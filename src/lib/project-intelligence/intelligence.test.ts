import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { buildProjectIntelligence, sanitizeAiContext, scoreToRiskLevel, type ProjectIntelligenceContext } from ".";
import { generateAiIntelligenceSummary } from "./ai-summary";

const baseDate = new Date("2026-06-23T00:00:00Z");

function context(): ProjectIntelligenceContext {
  return {
    project: {
      id: "project-demo",
      organizationId: "org-demo",
      name: "Демо объект",
      customer: "Заказчик",
      object: "Административное здание",
      address: "Москва",
      contractAmount: 1_000_000,
      vatMode: "vat",
      startsAt: "2026-06-01",
      endsAt: "2026-09-01",
      manager: "РП",
      status: "active"
    },
    budgetItems: [
      { id: "b1", projectId: "project-demo", section: "Монолит", code: "1", name: "Бетон", unit: "м3", qty: 0, plannedUnitPrice: 5000, actualUnitPrice: 5000, forecastUnitPrice: 5000, kind: "material", source: "test" },
      { id: "b2", projectId: "project-demo", section: "Монолит", code: "2", name: "Арматура", unit: "т", qty: 10, plannedUnitPrice: 0, actualUnitPrice: 0, forecastUnitPrice: 0, kind: "material", source: "test" },
      { id: "b3", projectId: "project-demo", section: "Монолит", code: "3", name: "Опалубка", unit: "м2", qty: 10, plannedUnitPrice: 100, actualUnitPrice: 100, forecastUnitPrice: 100, kind: "work", source: "test", comment: "Сумма: 1500" },
      { id: "b4", projectId: "project-demo", section: "Монолит", code: "4", name: "Опалубка", unit: "м2", qty: 5, plannedUnitPrice: 100, actualUnitPrice: 100, forecastUnitPrice: 100, kind: "work", source: "test" }
    ],
    scheduleItems: [
      { id: "s1", projectId: "project-demo", name: "Бетон монолита", owner: "", startsAt: "2026-06-10", endsAt: "2026-06-15", plannedQty: 10, actualQty: 1, status: "delayed" },
      { id: "s2", projectId: "project-demo", name: "Арматура", owner: "ПТО", startsAt: "2026-06-28", endsAt: "2026-07-02", plannedQty: 10, actualQty: 0, status: "not_started" }
    ],
    materials: [
      { id: "m1", projectId: "project-demo", name: "Бетон", unit: "м3", requiredQty: 20, orderedQty: 5, deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 0, actualUnitPrice: 0, supplier: "Не выбран", neededAt: "2026-06-25", status: "required" },
      { id: "m2", projectId: "project-demo", name: "Песок", unit: "т", requiredQty: 10, orderedQty: 10, deliveredQty: 20, consumedQty: 0, plannedUnitPrice: 100, actualUnitPrice: 100, supplier: "Поставщик", neededAt: "2026-07-01", status: "delivered" }
    ],
    procurementRequests: [{ id: "pr1", projectId: "project-demo", title: "Бетон", initiator: "РП", neededAt: "2026-06-25", priority: "high", status: "submitted", items: [] }],
    payments: [
      { id: "p1", projectId: "project-demo", title: "Аванс заказчика", counterparty: "Заказчик", direction: "incoming", plannedAt: "2026-06-01", amount: 100_000, status: "overdue", category: "customer" },
      { id: "p2", projectId: "project-demo", title: "Оплата бетона", counterparty: "Поставщик", direction: "outgoing", plannedAt: "2026-06-26", amount: 2_000_000, status: "planned", category: "supplier" }
    ],
    documents: [{ id: "d1", projectId: "project-demo", category: "прочее", title: "Фото", filePath: "", version: 1, author: "РП", createdAt: "2025-01-01", uploadedAt: "2025-01-01" }],
    risks: [{ id: "r1", projectId: "project-demo", title: "Риск бюджета", reason: "Рост цены материалов", priority: "critical", owner: "РП", dueAt: "2026-06-24", status: "open" }]
  };
}

