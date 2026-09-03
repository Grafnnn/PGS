import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";

const mocks = vi.hoisted(() => ({
  projectFind: vi.fn(),
  userFind: vi.fn(),
  memberUpsert: vi.fn(),
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
      user: { findFirst: mocks.userFind },
      projectMember: { upsert: mocks.memberUpsert },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

describe("project member organization scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    mocks.canProjectLocked.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
  });

  it("rejects a global user who is not a member of the project organization", async () => {
    mocks.userFind.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.test/api/projects/project-1/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "other-org@example.test", role: "MANAGER" })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(404);
    expect(mocks.userFind).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ memberships: { some: { organizationId: "org-1" } } })
    }));
    expect(mocks.memberUpsert).not.toHaveBeenCalled();
  });

  it("rechecks manage-members permission after obtaining the project lock", async () => {
    mocks.canProjectLocked.mockResolvedValue(false);
    mocks.userFind.mockResolvedValue({ id: "user-2" });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.test/api/projects/project-1/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "member@example.test", role: "MANAGER" })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect(mocks.lockProject).toHaveBeenCalledWith(expect.anything(), "project-1");
    expect(mocks.canProjectLocked).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ id: "owner-1" }), "project-1", "manage_members");
    expect(mocks.projectFind).not.toHaveBeenCalled();
    expect(mocks.memberUpsert).not.toHaveBeenCalled();
  });
});
