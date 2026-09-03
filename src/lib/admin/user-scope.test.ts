import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/lib/prisma";
import { assertSingleOrganizationUser, getAdminOrganizationContext, MultiOrganizationUserMutationError } from "./user-scope";

const mocks = vi.hoisted(() => ({
  membershipFind: vi.fn(),
  membershipCount: vi.fn()
}));

vi.mock("@/lib/env", () => ({ getEnvStatus: () => ({ authRequired: true }) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    membership: {
      findFirst: mocks.membershipFind,
      count: mocks.membershipCount
    }
  }
}));

const user = { id: "user-1", name: "User", email: "user@example.test", role: "OWNER", authenticated: true } as const;

describe("admin organization scope", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the membership role instead of the global session role", async () => {
    mocks.membershipFind.mockResolvedValue({ organizationId: "org-1", role: "project_manager" });
    await expect(getAdminOrganizationContext(user)).resolves.toBeNull();

    mocks.membershipFind.mockResolvedValue({ organizationId: "org-1", role: "owner" });
    await expect(getAdminOrganizationContext({ ...user, role: "VIEWER" })).resolves.toEqual({
      organizationId: "org-1",
      userId: "user-1",
      role: "OWNER"
    });
    expect(mocks.membershipFind).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { userId: "user-1", role: { in: ["owner", "super_admin"] } }
    }));
  });

  it("blocks global account mutation for a multi-organization user", async () => {
    mocks.membershipCount.mockResolvedValue(2);
    await expect(assertSingleOrganizationUser(prisma as never, "user-1")).rejects.toBeInstanceOf(MultiOrganizationUserMutationError);
  });
});
