import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  update: vi.fn(),
  audit: vi.fn(async () => ({})),
  transactionProject: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "user-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      $queryRaw: vi.fn(),
      project: { findUnique: mocks.transactionProject },
      scheduleItem: { update: mocks.update }
    }))
  }
}));

const project = {
  id: "project-1",
  organizationId: "org-1",
  budgetItems: [{ id: "budget-1", section: "Раздел 1", code: "1", name: "Монтаж кровли", unit: "м2", qty: 100, plannedUnitPrice: 200, kind: "work" }],
  scheduleItems: [{ id: "schedule-1", budgetItemId: null, name: "10 Монтаж кровли", unit: null, plannedQty: 100, dependency: "Раздел 1 · Профиль ГПР: G01" }]
};

describe("schedule budget reconciliation route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue(project as never);
    mocks.transactionProject.mockResolvedValue(project);
    mocks.update.mockResolvedValue({});
  });

  it("returns a read-only coverage preview", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local") as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      reconciliation: { summary: { automaticMatches: 1, currentCoveragePercent: 0, projectedCoveragePercent: 100 } }
    });
  });

  it("checks edit access before parsing a mutation body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(403);
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("applies exact links, restores the estimate unit and writes an audit record", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirm: true, overrides: [] })
    }) as never, { params: { projectId: "project-1" } });

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ applied: { count: 1, unitBackfilled: 1 } });
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "schedule-1" },
      data: { budgetItemId: "budget-1", unit: "м2" }
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "schedule_budget_reconciliation",
      action: "update"
    }));
  });
});
