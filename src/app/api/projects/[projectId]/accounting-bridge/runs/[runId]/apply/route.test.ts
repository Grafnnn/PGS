import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  runFind: vi.fn(),
  paymentFind: vi.fn(),
  paymentUpdate: vi.fn(),
  linkFind: vi.fn(),
  linkCreate: vi.fn(),
  linkUpdate: vi.fn(),
  runUpdate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    accountingSyncRun: { findFirst: mocks.runFind, update: mocks.runUpdate },
    payment: { findFirst: mocks.paymentFind, update: mocks.paymentUpdate },
    accountingExternalLink: { findFirst: mocks.linkFind, create: mocks.linkCreate, update: mocks.linkUpdate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      accountingSyncRun: { update: mocks.runUpdate },
      payment: { findFirst: mocks.paymentFind, update: mocks.paymentUpdate },
      accountingExternalLink: { findFirst: mocks.linkFind, create: mocks.linkCreate, update: mocks.linkUpdate }
    }))
  }
}));

const user = { id: "user-1", name: "Финансовый директор", email: "finance@example.test", role: "MANAGER", authenticated: true };
const run = {
  id: "run-1",
  organizationId: "org-1",
  projectId: "project-1",
  sourceSystem: "1c",
  status: "preview",
  unresolvedCount: 1,
  summary: { total: 2, matched: 1 },
  payload: {
    sourceSystem: "1c",
    summary: { total: 2 },
    matches: [
      { status: "matched", paymentId: "payment-1", score: 95, action: "mark_paid", row: { rowNumber: 2, externalId: "1C-1", date: "2026-07-15", direction: "outgoing", amount: 120000 } },
      { status: "unmatched", score: 0, action: "none", row: { rowNumber: 3, externalId: "1C-2", date: "2026-07-15", direction: "outgoing", amount: 70000 } }
    ]
  }
};

describe("accounting bridge apply route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.runFind.mockResolvedValue(run);
    mocks.paymentFind.mockResolvedValue({ id: "payment-1", projectId: "project-1" });
    mocks.linkFind.mockResolvedValue(null);
    mocks.paymentUpdate.mockResolvedValue({});
    mocks.linkCreate.mockResolvedValue({});
    mocks.runUpdate.mockResolvedValue({});
    mocks.audit.mockResolvedValue({});
  });

  it("checks accounting permission before reading confirmation", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(403);
    expect((request as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
  });

  it("updates and links only safe matches in one transaction", async () => {
    const request = new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }) }) as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ result: { updatedPayments: 1, linkedPayments: 1, unresolved: 1 } });
    expect(mocks.paymentUpdate).toHaveBeenCalledOnce();
    expect(mocks.linkCreate).toHaveBeenCalledOnce();
    expect(mocks.runUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "applied" }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "import_commit" }));
  });

  it("rejects repeat application", async () => {
    mocks.runFind.mockResolvedValue({ ...run, status: "applied" });
    const request = new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ confirmed: true }) }) as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1", runId: "run-1" } });
    expect(response.status).toBe(409);
    expect(mocks.paymentUpdate).not.toHaveBeenCalled();
  });
});
