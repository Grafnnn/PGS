import { budgetTotals, financeTotals, materialTotals, money, percent, workTotals } from "./calculations";
import { getProjectBundle } from "./demo-data";
import { getProjectBundleFromDb } from "./project-data";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const OPENAI_RETRY_DELAY_MS = process.env.NODE_ENV === "test" ? 0 : 300;

const transientProviderErrorPatterns = [
  "premature close",
  "econnreset",
  "etimedout",
  "enotfound",
  "eai_again",
  "socket hang up",
  "fetch failed",
  "terminated",
  "und_err_socket",
  "und_err_connect_timeout"
];

type OpenAiChatCompletion = {
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
};

export async function buildProjectContext(projectId: string) {
  const bundle = (await getProjectBundleFromDb(projectId).catch(() => null)) ?? getProjectBundle(projectId);
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const works = workTotals(bundle.scheduleItems);
  const materials = materialTotals(bundle.materials);
  const finance = financeTotals(bundle.payments);

  return {
    ...bundle,
    kpi: {
      contractAmount: money(bundle.project.contractAmount),
      plannedCost: money(budget.totalPlannedCost),
      actualCost: money(budget.totalActualCost),
      forecastCost: money(budget.totalForecastCost),
      plannedProfit: money(budget.plannedProfit),
      forecastProfit: money(budget.forecastProfit),
      plannedMargin: percent(budget.plannedMarginPercent),
      forecastMargin: percent(budget.forecastMarginPercent),
      completion: percent(works.completionPercent),
      overdueWorks: works.overdueItems.length,
      materialOverrun: money(materials.materialOverrun),
      cashGap: money(finance.cashGap),
      financingNeed: money(finance.financingNeed)
    }
  };
}

export function localAiFallback(
  prompt: string,
  projectId: string,
  intro = "Вывод: ключ OpenAI не настроен для live-ответа, поэтому сформирован локальный управленческий ответ по данным проекта."
) {
  const bundle = getProjectBundle(projectId);
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const works = workTotals(bundle.scheduleItems);
  const materials = materialTotals(bundle.materials);
  const finance = financeTotals(bundle.payments);
  const context = {
    ...bundle,
    kpi: {
      contractAmount: money(bundle.project.contractAmount),
      plannedCost: money(budget.totalPlannedCost),
      actualCost: money(budget.totalActualCost),
      forecastCost: money(budget.totalForecastCost),
      plannedProfit: money(budget.plannedProfit),
      forecastProfit: money(budget.forecastProfit),
      plannedMargin: percent(budget.plannedMarginPercent),
      forecastMargin: percent(budget.forecastMarginPercent),
      completion: percent(works.completionPercent),
      overdueWorks: works.overdueItems.length,
      materialOverrun: money(materials.materialOverrun),
      cashGap: money(finance.cashGap),
      financingNeed: money(finance.financingNeed)
    }
  };
  const criticalRisks = context.risks.filter((risk) => risk.priority === "critical" || risk.priority === "high");
  const deficitMaterials = context.materials.filter((material) => material.requiredQty > material.orderedQty);

  return [
    intro,
    `Проект: ${context.project.name}. Готовность по графику: ${context.kpi.completion}. Прогнозная прибыль: ${context.kpi.forecastProfit}.`,
    `Риски: ${criticalRisks.map((risk) => risk.title).join("; ") || "критичных рисков не выявлено"}.`,
    `Материалы к действию: ${deficitMaterials.map((item) => `${item.name} - заказать ${item.requiredQty - item.orderedQty} ${item.unit}`).join("; ") || "дефицита нет"}.`,
    `Финансы: потребность в финансировании ${context.kpi.financingNeed}.`,
    `Запрос пользователя: ${prompt}`
  ].join("\n\n");
}

function errorFragments(error: unknown): string[] {
  if (!error || typeof error !== "object") return [String(error ?? "")];
  const record = error as Record<string, unknown>;
  const fragments = [record.name, record.message, record.code]
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.toLowerCase());
  if (record.cause) fragments.push(...errorFragments(record.cause));
  return fragments;
}

export function isTransientOpenAiProviderError(error: unknown) {
  const text = errorFragments(error).join(" ");
  return transientProviderErrorPatterns.some((pattern) => text.includes(pattern));
}

function sanitizeProviderError(error: unknown) {
  if (!error || typeof error !== "object") return String(error ?? "unknown error").slice(0, 160);
  const record = error as Record<string, unknown>;
  return [record.name, record.message, record.code]
    .filter((value): value is string => typeof value === "string")
    .join(": ")
    .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
    .slice(0, 240);
}

function providerFailureResponse(prompt: string, projectId: string) {
  return {
    ok: false,
    status: 502,
    response: [
      "AI-провайдер временно недоступен. Запрос не выполнен, чтобы не возвращать пользователю техническую ошибку.",
      "Данные проекта не потеряны. Повторите запрос позже или используйте локальный отчет по проекту.",
      `Локальный ориентир: ${localAiFallback(
        prompt,
        projectId,
        "Вывод: live-ответ OpenAI временно недоступен, поэтому сформирован локальный управленческий ответ по данным проекта."
      )}`
    ].join("\n\n"),
    error: "AI provider request failed"
  };
}

async function delay(ms: number) {
  if (ms <= 0) return;
  await new Promise((resolve) => setTimeout(resolve, ms));
}

async function requestOpenAiChatCompletion(apiKey: string, body: unknown): Promise<OpenAiChatCompletion> {
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error("OpenAI provider returned a non-success status");
    Object.assign(error, {
      status: response.status,
      code: typeof payload?.error?.code === "string" ? payload.error.code : undefined,
      type: typeof payload?.error?.type === "string" ? payload.error.type : undefined
    });
    throw error;
  }

  return payload as OpenAiChatCompletion;
}

export async function askProjectAssistant(projectId: string, prompt: string) {
  if (!process.env.OPENAI_API_KEY) {
    return {
      ok: false,
      status: 503,
      response: localAiFallback(prompt, projectId),
      error: "OPENAI_API_KEY is not configured"
    };
  }

  const context = await buildProjectContext(projectId);
  const requestBody = {
    model: OPENAI_MODEL,
    messages: [
      {
        role: "system",
        content:
          "Ты - помощник руководителя строительного проекта. Анализируй данные строго по предоставленному контексту. Не выдумывай факты. Если данных недостаточно, укажи, какие данные нужны. Отвечай структурно: вывод, риски, причины, рекомендации, действия на ближайшие 7 дней."
      },
      {
        role: "user",
        content: JSON.stringify({ prompt, context }, null, 2)
      }
    ],
    temperature: 0.2
  };

  let completion: OpenAiChatCompletion;
  try {
    completion = await requestOpenAiChatCompletion(process.env.OPENAI_API_KEY, requestBody);
  } catch (error) {
    if (!isTransientOpenAiProviderError(error)) {
      console.warn("AI provider request failed", sanitizeProviderError(error));
      return providerFailureResponse(prompt, projectId);
    }

    console.warn("AI provider transient failure; retrying once", sanitizeProviderError(error));
    await delay(OPENAI_RETRY_DELAY_MS);

    try {
      completion = await requestOpenAiChatCompletion(process.env.OPENAI_API_KEY, requestBody);
    } catch (retryError) {
      console.warn("AI provider retry failed", sanitizeProviderError(retryError));
      return providerFailureResponse(prompt, projectId);
    }
  }

  return {
    ok: true,
    status: 200,
    response: completion.choices?.[0]?.message?.content ?? "AI не вернул текстовый ответ."
  };
}
