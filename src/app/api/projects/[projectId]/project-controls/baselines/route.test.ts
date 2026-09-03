import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  projectFind: vi.fn(),
  txProjectFind: vi.fn(),
  queryRaw: vi.fn(),
  baselineFind: vi.fn(),
  baselineCreate: vi.fn(),
  baselineUpdateMany: vi.fn(),
  transaction: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: mocks.role }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/project-controls-db", () => ({ projectControlBaselineInclude: {}, serializeProjectControlBaseline: vi.fn((value) => value) }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectControlBaseline: {},
    $transaction: mocks.transaction
  }
}));

const project = {
  id: "project-1",
  organizationId: "org-1",
  startsAt: new Date("2026-01-01T00:00:00.000Z"),
  endsAt: new Date("2026-01-11T00:00:00.000Z"),
  budgetItems: [{
    id: "budget-1", projectId: "project-1", costCodeId: "cc-1", section: "Работы", subsection: null, code: "01", name: "Монтаж", unit: "м2",
    qty: 10, plannedUnitPrice: 100, actualUnitPrice: 110, forecastUnitPrice: 120, kind: "work", source: "test", comment: null
  }],
  scheduleItems: [{
    id: "schedule-1", projectId: "project-1", budgetItemId: "budget-1", costCodeId: "cc-1", name: "Монтаж", owner: "ПТО",
    startsAt: new Date("2026-01-01T00:00:00.000Z"), endsAt: new Date("2026-01-11T00:00:00.000Z"), plannedQty: 10, actualQty: 2,
    status: "in_progress", dependency: null
  }]
};

describe("project controls baseline route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ authenticated: true, id: "user-1", name: "Owner" });
    mocks.queryRaw.mockResolvedValue([{ id: "project-1" }]);
    mocks.txProjectFind.mockResolvedValue(project);
    mocks.baselineFind.mockResolvedValue(null);
    mocks.baselineUpdateMany.mockResolvedValue({ count: 0 });
    mocks.baselineCreate.mockResolvedValue({ id: "baseline-1", projectId: "project-1", sequence: 1, status: "draft" });
    const tx = {
      $queryRaw: mocks.queryRaw,
      project: { findUnique: mocks.txProjectFind },
      projectControlBaseline: {
        findFirst: mocks.baselineFind,
        updateMany: mocks.baselineUpdateMany,
        create: mocks.baselineCreate
      }
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("rejects before body parsing and database access when edit permission is missing", async () => {
    mocks.role.mockResolvedValue("VIEWER");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns a deterministic preview without starting a transaction", async () => {
    mocks.role.mockResolvedValue("MANAGER");
    mocks.projectFind.mockResolvedValue(project);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "preview", name: "Baseline 1", dataDate: "2026-01-01" })
    }), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.preview.summary).toMatchObject({ budgetAtCompletion: 1000, scheduleCoveragePercent: 100, status: "ready" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("does not let a manager activate a baseline", async () => {
    mocks.role.mockResolvedValue("MANAGER");
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "create", name: "Baseline 1", dataDate: "2026-01-01", activate: true, confirm: true })
    }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("locks the project and rebuilds create data from fresh current state", async () => {
    mocks.role.mockResolvedValue("MANAGER");
    const order: string[] = [];
    mocks.queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: "project-1" }];
    });
    mocks.txProjectFind.mockImplementation(async () => {
      order.push("read");
      return project;
    });
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ mode: "create", name: "Baseline 1", dataDate: "2026-01-01", confirm: true })
    }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(201);
    expect(order).toEqual(["lock", "read"]);
    expect(mocks.projectFind).not.toHaveBeenCalled();
    expect(mocks.baselineCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ budgetAtCompletion: 1000, scheduleItemCount: 1 })
    }));
  });
});
