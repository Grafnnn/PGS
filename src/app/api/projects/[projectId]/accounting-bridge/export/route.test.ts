import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  runCreate: vi.fn(),
  audit: vi.fn(),
  buildExport: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/accounting-bridge", () => ({ buildAccountingExport: mocks.buildExport }));
vi.mock("@/lib/serializers", () => ({
  serializeProject: (value: unknown) => value,
  serializeMaterial: (value: unknown) => value,
  serializeProcurementRequest: (value: unknown) => value,
  serializePayment: (value: unknown) => value
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ accountingSyncRun: { create: mocks.runCreate } }))
  }
}));

const user = { id: "user-1", name: "Финансовый директор", email: "finance@example.test", role: "MANAGER", authenticated: true };
const bundle = {
  schema: "pgs-accounting-bridge-v1",
  generatedAt: "2026-07-15T00:00:00.000Z",
  project: { id: "project-1", code: "PGS-1", name: "Объект" },
  commitments: [{ id: "request-1", amount: 5000, lines: [{ estimateStatus: "estimated" }] }],
  receivables: [{ id: "payment-1" }],
  payables: [],
  totals: { contractAmount: 100000, commitments: 5000, receivables: 10000, payables: 0, paidIncoming: 0, paidOutgoing: 0 },
  limitations: []
};

describe("accounting bridge export route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({
      id: "project-1",
      organizationId: "org-1",
      code: "PGS-1",
      materials: [],
      procurementRequests: [],
      payments: []
    });
    mocks.buildExport.mockReturnValue(bundle);
    mocks.runCreate.mockResolvedValue({ id: "run-1" });
    mocks.audit.mockResolvedValue({});
  });

  it("checks accounting permission before reading project data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns a no-store JSON package and journals the export", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(response.headers.get("content-disposition")).toContain("pgs-accounting-PGS-1.json");
    await expect(response.json()).resolves.toMatchObject({ schema: "pgs-accounting-bridge-v1", totals: { commitments: 5000 } });
    expect(mocks.runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ direction: "export", status: "exported", sourceSystem: "universal_json" }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "use", entity: "accounting_sync" }));
  });
});
