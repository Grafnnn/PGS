import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(),
  canProject: vi.fn(),
  invoiceFind: vi.fn(),
  invoiceUpdate: vi.fn(),
  resolveReferences: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/invoice-reconciliation-db", () => ({
  invoiceInclude: {},
  resolveInvoiceReferences: mocks.resolveReferences
}));
vi.mock("@/lib/prisma", () => {
  const tx = { projectInvoice: { update: mocks.invoiceUpdate } };
  return {
    prisma: {
      projectInvoice: { findFirst: mocks.invoiceFind },
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
  issueDate: new Date("2026-07-10T12:00:00Z"),
  dueDate: new Date("2026-07-20T12:00:00Z"),
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
  costCodeId: null,
  commitmentId: null,
  paymentApplicationId: null,
  paymentId: null,
  linkedDocumentId: null,
  createdAt: now,
  updatedAt: now,
  costCode: null,
  commitment: null,
  paymentApplication: null,
  payment: null,
  linkedDocument: null
};

describe("invoice item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "manager-1", name: "РП", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.invoiceFind.mockResolvedValue(invoice);
    mocks.resolveReferences.mockResolvedValue({
      costCode: null,
      commitment: null,
      paymentApplication: null,
      payment: null,
      linkedDocument: null
    });
    mocks.invoiceUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      ...invoice,
      ...data,
      updatedAt: now
    }));
  });

  it("checks edit permission before parsing a patch", async () => {
    mocks.canProject.mockResolvedValue(false);
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never,
      { params: { projectId: "project-1", invoiceId: "invoice-1" } }
    );
    expect(response.status).toBe(403);
    expect(mocks.invoiceFind).not.toHaveBeenCalled();
  });

  it("validates a patched issue date against the stored due date", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://pgs.local", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ issueDate: "2026-08-01T12:00:00.000Z" })
      }) as never,
      { params: { projectId: "project-1", invoiceId: "invoice-1" } }
    );
    expect(response.status).toBe(400);
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });

  it("validates a patched gross amount against the stored tax amount", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://pgs.local", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ grossAmount: 10 })
      }) as never,
      { params: { projectId: "project-1", invoiceId: "invoice-1" } }
    );
    expect(response.status).toBe(400);
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });

  it("does not approve an invoice before a successful reconciliation", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(
      new Request("https://pgs.local", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "approved" })
      }) as never,
      { params: { projectId: "project-1", invoiceId: "invoice-1" } }
    );
    expect(response.status).toBe(409);
    expect(mocks.invoiceUpdate).not.toHaveBeenCalled();
  });
});
