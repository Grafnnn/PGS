import OpenAI from "openai";
import { budgetTotals, financeTotals, materialTotals, money, percent, workTotals } from "./calculations";
import { getProjectBundle } from "./demo-data";
import { getProjectBundleFromDb } from "./project-data";

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

export function localAiFallback(prompt: string, projectId: string) {
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
    "Вывод: ключ OpenAI не настроен для live-ответа, поэтому сформирован локальный управленческий ответ по данным проекта.",
    `Проект: ${context.project.name}. Готовность по графику: ${context.kpi.completion}. Прогнозная прибыль: ${context.kpi.forecastProfit}.`,
    `Риски: ${criticalRisks.map((risk) => risk.title).join("; ") || "критичных рисков не выявлено"}.`,
    `Материалы к действию: ${deficitMaterials.map((item) => `${item.name} - заказать ${item.requiredQty - item.orderedQty} ${item.unit}`).join("; ") || "дефицита нет"}.`,
    `Финансы: потребность в финансировании ${context.kpi.financingNeed}.`,
    `Запрос пользователя: ${prompt}`
  ].join("\n\n");
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

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const context = await buildProjectContext(projectId);

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
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
  });

  return {
    ok: true,
    status: 200,
    response: completion.choices[0]?.message.content ?? "AI не вернул текстовый ответ."
  };
}
