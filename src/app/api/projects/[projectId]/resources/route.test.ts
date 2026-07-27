import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  resourceCreate: vi.fn(),
  assignmentCreate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    organizationResource: { findMany: vi.fn(), findFirst: vi.fn(), create: mocks.resourceCreate },
    projectResourceAssignment: { findMany: vi.fn(), create: mocks.assignmentCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      organizationResource: { create: mocks.resourceCreate },
      projectResourceAssignment: { create: mocks.assignmentCreate }
    }))
  }
}));

const resource = {
  id: "resource-1",
  organizationId: "org-1",
  kind: "crew",
  name: "Бригада",
  profession: "Монолит",
  employmentType: "hired",
  headcount: 8,
  capacityHoursPerMonth: 160,
  productivityNorm: 12,
  productivityUnit: "м3/смена",
  monthlyCost: 800000,
  hourlyCost: 625,
  certifications: ["ОТ"],
  status: "active",
  notes: null,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date()
};
const assignment = {
  id: "assignment-1",
  organizationId: "org-1",
  projectId: "project-1",
  resourceId: "resource-1",
  startsAt: new Date("2026-07-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-01T00:00:00.000Z"),
  allocationPercent: 100,
  plannedHours: 1000,
  plannedOutput: 250,
  status: "active",
  notes: null,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("project workforce resources route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "project-1", organizationId: "org-1" } as never);
    vi.mocked(prisma.projectResourceAssignment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.organizationResource.findMany).mockResolvedValue([] as never);
    mocks.resourceCreate.mockResolvedValue(resource);
    mocks.assignmentCreate.mockResolvedValue(assignment);
  });

  it("guards reads before querying workforce data", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("does not expose the organization resource registry to project viewers", async () => {
    vi.mocked(canProject).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    expect(prisma.organizationResource.findMany).not.toHaveBeenCalled();
    await expect(response.json()).resolves.toMatchObject({
      available: [],
      permissions: { edit: false }
    });
  });

  it("requires edit permission before parsing create payload", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.resourceCreate).not.toHaveBeenCalled();
  });

  it("creates a resource and project assignment atomically", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        kind: "crew",
        name: "Бригада",
        profession: "Монолит",
        employmentType: "hired",
        headcount: 8,
        capacityHoursPerMonth: 160,
        productivityNorm: 12,
        productivityUnit: "м3/смена",
        monthlyCost: 800000,
        hourlyCost: 625,
        certifications: ["ОТ"],
        status: "active",
        assignment: {
          startsAt: "2026-07-01",
          endsAt: "2026-08-01",
          allocationPercent: 100,
          plannedHours: 1000,
          plannedOutput: 250,
          status: "active"
        }
      })
    }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.resourceCreate).toHaveBeenCalled();
    expect(mocks.assignmentCreate).toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ entity: "organization_resource", action: "create" }));
  });
});
