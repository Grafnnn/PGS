import { describe, expect, it } from "vitest";
import { canActOnWorkflowStep, dueDateFrom, resolveWorkflowTransition, workflowRunActionSchema, workflowSummary, workflowTemplateCreateSchema } from "./project-workflows";

describe("project workflow designer", () => {
  it("validates a bounded serial approval template", () => {
    const template = workflowTemplateCreateSchema.parse({
      name: "Согласование договора",
      category: "contract",
      steps: [
        { name: "Проверка", stepType: "review", assigneeRole: "MANAGER", dueDays: 2 },
        { name: "Решение", stepType: "approval", assigneeRole: "OWNER", dueDays: 1 }
      ]
    });
    expect(template.steps).toHaveLength(2);
    expect(template.steps[0].description).toBe("");
    expect(() => workflowTemplateCreateSchema.parse({ name: "x", steps: [] })).toThrow();
  });

  it("advances serial steps and closes only after the last approval", () => {
    expect(resolveWorkflowTransition({ runStatus: "active", currentSequence: 1, totalSteps: 3, action: "approve" })).toEqual({ runStatus: "active", currentStep: 2, activateStep: 2, terminal: false });
    expect(resolveWorkflowTransition({ runStatus: "active", currentSequence: 3, totalSteps: 3, action: "approve" })).toEqual({ runStatus: "approved", currentStep: 3, activateStep: null, terminal: true });
  });

  it("returns to the previous step and treats rejection as terminal", () => {
    expect(resolveWorkflowTransition({ runStatus: "active", currentSequence: 3, totalSteps: 3, action: "request_revision" })).toEqual({ runStatus: "active", currentStep: 2, activateStep: 2, terminal: false });
    expect(resolveWorkflowTransition({ runStatus: "active", currentSequence: 1, totalSteps: 3, action: "request_revision" }).currentStep).toBe(1);
    expect(resolveWorkflowTransition({ runStatus: "active", currentSequence: 2, totalSteps: 3, action: "reject" }).runStatus).toBe("rejected");
  });

  it("enforces ball-in-court roles", () => {
    expect(canActOnWorkflowStep("MANAGER", "MANAGER")).toBe(true);
    expect(canActOnWorkflowStep("MANAGER", "OWNER")).toBe(false);
    expect(canActOnWorkflowStep("ADMIN", "OWNER")).toBe(true);
    expect(canActOnWorkflowStep("OWNER", "ADMIN")).toBe(true);
    expect(canActOnWorkflowStep("VIEWER", "MANAGER")).toBe(false);
  });

  it("requires structured actions and computes due dates and summaries deterministically", () => {
    expect(workflowRunActionSchema.parse({ action: "approve" })).toEqual({ action: "approve", comment: "" });
    expect(dueDateFrom(new Date("2026-07-15T10:00:00.000Z"), 3).toISOString()).toBe("2026-07-18T10:00:00.000Z");
    const summary = workflowSummary([
      { status: "active", steps: [{ status: "active", dueAt: new Date("2026-07-14T10:00:00.000Z") }] },
      { status: "approved", steps: [{ status: "approved", dueAt: null }] },
      { status: "rejected", steps: [{ status: "rejected", dueAt: null }] }
    ], new Date("2026-07-15T10:00:00.000Z"));
    expect(summary).toEqual({ total: 3, active: 1, awaitingApproval: 0, overdue: 1, approved: 1, rejected: 1 });
  });
});
