import { describe, expect, it } from "vitest";
import { buildProjectWorkbookQualityGate, failedProjectWorkbookQualityGate } from "./project-workbook-quality";

const baseInput = {
  errors: [],
  warnings: [],
  sheets: [
    { sheetName: "01_ВОР", role: "works", enabled: true, overridden: false, confidence: 0.98, importedRows: 12, formulaCells: 0, hiddenRows: 0 },
    { sheetName: "02_ФОТ", role: "payroll", enabled: true, overridden: false, confidence: 0.99, importedRows: 4, formulaCells: 0, hiddenRows: 0 },
    { sheetName: "03_График", role: "schedule", enabled: true, overridden: false, confidence: 0.96, importedRows: 5, formulaCells: 0, hiddenRows: 0 }
  ],
  budgetItems: 16,
  materials: 3,
  scheduleItems: 5,
  payrollItems: 4,
  equipmentItems: 0,
  estimatedDirectCost: 1_000_000,
  sourceDirectCost: 1_000_000,
  reconciliationGap: 0,
  duplicateRows: 0
};

describe("project workbook quality gate", () => {
  it("returns a ready gate for a reconciled workbook", () => {
    const gate = buildProjectWorkbookQualityGate(baseInput);

    expect(gate.status).toBe("ready");
    expect(gate.acknowledgementRequired).toBe(false);
    expect(gate.metrics).toMatchObject({ recognizedRecords: 24, coveragePercent: 100, blockers: 0, warnings: 0 });
  });

  it("requires review for uncertain mapping, formulas, duplicates and a financial gap", () => {
    const gate = buildProjectWorkbookQualityGate({
      ...baseInput,
      sheets: [
        ...baseInput.sheets,
        { sheetName: "04_Укрупн", role: "unknown", enabled: true, overridden: false, confidence: 0.35, importedRows: 0, formulaCells: 7, hiddenRows: 2 }
      ],
      sourceDirectCost: 1_250_000,
      reconciliationGap: 250_000,
      duplicateRows: 3
    });

    expect(gate.status).toBe("review_required");
    expect(gate.acknowledgementRequired).toBe(true);
    expect(gate.metrics).toMatchObject({ reviewSheets: 1, formulaCells: 7, hiddenRows: 2, duplicateRows: 3, coveragePercent: 80 });
    expect(gate.issues.map((issue) => issue.id)).toEqual(expect.arrayContaining([
      "sheet-mapping-review",
      "financial-reconciliation-gap",
      "saved-formula-values",
      "deduplicated-rows",
      "hidden-rows"
    ]));
  });

  it("blocks a workbook without a recognized budget", () => {
    const gate = buildProjectWorkbookQualityGate({
      ...baseInput,
      budgetItems: 0,
      materials: 0,
      payrollItems: 0,
      scheduleItems: 2,
      estimatedDirectCost: 0,
      sourceDirectCost: undefined
    });

    expect(gate.status).toBe("blocked");
    expect(gate.metrics.blockers).toBe(1);
    expect(gate.issues).toEqual(expect.arrayContaining([expect.objectContaining({ id: "budget-empty", severity: "blocker" })]));
  });

  it("returns a blocked deterministic gate for a parser failure", () => {
    const gate = failedProjectWorkbookQualityGate("Файл поврежден.");

    expect(gate.status).toBe("blocked");
    expect(gate.score).toBeLessThan(50);
    expect(gate.issues).toEqual(expect.arrayContaining([expect.objectContaining({ severity: "blocker", detail: "Файл поврежден." })]));
  });
});
