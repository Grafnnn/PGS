import { describe, expect, it } from "vitest";
import { buildChangeOrdersIntelligence } from "@/lib/change-orders-intelligence";

describe("buildChangeOrdersIntelligence", () => {
  it("does not claim a controlled register without project evidence", () => {
    const model = buildChangeOrdersIntelligence({});
    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
  });

  it("surfaces scope, price and schedule change candidates without writing data", () => {
    const model = buildChangeOrdersIntelligence({
      project: { contractAmount: 1_000_000 },
      budgetItems: [{ id: "b1", projectId: "p", section: "Монолит", code: "", name: "Дополнительное армирование", unit: "т", qty: 2, plannedUnitPrice: 100_000, actualUnitPrice: 0, forecastUnitPrice: 130_000, kind: "work", source: "ВОР", comment: "изменение от заказчика" }],
      scheduleItems: [{ id: "s1", projectId: "p", budgetItemId: "b1", name: "Монолит", owner: "ПТО", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 10, actualQty: 12, status: "delayed" }],
      risks: [{ id: "r1", projectId: "p", title: "Изменение проектных решений", reason: "Требуется согласование заказчика", priority: "high", owner: "РП", dueAt: "2026-02-01", status: "open" }]
    });
    expect(model.summary.status).toBe("review_required");
    expect(model.summary.candidateCount).toBeGreaterThanOrEqual(4);
    expect(model.summary.estimatedAmount).toBeGreaterThan(0);
    expect(model.summary.contractReviewRequired).toBe(true);
    expect(model.candidates.map((item) => item.category)).toEqual(expect.arrayContaining(["scope", "price", "schedule", "risk"]));
    expect(model.actions).toHaveLength(4);
  });
});
