import { describe, expect, it } from "vitest";
import { changeOrderAmounts, changeOrderSummary, resolveChangeOrderTransition } from "@/lib/change-order-management";

describe("change order management", () => {
  it("calculates each financial stage from quantity and unit values", () => {
    expect(changeOrderAmounts([{ quantity: 2, estimatedUnitPrice: 100, proposedUnitPrice: 120, submittedUnitPrice: 130, approvedUnitPrice: 125, committedUnitPrice: 125 }])).toEqual({ estimated: 200, proposed: 240, submitted: 260, approved: 250, committed: 250 });
  });

  it("allows only explicit lifecycle transitions", () => {
    expect(resolveChangeOrderTransition("draft", "open")).toBe("open");
    expect(resolveChangeOrderTransition("open", "submit")).toBe("submitted");
    expect(resolveChangeOrderTransition("submitted", "approve")).toBe("approved");
    expect(resolveChangeOrderTransition("approved", "execute")).toBe("executed");
    expect(() => resolveChangeOrderTransition("draft", "execute")).toThrow();
  });

  it("keeps pending, approved and committed exposure separate", () => {
    const now = new Date("2026-07-16T12:00:00Z");
    const summary = changeOrderSummary([
      { status: "submitted", submittedAmount: 100, approvedAmount: 0, committedAmount: 0, dueAt: new Date("2026-07-15T12:00:00Z") },
      { status: "approved", submittedAmount: 200, approvedAmount: 180, committedAmount: 0, dueAt: null },
      { status: "executed", submittedAmount: 300, approvedAmount: 290, committedAmount: 290, dueAt: null }
    ], now);
    expect(summary).toMatchObject({ total: 3, active: 2, submitted: 100, approved: 470, committed: 290, overdue: 1 });
  });
});
