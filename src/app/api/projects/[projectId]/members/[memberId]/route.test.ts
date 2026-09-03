import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  projectFind: vi.fn(),
  memberFind: vi.fn(),
  membersFind: vi.fn(),
  memberUpdate: vi.fn(),
  memberDelete: vi.fn(),
  auditCreate: vi.fn(async () => ({})),
  lockProject: vi.fn(async () => undefined),
  canProjectLocked: vi.fn(async () => true)
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({
  canProject: vi.fn(async () => true),
  canProjectWithClient: mocks.canProjectLocked
}));
vi.mock("@/lib/admin/user-scope", () => ({ lockProject: mocks.lockProject }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      project: { findUnique: mocks.projectFind },
      projectMember: {
        findFirst: mocks.memberFind,
        findMany: mocks.membersFind,
        update: mocks.memberUpdate,
        delete: mocks.memberDelete
      },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const owner = {
  id: "member-1",
  userId: "user-1",
  projectId: "project-1",
  role: "OWNER",
  createdAt: new Date("2026-09-01T00:00:00.000Z"),
  user: { id: "user-1", email: "owner@example.test", name: "Owner", isActive: true, memberships: [{ role: "owner" }] }
};

describe("project member owner serialization", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.canProjectLocked.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.memberFind.mockResolvedValue(owner);
    mocks.membersFind.mockResolvedValue([{ id: "member-1", role: "OWNER" }]);
  });

  it("locks the project and refuses to downgrade the last project owner", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.test/api/projects/project-1/members/member-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "MANAGER" })
    }) as never, { params: { projectId: "project-1", memberId: "member-1" } });

    expect(response.status).toBe(400);
    expect(mocks.lockProject).toHaveBeenCalledWith(expect.anything(), "project-1");
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });

  it("refuses to delete the last project owner under the same lock", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.test") as never, {
      params: { projectId: "project-1", memberId: "member-1" }
    });

    expect(response.status).toBe(400);
    expect(mocks.lockProject).toHaveBeenCalledWith(expect.anything(), "project-1");
    expect(mocks.memberDelete).not.toHaveBeenCalled();
  });

  it("stops a queued role change when permission was revoked before the lock was acquired", async () => {
    mocks.canProjectLocked.mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.test/api/projects/project-1/members/member-1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ role: "MANAGER" })
    }) as never, { params: { projectId: "project-1", memberId: "member-1" } });

    expect(response.status).toBe(403);
    expect(mocks.memberFind).not.toHaveBeenCalled();
    expect(mocks.memberUpdate).not.toHaveBeenCalled();
  });
});
