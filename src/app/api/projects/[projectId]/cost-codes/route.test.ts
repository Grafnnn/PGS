import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  codeFind: vi.fn(),
  budgetFind: vi.fn(),
  scheduleFind: vi.fn(),
  materialFind: vi.fn(),
  procurementFind: vi.fn(),
  paymentFind: vi.fn(),
  changesFind: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectCostCode: { findMany: mocks.codeFind, findFirst: vi.fn(), create: vi.fn() },
    budgetItem: { findMany: mocks.budgetFind },
    scheduleItem: { findMany: mocks.scheduleFind },
    material: { findMany: mocks.materialFind },
    procurementRequestItem: { findMany: mocks.procurementFind },
    payment: { findMany: mocks.paymentFind },
    projectChangeOrderItem: { findMany: mocks.changesFind },
    $transaction: vi.fn()
  }
}));

describe("cost codes collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    [mocks.codeFind, mocks.budgetFind, mocks.scheduleFind, mocks.materialFind, mocks.procurementFind, mocks.paymentFind, mocks.changesFind].forEach((mock) => mock.mockResolvedValue([]));
  });

  it("guards reads before querying classification data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.codeFind).not.toHaveBeenCalled();
  });

  it("returns an empty, non-green coverage state", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.coverage).toMatchObject({ codes: 0, total: 0, linked: 0, percent: 0 });
    expect(body.entities).toMatchObject({ budget: [], payments: [], changes: [] });
  });

  it("checks edit permission before parsing a write request", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });
});
