import { askProjectAssistant } from "@/lib/ai";
import type { AiFinding, AiInsightResponse, AiProjectContext, AiRecommendedAction, AiRunInput, AiScenario, AiSeverity, AiStatus } from "./types";
import { buildAiProjectContext } from "./context";
import { aiInsightResponseSchema } from "./schemas";

const scenarioTitles: Record<AiScenario, string> = {
  summary: "Сводка по проекту",
  "budget-review": "Проверка ВОР / сметы",
  "schedule-review": "Анализ графика",
  "procurement-review": "Материалы и снабжение",
  "finance-review": "Финансовый анализ",
  "risk-review": "Риск-анализ",
  "document-review": "Анализ документов",
  "daily-report-summary": "Сводка по рапортам",
  "executive-report": "Управленческий отчет",
  "draft-text": "Подготовка текста"
};

export const aiScenarioAliases: Record<string, AiScenario> = {
  summary: "summary",
  "budget-review": "budget-review",
  "schedule-review": "schedule-review",
  "procurement-review": "procurement-review",
  "finance-review": "finance-review",
  "risk-review": "risk-review",
  "document-review": "document-review",
  "daily-report-summary": "daily-report-summary",
  "executive-report": "executive-report",
  "draft-text": "draft-text",
  "analyze-budget": "budget-review",
  "analyze-contract": "document-review",
  "procurement-suggestion": "procurement-review"
};

function statusFromFindings(findings: AiFinding[]): AiStatus {
  if (findings.some((finding) => finding.severity === "critical")) return "critical";
  if (findings.some((finding) => finding.severity === "high" || finding.severity === "medium")) return "attention";
  if (findings.length) return "attention";
  return "on_track";
}

function finding(severity: AiSeverity, title: string, description: string, source?: string, recommendation?: string): AiFinding {
  return { severity, title, description, source, recommendation };
}

function action(priority: "low" | "medium" | "high", title: string, description: string): AiRecommendedAction {
  return { priority, title, description };
}

function base(input: AiRunInput, context: AiProjectContext, findings: AiFinding[], recommendedActions: AiRecommendedAction[], summary: string, dataUsed: string[], draftText?: string): AiInsightResponse {
  return {
    title: scenarioTitles[input.scenario],
    scenario: input.scenario,
    overallStatus: statusFromFindings(findings),
    summary,
    findings,
    recommendedActions,
    draftText,
    dataUsed,
    dataLimitations: context.dataLimitations,
    generatedAt: new Date().toISOString(),
    provider: process.env.OPENAI_API_KEY ? "openai" : "deterministic"
  };
}

function deterministicInsight(input: AiRunInput, context: AiProjectContext): AiInsightResponse {
  const findings: AiFinding[] = [];
  const actions: AiRecommendedAction[] = [];
  const used = ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "dailyReports"];

  if (input.scenario === "budget-review" || input.scenario === "summary" || input.scenario === "executive-report") {
    for (const item of context.budget.zeroPrices) findings.push(finding("high", "Нулевая цена в ВОР", `${item.name} в разделе "${item.section}" имеет нулевую плановую или прогнозную цену.`, "budget", "Уточнить цену, КП или расценку перед commit/закрытием бюджета."));
    for (const item of context.budget.zeroQty) findings.push(finding("medium", "Нулевой объем", `${item.name} в разделе "${item.section}" имеет нулевой объем.`, "budget", "Проверить единицу измерения и объем."));
    for (const item of context.budget.suspicious) findings.push(finding("medium", "Подозрительная позиция ВОР", `${item.name}: ${item.reason}.`, "budget", "Проверить вручную с ПТО/сметчиком."));
    if (context.budget.forecastProfit < 0) findings.push(finding("critical", "Отрицательная прогнозная прибыль", "Прогноз затрат превышает договорную сумму.", "finance", "Провести разбор перерасхода по разделам и подготовить письмо/допсоглашение."));
  }

  if (input.scenario === "schedule-review" || input.scenario === "summary" || input.scenario === "executive-report") {
    for (const item of context.schedule.delayed) findings.push(finding("high", "Просроченная работа", `${item.name}, ответственный: ${item.owner}, плановый финиш: ${item.endsAt}.`, "schedule", "Обновить план восстановления и проверить зависимые работы."));
    for (const item of context.schedule.missingOwners) findings.push(finding("medium", "Работа без ответственного", `${item.name} не имеет ответственного.`, "schedule", "Назначить владельца задачи."));
  }

  if (input.scenario === "procurement-review" || input.scenario === "summary" || input.scenario === "executive-report") {
    for (const item of context.materials.deficit) findings.push(finding("high", "Дефицит материала", `${item.name}: не заказано ${item.shortage} ${item.unit}, нужно к ${item.neededAt}.`, "materials", "Сформировать заявку снабжению и запросить КП."));
    for (const item of context.materials.overBudget) findings.push(finding("medium", "Цена выше бюджета", `${item.name}: факт ${item.actualUnitPrice}, план ${item.plannedUnitPrice}.`, "materials", "Проверить КП/поставщика. Рыночную цену AI не подтверждает без прайсов."));
    for (const item of context.materials.missingSupplier) findings.push(finding("medium", "Нет поставщика", `${item.name} не имеет выбранного поставщика.`, "procurement", "Запросить КП минимум у 2-3 поставщиков."));
  }

  if (input.scenario === "finance-review" || input.scenario === "summary" || input.scenario === "executive-report") {
    if (context.finance.cashGap < 0) findings.push(finding("high", "Кассовый разрыв", `Прогнозный cash gap: ${context.finance.cashGap.toLocaleString("ru-RU")} ₽.`, "finance", "Сверить график оплат и приоритет платежей."));
    for (const item of context.finance.overdue) findings.push(finding("high", "Просроченный платеж", `${item.title}: ${item.amount.toLocaleString("ru-RU")} ₽, план ${item.plannedAt}.`, "finance", "Подготовить платежный приоритет или письмо контрагенту."));
  }

  if (input.scenario === "risk-review" || input.scenario === "summary" || input.scenario === "executive-report") {
    for (const item of context.risks.filter((risk) => risk.priority === "critical" || risk.priority === "high")) findings.push(finding(item.priority === "critical" ? "critical" : "high", item.title, item.reason, "risks", `Владелец: ${item.owner}. Срок решения: ${item.dueAt}.`));
  }

  if (input.scenario === "document-review") {
    findings.push(finding("medium", "Нет OCR/извлеченного текста", "Глубокий анализ документов невозможен: в контексте доступны только метаданные.", "documents", "Подключить OCR/extract-text pipeline и повторить анализ."));
  }

  if (input.scenario === "daily-report-summary") {
    const reportsWithIssues = context.dailyReports.filter((report) => report.issues);
    for (const report of reportsWithIssues) findings.push(finding("medium", "Проблема в рапорте", `${report.date}: ${report.issues}`, "dailyReports", "Сверить с графиком и назначить корректирующее действие."));
  }

  actions.push(action("high", "Проверить критичные отклонения", "Начать с позиций high/critical и закрепить владельца решения."));
  actions.push(action("medium", "Подготовить управленческую сводку", "Собрать короткий отчет: сроки, деньги, снабжение, риски, решения."));
  if (context.materials.deficit.length) actions.push(action("high", "Сформировать заявку снабжения", "Вынести дефицитные материалы в draft заявки и запросить КП."));

  const summary =
    findings.length > 0
      ? `Найдено ${findings.length} управленческих сигналов. Фокус: ${findings.slice(0, 3).map((item) => item.title).join(", ")}.`
      : "Критичных отклонений по доступным данным не найдено. Продолжайте контроль сроков, ВОР и снабжения.";

  const draftText =
    input.scenario === "draft-text" || input.scenario === "executive-report"
      ? buildDraftText(input, context, findings)
      : input.scenario === "procurement-review"
        ? buildProcurementDraft(context)
        : undefined;

  return base(input, context, findings.slice(0, 12), actions.slice(0, 8), summary, used, draftText);
}

