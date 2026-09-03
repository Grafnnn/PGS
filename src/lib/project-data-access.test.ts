import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getUserOrganizationContext, listProjectsFromDb } from "@/lib/project-data";

const mocks = vi.hoisted(() => ({
  projectFindMany: vi.fn(),
  projectFindFirst: vi.fn(),
  projectFindUnique: vi.fn(),
  projectMemberFindUnique: vi.fn(),
  membershipFindFirst: vi.fn(),
  membershipFindUnique: vi.fn(),
  organizationFindUnique: vi.fn(),
  userFindUnique: vi.fn()
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: mocks.projectFindMany, findFirst: mocks.projectFindFirst, findUnique: mocks.projectFindUnique },
    projectMember: { findUnique: mocks.projectMemberFindUnique },
    membership: { findFirst: mocks.membershipFindFirst, findUnique: mocks.membershipFindUnique },
    organization: { findUnique: mocks.organizationFindUnique },
    user: { findUnique: mocks.userFindUnique }
  }
}));

const owner = { id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER" as const, authenticated: true };
const manager = { id: "manager-1", name: "Manager", email: "manager@example.test", role: "MANAGER" as const, authenticated: true };

describe("organization-scoped project data", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.projectFindMany.mockResolvedValue([]);
  });

  const expectedScope = (userId: string) => ({
    OR: [
      { organization: { users: { some: { userId, role: { in: ["owner", "super_admin"] } } } } },
      { organization: { users: { some: { userId } } }, members: { some: { userId } } }
    ]
  });

  it("derives organization-wide visibility from the target membership role", async () => {
    await listProjectsFromDb(owner);

    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedScope("owner-1")
    }));
  });

  it("requires both organization and project membership for project managers", async () => {
    await listProjectsFromDb(manager);

    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      where: expectedScope("manager-1")
    }));
  });

  it("denies even a global owner role outside the user's organizations", async () => {
    mocks.projectFindUnique.mockResolvedValue(null);

    await expect(getEffectiveProjectRole(owner, "foreign-project")).resolves.toBeNull();
    expect(mocks.membershipFindUnique).not.toHaveBeenCalled();
    expect(mocks.projectMemberFindUnique).not.toHaveBeenCalled();
  });

  it("uses the authenticated user's organization for new records", async () => {
    mocks.membershipFindFirst.mockResolvedValue({
      organizationId: "org-1",
      organization: { id: "org-1", name: "Строй Компания" }
    });

    await expect(getUserOrganizationContext(owner)).resolves.toEqual({
      organizationId: "org-1",
      organizationName: "Строй Компания",
      userId: "owner-1"
    });
  });

  it("adds factual progress from the current project schedule", async () => {
    mocks.projectFindMany.mockResolvedValue([{
      id: "project-1",
      organizationId: "org-1",
      name: "Project",
      code: null,
      customer: "Customer",
      object: "Object",
      objectType: null,
      address: "Address",
      description: null,
      contractAmount: { toNumber: () => 1000 },
      vatMode: "vat",
      vatPercent: null,
      startsAt: new Date("2026-01-01"),
      endsAt: new Date("2026-12-31"),
      manager: "Manager",
      tenderSource: null,
      paymentNotes: null,
      volumeChangeMode: null,
      templateId: null,
      selectedModules: [],
      status: "active",
      isSmokeProject: false,
      scheduleItems: [
        { plannedQty: { toNumber: () => 100 }, actualQty: { toNumber: () => 50 }, status: "in_progress" },
        { plannedQty: { toNumber: () => 10 }, actualQty: { toNumber: () => 0 }, status: "not_started" }
      ]
    }]);

    const projects = await listProjectsFromDb(owner);

    expect(projects[0]?.progressPercent).toBe(25);
    expect(mocks.projectFindMany).toHaveBeenCalledWith(expect.objectContaining({
      include: {
        scheduleItems: {
          where: { isCurrent: true },
          select: { plannedQty: true, actualQty: true, status: true }
        }
      }
    }));
  });

  it("reports missing schedule progress as unknown instead of zero percent", async () => {
    mocks.projectFindMany.mockResolvedValue([{
      id: "project-1", organizationId: "org-1", name: "Project", code: null, customer: "Customer", object: "Object",
      objectType: null, address: "Address", description: null, contractAmount: { toNumber: () => 1000 }, vatMode: "vat",
      vatPercent: null, startsAt: new Date("2026-01-01"), endsAt: new Date("2026-12-31"), manager: "Manager",
      tenderSource: null, paymentNotes: null, volumeChangeMode: null, templateId: null, selectedModules: [], status: "active",
      isSmokeProject: false, scheduleItems: []
    }]);

    const projects = await listProjectsFromDb(owner);

    expect(projects[0]?.progressPercent).toBeNull();
  });
});
