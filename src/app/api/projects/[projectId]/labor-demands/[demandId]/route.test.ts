import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  demandDelete: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectLaborDemand: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectLaborDemand: { delete: mocks.demandDelete }
    }))
  }
}));

const demand = {
  id: "demand-1",
  organizationId: "org-1",
  projectId: "project-1",
  importBatchId: "import-1",
  category: "worker",
  profession: "Монтажник",
  function: null,
  grossMonthlySalary: 120000,
  peakHeadcount: 4,
  personMonths: 8,
  plannedHours: 1280,
  productivityNorm: 0,
  productivityUnit: null,
  startsAt: new Date("2026-08-01T00:00:00.000Z"),
  endsAt: new Date("2026-09-30T00:00:00.000Z"),
  monthlyProfile: [],
  source: "Excel",
  sourceSheet: "ФОТ",
  sourceRow: 3,
  confidence: 1,
  notes: null,
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date(),
  allocations: [],
  project: { organizationId: "org-1" }
};

describe("project labor demand detail route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.projectLaborDemand.findFirst).mockResolvedValue(demand as never);
  });

  it("keeps imported demand and its payroll budget under the Excel replacement workflow", async () => {
    const { DELETE } = await import("./route");
    const response = await DELETE(new Request("https://pgs.local", { method: "DELETE" }), {
      params: { projectId: "project-1", demandId: "demand-1" }
    });

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toMatchObject({
      error: "Imported labor demand must be replaced through Excel import"
    });
    expect(mocks.demandDelete).not.toHaveBeenCalled();
  });
});