function buildDraftText(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  return [
    `Тема: ${input.topic || scenarioTitles[input.scenario]} — ${context.project.name}`,
    "",
    `Проект: ${context.project.name}, адрес: ${context.project.address}.`,
    `Общий вывод: ${findings.length ? `требуется решение по ${findings.slice(0, 3).map((item) => item.title.toLowerCase()).join(", ")}.` : "критичных отклонений по доступным данным не выявлено."}`,
    "",
    "Что требует решения:",
    ...(findings.length ? findings.slice(0, 5).map((item) => `- ${item.title}: ${item.recommendation ?? item.description}`) : ["- Продолжить плановый контроль сроков, бюджета и снабжения."]),
    "",
    "Ограничения: отчет сформирован по данным PGS; отсутствующие документы/OCR и внешние рыночные цены не учитывались.",
    input.instructions ? `Дополнительные указания: ${input.instructions}` : ""
  ].filter(Boolean).join("\n");
}

function buildProcurementDraft(context: AiProjectContext) {
  const lines = context.materials.deficit.slice(0, 8).map((item) => `- ${item.name}: ${item.shortage} ${item.unit}, срок ${item.neededAt}, поставщик: ${item.supplier || "не выбран"}`);
  return [
    `Тема: Срочная заявка снабжения — ${context.project.name}`,
    "Приоритет: высокий",
    "",
    "Прошу запросить КП и закрыть поставку по позициям:",
    ...(lines.length ? lines : ["- Критичных дефицитных материалов по текущим данным не найдено."]),
    "",
    "Комментарий: AI не подтверждает рыночные цены без КП/прайсов; цены требуют ручной проверки снабжением."
  ].join("\n");
}

export async function runAiScenario(input: AiRunInput): Promise<AiInsightResponse> {
  const context = await buildAiProjectContext(input.projectId);
  const deterministic = deterministicInsight(input, context);
  if (!process.env.OPENAI_API_KEY) return aiInsightResponseSchema.parse(deterministic);

  const prompt = [
    `Сценарий: ${scenarioTitles[input.scenario]}.`,
    "Сформируй короткий управленческий вывод строго по данным PGS. Не выдумывай отсутствующие факты.",
    `Контекст: ${JSON.stringify(context).slice(0, 12_000)}`
  ].join("\n\n");
  const live = await askProjectAssistant(input.projectId, prompt);
  if (!live.ok) return aiInsightResponseSchema.parse({ ...deterministic, provider: "degraded", dataLimitations: [...deterministic.dataLimitations, "Live AI недоступен, показан deterministic fallback."] });
  return aiInsightResponseSchema.parse({ ...deterministic, provider: "openai", summary: live.response.slice(0, 1600) });
}
