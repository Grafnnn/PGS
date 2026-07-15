import { describe, expect, it } from "vitest";
import { buildPortfolioControlModel, type PortfolioProjectSource } from "@/lib/portfolio-control";

const base = (overrides: Partial<PortfolioProjectSource> = {}): PortfolioProjectSource => ({
  id: "project-1", name: "Школа", code: "SCH", customer: "Заказчик", manager: "Иванов", status: "active", contractAmount: 10_000_000,
  startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-12-31T00:00:00.000Z",
  budgetItems: [{ qty: 1, plannedUnitPrice: 7_000_000, forecastUnitPrice: 8_000_000 }],
  scheduleItems: [{ name: "Каркас", plannedQty: 100, actualQty: 60, status: "in_progress", endsAt: "2026-08-01T00:00:00.000Z" }],
  materials: [{ requiredQty: 100, orderedQty: 100, deliveredQty: 100, status: "delivered", neededAt: "2026-07-01T00:00:00.000Z" }],
  payments: [
    { direction: "incoming", amount: 5_000_000, status: "paid", plannedAt: "2026-06-01T00:00:00.000Z", paidAt: "2026-06-01T00:00:00.000Z" },
    { direction: "outgoing", amount: 3_000_000, status: "paid", plannedAt: "2026-06-10T00:00:00.000Z", paidAt: "2026-06-10T00:00:00.000Z" }
  ],
  risks: [], actionItems: [], ...overrides
});

describe("buildPortfolioControlModel", () => {
  it("aggregates projects, cashflow and manager workload", () => {
    const model = buildPortfolioControlModel([
      base(),
      base({ id: "project-2", name: "Больница", manager: "Петров", contractAmount: 4_000_000, payments: [{ direction: "outgoing", amount: 2_000_000, status: "planned", plannedAt: "2026-07-01T00:00:00.000Z" }] })
    ], new Date("2026-07-15T00:00:00.000Z"));
    expect(model.summary.projectCount).toBe(2);
    expect(model.summary.contractAmount).toBe(14_000_000);
    expect(model.cashflow).toHaveLength(2);
    expect(model.workload.map((item) => item.manager)).toEqual(["Иванов", "Петров"]);
  });

  it("does not show a false green when source data is missing", () => {
    const model = buildPortfolioControlModel([base({ budgetItems: [], scheduleItems: [], materials: [], payments: [], risks: [], actionItems: [] })]);
    expect(model.projects[0].health).toBe("no_data");
    expect(model.projects[0].healthScore).toBeNull();
    expect(model.summary.noDataProjects).toBe(1);
  });

  it("raises critical status for negative margin, cash exposure and critical risks", () => {
    const model = buildPortfolioControlModel([base({
      budgetItems: [{ qty: 1, plannedUnitPrice: 8_000_000, forecastUnitPrice: 12_000_000 }],
      payments: [{ direction: "outgoing", amount: 3_000_000, status: "planned", plannedAt: "2026-07-01T00:00:00.000Z" }],
      risks: [{ priority: "critical", status: "open", dueAt: "2026-07-10T00:00:00.000Z" }]
    })], new Date("2026-07-15T00:00:00.000Z"));
    expect(model.projects[0].health).toBe("critical");
    expect(model.projects[0].attentionReasons).toContain("Отрицательная прогнозная маржа");
    expect(model.projects[0].cashExposure).toBe(-3_000_000);
  });
});
