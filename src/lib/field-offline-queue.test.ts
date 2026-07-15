import { describe, expect, it } from "vitest";
import { classifyFieldSyncResponse, createFieldQueueItem } from "./field-offline-queue";

describe("field offline queue", () => {
  it("creates a stable pending operation without server credentials", () => {
    const item = createFieldQueueItem({
      projectId: "project-1",
      kind: "field_issue",
      payload: { title: "Ограждение повреждено", description: "Северная зона", priority: "high", assignee: "Прораб", dueAt: null }
    }, new Date("2026-07-15T10:00:00.000Z"), "mutation-1");

    expect(item).toMatchObject({
      id: "mutation-1",
      projectId: "project-1",
      kind: "field_issue",
      state: "pending",
      attempts: 0,
      capturedAt: "2026-07-15T10:00:00.000Z"
    });
    expect(JSON.stringify(item)).not.toMatch(/cookie|token|password/i);
  });

  it("separates conflicts, authorization failures and retryable server errors", () => {
    expect(classifyFieldSyncResponse(201).state).toBe("synced");
    expect(classifyFieldSyncResponse(409).state).toBe("conflict");
    expect(classifyFieldSyncResponse(403)).toMatchObject({ state: "failed", retryable: false });
    expect(classifyFieldSyncResponse(503)).toMatchObject({ state: "failed", retryable: true });
  });
});
