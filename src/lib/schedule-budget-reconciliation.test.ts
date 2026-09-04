import { describe, expect, it } from "vitest";
import {
  buildScheduleBudgetReconciliation,
  resolveScheduleBudgetOverrides
} from "@/lib/schedule-budget-reconciliation";
import type { BudgetItem, ScheduleItem } from "@/lib/types";

function budget(overrides: Partial<BudgetItem> & Pick<BudgetItem, "id" | "name">): BudgetItem {
  return {
    projectId: "project-1",
    section: "Раздел 1",
    code: overrides.id,
    unit: "м2",
    qty: 100,
    plannedUnitPrice: 10,
    actualUnitPrice: 0,
    forecastUnitPrice: 10,
    kind: "work",
    source: "КП",
    ...overrides
  };
}

function schedule(overrides: Partial<ScheduleItem> & Pick<ScheduleItem, "id" | "name">): ScheduleItem {
  return {
    projectId: "project-1",
    owner: "ПТО",
    startsAt: "2026-09-01",
    endsAt: "2026-09-10",
    plannedQty: 100,
    actualQty: 0,
    unit: "м²",
    status: "not_started",
    dependency: "Раздел 1 · Профиль ГПР: G01",
    ...overrides
  };
}

describe("schedule budget reconciliation", () => {
  it("matches schedule rows by normalized name, section, unit and quantity", () => {
    const result = buildScheduleBudgetReconciliation(
      [schedule({ id: "s-1", name: "10 Монтаж кровли" })],
      [budget({ id: "b-1", name: "Монтаж кровли" })]
    );

    expect(result.summary).toMatchObject({
      automaticMatches: 1,
      ambiguousMatches: 0,
      projectedLinkedScheduleItems: 1,
      projectedCoveragePercent: 100
    });
    expect(result.rows[0]).toMatchObject({ status: "automatic", suggestedBudgetItemId: "b-1" });
  });

  it("uses the imported section and quantity to separate repeated work names", () => {
    const result = buildScheduleBudgetReconciliation(
      [schedule({ id: "s-1", name: "20 Монтаж перемычек", plannedQty: 23, dependency: "Раздел 3 · Профиль ГПР: G07" })],
      [
        budget({ id: "b-1", name: "Монтаж перемычек", section: "Раздел 2", qty: 1 }),
        budget({ id: "b-2", name: "Монтаж перемычек", section: "Раздел 3", qty: 23 })
      ]
    );

    expect(result.rows[0]).toMatchObject({ status: "automatic", suggestedBudgetItemId: "b-2" });
  });

  it("keeps truly duplicate estimate rows for explicit review", () => {
    const budgets = [
      budget({ id: "b-1", code: "1.2", name: "Огрунтовка", qty: 1631.03 }),
      budget({ id: "b-2", code: "5.1", name: "Огрунтовка", qty: 1631.03 })
    ];
    const schedules = [
      schedule({ id: "s-1", name: "46 Огрунтовка", plannedQty: 1631.03 }),
      schedule({ id: "s-2", name: "51 Огрунтовка", plannedQty: 1631.03 })
    ];
    const result = buildScheduleBudgetReconciliation(schedules, budgets);

    expect(result.summary).toMatchObject({ automaticMatches: 0, ambiguousMatches: 2 });
    expect(result.rows.every((row) => row.candidates.length === 2)).toBe(true);
    expect(resolveScheduleBudgetOverrides(result, [
      { scheduleItemId: "s-1", budgetItemId: "b-1" },
      { scheduleItemId: "s-2", budgetItemId: "b-2" }
    ])).toHaveLength(2);
    expect(() => resolveScheduleBudgetOverrides(result, [
      { scheduleItemId: "s-1", budgetItemId: "b-1" },
      { scheduleItemId: "s-2", budgetItemId: "b-1" }
    ])).toThrow(/более одного раза/);
  });

  it("reports current and projected estimate coverage separately", () => {
    const budgets = [
      budget({ id: "b-1", name: "Работа 1", qty: 1, plannedUnitPrice: 100 }),
      budget({ id: "b-2", name: "Работа 2", qty: 1, plannedUnitPrice: 300 })
    ];
    const result = buildScheduleBudgetReconciliation([
      schedule({ id: "s-1", name: "Работа 1", plannedQty: 1, budgetItemId: "b-1" }),
      schedule({ id: "s-2", name: "Работа 2", plannedQty: 1 })
    ], budgets);

    expect(result.summary.currentCoveragePercent).toBe(25);
    expect(result.summary.projectedCoveragePercent).toBe(100);
    expect(result.summary.currentLinkedScheduleItems).toBe(1);
  });
});
