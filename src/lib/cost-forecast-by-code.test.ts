import { describe, expect, it } from "vitest";
import { buildCostForecastByCode } from "@/lib/cost-forecast-by-code";

describe("buildCostForecastByCode", () => {
  it("builds a deterministic EAC and VAC by cost code", () => {
    const model = buildCostForecastByCode({
      costCodes: [{ id: "cc-1", code: "03.10", name: "Монолит" }],
      baselineLines: [{ costCodeId: "cc-1", budget: 100 }],
      budgetItems: [],
      periodLines: [{ costCodeId: "cc-1", earnedValue: 40, actualCost: 50 }],
      changeOrderItems: [],
      commitmentLines: [{
        costCodeId: "cc-1",
        scheduledValue: 80,
        commitment: { status: "active" },
        paymentApplicationLines: [{
          currentAmount: 20,
          materialsStored: 0,
          retentionAmount: 0,
          application: { status: "approved" }
        }]
      }],
      payments: [{ costCodeId: "cc-1", direction: "outgoing", status: "paid", amount: 50 }]
    });
    expect(model.lines[0]).toMatchObject({
      budgetAtCompletion: 100,
      earnedValue: 40,
      actualCost: 50,
      openCommitments: 60,
      costPerformanceIndex: 0.8,
      estimateToComplete: 75,
      estimateAtCompletion: 125,
      varianceAtCompletion: -25,
      tone: "bad",
      sourceQuality: "controlled"
    });
    expect(model.summary.status).toBe("critical");
  });

  it("keeps EV and actual cost on the same published control-period cut-off", () => {
    const model = buildCostForecastByCode({
      costCodes: [{ id: "cc-1", code: "03.10", name: "Монолит" }],
      baselineLines: [{ costCodeId: "cc-1", budget: 100 }],
      budgetItems: [],
      periodLines: [{ costCodeId: "cc-1", earnedValue: 40, actualCost: 40 }],
      changeOrderItems: [],
      commitmentLines: [],
      payments: [{ costCodeId: "cc-1", direction: "outgoing", status: "paid", amount: 75 }]
    });

    expect(model.lines[0]).toMatchObject({
      earnedValue: 40,
      actualCost: 40,
      costPerformanceIndex: 1
    });
  });

  it("does not report green when control data is missing", () => {
    const model = buildCostForecastByCode({
      costCodes: [],
      baselineLines: [],
      budgetItems: [],
      periodLines: [],
      changeOrderItems: [],
      commitmentLines: [],
      payments: []
    });
    expect(model.summary.status).toBe("no_data");
    expect(model.lines).toEqual([]);
    expect(model.limitations.length).toBeGreaterThanOrEqual(3);
  });
});
