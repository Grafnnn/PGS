import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ user: vi.fn(), canProject: vi.fn(), recognize: vi.fn() }));

vi.mock("@/lib/auth/session", () => ({ getCurrentUser: mocks.user }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: mocks.canProject }));
vi.mock("@/lib/receipt-recognition", async (original) => {
  const actual = await original<typeof import("@/lib/receipt-recognition")>();
  return { ...actual, recognizeReceipt: mocks.recognize };
});

const context = { params: { projectId: "project-1" } };

describe("receipt preview route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.user.mockResolvedValue({ id: "user-1", authenticated: true });
    mocks.canProject.mockResolvedValue(true);
    mocks.recognize.mockResolvedValue({ merchant: "Магазин", documentNumber: null, expenseDate: "2026-08-31", currency: "RUB", grossAmount: 100, taxAmount: 0, paymentMethod: "cash", category: "materials", items: [], confidence: "medium", warnings: [] });
  });

  it("checks project access before reading multipart input", async () => {
    mocks.canProject.mockResolvedValue(false);
    const guardedRequest = { formData: vi.fn() } as never;
    const { POST } = await import("./route");
    const response = await POST(guardedRequest, context);
    expect(response.status).toBe(403);
    expect((guardedRequest as { formData: ReturnType<typeof vi.fn> }).formData).not.toHaveBeenCalled();
    expect(mocks.recognize).not.toHaveBeenCalled();
  });

  it("returns preview without storing a file or an expense", async () => {
    const form = new FormData();
    form.set("file", new File(["image"], "receipt.jpg", { type: "image/jpeg" }));
    const request = new Request("https://pgs.local", { method: "POST", body: form }) as never;
    const { POST } = await import("./route");
    const response = await POST(request, context);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ preview: expect.objectContaining({ merchant: "Магазин", grossAmount: 100 }) });
    expect(mocks.recognize).toHaveBeenCalledWith(expect.objectContaining({ fileName: "receipt.jpg", mimeType: "image/jpeg", bytes: expect.any(Buffer) }));
  });
});
