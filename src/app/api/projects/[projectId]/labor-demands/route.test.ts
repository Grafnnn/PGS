import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  demandCreate: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectLaborDemand: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectLaborDemand: { create: mocks.demandCreate }
    }))
  }
}));

const demand = {
  id: "demand-1",
  organizationId: "org-1",
  projectId: "project-1",
  importBatchId: null,
  category: "worker",
  profession: "Монтажник",
  function: "Монтаж металлоконструкций",
  grossMonthlySalary: 120000,
  peakHeadcount: 4,
  personMonths: 8,
  plannedHours: 1280,
  productivityNorm: 50,
  productivityUnit: "т/мес.",
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-09-30T00:00:00.000Z"),
  monthlyProfile: [{ month: 1, label: "M1", headcount: 4 }],
  source: "Ручной план ФОТ",
  sourceSheet: null,
  sourceRow: null,
  confidence: 1,
  notes: null,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  allocations: []
};

describe("project labor demands route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "project-1", organizationId: "org-1" } as never);
    vi.mocked(prisma.projectLaborDemand.findMany).mockResolvedValue([] as never);
    mocks.demandCreate.mockResolvedValue(demand);
  });

  it("checks edit permission before parsing a demand", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, {
      params: { projectId: "project-1" }
    });

    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.demandCreate).not.toHaveBeenCalled();
  });

  it("creates a scoped manual demand without creating organization employees", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        category: "worker",
        profession: "Монтажник",
        function: "Монтаж металлоконструкций",
        grossMonthlySalary: 120000,
        peakHeadcount: 4,
        personMonths: 8,
        plannedHours: 1280,
        productivityNorm: 50,
        productivityUnit: "т/мес.",
        startsAt: "2026-08-01",
        endsAt: "2026-09-30",
        monthlyProfile: [{ month: 1, label: "M1", headcount: 4 }],
        source: "Ручной план ФОТ",
        confidence: 1
      })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      item: {
        projectId: "project-1",
        profession: "Монтажник",
        peakHeadcount: 4,
        allocations: []
      }
    });
    expect(mocks.demandCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ projectId: "project-1", category: "worker" })
    }));
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "project_labor_demand",
      action: "create"
    }));
  });
});
