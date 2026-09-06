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

  it("does not turn an amount without VAT into a zero VAT rate", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({
        answer: "Сумма составляет 15 274 035,05 ₽, ставка НДС 0%, операция не облагается НДС.",
        confidence: "high",
        notFound: false,
        citationIds: ["S1"],
        followUps: []
      }) })
    })));

    const result = await answerTechnicalQuestion({
      projectName: "Тестовый проект",
      question: "Какая сумма договора и ставка НДС?",
      sources: [{ sourceId: "S1", title: "КП", locator: "Строка 4", text: "Утверждённое КП, ₽ без НДС | 15 274 035,05" }]
    });

    expect(result).toMatchObject({ confidence: "low", notFound: true });
    expect(result.answer).toContain("ставка НДС");
    expect(result.answer).not.toContain("0%");
    expect(result.answer).not.toContain("не облагается НДС");
  });

  it("keeps a VAT rate that is explicit in the cited evidence", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({
      ok: true,
      json: async () => ({ output_text: JSON.stringify({
        answer: "Ставка НДС по договору составляет 5%.",
        confidence: "high",
        notFound: false,
        citationIds: ["S1"],
        followUps: []
      }) })
    })));

    const result = await answerTechnicalQuestion({
      projectName: "Тестовый проект",
      question: "Какая ставка НДС?",
      sources: [{ sourceId: "S1", title: "Договор", locator: "Пункт 3.1", text: "Цена договора включает НДС по ставке 5%." }]
    });

    expect(result).toMatchObject({ answer: "Ставка НДС по договору составляет 5%.", confidence: "high", notFound: false });
  });
});
