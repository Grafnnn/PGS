import { describe, expect, it } from "vitest";
import { buildCashflowDraft, buildDocumentChecklist, buildProcurementDraft, buildScheduleDraft } from "./project-pipeline";

const baseData = {
  project: {
    id: "project-demo",
    organizationId: "org-demo",
    contractAmount: 1_000_000,
    startsAt: "2026-06-01",
    endsAt: "2026-09-01",
    name: "Demo"
  },
  budgetItems: [
    {
      id: "b1",
      projectId: "project-demo",
      section: "Монолит",
      code: "1",
      name: "Монтаж опалубки",
      unit: "м2",
      qty: 10,
      plannedUnitPrice: 1000,
      actualUnitPrice: 0,
      forecastUnitPrice: 1000,
      kind: "work",
      source: "Excel import"
    },
    {
      id: "b2",
      projectId: "project-demo",
      section: "Монолит",
      code: "2",
      name: "Бетон В25",
      unit: "м3",
      qty: 5,
      plannedUnitPrice: 5000,
      actualUnitPrice: 0,
      forecastUnitPrice: 5000,
      kind: "material",
      source: "Excel import"
    }
  ],
  materials: [
    {
      id: "m1",
      projectId: "project-demo",
      name: "Бетон В25",
      unit: "м3",
      requiredQty: 5,
      orderedQty: 1,
      deliveredQty: 0,
      consumedQty: 0,
      plannedUnitPrice: 5000,
      actualUnitPrice: 0,
      supplier: "Не выбран",
      neededAt: "2026-06-10",
      status: "required"
    }
  ],
  scheduleItems: [],
  procurementRequests: [],
  payments: [],
  cashflowPeriods: [],
  documents: [{ id: "doc-vor", category: "вор", title: "ВОР", fileName: "vor.xlsx" }],
  importBatches: [
    {
      id: "batch-1",
      fileName: "vor.xlsx",
      status: "committed",
      mode: "append",
      createdAt: "2026-06-01T00:00:00.000Z",
      committedAt: "2026-06-01T00:10:00.000Z",
      commitResult: { created: 2 },
      preview: {
        projectId: "project-demo",
        fileName: "vor.xlsx",
        parserVersion: "excel_import_v1",
        sheets: ["ВОР"],
        mapping: [],
        summary: {
          totalRows: 3,
          parsedRows: 2,
          readyRows: 2,
          warningRows: 0,
          errorRows: 0,
          skippedRows: 0,
          ignoredRows: 0,
          sections: 1,
          budgetItems: 1,
          materials: 1,
          scheduleItems: 0,
          workRows: 1,
          materialRows: 1,
          unknownRows: 0,
          duplicateRows: 0,
          hiddenRows: 0,
          formulaCells: 0,
          estimatedTotalAmount: 35_000,
          errors: 0,
          warnings: 0
        },
        sections: [{ name: "Монолит", sheetName: "ВОР", rowNumber: 1 }],
        budgetItems: [],
        materials: [],
        scheduleItems: [],
        unknownRows: [],
        previewRows: [
          {
            id: "row-work",
            sheetName: "ВОР",
            sourceRowNumber: 2,
            status: "ready",
            entityType: "budgetItem",
            section: "Монолит",
            name: "Монтаж опалубки",
            unit: "м2",
            quantity: 10,
            unitPrice: 1000,
            totalAmount: 10000,
            normalizedJson: {},
            warnings: [],
            errors: [],
            suspiciousFlags: []
          },
          {
            id: "row-material",
            sheetName: "ВОР",
            sourceRowNumber: 3,
            status: "ready",
            entityType: "material",
            section: "Монолит",
            name: "Бетон В25",
            unit: "м3",
            quantity: 5,
            unitPrice: 5000,
            totalAmount: 25000,
            normalizedJson: {},
            warnings: [],
            errors: [],
            suspiciousFlags: []
          }
        ],
        warnings: [],
        errors: []
      }
    }
  ]
} as const;

describe("project data pipeline", () => {
  it("marks VOR as present from uploaded document or import evidence", () => {
    const checklist = buildDocumentChecklist(baseData as any);
    expect(checklist.find((item) => item.key === "estimate")).toMatchObject({ status: "present" });
    expect(checklist.find((item) => item.key === "contract")).toMatchObject({ status: "missing" });
  });

  it("builds procurement suggestions from material deficits without external calls", () => {
    const draft = buildProcurementDraft(baseData as any);
    expect(draft.summary.materials).toBe(1);
    expect(draft.items[0]).toMatchObject({ material: "Бетон В25", deficit: 4, status: "quote_needed" });
    expect(draft.items[0].evidence[0]).toMatchObject({ importBatchId: "batch-1", importRowId: "batch-1:ВОР:3" });
  });

  it("does not suggest duplicate procurement drafts for materials already in active requests", () => {
    const draft = buildProcurementDraft({
      ...baseData,
      procurementRequests: [
        {
          id: "pr-1",
          projectId: "project-demo",
          title: "Заявка на бетон",
          initiator: "ПТО",
          neededAt: "2026-06-09",
          priority: "high",
          status: "draft",
          items: [{ materialId: "m1", name: "Бетон В25", qty: 4, unit: "м3" }]
        }
      ]
    } as any);
    expect(draft.canCommit).toBe(false);
    expect(draft.items).toEqual([]);
  });

  it("builds grouped draft schedule and keeps it in preview mode", () => {
    const draft = buildScheduleDraft(baseData as any);
    expect(draft.summary.stages).toBe(1);
    expect(draft.items[0]).toMatchObject({ stage: "Монолит", status: "needs_dates" });
    expect(draft.items[0].warnings[0]).toContain("Нет подтвержденного календарного графика");
  });

  it("builds cashflow draft totals and reports missing dates", () => {
    const draft = buildCashflowDraft(baseData as any);
    expect(draft.summary.totalBudget).toBe(35000);
    expect(draft.summary.materialsTotal).toBe(25000);
    expect(draft.summary.missingDates).toBe(1);
  });
});
