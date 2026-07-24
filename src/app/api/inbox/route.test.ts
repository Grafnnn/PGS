import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { loadApprovalInbox } from "@/lib/approval-inbox-data";

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/approval-inbox-data", () => ({ loadApprovalInbox: vi.fn() }));

const user = { id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER" as const, authenticated: true };
const loaded = {
  items: [{ key: "workflow_step:run-1", title: "Согласовать договор" }],
  summary: { active: 1, approvals: 1, overdue: 0, blocked: 0, unread: 1, snoozed: 0, archived: 0 },
  projects: [{ id: "project-1", name: "Школа", code: "PGS-01" }],
  scopeByKey: new Map()
};

describe("approval inbox route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(loadApprovalInbox).mockResolvedValue(loaded as never);
  });

  it("rejects anonymous reads before loading inbox data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/api/inbox"));
    expect(response.status).toBe(401);
    expect(loadApprovalInbox).not.toHaveBeenCalled();
  });

  it("returns the role-scoped queue without caching", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/api/inbox"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.items).toHaveLength(1);
    expect(body.summary).toMatchObject({ active: 1, unread: 1 });
    expect(loadApprovalInbox).toHaveBeenCalledWith(user);
  });

  it("supports a compact summary response for the navigation badge", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local/api/inbox?summary=1"));
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.summary.unread).toBe(1);
    expect(body.items).toBeUndefined();
    expect(body.projects).toBeUndefined();
  });
});
