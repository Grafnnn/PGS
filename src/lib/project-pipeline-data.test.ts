import { Prisma } from "@prisma/client";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { importPreviewSchema } from "@/lib/excel/import-types";
import { buildPipelineSnapshot, loadPipelineData, loadPipelineDataWithClient } from "@/lib/project-pipeline";

const mocks = vi.hoisted(() => ({ projectFindUnique: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { project: { findUnique: mocks.projectFindUnique } } }));

function preview() {
  return importPreviewSchema.parse({
    projectId: "project-1", fileName: "estimate.xlsx", sheets: ["Estimate"], mapping: [],
    summary: {
      totalRows: 1, parsedRows: 1, ignoredRows: 0, sections: 1, budgetItems: 1, materials: 0,
      scheduleItems: 0, unknownRows: 0, duplicateRows: 0, hiddenRows: 0, formulaCells: 0, errors: 0, warnings: 0
    },
    sections: [], budgetItems: [], materials: [], scheduleItems: [], unknownRows: [],
    previewRows: [{
      id: "row-1", sheetName: "Estimate", sourceRowNumber: 1, status: "ready", entityType: "budgetItem",
      name: "Concrete work", section: "Structure", quantity: 1, unitPrice: 100, totalAmount: 100,
      normalizedJson: {}, warnings: [], errors: [], suspiciousFlags: []
    }],
    warnings: [], errors: []
  });
}

function batch(id = "batch-1", previewJson: unknown = preview()) {
  return {
    id, fileName: "estimate.xlsx", status: "committed", mode: "append",
    committedAt: new Date("2026-09-01T10:00:00Z"), createdAt: new Date("2026-09-01T09:00:00Z"),
    previewJson, summary: { commitResult: { created: 1 } }
  };
}

function project() {
  return {
    id: "project-1", organizationId: "org-1", name: "Project", contractAmount: new Prisma.Decimal(1000),
    startsAt: new Date("2026-09-01T00:00:00Z"), endsAt: new Date("2026-12-01T00:00:00Z"),
    budgetItems: [], materials: [], scheduleItems: [], procurementRequests: [], payments: [],
    cashflowPeriods: [{
      id: "cashflow-1", periodStart: new Date("2026-09-01T00:00:00Z"), periodEnd: new Date("2026-09-30T00:00:00Z"),
      incoming: new Prisma.Decimal(100), outgoing: new Prisma.Decimal(50)
    }],
    documents: [{ id: "document-1", category: "contract", title: "Contract", fileName: null }],
    importBatches: [batch()]
  };
}

describe("pipeline data loader", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.projectFindUnique.mockResolvedValue(project());
  });

  it("selects only consumed project, document and import fields while preserving relation scope and ordering", async () => {
    await loadPipelineData("project-1");

    expect(mocks.projectFindUnique).toHaveBeenCalledTimes(1);
    expect(mocks.projectFindUnique).toHaveBeenCalledWith({
      where: { id: "project-1" },
      select: {
        id: true, organizationId: true, contractAmount: true, startsAt: true, endsAt: true, name: true,
        budgetItems: { orderBy: [{ section: "asc" }, { code: "asc" }] },
        materials: { orderBy: { neededAt: "asc" } },
        scheduleItems: { where: { isCurrent: true }, orderBy: { startsAt: "asc" } },
        procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
        payments: { orderBy: { plannedAt: "asc" } },
        cashflowPeriods: { orderBy: { periodStart: "asc" } },
        documents: {
          select: { id: true, category: true, title: true, fileName: true },
          orderBy: { createdAt: "desc" }
        },
        importBatches: {
          select: {
            id: true, fileName: true, status: true, mode: true, committedAt: true, createdAt: true,
            previewJson: true, summary: true
          },
          where: { status: "committed" },
          orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
          take: 10
        }
      }
    });
  });

  it("preserves serialized data and import evidence with only the selected fields present", async () => {
    const data = await loadPipelineData("project-1");

    expect(data).toEqual({
      project: {
        id: "project-1", organizationId: "org-1", name: "Project", contractAmount: 1000,
        startsAt: "2026-09-01", endsAt: "2026-12-01"
      },
      budgetItems: [], materials: [], scheduleItems: [], procurementRequests: [], payments: [],
      cashflowPeriods: project().cashflowPeriods,
      documents: project().documents,
      importBatches: [{
        id: "batch-1", fileName: "estimate.xlsx", status: "committed", mode: "append",
        committedAt: "2026-09-01T10:00:00.000Z", createdAt: "2026-09-01T09:00:00.000Z",
        preview: preview(), commitResult: { created: 1 }
      }]
    });
  });

  it("skips invalid previews without losing an older valid import or changing snapshot counts", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      ...project(), importBatches: [batch("invalid", {}), batch("older"), batch("oldest")]
    });

    const snapshot = await buildPipelineSnapshot("project-1");

    expect(snapshot?.latestImport?.id).toBe("older");
    expect(snapshot?.readiness.counts).toMatchObject({ committedImports: 2, importedBudgetItems: 1, documents: 1, cashflowPeriods: 1 });
    expect(snapshot?.documentChecklist.find((item) => item.key === "contract")?.documentIds).toEqual(["document-1"]);
    expect(snapshot?.documentChecklist.find((item) => item.key === "estimate")?.evidence)
      .toContainEqual(expect.objectContaining({ importBatchId: "older" }));
  });

  it("preserves null import metadata and excludes malformed previews", async () => {
    mocks.projectFindUnique.mockResolvedValue({
      ...project(), importBatches: [{ ...batch(), committedAt: null, mode: null, summary: null }, batch("invalid", null)]
    });

    const data = await loadPipelineData("project-1");

    expect(data?.importBatches).toHaveLength(1);
    expect(data?.importBatches[0]).toMatchObject({ committedAt: null, mode: null, commitResult: null });
  });

  it("returns null for a missing project", async () => {
    mocks.projectFindUnique.mockResolvedValue(null);

    await expect(loadPipelineData("missing")).resolves.toBeNull();
  });

  it("uses the supplied transaction client without reading through the global client", async () => {
    const findUnique = vi.fn().mockResolvedValue(project());
    const client = { project: { findUnique } } as unknown as Parameters<typeof loadPipelineDataWithClient>[0];

    const data = await loadPipelineDataWithClient(client, "project-1");

    expect(data?.project.id).toBe("project-1");
    expect(findUnique).toHaveBeenCalledTimes(1);
    expect(mocks.projectFindUnique).not.toHaveBeenCalled();
  });

  it("propagates read failures and performs a fresh read on retry", async () => {
    mocks.projectFindUnique.mockRejectedValueOnce(new Error("read unavailable"));

    await expect(loadPipelineData("project-1")).rejects.toThrow("read unavailable");
    await expect(loadPipelineData("project-1")).resolves.toMatchObject({ project: { id: "project-1" } });
    expect(mocks.projectFindUnique).toHaveBeenCalledTimes(2);
  });
});
