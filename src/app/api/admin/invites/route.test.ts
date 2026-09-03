import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getAdminOrganizationContext } from "@/lib/admin/user-scope";

const mocks = vi.hoisted(() => ({
  projectFindFirst: vi.fn(),
  inviteCreate: vi.fn(),
  auditCreate: vi.fn(),
  send: vi.fn(async () => ({ ok: true }))
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/admin/user-scope", () => ({ getAdminOrganizationContext: vi.fn() }));
vi.mock("@/lib/auth/tokens", () => ({
  generateOneTimeToken: () => "raw-token",
  hashOneTimeToken: () => "hashed-token",
  INVITE_TOKEN_TTL_HOURS: 24,
  tokenExpiresAt: () => new Date("2026-09-04T00:00:00.000Z")
}));
vi.mock("@/lib/env", () => ({ getEnv: () => ({ APP_URL: "https://pgs.test", NODE_ENV: "production" }) }));
vi.mock("@/lib/email", () => ({
  buildInviteEmail: (input: unknown) => input,
  getEmailProvider: () => ({ send: mocks.send })
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findFirst: mocks.projectFindFirst },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      userInvite: { create: mocks.inviteCreate },
      auditLog: { create: mocks.auditCreate }
    }))
  }
}));

const admin = { id: "admin-1", name: "Admin", email: "admin@example.test", role: "ADMIN", authenticated: true } as const;
const invite = {
  id: "invite-1",
  email: "worker@example.test",
  role: "VIEWER",
  projectId: null,
  projectRole: null,
  expiresAt: new Date("2026-09-04T00:00:00.000Z")
};

describe("admin invites organization scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(getAdminOrganizationContext).mockResolvedValue({ organizationId: "org-1", userId: admin.id, role: "ADMIN" });
    mocks.inviteCreate.mockResolvedValue(invite);
  });

  it("creates an organization invite in the current administrator organization", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.test/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: invite.email, role: "VIEWER" })
    }));

    expect(response.status).toBe(201);
    expect(mocks.inviteCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org-1" }) });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org-1" }) });
  });

  it("does not allow an administrator to invite into a project from another organization", async () => {
    mocks.projectFindFirst.mockResolvedValue(null);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.test/api/admin/invites", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: invite.email, role: "VIEWER", projectId: "project-other" })
    }));

    expect(response.status).toBe(404);
    expect(prisma.project.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "project-other", organizationId: "org-1" }
    }));
    expect(mocks.inviteCreate).not.toHaveBeenCalled();
  });
});
