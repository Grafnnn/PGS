import { describe, expect, it } from "vitest";
import { projectActionCreateSchema, projectActionSummary, projectActionUpdateSchema, serializeProjectAction } from "@/lib/project-actions";

describe("project actions", () => {
  it("validates bounded action input and defaults", () => {
    expect(projectActionCreateSchema.parse({ title: "Проверить исполнительную схему" })).toMatchObject({
      priority: "medium",
      requiresApproval: false,
      sourceModule: "manual"
    });
    expect(() => projectActionCreateSchema.parse({ title: "x" })).toThrow();
    expect(() => projectActionCreateSchema.parse({ title: "Выполнить", priority: "urgent" })).toThrow();
  });

  it("allows workflow statuses and explicit approval command", () => {
    expect(projectActionUpdateSchema.parse({ status: "waiting_approval", approve: true })).toEqual({ status: "waiting_approval", approve: true });
    expect(() => projectActionUpdateSchema.parse({ status: "unknown" })).toThrow();
  });

  it("summarizes active, overdue, blocked and approval work", () => {
    const now = new Date("2026-07-14T12:00:00.000Z");
    expect(projectActionSummary([
      { status: "open", dueAt: new Date("2026-07-13T12:00:00.000Z") },
      { status: "blocked", dueAt: null },
      { status: "waiting_approval", dueAt: new Date("2026-07-15T12:00:00.000Z") },
      { status: "done", dueAt: new Date("2026-07-10T12:00:00.000Z") }
    ], now)).toEqual({ total: 4, open: 3, blocked: 1, waitingApproval: 1, overdue: 1, done: 1 });
  });

  it("serializes dates without exposing persistence metadata", () => {
    const serialized = serializeProjectAction({
      id: "action-1",
      projectId: "project-1",
      title: "Согласовать замену",
      description: null,
      sourceModule: "Материалы",
      targetTab: "Материалы",
      priority: "high",
      status: "open",
      assignee: "РП",
      dueAt: new Date("2026-07-15T12:00:00.000Z"),
      completedAt: null,
      requiresApproval: true,
      approvedAt: null,
      approvedBy: null,
      createdAt: new Date("2026-07-14T12:00:00.000Z"),
      updatedAt: new Date("2026-07-14T12:00:00.000Z")
    });
    expect(serialized.dueAt).toBe("2026-07-15T12:00:00.000Z");
    expect(serialized).not.toHaveProperty("organizationId");
    expect(serialized).not.toHaveProperty("createdBy");
  });
});
