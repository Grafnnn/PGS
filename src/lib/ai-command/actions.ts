import type { AiActionPriority, AiFinding, AiInsightResponse, AiProjectContext, AiRecommendedAction, AiRunInput, AiScenario, AiSeverity, AiStatus } from "./types";
import { buildAiProjectContext } from "./context";
import { aiInsightResponseSchema } from "./schemas";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const MAX_PROVIDER_CONTEXT_CHARS = 12_000;
const MAX_FINDINGS = 12;
const MAX_ACTIONS = 8;

const scenarioTitles: Record<AiScenario, string> = {
  summary: "Сводка по проекту",
  "budget-review": "Проверка ВОР / сметы",
  "schedule-review": "Анализ графика",
  "procurement-review": "Материалы и снабжение",
  "finance-review": "Финансовый анализ",
  "contract-review": "Проверка договора / тендера",
  "risk-review": "Риск-анализ",
  "document-review": "Анализ документов",
  "daily-report-summary": "Сводка по рапортам",
  "executive-report": "Управленческий отчет",
  "draft-text": "Подготовка текста"
};

const scenarioDataUsed: Record<AiScenario, string[]> = {
  summary: ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "dailyReports"],
  "budget-review": ["project", "budget"],
  "schedule-review": ["project", "schedule", "risks", "dailyReports"],
  "procurement-review": ["project", "materials", "procurement", "schedule"],
  "finance-review": ["project", "budget", "finance", "risks"],
  "contract-review": ["project", "documents", "budget", "finance", "risks"],
  "risk-review": ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "documents"],
  "document-review": ["project", "documents"],
  "daily-report-summary": ["project", "dailyReports", "schedule", "risks"],
  "executive-report": ["project", "budget", "schedule", "materials", "procurement", "finance", "risks", "dailyReports"],
  "draft-text": ["project", "budget", "schedule", "materials", "finance", "risks"]
};

export const aiScenarioAliases: Record<string, AiScenario> = {
  summary: "summary",
  "budget-review": "budget-review",
  "schedule-review": "schedule-review",
  "procurement-review": "procurement-review",
  "finance-review": "finance-review",
  "contract-review": "contract-review",
  "risk-review": "risk-review",
  "document-review": "document-review",
  "daily-report-summary": "daily-report-summary",
  "executive-report": "executive-report",
  "draft-text": "draft-text",
  "analyze-budget": "budget-review",
  "analyze-contract": "contract-review",
  "procurement-suggestion": "procurement-review"
};

type ProviderPayload = Partial<Omit<AiInsightResponse, "scenario" | "generatedAt" | "provider">>;

function statusFromFindings(findings: AiFinding[]): AiStatus {
  if (findings.some((findingItem) => findingItem.severity === "critical")) return "critical";
  if (findings.some((findingItem) => findingItem.severity === "high" || findingItem.severity === "medium")) return "attention";
  if (findings.length) return "attention";
  return "on_track";
}

function finding(severity: AiSeverity, title: string, description: string, source?: string, recommendation?: string): AiFinding {
  return { severity, title, description, source, recommendation };
}

