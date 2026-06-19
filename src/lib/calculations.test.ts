import { describe, expect, it } from "vitest";
import { budgetTotals, financeTotals, materialTotals, workTotals } from "./calculations";

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
    ).toBe(500_000);
  });
});
