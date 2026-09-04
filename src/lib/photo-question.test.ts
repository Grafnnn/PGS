import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { askPhotoQuestion, PhotoQuestionProviderError } from "./photo-question";

describe("photo question provider", () => {
  beforeEach(() => {
    vi.stubEnv("OPENAI_API_KEY", "openai-token-redacted");
    vi.stubEnv("OPENAI_CONNECTOR_MODE", "read_only");
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("sends selected image bytes and returns bounded structured analysis", async () => {
    const fetchMock = vi.fn(async (_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { input: unknown[]; store?: boolean; text?: { format?: { type?: string; strict?: boolean } } };
      expect(JSON.stringify(body)).toContain("data:image/jpeg;base64,aW1hZ2U=");
      expect(JSON.stringify(body)).not.toContain("openai-token-redacted");
      expect(body.store).toBe(false);
      expect(body.text?.format).toMatchObject({ type: "json_schema", strict: true });
      expect(init?.signal).toBeInstanceOf(AbortSignal);
      return new Response(JSON.stringify({
        output_text: JSON.stringify({
          answer: "Покрытие видно частично.",
          observations: ["Есть открытый участок"],
          risks: ["Возможны осадки"],
          recommendedActions: ["Закрыть участок"],
          confidence: "medium",
          limitations: ["Нет общего плана"]
        })
      }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(askPhotoQuestion({
      question: "Что видно на фото?",
      photos: [{ mimeType: "image/jpeg", bytes: Buffer.from("image") }]
    })).resolves.toMatchObject({ confidence: "medium", observations: ["Есть открытый участок"] });
    expect(fetchMock).toHaveBeenCalledWith("https://api.openai.com/v1/responses", expect.objectContaining({ method: "POST" }));
  });

  it("fails safely when the provider is not configured", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    await expect(askPhotoQuestion({ question: "Что видно?", photos: [] })).rejects.toEqual(expect.objectContaining<Partial<PhotoQuestionProviderError>>({ status: 503 }));
  });

  it("rejects non-JSON provider output", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ output_text: "not-json" }), { status: 200 })));
    await expect(askPhotoQuestion({ question: "Что видно?", photos: [] })).rejects.toEqual(expect.objectContaining<Partial<PhotoQuestionProviderError>>({ status: 502 }));
  });

  it("returns a bounded timeout error when the provider does not respond", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_url: string, init?: RequestInit) => new Promise<Response>((_resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")), { once: true });
    })));

    const expectation = expect(askPhotoQuestion({
      question: "Что видно на фото?",
      photos: [{ mimeType: "image/jpeg", bytes: Buffer.from("image") }]
    })).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(45_000);
    await expectation;
  });

  it("normalizes provider network errors without exposing their details", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("socket failed with sensitive upstream details");
    }));

    await expect(askPhotoQuestion({ question: "Что видно?", photos: [] })).rejects.toEqual(expect.objectContaining<Partial<PhotoQuestionProviderError>>({
      message: "Сервис AI временно недоступен. Повторите попытку позже.",
      status: 502
    }));
  });
});
