import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { loadApprovalInbox } from "@/lib/approval-inbox-data";

const mocks = vi.hoisted(() => ({
  upsert: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/approval-inbox-data", () => ({ loadApprovalInbox: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    inboxItemState: { upsert: mocks.upsert }
  }
}));

const user = { id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER" as const, authenticated: true };
const item = { key: "workflow_step:run-1", title: "Согласовать договор" };

describe("approval inbox state route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(loadApprovalInbox).mockResolvedValue({
      items: [item],
      summary: {},
      projects: [],
      scopeByKey: new Map([[item.key, { organizationId: "org-1", projectId: "project-1" }]])
    } as never);
    mocks.upsert.mockResolvedValue({
      itemKey: item.key,
      readAt: new Date("2026-07-24T12:00:00.000Z"),
      snoozedUntil: null,
      archivedAt: null
    });
  });

  it("rejects anonymous mutations before parsing the request", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local/api/inbox/state", { method: "PATCH", body: "not-json" }));
    expect(response.status).toBe(401);
    expect(loadApprovalInbox).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("rejects malformed or inaccessible source keys", async () => {
    const { PATCH } = await import("./route");
    const malformed = await PATCH(
      new Request("https://pgs.local/api/inbox/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: "workflow_step:../../secret", action: "read" })
      })
    );
    expect(malformed.status).toBe(400);

    const missing = await PATCH(
      new Request("https://pgs.local/api/inbox/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: "workflow_step:run-2", action: "read" })
      })
    );
    expect(missing.status).toBe(404);
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("limits snooze duration and persists valid state changes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-24T12:00:00.000Z"));
    const { PATCH } = await import("./route");
    const tooLong = await PATCH(
      new Request("https://pgs.local/api/inbox/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, action: "snooze", snoozedUntil: "2026-09-01T12:00:00.000Z" })
      })
    );
    expect(tooLong.status).toBe(400);

    const response = await PATCH(
      new Request("https://pgs.local/api/inbox/state", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemKey: item.key, action: "read" })
      })
    );
    expect(response.status).toBe(200);
    expect(mocks.upsert).toHaveBeenCalledWith(expect.objectContaining({ where: { userId_itemKey: { userId: "owner-1", itemKey: item.key } } }));
    vi.useRealTimers();
  });
});
