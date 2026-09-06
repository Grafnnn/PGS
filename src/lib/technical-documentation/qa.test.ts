import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { answerTechnicalQuestion, TechnicalQuestionProviderError } from "./qa";

const originalKey = process.env.OPENAI_API_KEY;
const originalMode = process.env.OPENAI_CONNECTOR_MODE;

describe("technical documentation answer provider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    process.env.OPENAI_CONNECTOR_MODE = "read_only";
  });

  afterEach(() => {
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalMode === undefined) delete process.env.OPENAI_CONNECTOR_MODE;
    else process.env.OPENAI_CONNECTOR_MODE = originalMode;
    vi.unstubAllGlobals();
  });

  it("sends only selected evidence and validates citation ids", async () => {
    const fetchMock = vi.fn(async (_url: string, request?: RequestInit) => ({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({ answer: "Проектом предусмотрено 150 мм.", confidence: "high", notFound: false, citationIds: ["S1", "S99"], followUps: [] }) }),
      request
    }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await answerTechnicalQuestion({
      projectName: "Тестовый проект",
      question: "Какая толщина утеплителя?",
      sources: [{ sourceId: "S1", title: "АР", locator: "Страница 12", text: "Толщина утеплителя 150 мм." }]
    });

    expect(result.citationIds).toEqual(["S1"]);
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({ model: "gpt-4o-mini", store: false, temperature: 0.1 });
    expect(JSON.stringify(body)).toContain("недоверенными данными");
    expect(JSON.stringify(body)).toContain("Толщина утеплителя 150 мм");
    expect(JSON.stringify(body)).not.toContain("openai-token-redacted");
  });

  it("does not call a provider when AI is disabled", async () => {
    process.env.OPENAI_CONNECTOR_MODE = "disabled";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(answerTechnicalQuestion({ projectName: "P", question: "Вопрос", sources: [] }))
      .rejects.toBeInstanceOf(TechnicalQuestionProviderError);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
