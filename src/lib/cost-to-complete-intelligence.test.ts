import { describe, expect, it } from "vitest";
import { buildCostToCompleteIntelligence } from "@/lib/cost-to-complete-intelligence";

describe("buildCostToCompleteIntelligence", () => {
  it("does not claim a healthy forecast without contract and budget data", () => {
    const model = buildCostToCompleteIntelligence({});
    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
  });

  it("surfaces margin, cash, material and schedule signals from existing project data", () => {
    const model = buildCostToCompleteIntelligence({
      project: { contractAmount: 1_000_000 },
      budgetItems: [{ id: "b1", projectId: "p1", section: "Монолит", code: "", name: "Работы", unit: "шт", qty: 1, plannedUnitPrice: 800_000, actualUnitPrice: 200_000, forecastUnitPrice: 1_020_000, kind: "work", source: "test" }],
      scheduleItems: [{ id: "s1", projectId: "p1", name: "Монолит", owner: "ПТО", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 10, actualQty: 2, status: "delayed" }],
      materials: [{ id: "m1", projectId: "p1", name: "Бетон", unit: "м3", requiredQty: 10, orderedQty: 0, deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 1, actualUnitPrice: 0, supplier: "", neededAt: "2026-01-10", status: "required" }],
      payments: [{ id: "pay1", projectId: "p1", title: "Поставка", counterparty: "Поставщик", direction: "outgoing", plannedAt: "2026-01-10", amount: 2_000_000, status: "approved", category: "supplier" }]
    });
    expect(model.summary.status).toBe("critical");
    expect(model.summary.costToComplete).toBe(820_000);
    expect(model.signals.map((item) => item.id)).toEqual(expect.arrayContaining(["forecast-overrun", "margin-threshold", "cash-gap", "material-deficit", "schedule-delay"]));
    expect(model.actions).toHaveLength(4);
  });
});
