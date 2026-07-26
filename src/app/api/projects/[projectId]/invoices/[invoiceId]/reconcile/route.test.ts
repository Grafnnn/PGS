import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  invoiceFind: vi.fn(),
  invoiceUpdate: vi.fn(),
  paymentCreate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => {
  const tx = {
    projectInvoice: { update: mocks.invoiceUpdate },
    payment: { create: mocks.paymentCreate }
  };
  return {
    prisma: {
      projectInvoice: { findFirst: mocks.invoiceFind },
      payment: { create: mocks.paymentCreate },
      $transaction: vi.fn(async (callback: (client: typeof tx) => unknown) => callback(tx))
    }
  };
});

const now = new Date("2026-07-27T12:00:00Z");
const invoice = {
  id: "invoice-1",
  organizationId: "org-1",
  projectId: "project-1",
  sequence: 1,
  number: "INV-001",
  direction: "AP",
  invoiceType: "invoice",
  counterparty: "ООО Монолит",
  issueDate: now,
  dueDate: new Date("2026-08-10T12:00:00Z"),
  servicePeriodStart: null,
  servicePeriodEnd: null,
  grossAmount: 100,
  taxAmount: 20,
  currency: "RUB",
  status: "received",
  matchStatus: "unmatched",
  matchSnapshot: null,
  notes: null,
  approvedAt: null,
  paidAt: null,
  voidedAt: null,
  costCodeId: "cc-1",
  commitmentId: "commitment-1",
  paymentApplicationId: null,
  paymentId: null,
  linkedDocumentId: "doc-1",
  createdAt: now,
  updatedAt: now,
  costCode: { code: "03.10", name: "Монолит" },
  commitment: { number: "COM-001", title: "Монолит", counterparty: "ООО Монолит", status: "active", lines: [{ scheduledValue: 100 }] },
  paymentApplication: null,
  payment: null,
  linkedDocument: { title: "Счёт INV-001", fileName: "invoice.pdf" }
};

describe("invoice reconcile route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "manager-1", name: "РП", email: "rp@example.test", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.invoiceFind.mockResolvedValue(invoice);
    mocks.invoiceUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...invoice, ...data }));
  });

  it("checks edit access before parsing confirmation", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1", invoiceId: "invoice-1" } });
    expect(response.status).toBe(403);
    expect(mocks.invoiceFind).not.toHaveBeenCalled();
  });

  it("updates only reconciliation state and never creates a payment", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ confirmed: true })
    }) as never, { params: { projectId: "project-1", invoiceId: "invoice-1" } });
    expect(response.status).toBe(200);
    expect(mocks.invoiceUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ matchStatus: "matched" })
    }));
    expect(mocks.paymentCreate).not.toHaveBeenCalled();
    expect(mocks.audit).toHaveBeenCalled();
  });
});
