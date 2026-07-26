import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  costCodes: vi.fn(),
  baseline: vi.fn(),
  period: vi.fn(),
  budget: vi.fn(),
  changes: vi.fn(),
  commitments: vi.fn(),
  payments: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectCostCode: { findMany: mocks.costCodes },
    projectControlBaseline: { findFirst: mocks.baseline },
    projectControlPeriod: { findFirst: mocks.period },
    budgetItem: { findMany: mocks.budget },
    projectChangeOrderItem: { findMany: mocks.changes },
    projectCommitmentLine: { findMany: mocks.commitments },
    payment: { findMany: mocks.payments }
  }
}));

describe("cost forecast API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "viewer-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1" });
    mocks.costCodes.mockResolvedValue([]);
    mocks.baseline.mockResolvedValue(null);
    mocks.period.mockResolvedValue(null);
    [mocks.budget, mocks.changes, mocks.commitments, mocks.payments].forEach((mock) => mock.mockResolvedValue([]));
  });

  it("checks view access before loading cost data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.costCodes).not.toHaveBeenCalled();
  });

  it("returns a non-green no-data result", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.summary.status).toBe("no_data");
    expect(body.limitations.length).toBeGreaterThan(0);
  });
});
