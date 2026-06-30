import { describe, expect, it } from "vitest";
import { buildProcurementIntelligenceModel, materialCategory, type ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import type { ImportPreviewRow } from "@/lib/excel/import-types";
import type { Material, ProcurementRequest } from "@/lib/types";

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    projectId: "project-demo",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 10,
    orderedQty: 2,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 6500,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-07-10",
    status: "required",
    ...overrides
  };
}

function previewRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    id: "row-material",
    sheetName: "ВОР",
    sourceRowNumber: 5,
    status: "ready",
    entityType: "material",
    section: "Монолит",
    name: "Бетон В25",
    unit: "м3",
    quantity: 10,
    unitPrice: 6500,
    totalAmount: 65_000,
    normalizedJson: {},
    warnings: [],
    errors: [],
    suspiciousFlags: [],
    ...overrides
  };
}

function importHistory(rows: ImportPreviewRow[] = [previewRow()]): ProcurementImportHistoryItem[] {
  return [
    {
      id: "batch-1",
      fileName: "vor.xlsx",
      status: "committed",
      committedAt: "2026-07-01T10:00:00.000Z",
      preview: {
        summary: {
          totalRows: rows.length,
          parsedRows: rows.length,
          readyRows: rows.filter((row) => row.status === "ready").length,
          warningRows: rows.filter((row) => row.status === "warning").length,
          errorRows: rows.filter((row) => row.status === "error").length,
          skippedRows: 0,
          ignoredRows: 0,
          sections: 1,
          budgetItems: 0,
          materials: rows.filter((row) => row.entityType === "material").length,
          scheduleItems: 0,
          workRows: 0,
          materialRows: rows.filter((row) => row.entityType === "material").length,
          unknownRows: rows.filter((row) => row.entityType === "unknown").length,
          duplicateRows: 0,
          hiddenRows: 0,
          formulaCells: 0,
          errors: rows.filter((row) => row.status === "error").length,
          warnings: rows.filter((row) => row.status === "warning").length
        },
        previewRows: rows,
        unknownRows: rows
          .filter((row) => row.entityType === "unknown")
          .map((row) => ({
            sheetName: row.sheetName,
            rowNumber: row.sourceRowNumber,
            reason: "unknown",
            values: [row.name ?? "unknown"]
          }))
      }
    }
  ];
}

describe("procurement intelligence model", () => {
  it("asks for import when no materials or committed rows exist", () => {
    const model = buildProcurementIntelligenceModel({
      projectName: "Demo",
      materials: [],
      procurementRequests: [],
      importHistory: [],
      today: "2026-07-01"
    });

    expect(model.status).toBe("needs_import");
    expect(model.supplyRequestDraft.status).toBe("empty");
    expect(model.readiness.blockers).toContain("Загрузите ВОР или добавьте материалы вручную.");
  });

  it("builds candidates and a supply draft from valid material deficits", () => {
    const model = buildProcurementIntelligenceModel({
      projectName: "Demo",
      materials: [material()],
      procurementRequests: [],
      importHistory: importHistory(),
      today: "2026-07-01"
    });

    expect(model.summary.materials).toBe(1);
    expect(model.summary.candidates).toBe(1);
    expect(model.candidates[0]).toMatchObject({ name: "Бетон В25", deficitQty: 8, sourceSection: "Монолит" });
    expect(model.groupsByCategory[0]).toMatchObject({ label: "Бетон и инертные", count: 1 });
    expect(model.supplyRequestDraft.items[0]).toMatchObject({ name: "Бетон В25", quantity: 8, status: "draft" });
    expect(model.supplyRequestDraft.copyText).toContain("Заявка снабжению по проекту: Demo");
  });

  it("keeps incomplete rows in review and out of the supply draft", () => {
    const model = buildProcurementIntelligenceModel({
      projectName: "Demo",
      materials: [material({ unit: "", requiredQty: 0 })],
      procurementRequests: [],
      importHistory: importHistory([previewRow({ unit: "", quantity: undefined, status: "warning", suspiciousFlags: ["missingQuantity"] })]),
      today: "2026-07-01"
    });

    expect(model.status).toBe("blocked");
    expect(model.summary.candidates).toBe(0);
    expect(model.missingRows[0].warnings).toEqual(expect.arrayContaining(["Нет единицы измерения", "Нет количества"]));
    expect(model.supplyRequestDraft.items).toEqual([]);
  });

  it("does not duplicate materials already covered by active procurement requests", () => {
    const request: ProcurementRequest = {
      id: "req-1",
      projectId: "project-demo",
      title: "Заявка на бетон",
      initiator: "ПТО",
      neededAt: "2026-07-08",
      priority: "high",
      status: "draft",
      items: [{ materialId: "mat-1", name: "Бетон В25", qty: 8, unit: "м3" }]
    };

    const model = buildProcurementIntelligenceModel({
      projectName: "Demo",
      materials: [material()],
      procurementRequests: [request],
      importHistory: importHistory(),
      today: "2026-07-01"
    });

    expect(model.summary.activeRequests).toBe(1);
    expect(model.summary.candidates).toBe(0);
    expect(model.supplyRequestDraft.items).toEqual([]);
  });

  it("keeps unknown rows visible but never silently inserts them into drafts", () => {
    const model = buildProcurementIntelligenceModel({
      projectName: "Demo",
      materials: [material()],
      procurementRequests: [],
      importHistory: importHistory([previewRow(), previewRow({ id: "unknown-1", entityType: "unknown", name: "Комментарий", status: "skipped", sourceRowNumber: 9 })]),
      today: "2026-07-01"
    });

    expect(model.missingRows.some((row) => row.name.includes("Комментарий"))).toBe(true);
    expect(model.supplyRequestDraft.items).toHaveLength(1);
    expect(model.supplyRequestDraft.items[0].name).toBe("Бетон В25");
  });

  it("classifies common construction material categories", () => {
    expect(materialCategory("Арматура А500С")).toBe("Металл");
    expect(materialCategory("Кабель ВВГнг")).toBe("Электрика");
    expect(materialCategory("Труба ПНД")).toBe("Инженерные сети");
  });
});
