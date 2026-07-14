import { describe, expect, it } from "vitest";
import { resolveRfiTransition, resolveSubmittalTransition, workflowSummary, WorkflowConflictError } from "./rfi-submittals";

describe("RFI and submittal workflows", () => {
  it("enforces the RFI lifecycle and requires an answer", () => {
    expect(resolveRfiTransition("draft", "send")).toBe("open");
    expect(() => resolveRfiTransition("open", "answer", "")).toThrow(WorkflowConflictError);
    expect(resolveRfiTransition("open", "answer", "Use detail A-12")).toBe("answered");
    expect(resolveRfiTransition("answered", "close")).toBe("closed");
    expect(resolveRfiTransition("closed", "reopen")).toBe("open");
  });

  it("enforces review and revision cycles for submittals", () => {
    expect(resolveSubmittalTransition("draft", "submit")).toBe("submitted");
    expect(() => resolveSubmittalTransition("submitted", "review")).toThrow(WorkflowConflictError);
    expect(resolveSubmittalTransition("submitted", "review", "revise_required")).toBe("revise_required");
    expect(resolveSubmittalTransition("revise_required", "resubmit")).toBe("submitted");
    expect(resolveSubmittalTransition("submitted", "review", "approved")).toBe("approved");
    expect(resolveSubmittalTransition("approved", "close")).toBe("closed");
  });

  it("reports overdue open items without false green", () => {
    const now = new Date("2026-07-14T12:00:00Z");
    const summary = workflowSummary(
      [{ status: "open", dueAt: new Date("2026-07-13T12:00:00Z") }],
      [{ status: "revise_required", dueAt: new Date("2026-07-12T12:00:00Z") }],
      now
    );
    expect(summary.rfiOverdue).toBe(1);
    expect(summary.submittalOverdue).toBe(1);
    expect(summary.revisionsRequired).toBe(1);
  });
});
