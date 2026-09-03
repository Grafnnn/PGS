import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  role: vi.fn(),
  queryRaw: vi.fn(),
  periodFind: vi.fn(),
  periodUpdate: vi.fn(),
  transaction: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: mocks.role }));
vi.mock("@/lib/audit", () => ({ writeAudit: (...args: unknown[]) => mocks.audit(...args) }));
vi.mock("@/lib/project-controls-db", () => ({
  projectControlPeriodInclude: {},
  serializeProjectControlPeriod: vi.fn((value) => value)
}));
vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

const period = {
  id: "period-1",
  organizationId: "org-1",
  projectId: "project-1",
  sequence: 1,
  label: "Август 2026",
  status: "published"
};

function request(action: "lock" | "void") {
  return new Request("https://pgs.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action, confirm: true })
  });
}

describe("project controls period action route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ authenticated: true, id: "user-1", name: "Owner" });
    mocks.role.mockResolvedValue("OWNER");
    mocks.queryRaw.mockResolvedValue([{ id: "project-1" }]);
    mocks.periodFind.mockResolvedValue(period);
    mocks.periodUpdate.mockResolvedValue({ ...period, status: "locked" });
    mocks.audit.mockResolvedValue(undefined);
    const tx = {
      $queryRaw: mocks.queryRaw,
      projectControlPeriod: { findFirst: mocks.periodFind, update: mocks.periodUpdate }
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));
  });

  it("locks the project before reading and locking the reporting period", async () => {
    const order: string[] = [];
    mocks.queryRaw.mockImplementation(async () => {
      order.push("lock");
      return [{ id: "project-1" }];
    });
    mocks.periodFind.mockImplementation(async () => {
      order.push("read");
      return period;
    });
    const { PATCH } = await import("./route");
    const response = await PATCH(request("lock"), { params: { projectId: "project-1", periodId: "period-1" } });

    expect(response.status).toBe(200);
    expect(order).toEqual(["lock", "read"]);
    expect(mocks.periodUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "period-1" },
      data: expect.objectContaining({ status: "locked" })
    }));
  });

  it("rejects a repeated action from the fresh locked state", async () => {
    mocks.periodFind.mockResolvedValue({ ...period, status: "locked" });
    const { PATCH } = await import("./route");
    const response = await PATCH(request("void"), { params: { projectId: "project-1", periodId: "period-1" } });

    expect(response.status).toBe(409);
    expect(mocks.periodUpdate).not.toHaveBeenCalled();
  });
});
