import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  invoiceFindMany: vi.fn(),
  costCodeFindMany: vi.fn(),
  commitmentFindMany: vi.fn(),
  applicationFindMany: vi.fn(),
  paymentFindMany: vi.fn(),
  documentFindMany: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    projectInvoice: { findMany: mocks.invoiceFindMany },
    projectCostCode: { findMany: mocks.costCodeFindMany },
    projectCommitment: { findMany: mocks.commitmentFindMany },
    projectPaymentApplication: { findMany: mocks.applicationFindMany },
    payment: { findMany: mocks.paymentFindMany },
    document: { findMany: mocks.documentFindMany }
  }
}));

describe("invoice register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "manager-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1" });
    [mocks.invoiceFindMany, mocks.costCodeFindMany, mocks.commitmentFindMany, mocks.applicationFindMany, mocks.paymentFindMany, mocks.documentFindMany]
      .forEach((mock) => mock.mockResolvedValue([]));
  });

  it("guards reads before querying financial data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.invoiceFindMany).not.toHaveBeenCalled();
  });

  it("guards writes before parsing the request body", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });
});
