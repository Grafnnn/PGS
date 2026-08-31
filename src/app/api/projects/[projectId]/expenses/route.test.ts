import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  user: vi.fn(), canProject: vi.fn(), projectFind: vi.fn(), expenseFindMany: vi.fn(), costCodeFindMany: vi.fn(), costCodeFind: vi.fn(),
  transaction: vi.fn(), audit: vi.fn(), save: vi.fn(), remove: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/storage/documents", async (original) => {
  const actual = await original<typeof import("@/lib/storage/documents")>();
  return { ...actual, saveDocumentFile: mocks.save, deleteDocumentFile: mocks.remove };
});
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: mocks.projectFind },
  projectExpense: { findMany: mocks.expenseFindMany },
  projectCostCode: { findMany: mocks.costCodeFindMany, findFirst: mocks.costCodeFind },
  $transaction: mocks.transaction
} }));

const context = { params: { projectId: "project-1" } };
const expense = {
  id: "expense-1", organizationId: "org-1", projectId: "project-1", sequence: 1, expenseDate: new Date("2026-08-31T12:00:00Z"),
  merchant: "Хозяйственные расходы", documentNumber: null, category: "other", paymentMethod: "cash", currency: "RUB",
  grossAmount: 500, taxAmount: 0, source: "manual", recognitionStatus: "not_applicable", recognitionConfidence: null, notes: null,
  createdAt: new Date("2026-08-31T13:00:00Z"), updatedAt: new Date("2026-08-31T13:00:00Z"), costCode: null, receiptDocument: null, items: []
};

describe("expense register route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", name: "Admin", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ id: "project-1", organizationId: "org-1" });
    mocks.expenseFindMany.mockResolvedValue([expense]);
    mocks.costCodeFindMany.mockResolvedValue([]);
    mocks.costCodeFind.mockResolvedValue(null);
    mocks.audit.mockResolvedValue({});
  });

  it("checks edit access before parsing a create request", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guarded = { headers: new Headers({ "content-type": "application/json" }), json: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guarded, context);
    expect(response.status).toBe(403);
    expect((guarded as { json: ReturnType<typeof vi.fn> }).json).not.toHaveBeenCalled();
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("returns serialized register totals", async () => {
    const { GET } = await import("./route");
    const response = await GET(new Request("https://pgs.local"), context);
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(body.items[0]).toMatchObject({ merchant: "Хозяйственные расходы", grossAmount: 500 });
    expect(body.summary).toMatchObject({ count: 1, grossAmount: 500, receipts: 0, withoutReceipt: 1 });
  });

  it("creates a manual expense without touching receipt storage", async () => {
    const tx = {
      projectExpense: { findFirst: vi.fn().mockResolvedValue(null), create: vi.fn().mockResolvedValue(expense) },
      document: { create: vi.fn() }, documentVersion: { create: vi.fn() }, auditLog: { create: vi.fn() }
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    const request = new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
      expenseDate: "2026-08-31", merchant: "Хозяйственные расходы", category: "other", paymentMethod: "cash", currency: "RUB", grossAmount: 500, taxAmount: 0, source: "manual", items: []
    }) }) as never;
    const { POST } = await import("./route");
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(tx.projectExpense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ source: "manual", receiptDocumentId: null, grossAmount: 500 }) }));
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("stores a receipt as a project document and links it to the expense", async () => {
    const receiptExpense = { ...expense, source: "receipt", recognitionStatus: "recognized", recognitionConfidence: "high", receiptDocumentId: "doc-1", receiptDocument: { id: "doc-1", title: "Чек", fileName: "receipt.pdf", mimeType: "application/pdf" } };
    const tx = {
      projectExpense: { findFirst: vi.fn().mockResolvedValue({ sequence: 3 }), create: vi.fn().mockResolvedValue(receiptExpense) },
      document: { create: vi.fn().mockResolvedValue({ id: "doc-1" }) }, documentVersion: { create: vi.fn().mockResolvedValue({ id: "version-1" }) }, auditLog: { create: vi.fn() }
    };
    mocks.transaction.mockImplementation(async (callback: (value: typeof tx) => unknown) => callback(tx));
    const form = new FormData();
    form.set("payload", JSON.stringify({
      expenseDate: "2026-08-31", merchant: "ООО Стройснаб", documentNumber: "17", category: "materials", paymentMethod: "card", currency: "RUB",
      grossAmount: 1200, taxAmount: 200, source: "receipt", recognitionStatus: "recognized", recognitionConfidence: "high",
      items: [{ name: "Крепёж", category: "materials", quantity: 2, unit: "уп", unitPrice: 600, amount: 1200, taxAmount: 200 }]
    }));
    form.set("file", new File(["pdf"], "receipt.pdf", { type: "application/pdf" }));
    const request = new Request("https://pgs.local", { method: "POST", body: form }) as never;
    const { POST } = await import("./route");
    const response = await POST(request, context);
    expect(response.status).toBe(201);
    expect(mocks.save).toHaveBeenCalledWith(expect.stringMatching(/^project-1\//), expect.any(Buffer));
    expect(tx.document.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ projectId: "project-1", category: "чек / расход", fileName: "receipt.pdf" }) }));
    expect(tx.documentVersion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ documentId: "doc-1", versionNumber: 1 }) }));
    expect(tx.projectExpense.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ sequence: 4, receiptDocumentId: "doc-1", source: "receipt" }) }));
    expect(mocks.remove).not.toHaveBeenCalled();
  });
});