function action(priority: AiActionPriority, title: string, description: string): AiRecommendedAction {
  return { priority, title, description };
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function percent(value: number) {
  return `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;
}

function scenarioLimitations(input: AiRunInput, context: AiProjectContext, provider?: AiInsightResponse["provider"], extra: string[] = []) {
  const limitations = [...context.dataLimitations];
  if (provider === "deterministic") limitations.push("AI provider key не настроен: показан deterministic management analysis без live provider call.");
  if (input.scenario === "finance-review" && context.finance.paymentCount === 0) limitations.push("Финансовый анализ ограничен: платежи по проекту не найдены.");
  if (input.scenario === "daily-report-summary" && context.dailyReports.length === 0) limitations.push("Рапорты по проекту не найдены: сводка ограничена графиком и рисками.");
  if (input.scenario === "document-review" && context.documents.length === 0) limitations.push("Документы по проекту не найдены.");
  if (input.scenario === "contract-review") limitations.push("Проверка договора ограничена метаданными документов и проектными данными: OCR/полный текст договора не передается автоматически.");
  if (input.scenario === "budget-review" && context.budget.itemCount === 0) limitations.push("ВОР/бюджет по проекту пустой.");
  return Array.from(new Set([...limitations, ...extra]));
}

function base(
  input: AiRunInput,
  context: AiProjectContext,
  findings: AiFinding[],
  recommendedActions: AiRecommendedAction[],
  summary: string,
  provider: AiInsightResponse["provider"],
  options: Pick<AiInsightResponse, "subject" | "draftText" | "recommendedAttachments"> = {},
  extraLimitations: string[] = []
): AiInsightResponse {
  return aiInsightResponseSchema.parse({
    title: scenarioTitles[input.scenario],
    scenario: input.scenario,
    overallStatus: statusFromFindings(findings),
    summary,
    findings: findings.slice(0, MAX_FINDINGS),
    recommendedActions: recommendedActions.slice(0, MAX_ACTIONS),
    ...options,
    dataUsed: scenarioDataUsed[input.scenario],
    dataLimitations: scenarioLimitations(input, context, provider, extraLimitations),
    generatedAt: new Date().toISOString(),
    provider
  });
}

function collectBudgetFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  for (const item of context.budget.zeroPrices) findings.push(finding("high", "Нулевая цена в ВОР", `${item.name} в разделе "${item.section}" имеет нулевую плановую или прогнозную цену.`, "budget", "Уточнить цену, КП или расценку перед commit/закрытием бюджета."));
  for (const item of context.budget.zeroQty) findings.push(finding("medium", "Нулевой объем", `${item.name} в разделе "${item.section}" имеет нулевой объем.`, "budget", "Проверить единицу измерения и объем."));
  for (const item of context.budget.missingUnits) findings.push(finding("medium", "Не указана единица измерения", `${item.name} в разделе "${item.section}" не имеет единицы измерения.`, "budget", "Заполнить единицу измерения до закрытия ВОР."));
  for (const item of context.budget.duplicateNames) findings.push(finding("medium", "Возможный дубль позиции", `${item.name} встречается ${item.count} раза в разделах: ${item.sections.join(", ")}.`, "budget", "Проверить, это разные работы или задвоение."));
  for (const item of context.budget.largeItems) findings.push(finding("low", "Крупная позиция бюджета", `${item.name}: ${money(item.amount)} (${percent(item.sharePercent)} договора).`, "budget", "Проверить цену, объем и привязку к КП/договору."));
  for (const item of context.budget.suspicious) findings.push(finding("medium", "Подозрительная позиция ВОР", `${item.name}: ${item.reason}.`, "budget", "Проверить вручную с ПТО/сметчиком."));
  if (context.budget.forecastProfit < 0) findings.push(finding("critical", "Отрицательная прогнозная прибыль", "Прогноз затрат превышает договорную сумму.", "finance", "Провести разбор перерасхода по разделам и подготовить письмо/допсоглашение."));
  return findings;
}

function collectScheduleFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  for (const item of context.schedule.delayed) findings.push(finding("high", "Просроченная работа", `${item.name}, ответственный: ${item.owner || "не назначен"}, плановый финиш: ${item.endsAt}.`, "schedule", "Обновить план восстановления и проверить зависимые работы."));
  for (const item of context.schedule.missingOwners) findings.push(finding("medium", "Работа без ответственного", `${item.name} не имеет ответственного.`, "schedule", "Назначить владельца задачи."));
  for (const item of context.schedule.missingDates) findings.push(finding("medium", "Работа без дат", `${item.name} не имеет полной пары старт/финиш.`, "schedule", "Заполнить даты до управленческого контроля графика."));
  if (context.schedule.upcoming.length) findings.push(finding("low", "Ближайшие работы к контролю", `${context.schedule.upcoming.slice(0, 3).map((item) => item.name).join(", ")} стартуют или идут в ближайшие 14 дней.`, "schedule", "Проверить готовность материалов, людей и фронта работ."));
  return findings;
}

function collectProcurementFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  for (const item of context.materials.deficit) findings.push(finding("high", "Дефицит материала", `${item.name}: не заказано ${item.shortage} ${item.unit}, нужно к ${item.neededAt}.`, "materials", "Сформировать заявку снабжению и запросить КП."));
  for (const item of context.materials.overBudget) findings.push(finding("medium", "Цена выше бюджета", `${item.name}: факт ${money(item.actualUnitPrice)}, план ${money(item.plannedUnitPrice)}.`, "materials", "Проверить КП/поставщика. Рыночную цену AI не подтверждает без прайсов."));
  for (const item of context.materials.missingSupplier) findings.push(finding("medium", "Нет поставщика", `${item.name} не имеет выбранного поставщика.`, "procurement", "Запросить КП минимум у 2-3 поставщиков."));
  for (const item of context.procurement.materialsWithoutQuotes.slice(0, 5)) findings.push(finding("low", "Нет КП в контексте", `${item.name}: КП поставщика не найдено в данных проекта.`, "procurement", "Приложить КП или прайс, если требуется проверка цены."));
  return findings;
}

function collectFinanceFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (context.finance.cashGap < 0) findings.push(finding("high", "Кассовый разрыв", `Прогнозный cash gap: ${money(context.finance.cashGap)}.`, "finance", "Сверить график оплат и приоритет платежей."));
  if (context.finance.unpaidIncoming > 0) findings.push(finding("medium", "Есть неоплаченные входящие платежи", `Не оплачено входящих платежей: ${money(context.finance.unpaidIncoming)}.`, "finance", "Проверить дебиторку, КС и план поступлений."));
  if (context.finance.unpaidOutgoing > 0) findings.push(finding("medium", "Есть неоплаченные исходящие платежи", `Не оплачено исходящих платежей: ${money(context.finance.unpaidOutgoing)}.`, "finance", "Согласовать платежный календарь и критичные поставки."));
  for (const item of context.finance.overdue) findings.push(finding("high", "Просроченный платеж", `${item.title}: ${money(item.amount)}, план ${item.plannedAt}.`, "finance", "Подготовить платежный приоритет или письмо контрагенту."));
  return findings;
}

function collectRiskFindings(context: AiProjectContext) {
  return context.risks
    .filter((risk) => risk.priority === "critical" || risk.priority === "high" || risk.status !== "closed")
    .map((risk) =>
      finding(
        risk.priority === "critical" ? "critical" : risk.priority === "high" ? "high" : "medium",
        risk.title,
        risk.reason,
        "risks",
        `Реестр риска: владелец ${risk.owner || "не назначен"}, срок решения ${risk.dueAt || "не задан"}.`
      )
    );
}

function collectDocumentFindings(context: AiProjectContext) {
  const findings = [
    finding("medium", "Нет OCR/извлеченного текста", "Глубокий анализ документов невозможен: в контексте доступны только метаданные.", "documents", "Подключить OCR/extract-text pipeline и повторить анализ.")
  ];
  const categories = Array.from(new Set(context.documents.map((documentItem) => documentItem.category))).filter(Boolean);
  if (categories.length) findings.push(finding("low", "Доступны категории документов", `В проекте найдены категории: ${categories.join(", ")}.`, "documents", "Сначала проверить договоры, сметы, КС и исполнительную документацию."));
  return findings;
}

function collectContractFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  const documentSource = context.documents.map((documentItem) => `${documentItem.title} ${documentItem.category}`.toLowerCase()).join(" ");
  const hasContract = /договор|contract/.test(documentSource);
  const hasEstimate = /вор|смет|estimate|budget/.test(documentSource) || context.budget.itemCount > 0;
  const hasPayment = /оплат|аванс|payment/.test(documentSource) || context.finance.paymentCount > 0;
  const hasAcceptance = /кс|акт|прием|приём|acceptance/.test(documentSource);
  if (!hasContract) findings.push(finding("critical", "Договор не найден в метаданных", "В проектном контексте нет документа категории/названия договора.", "documents", "Загрузить договор или проект договора перед управленческим решением."));
  if (!hasEstimate) findings.push(finding("high", "Нет ВОР/сметы в договорном пакете", "Цена договора не связана с подтвержденными объемами и бюджетной базой.", "budget", "Приложить ВОР/смету и сверить маржу."));
  if (!hasPayment) findings.push(finding("high", "Не найден платежный контур", "В метаданных документов и платежах нет явных условий оплаты/аванса.", "finance", "Запросить график оплат, аванс и порядок оплаты КС."));
  if (!hasAcceptance) findings.push(finding("medium", "Не найден приемочный контур", "Не видно порядка приемки, КС или актов в метаданных.", "documents", "Проверить раздел приемки, мотивированный отказ и пакет закрытия."));
  if (context.budget.forecastProfit < 0) findings.push(finding("critical", "Отрицательная маржа до подписания", `Прогноз прибыли ${money(context.budget.forecastProfit)}.`, "finance", "Пересчитать цену КП или исключить убыточные условия."));
  if (context.finance.cashGap < 0) findings.push(finding("high", "Cash gap влияет на условия договора", `Cash gap ${money(context.finance.cashGap)} может требовать аванс или этапную оплату.`, "finance", "Согласовать авансирование и календарь оплат."));
  return findings;
}

function collectDailyReportFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  const reportsWithIssues = context.dailyReports.filter((report) => report.issues);
  for (const report of reportsWithIssues) findings.push(finding("medium", "Проблема в рапорте", `${report.date}: ${report.issues}`, "dailyReports", "Сверить с графиком и назначить корректирующее действие."));
  if (context.dailyReports.length) {
    const last = context.dailyReports[0];
    findings.push(finding("low", "Последний рапорт", `${last.date}: ${last.completedWorks || "выполненные работы не указаны"}. Люди: ${last.workers}, ИТР: ${last.engineers}.`, "dailyReports", "Сверить факт с графиком и объемами."));
  }
  return findings;
}

function collectFindings(input: AiRunInput, context: AiProjectContext) {
  if (input.scenario === "budget-review") return collectBudgetFindings(context);
  if (input.scenario === "schedule-review") return collectScheduleFindings(context);
  if (input.scenario === "procurement-review") return collectProcurementFindings(context);
  if (input.scenario === "finance-review") return collectFinanceFindings(context);
  if (input.scenario === "contract-review") return collectContractFindings(context);
  if (input.scenario === "risk-review") return [...collectRiskFindings(context), ...collectScheduleFindings(context).slice(0, 3), ...collectProcurementFindings(context).slice(0, 3), ...collectFinanceFindings(context).slice(0, 3)];
  if (input.scenario === "document-review") return collectDocumentFindings(context);
  if (input.scenario === "daily-report-summary") return collectDailyReportFindings(context);
  return [...collectBudgetFindings(context), ...collectScheduleFindings(context), ...collectProcurementFindings(context), ...collectFinanceFindings(context), ...collectRiskFindings(context)];
}

function buildActions(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  const actions: AiRecommendedAction[] = [];
  if (findings.some((item) => item.severity === "critical" || item.severity === "high")) actions.push(action("high", "Разобрать критичные отклонения", "Начать с high/critical findings, закрепить владельца, срок и решение."));
  if (context.materials.deficit.length && ["summary", "procurement-review", "risk-review", "executive-report"].includes(input.scenario)) actions.push(action("high", "Сформировать заявку снабжения", "Вынести дефицитные материалы в draft заявки и запросить КП."));
  if (context.schedule.delayed.length && ["summary", "schedule-review", "risk-review", "executive-report"].includes(input.scenario)) actions.push(action("high", "Обновить план восстановления графика", "Проверить зависимые работы, фронт, людей и материалы на ближайшие 7 дней."));
  if (context.finance.cashGap < 0 && ["summary", "finance-review", "risk-review", "executive-report"].includes(input.scenario)) actions.push(action("high", "Согласовать платежный календарь", "Подготовить варианты закрытия cash gap: переносы, аванс, приоритет поставок."));
  if (input.scenario === "contract-review") actions.push(action("high", "Проверить договорные условия до GO", "Сверить оплату, аванс, приемку, штрафы, изменение объемов и состав приложений."));
  if (input.scenario === "document-review") actions.push(action("medium", "Запустить OCR/text extraction как отдельный шаг", "Без извлеченного текста AI не должен делать вид, что прочитал документы."));
  if (input.scenario === "daily-report-summary") actions.push(action("medium", "Сверить рапорты с графиком", "Проверить, какие фактические работы не отражены в графике/объемах."));
  actions.push(action("medium", "Подготовить управленческую сводку", "Собрать короткий отчет: сроки, деньги, снабжение, риски, решения."));
  return actions;
}

function buildSummary(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  if (input.scenario === "finance-review") {
    return `Финансовый контур: входящие ${money(context.finance.incomingPayments)}, исходящие ${money(context.finance.outgoingPayments)}, cash gap ${money(context.finance.cashGap)}.`;
  }
  if (input.scenario === "budget-review") {
    return `ВОР содержит ${context.budget.itemCount} позиций. Прогноз затрат ${money(context.budget.totalForecastCost)}, прогноз прибыли ${money(context.budget.forecastProfit)} (${percent(context.budget.forecastMarginPercent)}).`;
  }
  if (input.scenario === "schedule-review") {
    return `График содержит ${context.schedule.itemCount} работ, готовность ${percent(context.schedule.completionPercent)}. Просрочек: ${context.schedule.delayed.length}.`;
  }
  if (input.scenario === "procurement-review") {
    return `Материалы: ${context.materials.itemCount} позиций, дефицитных ${context.materials.deficit.length}, активных заявок ${context.procurement.active.length}.`;
  }
  if (input.scenario === "document-review") {
    return `Проверены только метаданные документов: ${context.documents.length} документов. Глубокий анализ текста пока недоступен.`;
  }
  if (input.scenario === "contract-review") {
    return `Проверен договорный контур по метаданным и данным проекта: документов ${context.documents.length}, позиций ВОР ${context.budget.itemCount}, прогноз прибыли ${money(context.budget.forecastProfit)}.`;
  }
  if (input.scenario === "daily-report-summary") {
    return `Проверены последние рапорты: ${context.dailyReports.length}. Проблемных записей: ${context.dailyReports.filter((report) => report.issues).length}.`;
  }
  return findings.length > 0
    ? `Найдено ${findings.length} управленческих сигналов. Фокус: ${findings.slice(0, 3).map((item) => item.title).join(", ")}.`
    : "Критичных отклонений по доступным данным не найдено. Продолжайте контроль сроков, ВОР и снабжения.";
}

function buildDraftText(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  const subject = `${input.topic || scenarioTitles[input.scenario]} — ${context.project.name}`;
  return {
    subject,
    recommendedAttachments: ["Актуальный график", "ВОР/бюджет", "Реестр рисков", "Платежный календарь"].slice(0, input.scenario === "draft-text" ? 4 : 3),
    draftText: [
      `Тема: ${subject}`,
      "",
      `Проект: ${context.project.name}, адрес: ${context.project.address}.`,
      `Общий вывод: ${findings.length ? `требуется решение по ${findings.slice(0, 3).map((item) => item.title.toLowerCase()).join(", ")}.` : "критичных отклонений по доступным данным не выявлено."}`,
      "",
      "Что требует решения:",
      ...(findings.length ? findings.slice(0, 5).map((item) => `- ${item.title}: ${item.recommendation ?? item.description}`) : ["- Продолжить плановый контроль сроков, бюджета и снабжения."]),
      "",
      "Ограничения: отчет сформирован по данным PGS; отсутствующие документы/OCR и внешние рыночные цены не учитывались.",
      input.instructions ? `Дополнительные указания: ${input.instructions}` : ""
    ].filter(Boolean).join("\n")
  };
}

function buildProcurementDraft(context: AiProjectContext) {
  const lines = context.materials.deficit.slice(0, 8).map((item) => `- ${item.name}: ${item.shortage} ${item.unit}, срок ${item.neededAt}, поставщик: ${item.supplier || "не выбран"}`);
  return {
    subject: `Срочная заявка снабжения — ${context.project.name}`,
    recommendedAttachments: ["ВОР/потребность материалов", "График работ на 14 дней", "КП/прайсы поставщиков"],
    draftText: [
      `Тема: Срочная заявка снабжения — ${context.project.name}`,
      "Приоритет: высокий",
      "",
      "Прошу запросить КП и закрыть поставку по позициям:",
      ...(lines.length ? lines : ["- Критичных дефицитных материалов по текущим данным не найдено."]),
      "",
      "Комментарий: AI не подтверждает рыночные цены без КП/прайсов; цены требуют ручной проверки снабжением."
    ].join("\n")
  };
}

function buildScenarioOptions(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  if (input.scenario === "draft-text" || input.scenario === "executive-report") return buildDraftText(input, context, findings);
  if (input.scenario === "procurement-review") return buildProcurementDraft(context);
  if (input.scenario === "contract-review") return { recommendedAttachments: ["Договор / проект договора", "ТЗ", "ВОР/смета", "График оплат", "Календарный график", "КС/акты"] };
  if (input.scenario === "document-review") return { recommendedAttachments: ["Договор", "ВОР/смета", "КС", "Исполнительная документация"] };
  return {};
}

function deterministicInsight(input: AiRunInput, context: AiProjectContext, provider: AiInsightResponse["provider"] = process.env.OPENAI_API_KEY ? "openai" : "deterministic", extraLimitations: string[] = []): AiInsightResponse {
  const findings = collectFindings(input, context);
  const actions = buildActions(input, context, findings);
  return base(input, context, findings, actions, buildSummary(input, context, findings), provider, buildScenarioOptions(input, context, findings), extraLimitations);
}

function parseProviderJson(content: string): ProviderPayload | null {
  try {
    return JSON.parse(content) as ProviderPayload;
  } catch {
    const start = content.indexOf("{");
    const end = content.lastIndexOf("}");
    if (start < 0 || end <= start) return null;
    try {
      return JSON.parse(content.slice(start, end + 1)) as ProviderPayload;
    } catch {
      return null;
    }
  }
}

function sanitizeProviderItems<T>(items: T[] | undefined, fallback: T[], max: number) {
  return Array.isArray(items) ? items.slice(0, max) : fallback.slice(0, max);
}

function mergeProviderInsight(input: AiRunInput, context: AiProjectContext, deterministic: AiInsightResponse, payload: ProviderPayload) {
  return aiInsightResponseSchema.parse({
    ...deterministic,
    title: typeof payload.title === "string" ? payload.title.slice(0, 120) : deterministic.title,
    scenario: input.scenario,
    overallStatus: payload.overallStatus ?? deterministic.overallStatus,
    summary: typeof payload.summary === "string" ? payload.summary.slice(0, 1800) : deterministic.summary,
    findings: sanitizeProviderItems(payload.findings, deterministic.findings, MAX_FINDINGS),
    recommendedActions: sanitizeProviderItems(payload.recommendedActions, deterministic.recommendedActions, MAX_ACTIONS),
    subject: typeof payload.subject === "string" ? payload.subject.slice(0, 180) : deterministic.subject,
    draftText: typeof payload.draftText === "string" ? payload.draftText.slice(0, 6000) : deterministic.draftText,
    recommendedAttachments: sanitizeProviderItems(payload.recommendedAttachments, deterministic.recommendedAttachments ?? [], 8),
    dataUsed: sanitizeProviderItems(payload.dataUsed, deterministic.dataUsed, 12),
    dataLimitations: Array.from(new Set([...deterministic.dataLimitations.filter((item) => !item.includes("AI provider key")), ...(payload.dataLimitations ?? [])])).slice(0, 16),
    generatedAt: new Date().toISOString(),
    provider: "openai"
  });
}

async function requestStructuredProvider(input: AiRunInput, context: AiProjectContext) {
  if (!process.env.OPENAI_API_KEY) return null;
  const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
    method: "POST",
    headers: {
      authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model: OPENAI_MODEL,
      response_format: { type: "json_object" },
      temperature: 0.2,
      messages: [
        {
          role: "system",
          content:
            "Ты - управленческий AI-помощник строительного проекта. Отвечай только валидным JSON. Анализируй строго предоставленный контекст PGS. Не выдумывай факты, рыночные цены, оплаты или документы. AI не изменяет данные, только дает рекомендации."
        },
        {
          role: "user",
          content: JSON.stringify({
            scenario: input.scenario,
            outputContract: {
              title: "string",
              overallStatus: "on_track | attention | critical | unknown",
              summary: "string",
              findings: [{ severity: "low | medium | high | critical", title: "string", description: "string", source: "string", recommendation: "string" }],
              recommendedActions: [{ priority: "low | medium | high", title: "string", description: "string" }],
              subject: "optional string",
              draftText: "optional string",
              recommendedAttachments: ["optional strings"],
              dataUsed: ["strings"],
              dataLimitations: ["strings"]
            },
            draftRequest: input.scenario === "draft-text" ? { textType: input.textType, topic: input.topic, instructions: input.instructions } : undefined,
            context
          }).slice(0, MAX_PROVIDER_CONTEXT_CHARS)
        }
      ]
    })
  });

  const payload = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string | null } }> } | null;
  if (!response.ok) throw new Error("OpenAI provider returned a non-success status");
  return parseProviderJson(payload?.choices?.[0]?.message?.content ?? "");
}

export async function runAiScenario(input: AiRunInput): Promise<AiInsightResponse> {
  const context = await buildAiProjectContext(input.projectId);
  const deterministic = deterministicInsight(input, context, process.env.OPENAI_API_KEY ? "degraded" : "deterministic");
  if (!process.env.OPENAI_API_KEY) return deterministic;

  try {
    const providerPayload = await requestStructuredProvider(input, context);
    if (!providerPayload) {
      return deterministicInsight(input, context, "degraded", ["Live AI вернул невалидный structured JSON, показан deterministic fallback."]);
    }
    return mergeProviderInsight(input, context, deterministic, providerPayload);
  } catch {
    return deterministicInsight(input, context, "degraded", ["Live AI недоступен, показан deterministic fallback."]);
  }
}
