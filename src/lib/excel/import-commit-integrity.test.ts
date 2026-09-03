import { describe, expect, it, vi } from "vitest";
import {
  claimImportBatch,
  ImportCommitConflict,
  prepareBudgetReplacement,
  prepareScheduleRevision,
  relinkScheduleBudgetItems
} from "@/lib/excel/import-commit-integrity";

describe("import commit integrity", () => {
  it("claims a preview exactly once", async () => {
    const updateMany = vi.fn().mockResolvedValue({ count: 0 });

    await expect(claimImportBatch({ importBatch: { updateMany } } as never, {
      importBatchId: "batch-1",
      projectId: "project-1"
    })).rejects.toBeInstanceOf(ImportCommitConflict);
  });

  it("claims only the exact preview revision read under the project lock", async () => {
    const updatedAt = new Date("2026-09-03T08:00:00.000Z");
    const updateMany = vi.fn().mockResolvedValue({ count: 1 });

    await claimImportBatch({ importBatch: { updateMany } } as never, {
      importBatchId: "batch-1",
      projectId: "project-1",
      expectedUpdatedAt: updatedAt
    });

    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", projectId: "project-1", status: "previewed", updatedAt },
      data: { status: "committing" }
    });
  });

  it("starts a new revision when a project has history but no current schedule", async () => {
    const aggregate = vi.fn()
      .mockResolvedValueOnce({ _max: { revision: 3 } })
      .mockResolvedValueOnce({ _max: { revision: null } });
    const tx = { $queryRaw: vi.fn(), scheduleItem: { aggregate } };

    await expect(prepareScheduleRevision(tx as never, { projectId: "project-1", replace: false }))
      .resolves.toEqual({ revision: 4, supersededCount: 0 });
  });

  it("archives the current schedule before a replacement revision", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      scheduleItem: {
        aggregate: vi.fn().mockResolvedValue({ _max: { revision: 2 } }),
        updateMany: vi.fn().mockResolvedValue({ count: 12 })
      }
    };

    await expect(prepareScheduleRevision(tx as never, { projectId: "project-1", replace: true }))
      .resolves.toEqual({ revision: 3, supersededCount: 12 });
  });

  it("blocks budget replacement while an active control baseline exists", async () => {
    const tx = { projectControlBaseline: { count: vi.fn().mockResolvedValue(1) } };

    await expect(prepareBudgetReplacement(tx as never, { projectId: "project-1", replace: true }))
      .rejects.toBeInstanceOf(ImportCommitConflict);
  });

  it("snapshots schedule links before replacement deletes the old budget rows", async () => {
    const findMany = vi.fn().mockResolvedValue([
      { id: "schedule-1", budgetItemId: "old-1" },
      { id: "schedule-2", budgetItemId: "old-1" }
    ]);
    const tx = {
      projectControlBaseline: { count: vi.fn().mockResolvedValue(0) },
      budgetItem: { findMany: vi.fn().mockResolvedValue([{ id: "old-1", code: "A-1", name: "Монтаж" }]) },
      scheduleItem: { findMany }
    };

    await expect(prepareBudgetReplacement(tx as never, { projectId: "project-1", replace: true }))
      .resolves.toEqual([{ id: "old-1", code: "A-1", name: "Монтаж", scheduleItemIds: ["schedule-1", "schedule-2"] }]);
    expect(findMany).toHaveBeenCalledWith({
      where: { projectId: "project-1", budgetItemId: { in: ["old-1"] } },
      select: { id: true, budgetItemId: true }
    });
  });

  it("relinks schedule rows by stable budget code and name", async () => {
    const updateMany = vi.fn()
      .mockResolvedValueOnce({ count: 2 })
      .mockResolvedValueOnce({ count: 1 });
    const result = await relinkScheduleBudgetItems({ scheduleItem: { updateMany } } as never, {
      projectId: "project-1",
      previous: [
        { id: "old-1", code: "A-1", name: "Монтаж", scheduleItemIds: ["schedule-1", "schedule-2"] },
        { id: "old-2", code: "A-2", name: "Демонтаж", scheduleItemIds: ["schedule-3"] }
      ],
      created: [{ id: "new-1", code: "a-1", name: "монтаж" }]
    });

    expect(result).toEqual({ relinked: 2, cleared: 1 });
    expect(updateMany).toHaveBeenNthCalledWith(1, {
      where: { projectId: "project-1", id: { in: ["schedule-1", "schedule-2"] } },
      data: { budgetItemId: "new-1" }
    });
    expect(updateMany).toHaveBeenNthCalledWith(2, {
      where: { projectId: "project-1", id: { in: ["schedule-3"] } },
      data: { budgetItemId: null }
    });
  });
});
