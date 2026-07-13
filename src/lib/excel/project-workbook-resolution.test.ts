import { describe, expect, it } from "vitest";
import { buildProjectWorkbookQualityGate, failedProjectWorkbookQualityGate } from "./project-workbook-quality";
import { buildProjectWorkbookResolutionPlan } from "./project-workbook-resolution";

const reviewQuality = buildProjectWorkbookQualityGate({
  errors: [],
  warnings: [],
  sheets: [
    { sheetName: "ВОР", role: "works", enabled: true, overridden: false, confidence: 0.98, importedRows: 12, formulaCells: 8, hiddenRows: 0 },
    { sheetName: "Укрупн", role: "unknown", enabled: true, overridden: false, confidence: 0.35, importedRows: 0, formulaCells: 0, hiddenRows: 0 }
  ],
  budgetItems: 12,
  materials: 2,
  scheduleItems: 0,
  payrollItems: 0,
  equipmentItems: 0,
  estimatedDirectCost: 800_000,
  sourceDirectCost: 1_000_000,
  reconciliationGap: 200_000,
  duplicateRows: 2
});

describe("project workbook resolution plan", () => {
  it("requires an individual decision for every warning", () => {
    const plan = buildProjectWorkbookResolutionPlan(reviewQuality);

    expect(plan.status).toBe("action_required");
    expect(plan.canCreate).toBe(false);
    expect(plan.summary.correctionsRequired).toBe(1);
    expect(plan.summary.decisionsRequired).toBe(3);
    expect(plan.summary.decisionsRemaining).toBe(3);
    expect(plan.progressPercent).toBe(0);
    expect(plan.steps.filter((step) => step.state === "needs_decision")).toHaveLength(3);
    expect(plan.steps).toEqual(expect.arrayContaining([expect.objectContaining({ id: "sheet-mapping-review", state: "needs_action" })]));
  });

  it("becomes ready after source corrections are reanalyzed and all decisions are confirmed", () => {
    const correctedQuality = buildProjectWorkbookQualityGate({
      errors: [],
      warnings: [],
      sheets: [
        { sheetName: "ВОР", role: "works", enabled: true, overridden: false, confidence: 0.98, importedRows: 12, formulaCells: 8, hiddenRows: 0 },
        { sheetName: "Укрупн", role: "reference", enabled: true, overridden: true, confidence: 0.35, importedRows: 0, formulaCells: 0, hiddenRows: 0 }
      ],
      budgetItems: 12,
      materials: 2,
      scheduleItems: 0,
      payrollItems: 0,
      equipmentItems: 0,
      estimatedDirectCost: 800_000,
      sourceDirectCost: 1_000_000,
      reconciliationGap: 200_000,
      duplicateRows: 2
    });
    const decisionIds = correctedQuality.issues.filter((issue) => issue.resolution === "acknowledgement").map((issue) => issue.id);
    const decisions = Object.fromEntries(decisionIds.map((id) => [id, true]));
    const plan = buildProjectWorkbookResolutionPlan(correctedQuality, decisions);

    expect(plan.status).toBe("ready");
    expect(plan.canCreate).toBe(true);
    expect(plan.progressPercent).toBe(100);
    expect(plan.summary).toMatchObject({ correctionsRequired: 0, decisionsRequired: 3, decisionsConfirmed: 3, decisionsRemaining: 0 });
  });

  it("ignores stale decisions that are not present in the current analysis", () => {
    const plan = buildProjectWorkbookResolutionPlan(reviewQuality, { "old-warning": true });

    expect(plan.status).toBe("action_required");
    expect(plan.summary.decisionsConfirmed).toBe(0);
    expect(plan.unresolvedIssueIds).not.toContain("old-warning");
  });

  it("never allows confirmation to bypass a blocker", () => {
    const quality = failedProjectWorkbookQualityGate("Файл поврежден.");
    const decisions = Object.fromEntries(quality.issues.map((issue) => [issue.id, true]));
    const plan = buildProjectWorkbookResolutionPlan(quality, decisions);

    expect(plan.status).toBe("blocked");
    expect(plan.canCreate).toBe(false);
    expect(plan.progressPercent).toBe(0);
    expect(plan.steps).toEqual(expect.arrayContaining([expect.objectContaining({ state: "blocked" })]));
  });
});
