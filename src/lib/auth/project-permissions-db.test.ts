import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "./project-permissions";

const mocks = vi.hoisted(() => ({
  projectFind: vi.fn(),
  membershipFind: vi.fn(),
  projectMemberFind: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    membership: { findUnique: mocks.membershipFind },
    projectMember: { findUnique: mocks.projectMemberFind }
  }
}));

const user = { id: "user-1", name: "User", email: "user@example.test", role: "OWNER", authenticated: true } as const;

describe("target organization project role", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFind.mockResolvedValue({ organizationId: "org-target" });
  });

  it("does not carry a global owner role into another organization", async () => {
    mocks.membershipFind.mockResolvedValue({ role: "subcontractor" });
    mocks.projectMemberFind.mockResolvedValue({ role: "VIEWER" });
    await expect(getEffectiveProjectRole(user, "project-1")).resolves.toBe("VIEWER");
  });

  it("grants organization owner authority even when the legacy global role is lower", async () => {
    mocks.membershipFind.mockResolvedValue({ role: "owner" });
    await expect(getEffectiveProjectRole({ ...user, role: "VIEWER" }, "project-1")).resolves.toBe("OWNER");
    expect(mocks.projectMemberFind).not.toHaveBeenCalled();
  });

  it("denies access without a membership in the target organization", async () => {
    mocks.membershipFind.mockResolvedValue(null);
    await expect(getEffectiveProjectRole(user, "project-1")).resolves.toBeNull();
    expect(mocks.projectMemberFind).not.toHaveBeenCalled();
  });
});
