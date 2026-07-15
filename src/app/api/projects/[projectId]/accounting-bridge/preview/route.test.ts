import { beforeEach, describe, expect, it, vi } from "vitest";
import * as XLSX from "xlsx";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  canProject: vi.fn(),
  projectFind: vi.fn(),
  paymentFind: vi.fn(),
  linkFind: vi.fn(),
  runCreate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: mocks.projectFind },
    payment: { findMany: mocks.paymentFind },
    accountingExternalLink: { findMany: mocks.linkFind },
    accountingSyncRun: { create: mocks.runCreate },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ accountingSyncRun: { create: mocks.runCreate } }))
  }
}));

const user = { id: "user-1", name: "Финансовый директор", email: "finance@example.test", role: "MANAGER", authenticated: true };

function previewRequest() {
  const sheet = XLSX.utils.json_to_sheet([{ "Номер документа": "1C-1", Дата: "15.07.2026", Контрагент: "ООО Бетон", Операция: "Списание", Сумма: 120000, Статус: "Проведен" }]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, "Платежи");
  const bytes = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const arrayBuffer = new Uint8Array(bytes).buffer as ArrayBuffer;
  const form = new FormData();
  form.set("sourceSystem", "1c");
  form.set("file", new File([arrayBuffer], "statement.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
  return new Request("https://pgs.local/api/projects/project-1/accounting-bridge/preview", { method: "POST", body: form }) as never;
}

describe("accounting bridge preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue(user);
    mocks.canProject.mockResolvedValue(true);
    mocks.projectFind.mockResolvedValue({ organizationId: "org-1" });
    mocks.paymentFind.mockResolvedValue([{ id: "payment-1", organizationId: "org-1", projectId: "project-1", title: "Оплата бетона", counterparty: "ООО Бетон", direction: "outgoing", plannedAt: new Date("2026-07-15"), paidAt: null, amount: { toNumber: () => 120000 }, status: "approved", category: "supplier", createdBy: "user-1", createdAt: new Date(), updatedAt: new Date() }]);
    mocks.linkFind.mockResolvedValue([]);
    mocks.runCreate.mockResolvedValue({ id: "run-1" });
    mocks.audit.mockResolvedValue({});
  });

  it("checks accounting permission before parsing multipart data", async () => {
    mocks.canProject.mockResolvedValue(false);
    const request = { formData: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect((request as { formData: ReturnType<typeof vi.fn> }).formData).not.toHaveBeenCalled();
  });

  it("returns a sanitized 400 response for malformed multipart data", async () => {
    const request = { formData: vi.fn().mockRejectedValue(new Error("multipart parser internals")) } as never;
    const { POST } = await import("./route");
    const response = await POST(request, { params: { projectId: "project-1" } });
    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid multipart form data" });
    expect(mocks.projectFind).not.toHaveBeenCalled();
  });

  it("persists only a dry-run preview and audit summary", async () => {
    const { POST } = await import("./route");
    const response = await POST(previewRequest(), { params: { projectId: "project-1" } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ runId: "run-1", preview: { summary: { matched: 1, safeToApply: 1 } } });
    expect(mocks.runCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "preview", matchedCount: 1 }) }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ action: "import_preview" }));
  });
});
