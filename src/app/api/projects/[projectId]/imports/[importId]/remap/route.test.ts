import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ImportPreview } from "@/lib/excel/import-types";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFindUnique: vi.fn(),
  transaction: vi.fn(),
  remap: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: (...args: unknown[]) => mocks.getCurrentUser(...args) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: (...args: unknown[]) => mocks.canProject(...args) }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/excel/import-parser", () => ({ remapImportPreview: (...args: unknown[]) => mocks.remap(...args) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: (...args: unknown[]) => mocks.projectFindUnique(...args) },
    $transaction: (...args: unknown[]) => mocks.transaction(...args)
  }
}));

function preview(): ImportPreview {
  return {
    importBatchId: "batch-1",
    projectId: "project-1",
    fileName: "project.xlsx",
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
  return new Request("https://pgs.local/api/projects/project-1/imports/batch-1/remap", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ mapping: [] })
  }) as never;
}

const context = { params: { projectId: "project-1", importId: "batch-1" } };

describe("import remap route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user-1", name: "Admin", email: "admin@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFindUnique.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    mocks.remap.mockImplementation((value) => value);
    mocks.audit.mockResolvedValue({});
  });

  it("locks the project, reads fresh state, and conditionally updates one preview revision", async () => {
    const order: string[] = [];
    const updatedAt = new Date("2026-09-03T08:00:00.000Z");
    const tx = {
      $queryRaw: vi.fn(async () => { order.push("lock"); }),
      importBatch: {
        findFirst: vi.fn(async () => { order.push("read"); return { id: "batch-1", status: "previewed", updatedAt, previewJson: preview() }; }),
        updateMany: vi.fn(async () => { order.push("update"); return { count: 1 }; })
      }
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(post(), context);

    expect(response.status).toBe(200);
    expect(order).toEqual(["lock", "read", "update"]);
    expect(tx.importBatch.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "batch-1", projectId: "project-1", status: "previewed", updatedAt }
    }));
  });

  it("does not remap a batch that is already being committed", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "committing", updatedAt: new Date(), previewJson: preview() })),
        updateMany: vi.fn()
      }
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(post(), context);

    expect(response.status).toBe(409);
    expect(mocks.remap).not.toHaveBeenCalled();
    expect(tx.importBatch.updateMany).not.toHaveBeenCalled();
  });

  it("returns a conflict when the preview revision changes before the conditional update", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "previewed", updatedAt: new Date(), previewJson: preview() })),
        updateMany: vi.fn(async () => ({ count: 0 }))
      }
    };
    mocks.transaction.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(post(), context);

    expect(response.status).toBe(409);
    expect(mocks.audit).not.toHaveBeenCalled();
  });
});