describe("project intelligence", () => {
  const originalOpenAiKey = process.env.OPENAI_API_KEY;
  let fetchMock: MockInstance<typeof globalThis.fetch>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
  });

  afterEach(() => {
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    fetchMock.mockRestore();
  });

  it("maps risk scores to levels", () => {
    expect(scoreToRiskLevel(10)).toBe("low");
    expect(scoreToRiskLevel(35)).toBe("medium");
    expect(scoreToRiskLevel(60)).toBe("high");
    expect(scoreToRiskLevel(80)).toBe("critical");
  });

  it("detects budget, schedule, procurement, finance and document signals with evidence", () => {
    const snapshot = buildProjectIntelligence(context(), baseDate);

    expect(snapshot.budget.missingPriceItems).toHaveLength(1);
    expect(snapshot.budget.zeroQuantityItems).toHaveLength(1);
    expect(snapshot.budget.amountMismatches).toHaveLength(1);
    expect(snapshot.budget.duplicateItems).toHaveLength(1);
    expect(snapshot.schedule.overdueTasks).toHaveLength(1);
    expect(snapshot.schedule.noOwnerTasks).toHaveLength(1);
    expect(snapshot.procurement.deficitMaterials).toHaveLength(1);
    expect(snapshot.procurement.overstockMaterials).toHaveLength(1);
    expect(snapshot.procurement.missingSupplierMaterials).toHaveLength(1);
    expect(snapshot.procurement.missingPriceMaterials).toHaveLength(1);
    expect(snapshot.finance.overduePayments).toHaveLength(1);
    expect(snapshot.finance.possibleCashGap).toBeLessThan(0);
    expect(snapshot.documents.missingKeyDocuments.length).toBeGreaterThanOrEqual(3);
    expect(snapshot.documents.uncategorizedDocuments).toHaveLength(1);
    expect(snapshot.documents.ragReadiness.status).toBe("placeholder");
    expect(snapshot.radar.every((item) => item.evidence.length > 0)).toBe(true);
    expect(snapshot.actions.every((item) => item.category && item.actionType && item.priority && item.evidence.length > 0)).toBe(true);
    expect(snapshot.actions[0].priority).toBe("critical");
  });

  it("keeps procurement, schedule, cashflow and documents hooks non-mutating", () => {
    const input = context();
    const before = JSON.stringify(input);

    buildProjectIntelligence(input, baseDate);

    expect(JSON.stringify(input)).toBe(before);
  });

  it("sanitizes AI context and removes token-like fields", () => {
    const snapshot = buildProjectIntelligence(context(), baseDate);
    const sanitized = sanitizeAiContext({
      ...snapshot,
      project: { ...snapshot.project, name: "sk-test-secret project" }
    });

    expect(JSON.stringify(sanitized)).not.toContain("sk-test-secret");
    expect(JSON.stringify(sanitized)).not.toContain("DATABASE_URL");
  });

  it("returns deterministic AI fallback without calling OpenAI", async () => {
    delete process.env.OPENAI_API_KEY;
    const snapshot = buildProjectIntelligence(context(), baseDate);

    const result = await generateAiIntelligenceSummary(snapshot);

    expect(result.status).toBe("unavailable");
    expect(result.source).toBe("deterministic");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("parses mocked AI summaries without exposing raw provider payload", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  executiveSummary: "Проект требует внимания.",
                  keyRisks: ["Сроки"],
                  recommendedActions: ["Проверить материалы"],
                  managementNote: "Для руководства",
                  assumptions: ["Данные актуальны"],
                  missingData: []
                })
              }
            }
          ]
        }),
        { status: 200, headers: { "content-type": "application/json" } }
      )
    );
    const snapshot = buildProjectIntelligence(context(), baseDate);

    const result = await generateAiIntelligenceSummary(snapshot);

    expect(result.status).toBe("success");
    expect(result.source).toBe("openai");
    expect(result.recommendedActions).toEqual(["Проверить материалы"]);
    expect(JSON.stringify(result)).not.toContain("openai-token-redacted");
  });
});
