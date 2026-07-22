import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  baselineFind: vi.fn(),
  scheduleFind: vi.fn(),
  progressFind: vi.fn(),
  paymentFind: vi.fn(),
  transaction: vi.fn(),
  serializeBaseline: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: mocks.role }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/project-controls-db", () => ({
  projectControlBaselineInclude: {},
  projectControlPeriodInclude: {},
  serializeProjectControlBaseline: mocks.serializeBaseline,
  serializeProjectControlPeriod: vi.fn((value) => value)
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectControlBaseline: { findFirst: mocks.baselineFind },
    projectControlPeriod: {},
    scheduleItem: { findMany: mocks.scheduleFind },
    workProgressEntry: { findMany: mocks.progressFind },
    payment: { findMany: mocks.paymentFind },
    $transaction: mocks.transaction
  }
}));

const storedBaseline = {
  id: "baseline-1",
  projectId: "project-1",
  sequence: 1,
  name: "Baseline 1",
  status: "active",
  dataDate: "2026-01-01T00:00:00.000Z",
  plannedStart: "2026-01-01T00:00:00.000Z",
  plannedFinish: "2026-01-11T00:00:00.000Z",
  budgetAtCompletion: 1000,
  budgetItemCount: 1,
  scheduleItemCount: 1,
  linkedBudgetValue: 1000,
  scheduleCoveragePercent: 100,
  limitations: [],
  notes: null,
  activatedAt: "2026-01-01T00:00:00.000Z",
  supersededAt: null,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  lines: [{
    id: "line-1", baselineId: "baseline-1", budgetItemId: "budget-1", scheduleItemId: "schedule-1", costCodeId: "cc-1", sequence: 1,
    code: "01", name: "Монтаж", unit: "м2", plannedQty: 10, budget: 1000, weight: 1,
    plannedStart: "2026-01-01T00:00:00.000Z", plannedFinish: "2026-01-11T00:00:00.000Z", sourceQuality: "linked"
  }]
};

describe("project controls reporting period route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ authenticated: true, id: "user-1", name: "Manager" });
    mocks.serializeBaseline.mockReturnValue(storedBaseline);
  });

  it("rejects before body parsing and database access when edit permission is missing", async () => {
    mocks.role.mockResolvedValue("VIEWER");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.baselineFind).not.toHaveBeenCalled();
  });

  it("previews EVM metrics without writing a reporting period", async () => {
    mocks.role.mockResolvedValue("MANAGER");
    mocks.baselineFind.mockResolvedValue({ id: "baseline-1", organizationId: "org-1", status: "active" });
    mocks.scheduleFind.mockResolvedValue([{ id: "schedule-1", projectId: "project-1", budgetItemId: "budget-1", costCodeId: "cc-1", name: "Монтаж", owner: "ПТО", startsAt: new Date("2026-01-01"), endsAt: new Date("2026-01-11"), plannedQty: 10, actualQty: 3, status: "in_progress", dependency: null }]);
    mocks.progressFind.mockResolvedValue([{ scheduleItemId: "schedule-1", date: new Date("2026-01-05"), qty: 3, status: "approved" }]);
    mocks.paymentFind.mockResolvedValue([{ id: "payment-1", projectId: "project-1", costCodeId: "cc-1", title: "Факт", counterparty: "Подрядчик", direction: "outgoing", plannedAt: new Date("2026-01-04"), paidAt: new Date("2026-01-05"), amount: 250, status: "paid", category: "subcontractor" }]);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "preview", baselineId: "baseline-1", dataDate: "2026-01-06" })
    }), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.preview.summary).toMatchObject({ plannedValue: 500, earnedValue: 300, actualCost: 250, costPerformanceIndex: 1.2, schedulePerformanceIndex: 0.6 });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
