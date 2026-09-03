import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  access: vi.fn(),
  loadPipelineData: vi.fn(),
  buildScheduleDraft: vi.fn(),
  transaction: vi.fn(),
  queryRaw: vi.fn(),
  projectFind: vi.fn(),
  budgetFind: vi.fn(),
  scheduleFind: vi.fn(),
  scheduleAggregate: vi.fn(),
  scheduleCreate: vi.fn()
}));

vi.mock("@/lib/project-route-guards", () => ({ requireProjectAccess: (...args: unknown[]) => mocks.access(...args) }));
vi.mock("@/lib/project-pipeline", async () => {
  const actual = await vi.importActual<typeof import("@/lib/project-pipeline")>("@/lib/project-pipeline");
  return {
    ...actual,
    loadPipelineData: (...args: unknown[]) => mocks.loadPipelineData(...args),
    buildScheduleDraft: (...args: unknown[]) => mocks.buildScheduleDraft(...args)
  };
});
vi.mock("@/lib/serializers", () => ({
  serializeBudgetItem: vi.fn((value) => value),
  serializeScheduleItem: vi.fn((value) => ({ ...value, startsAt: value.startsAt.toISOString(), endsAt: value.endsAt.toISOString() }))
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const project = {
  id: "project-1",
  organizationId: "org-1",
  contractAmount: 1_000_000,
  startsAt: new Date("2026-09-01T00:00:00.000Z"),
  endsAt: new Date("2026-12-31T00:00:00.000Z"),
  name: "Троицк"
};

function request(body: unknown) {
  return new Request("https://pgs.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
}

describe("schedule draft-from-import route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.access.mockResolvedValue({ user: { id: "user-1" }, project: { id: "project-1", organizationId: "org-1" } });
    mocks.loadPipelineData.mockResolvedValue({
      project: { id: "project-1", organizationId: "org-1", contractAmount: 1_000_000, startsAt: "2026-09-01", endsAt: "2026-12-31", name: "Троицк" },
      budgetItems: [], scheduleItems: [], materials: [], procurementRequests: [], payments: [], cashflowPeriods: [], documents: [], importBatches: []
    });
    mocks.queryRaw.mockResolvedValue([{ id: "project-1" }]);
    mocks.projectFind.mockResolvedValue(project);
    mocks.budgetFind.mockResolvedValue([]);
    mocks.scheduleFind.mockResolvedValue([]);
    mocks.scheduleAggregate.mockResolvedValue({ _max: { revision: null } });
    mocks.buildScheduleDraft.mockReturnValue({
      projectId: "project-1",
      sourceImportBatchId: null,
      canCommit: true,
      summary: { stages: 1, existingScheduleItems: 0, missingDates: 1 },
      items: [{ stage: "Кровля", name: "Кровля", works: 12, amount: 500_000, suggestedDurationDays: 5, dependency: null, status: "needs_dates", warnings: [], evidence: [] }]
    });
    mocks.scheduleCreate.mockImplementation(async ({ data }) => ({ id: "schedule-new", ...data }));
    const tx = {
      $queryRaw: mocks.queryRaw,
      project: { findUnique: mocks.projectFind },
      budgetItem: { findMany: mocks.budgetFind },
      scheduleItem: { findMany: mocks.scheduleFind, aggregate: mocks.scheduleAggregate, create: mocks.scheduleCreate }
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("checks view access before parsing an unauthenticated request", async () => {
    mocks.access.mockResolvedValue({ response: new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 }) });
    const { POST } = await import("./route");
    const response = await POST(request("not-json"), { params: { projectId: "project-1" } });

    expect(response!.status).toBe(401);
    expect(mocks.loadPipelineData).not.toHaveBeenCalled();
  });

  it("serializes commit, rereads current schedule and creates a milestone in its current revision", async () => {
    const order: string[] = [];
    mocks.queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: "project-1" }];
    });
    mocks.projectFind.mockImplementation(async () => {
      order.push("project");
      return project;
    });
    const { POST } = await import("./route");
    const response = await POST(request({ commit: true, confirmed: true }), { params: { projectId: "project-1" } });

    expect(response!.status).toBe(200);
    expect(order).toEqual(["lock", "project"]);
    expect(mocks.access).toHaveBeenNthCalledWith(1, "project-1", "view");
    expect(mocks.access).toHaveBeenNthCalledWith(2, "project-1", "edit");
    expect(mocks.scheduleCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        plannedQty: expect.objectContaining({}),
        unit: "%",
        progressMode: "milestone",
        revision: 1,
        isCurrent: true,
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-09-06T00:00:00.000Z")
      })
    }));
  });

  it("does not create duplicate work after a repeated click sees fresh current state", async () => {
    const existing = {
      id: "schedule-existing",
      projectId: "project-1",
      organizationId: "org-1",
      name: "Кровля",
      owner: "ПТО",
      startsAt: new Date("2026-09-01T00:00:00.000Z"),
      endsAt: new Date("2026-09-06T00:00:00.000Z"),
      plannedQty: 100,
      actualQty: 0,
      manualActualQty: 0,
      reportActualQty: 0,
      unit: "%",
      progressMode: "milestone",
      revision: 3,
      isCurrent: true,
      supersededAt: null,
      status: "not_started",
      dependency: null,
      budgetItemId: null,
      costCodeId: null
    };
    mocks.scheduleFind.mockResolvedValue([existing]);
    mocks.scheduleAggregate.mockResolvedValue({ _max: { revision: 3 } });
    mocks.buildScheduleDraft.mockImplementation((data) => ({
      projectId: "project-1",
      sourceImportBatchId: null,
      canCommit: false,
      summary: { stages: 1, existingScheduleItems: data.scheduleItems.length, missingDates: 0 },
      items: [{ stage: "Кровля", name: "Кровля", works: 12, amount: 500_000, suggestedDurationDays: 5, dependency: null, status: "already_exists", warnings: [], evidence: [] }]
    }));
    const { POST } = await import("./route");
    const response = await POST(request({ commit: true, confirmed: true }), { params: { projectId: "project-1" } });
    const body = await response!.json();

    expect(response!.status).toBe(200);
    expect(body.created).toEqual([]);
    expect(mocks.scheduleCreate).not.toHaveBeenCalled();
  });
});
