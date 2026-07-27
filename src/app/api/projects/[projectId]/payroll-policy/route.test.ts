import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  writeAudit: vi.fn(async () => ({})),
  upsert: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.writeAudit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectPayrollPolicy: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectPayrollPolicy: { upsert: mocks.upsert }
    }))
  }
}));

const savedPolicy = {
  id: "policy-1",
  organizationId: "org-1",
  projectId: "project-1",
  insuranceContributionRate: 30,
  accidentContributionRate: 0.4,
  personalIncomeTaxRate: 13,
  workingHoursPerMonth: 160,
  sourceYear: 2026,
  notes: "План",
  createdBy: "user-1",
  createdAt: new Date(),
  updatedAt: new Date()
};

describe("project payroll policy route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ id: "project-1", organizationId: "org-1" } as never);
    vi.mocked(prisma.projectPayrollPolicy.findUnique).mockResolvedValue(null);
    mocks.upsert.mockResolvedValue(savedPolicy);
  });

  it("checks edit permission before parsing the policy body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, {
      params: { projectId: "project-1" }
    });

    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
    expect(mocks.upsert).not.toHaveBeenCalled();
  });

  it("stores project-scoped planning rates and writes an audit event", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        insuranceContributionRate: 30,
        accidentContributionRate: 0.4,
        personalIncomeTaxRate: 13,
        workingHoursPerMonth: 160,
        sourceYear: 2026,
        notes: "План"
      })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      policy: {
        projectId: "project-1",
        insuranceContributionRate: 30,
        accidentContributionRate: 0.4,
        personalIncomeTaxRate: 13
      }
    });
    expect(mocks.upsert).toHaveBeenCalled();
    expect(mocks.writeAudit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "project_payroll_policy",
      action: "create"
    }));
  });
});
