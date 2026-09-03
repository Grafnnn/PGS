import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";
import type { ImportPreview } from "@/lib/excel/import-types";

const getCurrentUserMock = vi.fn();
const canProjectMock = vi.fn();
const projectFindUniqueMock = vi.fn();
const importBatchFindFirstMock = vi.fn();
const transactionMock = vi.fn();
const writeAuditMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: canProjectMock
}));

vi.mock("@/lib/audit", () => ({
  writeAudit: writeAuditMock
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: {
      findUnique: projectFindUniqueMock
    },
    importBatch: {
      findFirst: importBatchFindFirstMock
    },
    $transaction: transactionMock
  }
}));

const authorizedUser: AppUser = {
  id: "user-1",
  name: "Project Manager",
  email: "pm@pgs.local",
  role: "MANAGER",
  authenticated: true
};

function requestJson(body: unknown) {
  return {
    json: vi.fn(async () => body)
  } as never;
}

function preview(overrides: Partial<ImportPreview> = {}): ImportPreview {
  return {
    importBatchId: "batch-1",
    projectId: "project-demo",
    fileName: "вор.xlsx",
    fileSize: 1234,
    parserVersion: "excel_import_v1",
    sheets: ["ВОР"],
    mapping: [
      {
        sheetName: "ВОР",
        headerRow: 1,
        columns: { name: 1, unit: 2, qty: 3, unitPrice: 4 },
        rows: 2,
        parsedRows: 1,
        hiddenRows: 0,
        formulaCells: 0,
        warnings: []
      }
    ],
    summary: {
      totalRows: 2,
      parsedRows: 1,
      ignoredRows: 0,
      sections: 0,
      budgetItems: 1,
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
    budgetItems: [
      {
        section: "Монолит",
        code: "1.1",
        name: "Бетонирование",
        unit: "м3",
        qty: 10,
        plannedUnitPrice: 5000,
        actualUnitPrice: 5000,
        forecastUnitPrice: 5000,
        kind: "work",
        source: "Excel import",
        sheetName: "ВОР",
        rowNumber: 2
      }
    ],
    materials: [],
    scheduleItems: [],
    unknownRows: [],
    warnings: [],
    errors: [],
    ...overrides
  };
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

describe("budget import commit route", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
    canProjectMock.mockReset();
    projectFindUniqueMock.mockReset();
    importBatchFindFirstMock.mockReset();
    transactionMock.mockReset();
    writeAuditMock.mockReset();
  });

  it("returns 401 before reading JSON when unauthenticated", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const request = requestJson({ importBatchId: "batch-1" });
    const { POST } = await import("./route");

    const response = await POST(request, { params: { projectId: "project-demo" } });

    expect(response.status).toBe(401);
    await expect(responseJson(response)).resolves.toEqual({ error: "Unauthorized" });
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(canProjectMock).not.toHaveBeenCalled();
  });

  it("returns 403 for users without import access", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(false);
    const request = requestJson({ importBatchId: "batch-1" });
    const { POST } = await import("./route");

    const response = await POST(request, { params: { projectId: "project-demo" } });

    expect(response.status).toBe(403);
    await expect(responseJson(response)).resolves.toEqual({ error: "Forbidden" });
    expect(canProjectMock).toHaveBeenCalledWith(authorizedUser, "project-demo", "import");
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
  });

  it("requires explicit confirmation for replacement modes", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    const { POST } = await import("./route");

    const response = await POST(requestJson({ importBatchId: "batch-1", mode: "replace_all" }), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(409);
    await expect(responseJson(response)).resolves.toEqual({ error: "Replacement import requires explicit confirmation." });
    expect(importBatchFindFirstMock).not.toHaveBeenCalled();
  });

  it("rejects already committed batches", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    const tx = {
      $queryRaw: vi.fn(),
      importBatch: { findFirst: vi.fn(async () => ({ id: "batch-1", status: "committed", previewJson: preview() })) }
    };
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(requestJson({ importBatchId: "batch-1", mode: "append" }), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(409);
    await expect(responseJson(response)).resolves.toEqual({ error: "Import batch already committed" });
    expect(tx.$queryRaw).toHaveBeenCalledOnce();
    expect(tx.importBatch.findFirst).toHaveBeenCalledWith({ where: { id: "batch-1", projectId: "project-demo" } });
  });

  it("replaces materials after removing draft procurement requests and keeps the source order deadline", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      budgetItem: { deleteMany: vi.fn(), create: vi.fn() },
      budgetSection: { deleteMany: vi.fn(), upsert: vi.fn() },
      procurementRequest: {
        count: vi.fn(async () => 0),
        deleteMany: vi.fn(async () => ({ count: 67 }))
      },
      material: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }) => ({
          id: "material-1",
          ...data,
          orderByAt: new Date("2026-09-04T00:00:00.000Z"),
          neededAt: new Date("2026-10-30T00:00:00.000Z")
        }))
      },
      scheduleItem: { deleteMany: vi.fn(), create: vi.fn() },
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "previewed", previewJson: importPreview })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn()
      }
    };
    const importPreview = preview({
      summary: { ...preview().summary, budgetItems: 0, materials: 1, materialRows: 1 },
      budgetItems: [],
      materials: [{
        name: "[МЗ-06] Балка · Б1",
        unit: "шт",
        requiredQty: 1,
        orderedQty: 0,
        deliveredQty: 0,
        consumedQty: 0,
        plannedUnitPrice: 0,
        actualUnitPrice: 0,
        supplier: "Не выбран",
        orderByAt: "2026-09-04",
        neededAt: "2026-10-30",
        status: "required",
        sheetName: "заявки_итог",
        rowNumber: 7
      }]
    });
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    importBatchFindFirstMock.mockResolvedValue({ id: "batch-1", status: "previewed", previewJson: importPreview });
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(requestJson({
      importBatchId: "batch-1",
      mode: "replace_materials",
      replaceConfirmed: true
    }), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(200);
    expect(tx.procurementRequest.count).toHaveBeenCalledWith({
      where: {
        projectId: "project-demo",
        status: { in: ["submitted", "approved", "ordered", "expected", "partially_received"] }
      }
    });
    expect(tx.procurementRequest.deleteMany).toHaveBeenCalledWith({
      where: { projectId: "project-demo", status: "draft" }
    });
    expect(tx.material.deleteMany).toHaveBeenCalledWith({ where: { projectId: "project-demo" } });
    expect(tx.material.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        orderByAt: new Date("2026-09-04T00:00:00.000Z"),
        neededAt: new Date("2026-10-30T00:00:00.000Z")
      })
    }));
    await expect(responseJson(response)).resolves.toMatchObject({
      ok: true,
      removedDraftRequests: 67,
      materials: [expect.objectContaining({ orderByAt: "2026-09-04", neededAt: "2026-10-30" })]
    });
  });

  it("blocks material replacement while procurement requests are active", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "previewed", previewJson: preview() })),
        updateMany: vi.fn(async () => ({ count: 1 }))
      },
      procurementRequest: {
        count: vi.fn(async () => 1),
        deleteMany: vi.fn()
      },
      material: { deleteMany: vi.fn() }
    };
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    importBatchFindFirstMock.mockResolvedValue({ id: "batch-1", status: "previewed", previewJson: preview() });
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(requestJson({
      importBatchId: "batch-1",
      mode: "replace_materials",
      replaceConfirmed: true
    }), { params: { projectId: "project-demo" } });

    expect(response.status).toBe(422);
    await expect(responseJson(response)).resolves.toEqual({
      error: "Нельзя сохранить замену материалов: сначала закройте или отмените активные заявки на снабжение."
    });
    expect(tx.procurementRequest.deleteMany).not.toHaveBeenCalled();
    expect(tx.material.deleteMany).not.toHaveBeenCalled();
  });

  it("commits the stored server-side batch instead of trusting client rows", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      budgetItem: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }) => ({ id: "budget-1", ...data }))
      },
      budgetSection: {
        deleteMany: vi.fn(),
        upsert: vi.fn()
      },
      material: {
        deleteMany: vi.fn(),
        create: vi.fn()
      },
      scheduleItem: {
        deleteMany: vi.fn(),
        create: vi.fn()
      },
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "previewed", previewJson: preview() })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn()
      }
    };
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    importBatchFindFirstMock.mockResolvedValue({ id: "batch-1", status: "previewed", previewJson: preview() });
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(
      requestJson({
        importBatchId: "batch-1",
        mode: "append",
        budgetItems: [{ name: "Подмененная строка" }]
      }),
      { params: { projectId: "project-demo" } }
    );

    expect(response.status).toBe(200);
    await expect(responseJson(response)).resolves.toMatchObject({ ok: true, importBatchId: "batch-1" });
    expect(tx.budgetItem.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Бетонирование" }) }));
    expect(tx.budgetItem.create).not.toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ name: "Подмененная строка" }) }));
    expect(tx.importBatch.update).toHaveBeenCalledWith({ where: { id: "batch-1" }, data: expect.objectContaining({ status: "committed", mode: "append" }) });
    expect(writeAuditMock).toHaveBeenCalled();
  });

  it("commits Excel labor demand and links its hours to the created VOR row", async () => {
    const tx = {
      $queryRaw: vi.fn(),
      budgetItem: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }) => ({ id: "budget-1", ...data }))
      },
      budgetSection: { deleteMany: vi.fn(), upsert: vi.fn() },
      material: { deleteMany: vi.fn(), create: vi.fn() },
      scheduleItem: { deleteMany: vi.fn(), create: vi.fn() },
      projectPayrollPolicy: { upsert: vi.fn() },
      projectLaborDemand: {
        deleteMany: vi.fn(),
        create: vi.fn(async ({ data }) => ({ id: "demand-1", ...data }))
      },
      projectLaborAllocation: {
        create: vi.fn(async ({ data }) => ({ id: "allocation-1", ...data }))
      },
      importBatch: {
        findFirst: vi.fn(async () => ({ id: "batch-1", status: "previewed", previewJson: importPreview })),
        updateMany: vi.fn(async () => ({ count: 1 })),
        update: vi.fn()
      }
    };
    const importPreview = preview({
      summary: {
        ...preview().summary,
        budgetItems: 1,
        laborDemands: 1,
        laborAllocations: 1
      },
      laborDemands: [{
        category: "worker",
        profession: "Бетонщик",
        grossMonthlySalary: 120000,
        peakHeadcount: 2,
        personMonths: 2,
        plannedHours: 320,
        productivityNorm: 5,
        startsAt: "2026-08-01T00:00:00.000Z",
        endsAt: "2026-08-31T00:00:00.000Z",
        monthlyProfile: [{ month: 1, label: "M1", headcount: 2 }],
        source: "Excel · ФОТ",
        sourceSheet: "ФОТ",
        sourceRow: 3,
        confidence: 0.95,
        allocations: [{
          budgetCode: "1.1",
          budgetName: "Бетонирование",
          sharePercent: 100,
          personMonths: 2,
          plannedHours: 320,
          requiredHeadcount: 2,
          confidence: 0.9,
          reason: "Совпадение с ВОР"
        }]
      }]
    });
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    canProjectMock.mockResolvedValue(true);
    projectFindUniqueMock.mockResolvedValue({ id: "project-demo", organizationId: "org-demo" });
    importBatchFindFirstMock.mockResolvedValue({ id: "batch-1", status: "previewed", previewJson: importPreview });
    transactionMock.mockImplementation(async (callback) => callback(tx));
    const { POST } = await import("./route");

    const response = await POST(requestJson({ importBatchId: "batch-1", mode: "append" }), {
      params: { projectId: "project-demo" }
    });

    expect(response.status).toBe(200);
    expect(tx.projectPayrollPolicy.upsert).toHaveBeenCalled();
    expect(tx.projectLaborDemand.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ profession: "Бетонщик", importBatchId: "batch-1" })
    }));
    expect(tx.projectLaborAllocation.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        laborDemandId: "demand-1",
        budgetItemId: "budget-1",
        workName: "Бетонирование"
      })
    }));
  });
});
