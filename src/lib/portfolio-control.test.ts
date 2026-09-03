import { describe, expect, it } from "vitest";
import { buildPortfolioControlModel, buildPortfolioCostStructure, type PortfolioProjectSource } from "@/lib/portfolio-control";

const base = (overrides: Partial<PortfolioProjectSource> = {}): PortfolioProjectSource => ({
  id: "project-1", name: "Школа", code: "SCH", customer: "Заказчик", manager: "Иванов", status: "active", contractAmount: 10_000_000,
  startsAt: "2026-01-01T00:00:00.000Z", endsAt: "2026-12-31T00:00:00.000Z",
  budgetItems: [{ qty: 1, plannedUnitPrice: 7_000_000, forecastUnitPrice: 8_000_000, kind: "work" }],
  scheduleItems: [{ name: "Каркас", plannedQty: 100, actualQty: 60, status: "in_progress", endsAt: "2026-08-01T00:00:00.000Z" }],
  materials: [{ requiredQty: 100, orderedQty: 100, deliveredQty: 100, status: "delivered", neededAt: "2026-07-01T00:00:00.000Z" }],
  payments: [
    { direction: "incoming", amount: 5_000_000, status: "paid", plannedAt: "2026-06-01T00:00:00.000Z", paidAt: "2026-06-01T00:00:00.000Z" },
    { direction: "outgoing", amount: 3_000_000, status: "paid", plannedAt: "2026-06-10T00:00:00.000Z", paidAt: "2026-06-10T00:00:00.000Z" }
  ],
  expenses: [],
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
    const model = buildPortfolioControlModel([base({ budgetItems: [], scheduleItems: [], materials: [], payments: [], expenses: [], risks: [], actionItems: [] })]);
    expect(model.projects[0].health).toBe("no_data");
    expect(model.projects[0].healthScore).toBeNull();
    expect(model.summary.noDataProjects).toBe(1);
  });

  it("raises critical status for negative margin, cash exposure and critical risks", () => {
    const model = buildPortfolioControlModel([base({
      budgetItems: [{ qty: 1, plannedUnitPrice: 8_000_000, forecastUnitPrice: 12_000_000, kind: "work" }],
      payments: [{ direction: "outgoing", amount: 3_000_000, status: "planned", plannedAt: "2026-07-01T00:00:00.000Z" }],
      risks: [{ priority: "critical", status: "open", dueAt: "2026-07-10T00:00:00.000Z" }]
    })], new Date("2026-07-15T00:00:00.000Z"));
    expect(model.projects[0].health).toBe("critical");
    expect(model.projects[0].attentionReasons).toContain("Отрицательная прогнозная маржа");
    expect(model.projects[0].cashExposure).toBe(-3_000_000);
  });

  it("averages work progress per item instead of adding incompatible units", () => {
    const model = buildPortfolioControlModel([base({
      scheduleItems: [
        { name: "Бетон", plannedQty: 1000, actualQty: 500, status: "in_progress", endsAt: "2026-10-01T00:00:00.000Z" },
        { name: "Двери", plannedQty: 2, actualQty: 2, status: "done", endsAt: "2026-10-01T00:00:00.000Z" }
      ]
    })]);

    expect(model.projects[0].progressPercent).toBe(75);
  });

  it("uses registered RUB expenses as a factual lower bound for cost forecast", () => {
    const model = buildPortfolioControlModel([base({
      budgetItems: [{ qty: 1, plannedUnitPrice: 7_000_000, forecastUnitPrice: 8_000_000, kind: "work" }],
      expenses: [
        { grossAmount: 9_000_000, category: "materials", currency: "RUB" },
        { grossAmount: 1_000, category: "other", currency: "USD" }
      ]
    })]);

    expect(model.projects[0]).toMatchObject({
      forecastCost: 9_000_000,
      forecastProfit: 1_000_000,
      actualExpenses: 9_000_000,
      excludedNonRubExpenses: 1,
      financialForecastAvailable: true
    });
    expect(model.summary.actualExpenses).toBe(9_000_000);
    expect(model.summary.excludedNonRubExpenses).toBe(1);
  });

  it("does not invent a 100 percent margin when no budget or actual cost exists", () => {
    const model = buildPortfolioControlModel([base({ budgetItems: [], expenses: [] })]);

    expect(model.projects[0].forecastMarginPercent).toBeNull();
    expect(model.projects[0].financialForecastAvailable).toBe(false);
    expect(model.projects[0].forecastProfit).toBe(0);
    expect(model.summary.financialForecastProjects).toBe(0);
  });

  it("shows actual expenses but does not call them a completion forecast without a budget", () => {
    const model = buildPortfolioControlModel([base({
      budgetItems: [],
      expenses: [{ grossAmount: 250_000, category: "materials", currency: "RUB" }]
    })]);

    expect(model.projects[0]).toMatchObject({ actualExpenses: 250_000, forecastCost: 0, forecastProfit: 0, financialForecastAvailable: false });
    expect(model.projects[0].forecastMarginPercent).toBeNull();
    expect(model.projects[0].attentionReasons).toContain("Фактические расходы не сопоставлены с бюджетом");
  });

  it("builds portfolio cost structure from forecast and RUB actuals without mixing currencies", () => {
    const structure = buildPortfolioCostStructure([base({
      budgetItems: [
        { qty: 2, plannedUnitPrice: 100, forecastUnitPrice: 120, kind: "material" },
        { qty: 1, plannedUnitPrice: 50, forecastUnitPrice: 50, kind: "payroll" }
      ],
      expenses: [
        { grossAmount: 100, category: "materials", currency: "RUB" },
        { grossAmount: 75, category: "labor", currency: "RUB" },
        { grossAmount: 500, category: "materials", currency: "USD" }
      ]
    })]);

    expect(structure).toEqual([
      { key: "material", label: "Материалы", forecast: 240, actual: 100 },
      { key: "payroll", label: "ФОТ", forecast: 50, actual: 75 }
    ]);
  });

  it("classifies a mixed receipt by expense lines instead of its header category", () => {
    const structure = buildPortfolioCostStructure([base({
      budgetItems: [],
      expenses: [{
        grossAmount: 1_000,
        category: "other",
        currency: "RUB",
        items: [
          { amount: 700, category: "materials" },
          { amount: 250, category: "labor" }
        ]
      }]
    })]);

    expect(structure).toEqual([
      { key: "material", label: "Материалы", forecast: 0, actual: 700 },
      { key: "payroll", label: "ФОТ", forecast: 0, actual: 250 },
      { key: "other", label: "Прочее", forecast: 0, actual: 50 }
    ]);
  });
});
