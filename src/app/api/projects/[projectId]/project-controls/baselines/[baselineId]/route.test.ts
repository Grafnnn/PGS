import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  queryRaw: vi.fn(),
  baselineFind: vi.fn(),
  baselineCount: vi.fn(),
  baselineDelete: vi.fn(),
  baselineUpdate: vi.fn(),
  baselineUpdateMany: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: mocks.role }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/project-controls-db", () => ({
  projectControlBaselineInclude: {},
  serializeProjectControlBaseline: vi.fn((value) => value)
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const baseline = {
  id: "baseline-1",
  organizationId: "org-1",
  projectId: "project-1",
  sequence: 1,
  name: "Baseline 1",
  status: "draft",
  budgetAtCompletion: 1000,
  scheduleItemCount: 1
};

function request(action: "activate" | "delete") {
  return new Request("https://pgs.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, confirm: true })
  });
}

describe("project controls baseline action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ authenticated: true, id: "user-1", name: "Owner" });
    mocks.role.mockResolvedValue("OWNER");
    mocks.queryRaw.mockResolvedValue([{ id: "project-1" }]);
    mocks.baselineFind.mockResolvedValue(baseline);
    mocks.baselineCount.mockResolvedValue(0);
    mocks.baselineDelete.mockResolvedValue(baseline);
    mocks.baselineUpdateMany.mockResolvedValue({ count: 0 });
    mocks.baselineUpdate.mockResolvedValue({ ...baseline, status: "active" });
    mocks.audit.mockResolvedValue(undefined);
    const tx = {
      $queryRaw: mocks.queryRaw,
      projectControlBaseline: {
        findFirst: mocks.baselineFind,
        delete: mocks.baselineDelete,
        update: mocks.baselineUpdate,
        updateMany: mocks.baselineUpdateMany
      },
      projectControlPeriod: { count: mocks.baselineCount }
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("locks the project before reading and activating the baseline", async () => {
    const order: string[] = [];
    mocks.queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: "project-1" }];
    });
    mocks.baselineFind.mockImplementation(async () => {
      order.push("read");
      return baseline;
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request("activate"), { params: { projectId: "project-1", baselineId: "baseline-1" } });

    expect(response.status).toBe(200);
    expect(order).toEqual(["lock", "read"]);
    expect(mocks.baselineUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "baseline-1" },
      data: expect.objectContaining({ status: "active" })
    }));
  });

  it("rejects a repeated action from the fresh locked state", async () => {
    mocks.baselineFind.mockResolvedValue({ ...baseline, status: "active" });
    const { PATCH } = await import("./route");
    const response = await PATCH(request("activate"), { params: { projectId: "project-1", baselineId: "baseline-1" } });

    expect(response.status).toBe(409);
    expect(mocks.baselineUpdate).not.toHaveBeenCalled();
  });

  it("checks period use after locking before deleting a draft", async () => {
    mocks.baselineCount.mockResolvedValue(1);
    const { PATCH } = await import("./route");
    const response = await PATCH(request("delete"), { params: { projectId: "project-1", baselineId: "baseline-1" } });

    expect(response.status).toBe(409);
    expect(mocks.baselineDelete).not.toHaveBeenCalled();
  });
});
