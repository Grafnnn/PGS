import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AppUser } from "@/lib/auth/permissions";

const getCurrentUserMock = vi.fn();

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: getCurrentUserMock
}));

const authorizedUser: AppUser = {
  id: "user-1",
  name: "Owner",
  email: "owner@pgs.local",
  role: "OWNER",
  authenticated: true
};

function requestWithFormData(formData: () => Promise<FormData>) {
  return { formData } as never;
}

async function responseJson(response: Response) {
  return (await response.json()) as Record<string, unknown>;
}

function formWithFile(file: File) {
  const form = new FormData();
  form.append("file", file);
  return form;
}

describe("contract prefill onboarding route", () => {
  beforeEach(() => {
    getCurrentUserMock.mockReset();
  });

  it("blocks unauthenticated users before reading form data", async () => {
    getCurrentUserMock.mockResolvedValue(null);
    const formData = vi.fn(async () => new FormData());
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(formData));

    expect(response.status).toBe(403);
    expect(formData).not.toHaveBeenCalled();
  });

  it("rejects unsupported files without creating project or document writes", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(async () => formWithFile(new File(["%PDF"], "contract.pdf", { type: "application/pdf" }))));
    const body = await responseJson(response);

    expect(response.status).toBe(400);
    expect(String(body.error)).toContain("not supported");
    expect(JSON.stringify(body)).not.toContain("Prisma");
  });

  it("rejects empty text files", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    const { POST } = await import("./route");

    const response = await POST(requestWithFormData(async () => formWithFile(new File([""], "contract.txt", { type: "text/plain" }))));

    expect(response.status).toBe(400);
    expect(await responseJson(response)).toMatchObject({ error: "Contract file is empty." });
  });

  it("returns deterministic suggestions for a synthetic text contract and performs no writes", async () => {
    getCurrentUserMock.mockResolvedValue(authorizedUser);
    const { POST } = await import("./route");
    const text = `
      Заказчик: ООО "Город Заказчик"
      Подрядчик: ООО "ПГС Подряд"
      Объект строительства: Административное здание
      Адрес объекта: г. Москва, ул. Строителей, д. 10
      Цена договора 7 000 000 руб., в том числе НДС 20%.
      Срок выполнения работ: с 01.07.2026 по 01.09.2026.
      Оплата после подписания актов выполненных работ КС-2 и КС-3.
    `;

    const response = await POST(requestWithFormData(async () => formWithFile(new File([text], "contract.txt", { type: "text/plain" }))));
    const body = await responseJson(response) as {
      ok?: boolean;
      result?: Record<string, unknown>;
      writes?: Record<string, unknown>;
    };

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.result).toMatchObject({
      customerName: "ООО \"Город Заказчик\"",
      projectName: "Административное здание",
      contractAmount: 7_000_000,
      startDate: "2026-07-01",
      finishDate: "2026-09-01"
    });
    expect(body.writes).toEqual({ projectCreated: false, documentPersisted: false });
  });
});
