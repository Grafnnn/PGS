import { beforeEach, describe, expect, it, vi } from "vitest";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserOrganizationContext } from "@/lib/project-data";

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(),
  hashPassword: vi.fn(async () => "hashed")
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/permissions", () => ({ canManageUsers: vi.fn() }));
vi.mock("@/lib/auth/password", () => ({ hashPassword: mocks.hashPassword }));
vi.mock("@/lib/project-data", () => ({ getUserOrganizationContext: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: { findMany: mocks.findMany },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      user: { create: mocks.create },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const admin = { id: "admin-1", name: "Admin", email: "admin@example.test", role: "ADMIN", authenticated: true } as const;
const user = {
  id: "user-1",
  email: "user@example.test",
  name: "User",
  appRole: "MANAGER",
  isActive: true,
  lastLoginAt: null,
  createdAt: new Date("2026-09-01T00:00:00.000Z")
};

describe("admin users organization scope", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(admin);
    vi.mocked(canManageUsers).mockReturnValue(true);
    vi.mocked(getUserOrganizationContext).mockResolvedValue({ organizationId: "org-1", organizationName: "Org 1", userId: admin.id });
    mocks.findMany.mockResolvedValue([user]);
    mocks.create.mockResolvedValue(user);
  });

  it("lists only users belonging to the administrator organization", async () => {
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.user.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { memberships: { some: { organizationId: "org-1" } } }
    }));
  });

  it("creates the user membership and audit in the same organization", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local/api/admin/users", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: user.email, name: user.name, role: "MANAGER", password: "Strong!Pass-2026" })
    }) as never);

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith({ data: expect.objectContaining({
      email: user.email,
      passwordHash: "hashed",
      memberships: { create: { organizationId: "org-1", role: "project_manager" } }
    }) });
    expect(mocks.audit).toHaveBeenCalledWith({ data: expect.objectContaining({ organizationId: "org-1", entity: "user", action: "create" }) });
  });

  it("rejects administration without an organization membership", async () => {
    vi.mocked(getUserOrganizationContext).mockResolvedValue(null);
    const { GET } = await import("./route");
    const response = await GET();

    expect(response.status).toBe(403);
    expect(mocks.findMany).not.toHaveBeenCalled();
  });
});
