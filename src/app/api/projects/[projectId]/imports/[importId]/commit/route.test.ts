import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview } from "@/lib/excel/import-types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFindUnique: vi.fn(),
  transaction: vi.fn(),
  buildPlan: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: (...args: unknown[]) => mocks.getCurrentUser(...args) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: (...args: unknown[]) => mocks.canProject(...args) }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/excel/import-parser", () => ({ buildCommitPlan: (...args: unknown[]) => mocks.buildPlan(...args) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: (...args: unknown[]) => mocks.projectFindUnique(...args) },
    $transaction: (...args: unknown[]) => mocks.transaction(...args)
  }
}));

function preview(fileName: string): ImportPreview {
  return {
    importBatchId: "batch-1",
    projectId: "project-1",
    fileName,
    fileSize: 100,
    parserVersion: "excel_import_v1",
    sheets: ["ВОР"],
    mapping: [],
    summary: {
      totalRows: 0,
      parsedRows: 0,
      ignoredRows: 0,
      sections: 0,
      budgetItems: 0,
      materials: 0,
      scheduleItems: 0,
      unknownRows: 0,
      duplicateRows: 0,
      hiddenRows: 0,
      formulaCells: 0,
      errors: 0,
      warnings: 0
    },
    sections: [],
    budgetItems: [],
    materials: [],
    scheduleItems: [],
    unknownRows: [],
    warnings: [],
    errors: []
  };
}

function post() {
  return new Request("https://pgs.local/api/projects/project-1/imports/batch-1/commit", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mode: "append" })
  }) as never;
}

describe("project import commit route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", name: "Admin", email: "admin@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFindUnique.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    mocks.buildPlan.mockReturnValue({
      mode: "append",
      sections: [],
      budgetItems: [],
      materials: [],
      scheduleItems: [],
      laborDemands: [],
      summary: {}
    });
    mocks.audit.mockResolvedValue({});
  });

  it("locks the project and commits the fresh server preview with an atomic revision claim", async () => {
    const order: string[] = [];
    const updatedAt = new Date("2026-09-03T08:00:00.000Z");
    const freshPreview = preview("fresh.xlsx");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const tx = {
      $queryRaw: vi.fn(async () => { order.push("lock"); }),
      importBatch: {
        findFirst: vi.fn(async () => { order.push("read"); return { id: "batch-1", status: "previewed", updatedAt, previewJson: freshPreview }; }),
        updateMany,
        update: vi.fn(async () => ({}))
      },
      projectControlBaseline: { count: vi.fn() },
      budgetItem: { create: vi.fn() },
      budgetSection: { upsert: vi.fn() },
      material: { create: vi.fn() },
      scheduleItem: {
        aggregate: vi.fn().mockResolvedValueOnce({ _max: { revision: 0 } }).mockResolvedValueOnce({ _max: { revision: null } }),
        create: vi.fn()
      },
      projectLaborDemand: { create: vi.fn() },
      projectLaborAllocation: { create: vi.fn() },
      projectPayrollPolicy: { upsert: vi.fn() }
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(post(), { params: { projectId: "project-1", importId: "batch-1" } });

    expect(response.status).toBe(200);
    expect(order.slice(0, 2)).toEqual(["lock", "read"]);
    expect(mocks.buildPlan).toHaveBeenCalledWith(expect.objectContaining({ fileName: "fresh.xlsx" }), "append");
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: "batch-1", projectId: "project-1", status: "previewed", updatedAt },
      data: { status: "committing" }
    });
  });

  it("returns a conflict on a repeated click after the batch was committed", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "committed", updatedAt: new Date(), previewJson: preview("done.xlsx") })),
        updateMany: vi.fn()
      }
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(post(), { params: { projectId: "project-1", importId: "batch-1" } });

    expect(response.status).toBe(409);
    expect(mocks.buildPlan).not.toHaveBeenCalled();
    expect(tx.importBatch.updateMany).not.toHaveBeenCalled();
  });
});
