import { describe, expect, it } from "vitest";
import { budgetTotals, financeTotals, materialTotals, scheduleProgressPercent, workTotals } from "./calculations";

describe("construction calculations", () => {
  it("calculates project margin", () => {
    const result = budgetTotals(10_000, [
      {
        id: "1",
        projectId: "p1",
        section: "Работы",
        code: "1",
        name: "Монолит",
        unit: "м3",
        qty: 10,
        plannedUnitPrice: 700,
        actualUnitPrice: 750,
        forecastUnitPrice: 720,
        kind: "work",
        source: "demo"
      }
    ]);

    expect(result.plannedProfit).toBe(3_000);
    expect(result.actualProfit).toBe(2_500);
  });

  it("detects work completion", () => {
    const result = workTotals([
      {
        id: "s1",
        projectId: "p1",
        name: "Земляные работы",
        owner: "РП",
        startsAt: "2026-01-01",
        endsAt: "2026-01-10",
        plannedQty: 100,
        actualQty: 50,
        status: "in_progress"
      }
    ]);

    expect(result.completionPercent).toBe(50);
  });

  it("does not add incompatible work quantities when calculating completion", () => {
    const result = workTotals([
      { id: "m2", projectId: "p1", name: "Площадь", owner: "РП", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 1000, actualQty: 500, unit: "м²", status: "in_progress" },
      { id: "pcs", projectId: "p1", name: "Штучная работа", owner: "РП", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 1, actualQty: 1, unit: "шт", status: "done" }
    ]);

    expect(result.completionPercent).toBe(75);
  });

  it("returns no schedule progress when a project has no schedule", () => {
    expect(scheduleProgressPercent([])).toBeNull();
  });

  it("calculates material overrun and finance gap", () => {
    expect(
      materialTotals([
        {
          id: "m1",
          projectId: "p1",
          name: "Бетон",
          unit: "м3",
          requiredQty: 10,
          orderedQty: 10,
          deliveredQty: 6,
          consumedQty: 3,
          plannedUnitPrice: 100,
          actualUnitPrice: 120,
          supplier: "Поставщик",
          neededAt: "2026-06-20",
          status: "ordered"
        }
      ]).materialOverrun
    ).toBe(200);

    expect(
      financeTotals([
        {
          id: "p1",
          projectId: "project",
          title: "Оплата",
          counterparty: "Поставщик",
          direction: "outgoing",
          plannedAt: "2026-06-20",
          amount: 2_000_000,
          status: "planned",
          category: "supplier"
        }
      ]).financingNeed
    ).toBe(2_000_000);
  });

  it("starts finance totals from a factual zero balance unless a balance is supplied", () => {
    const result = financeTotals([]);
    expect(result.openingBalance).toBe(0);
    expect(result.closingBalance).toBe(0);
  });

  it("keeps margin percentages finite until a contract amount is entered", () => {
    const result = budgetTotals(0, [{
      id: "budget-1",
      projectId: "project-1",
      section: "Работы",
      code: "1",
      name: "Монтаж",
      unit: "м2",
      qty: 10,
      plannedUnitPrice: 100,
      actualUnitPrice: 110,
      forecastUnitPrice: 120,
      kind: "work",
      source: "manual"
    }]);

    expect(result).toMatchObject({ plannedMarginPercent: 0, actualMarginPercent: 0, forecastMarginPercent: 0 });
  });
});
