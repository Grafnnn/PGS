import type { AiActionPriority, AiFinding, AiInsightResponse, AiProjectContext, AiRecommendedAction, AiRunInput, AiScenario, AiSeverity, AiStatus } from "./types";
import { buildAiProjectContext } from "./context";
import { aiInsightResponseSchema } from "./schemas";
import { aiScenarioById } from "./catalog";
import { getOpenAiRuntimeConfig } from "@/lib/env";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_MODEL = "gpt-4o-mini";
const PROVIDER_TIMEOUT_MS = process.env.NODE_ENV === "test" ? 2_000 : 45_000;
const MAX_PROVIDER_CONTEXT_CHARS = 32_000;
const MAX_FINDINGS = 12;
const MAX_ACTIONS = 8;

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
  "onboarding-review": "onboarding-review",
  "workforce-review": "workforce-review",
  "field-review": "field-review",
  "quality-review": "quality-review",
  "rfi-review": "rfi-review",
  "claims-review": "claims-review",
  "acceptance-review": "acceptance-review",
  "closeout-review": "closeout-review",
  "draft-text": "draft-text",
  "analyze-budget": "budget-review",
  "analyze-contract": "contract-review",
  "procurement-suggestion": "procurement-review"
};

type ProviderPayload = Record<string, unknown>;

const providerInsightJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["title", "overallStatus", "summary", "findings", "recommendedActions", "subject", "draftText", "recommendedAttachments", "dataLimitations"],
  properties: {
    title: { type: "string", maxLength: 120 },
    overallStatus: { type: "string", enum: ["on_track", "attention", "critical", "unknown"] },
    summary: { type: "string", maxLength: 1800 },
    findings: {
      type: "array",
      maxItems: MAX_FINDINGS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["severity", "title", "description", "source", "recommendation"],
        properties: {
          severity: { type: "string", enum: ["low", "medium", "high", "critical"] },
          title: { type: "string", maxLength: 180 },
          description: { type: "string", maxLength: 1200 },
          source: { type: "string", maxLength: 120 },
          recommendation: { type: "string", maxLength: 1000 }
        }
      }
    },
    recommendedActions: {
      type: "array",
      maxItems: MAX_ACTIONS,
      items: {
        type: "object",
        additionalProperties: false,
        required: ["priority", "title", "description"],
        properties: {
          priority: { type: "string", enum: ["low", "medium", "high"] },
          title: { type: "string", maxLength: 180 },
          description: { type: "string", maxLength: 1000 }
        }
      }
    },
    subject: { anyOf: [{ type: "string", maxLength: 180 }, { type: "null" }] },
    draftText: { anyOf: [{ type: "string", maxLength: 6000 }, { type: "null" }] },
    recommendedAttachments: { type: "array", maxItems: 8, items: { type: "string", maxLength: 180 } },
    dataLimitations: { type: "array", maxItems: 8, items: { type: "string", maxLength: 600 } }
  }
} as const;

function statusFromFindings(findings: AiFinding[]): AiStatus {
  if (findings.some((findingItem) => findingItem.severity === "critical")) return "critical";
  if (findings.some((findingItem) => findingItem.severity === "high" || findingItem.severity === "medium")) return "attention";
  if (findings.length) return "attention";
  return "on_track";
}

const findingSeverityRank: Record<AiSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

function rankFindings(findings: AiFinding[]) {
  return findings
    .map((item, index) => ({ item, index }))
    .sort((left, right) => findingSeverityRank[left.item.severity] - findingSeverityRank[right.item.severity] || left.index - right.index)
    .map(({ item }) => item);
}

function statusForScenario(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  const status = statusFromFindings(findings);
  if (status !== "on_track") return status;
  const hasEvidence: Partial<Record<AiScenario, boolean>> = {
    "budget-review": context.budget.itemCount > 0,
    "schedule-review": context.schedule.itemCount > 0,
    "procurement-review": context.materials.itemCount + context.procurement.active.length > 0,
    "finance-review": context.finance.paymentCount + context.expenses.count > 0,
    "contract-review": context.documents.length > 0,
    "document-review": context.documents.length > 0,
    "daily-report-summary": context.dailyReports.length > 0,
    "workforce-review": context.workforce.demandCount + context.workforce.assignmentCount > 0,
    "field-review": context.field.reportCount > 0,
    "quality-review": context.quality.inspectionCount + context.quality.openIssueCount > 0,
    "rfi-review": context.collaboration.openRfis + context.collaboration.openSubmittals > 0,
    "claims-review": context.commercial.changeOrderCount > 0,
    "acceptance-review": context.acceptance.applicationCount > 0,
    "closeout-review": context.closeout.packageCount > 0
  };
  if (input.scenario in hasEvidence && !hasEvidence[input.scenario]) return "unknown";
  const broadEvidence = context.budget.itemCount + context.schedule.itemCount + context.materials.itemCount + context.finance.paymentCount + context.dailyReports.length + context.documents.length;
  if (["summary", "executive-report", "risk-review", "draft-text"].includes(input.scenario) && broadEvidence === 0) return "unknown";
  return status;
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
  if (provider === "deterministic") {
    const runtime = getOpenAiRuntimeConfig();
    limitations.push(runtime.mode === "disabled"
      ? "OpenAI connector отключен: показаны только детерминированные проверки PGS."
      : "AI provider key не настроен: показаны только детерминированные проверки PGS.");
  }
  if (input.scenario === "finance-review" && context.finance.paymentCount === 0) limitations.push("Финансовый анализ ограничен: платежи по проекту не найдены.");
  if (input.scenario === "daily-report-summary" && context.dailyReports.length === 0) limitations.push("Рапорты по проекту не найдены: сводка ограничена графиком и рисками.");
  if (input.scenario === "document-review" && context.documents.length === 0) limitations.push("Документы по проекту не найдены.");
  if (input.scenario === "contract-review") limitations.push("Проверка договора ограничена метаданными документов и проектными данными: OCR/полный текст договора не передается автоматически.");
  if (input.scenario === "budget-review" && context.budget.itemCount === 0) limitations.push("ВОР/бюджет по проекту пустой.");
  if (input.scenario === "workforce-review" && context.workforce.demandCount === 0) limitations.push("Потребность ФОТ не сформирована: вывод ограничен назначениями и рапортами.");
  if (input.scenario === "field-review" && context.field.reportCount === 0) limitations.push("Полевые рапорты отсутствуют: факт выполнения и фото не подтверждены.");
  if (input.scenario === "quality-review" && context.quality.inspectionCount + context.quality.openIssueCount === 0) limitations.push("Контур качества пуст: отсутствие записей не считается подтверждением качества.");
  if (input.scenario === "rfi-review" && context.collaboration.openRfis + context.collaboration.openSubmittals === 0) limitations.push("RFI и согласования не зарегистрированы: отсутствие записей не подтверждает отсутствие вопросов.");
  if (input.scenario === "claims-review" && context.commercial.changeOrderCount === 0) limitations.push("Изменения/претензии не зарегистрированы: договорные основания по текстам документов не анализировались.");
  if (input.scenario === "acceptance-review" && context.acceptance.applicationCount === 0) limitations.push("Платежные приложения/КС не зарегистрированы.");
  if (input.scenario === "closeout-review" && context.closeout.packageCount === 0) limitations.push("Пакеты сдачи не созданы: отсутствие записей не означает готовность к закрытию.");
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
    title: aiScenarioById[input.scenario].title,
    scenario: input.scenario,
    overallStatus: statusForScenario(input, context, findings),
    summary,
    findings: rankFindings(findings).slice(0, MAX_FINDINGS),
    recommendedActions: recommendedActions.slice(0, MAX_ACTIONS),
    ...options,
    dataUsed: aiScenarioById[input.scenario].dataKeys,
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

function collectOnboardingFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (!context.project.customer?.trim()) findings.push(finding("high", "Не указан заказчик", "Карточка проекта не содержит заказчика.", "project", "Заполнить заказчика до договорных и платежных решений."));
  if (!context.project.contractAmount || context.project.contractAmount <= 0) findings.push(finding("critical", "Не задана сумма договора", "Экономика и маржа проекта не могут быть рассчитаны.", "project", "Указать подтвержденную договорную сумму и режим НДС."));
  if (!context.project.startsAt || !context.project.endsAt) findings.push(finding("high", "Не задан период проекта", "Нет полной пары дат начала и окончания.", "project", "Подтвердить календарные границы проекта."));
  if (!context.budget.itemCount) findings.push(finding("critical", "ВОР не загружена", "Нет объемов и расценок для планирования проекта.", "budget", "Импортировать и проверить ВОР/смету."));
  if (!context.schedule.itemCount) findings.push(finding("critical", "График не сформирован", "Нет производственной последовательности и контрольных дат.", "schedule", "Сформировать базовый график и назначить ответственных."));
  if (!context.documents.length) findings.push(finding("high", "Стартовые документы не загружены", "Договор, ТЗ и исходные документы отсутствуют в реестре.", "documents", "Загрузить стартовый пакет и проверить категории."));
  if (!context.workforce.demandCount) findings.push(finding("medium", "Ресурсная потребность не рассчитана", "ФОТ и потребность в людях не связаны с графиком.", "workforce", "Сформировать трудовую потребность по видам работ."));
  return findings;
}

function collectWorkforceFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  const gap = Math.max(0, Math.ceil(context.workforce.peakHeadcount - context.workforce.assignedHeadcount));
  if (gap > 0) findings.push(finding("high", "Дефицит рабочей силы", `Пиковая потребность ${Math.ceil(context.workforce.peakHeadcount)} чел., назначено ${context.workforce.assignedHeadcount}; дефицит ${gap} чел.`, "workforce", "Уточнить календарную потребность и назначить ресурсы до начала фронта."));
  if (context.workforce.missingProductivityNorms) findings.push(finding("medium", "Не заполнены нормы выработки", `${context.workforce.missingProductivityNorms} позиций потребности не имеют нормы выработки.`, "workforce", "Подтвердить нормы ПТО до расчета численности."));
  if (context.workforce.missingSalaryRates) findings.push(finding("medium", "Не заполнены ставки ФОТ", `${context.workforce.missingSalaryRates} позиций не имеют месячной ставки.`, "workforce", "Заполнить зарплату и налоговую нагрузку для прогноза себестоимости."));
  if (context.workforce.pendingAdmissions) findings.push(finding("high", "Есть неподтвержденные допуски", `${context.workforce.pendingAdmissions} заявок на допуск ожидают решения.`, "workforce", "Проверить документы и подтвердить допуск до выхода на площадку."));
  return findings;
}

function collectFieldFindings(context: AiProjectContext) {
  const findings = collectDailyReportFindings(context);
  if (!context.field.reportCount) findings.push(finding("high", "Нет подтвержденного факта площадки", "Рапорты и фото отсутствуют, поэтому прогресс нельзя считать подтвержденным.", "dailyReports", "Открыть смену, зафиксировать объемы и приложить фото."));
  if (context.field.drafts) findings.push(finding("medium", "Есть незакрытые смены", `${context.field.drafts} рапортов остаются в черновике или открытой фазе.`, "dailyReports", "Завершить факт, проверить фото и отправить рапорт на согласование."));
  if (context.field.reportsWithoutPhotos) findings.push(finding("medium", "Факт без фотоподтверждения", `${context.field.reportsWithoutPhotos} рапортов не имеют прикрепленных фото.`, "dailyReports", "Приложить фото к соответствующему рапорту до утверждения факта."));
  if (context.field.reportsWithoutProgress) findings.push(finding("high", "Рапорт не применен к графику", `${context.field.reportsWithoutProgress} рапортов не имеют примененной записи прогресса.`, "schedule", "Проверить объемы и связь работ рапорта с текущей версией графика."));
  return findings;
}

function collectQualityFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (context.quality.acceptanceBlockers) findings.push(finding("critical", "Есть блокеры приемки", `${context.quality.acceptanceBlockers} замечаний блокируют приемку/КС.`, "quality", "Закрыть корректирующие действия и приложить подтверждение устранения."));
  if (context.quality.criticalOrHighIssues) findings.push(finding("high", "Критичные замечания качества", `${context.quality.criticalOrHighIssues} открытых замечаний имеют высокий или критичный уровень.`, "quality", "Назначить владельцев и срок устранения."));
  if (context.quality.overdueIssues) findings.push(finding("high", "Просрочены замечания качества", `${context.quality.overdueIssues} замечаний просрочены.`, "quality", "Эскалировать просроченные замечания и обновить план закрытия."));
  if (context.quality.inspectionsDue) findings.push(finding("medium", "Просрочены инспекции", `${context.quality.inspectionsDue} проверок не закрыты к плановой дате.`, "quality", "Провести проверку или документировать перенос."));
  if (context.quality.missingOwners) findings.push(finding("medium", "Замечания без ответственного", `${context.quality.missingOwners} замечаний не имеют владельца.`, "quality", "Назначить ответственную сторону."));
  if (context.quality.missingCorrectiveActions) findings.push(finding("medium", "Нет корректирующих мер", `${context.quality.missingCorrectiveActions} замечаний не содержат плана устранения.`, "quality", "Зафиксировать проверяемую корректирующую меру."));
  for (const issue of context.quality.topIssues.slice(0, 3)) findings.push(finding(issue.acceptanceBlocker ? "critical" : issue.severity === "high" ? "high" : "medium", issue.title, `Статус ${issue.status}; ответственный ${issue.responsibleParty || "не назначен"}; срок ${issue.dueAt || "не задан"}.`, "quality", "Открыть карточку замечания и подтвердить evidence закрытия."));
  return findings;
}

function collectRfiFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (context.collaboration.overdueRfis) findings.push(finding("high", "Просрочены RFI", `${context.collaboration.overdueRfis} запросов превысили срок ответа.`, "rfi", "Эскалировать вопросы, влияющие на ближайшие работы."));
  if (context.collaboration.unansweredRfis) findings.push(finding("medium", "RFI без ответа", `${context.collaboration.unansweredRfis} открытых запросов не имеют ответа.`, "rfi", "Назначить ответственного и дату ответа."));
  if (context.collaboration.overdueSubmittals) findings.push(finding("high", "Просрочены согласования", `${context.collaboration.overdueSubmittals} материалов/документов не согласованы в срок.`, "submittals", "Проверить влияние на закупку и график."));
  return findings;
}

function collectClaimsFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (context.commercial.unpricedChangeOrders) findings.push(finding("high", "Изменения без оценки", `${context.commercial.unpricedChangeOrders} изменений не имеют денежной оценки.`, "commercial", "Оценить объем, цену и договорное основание до выполнения."));
  if (context.commercial.pendingChangeOrders) findings.push(finding("medium", "Изменения ожидают решения", `${context.commercial.pendingChangeOrders} изменений находятся в незавершенном статусе; экспозиция ${money(context.commercial.changeOrderExposure)}.`, "commercial", "Проверить сроки уведомления и пакет подтверждения."));
  if (context.commercial.scheduleImpactDays > 0) findings.push(finding("high", "Изменения влияют на срок", `Совокупное заявленное влияние: ${context.commercial.scheduleImpactDays} дн.`, "commercial", "Связать изменение с графиком и направить уведомление в договорный срок."));
  if (context.commercial.unmatchedInvoices) findings.push(finding("medium", "Счета не сопоставлены", `${context.commercial.unmatchedInvoices} счетов не связаны с обязательством/КС/платежом.`, "finance", "Провести трехстороннюю сверку и назначить код затрат."));
  return findings;
}

function collectAcceptanceFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (context.quality.acceptanceBlockers) findings.push(finding("critical", "КС блокируют замечания", `${context.quality.acceptanceBlockers} замечаний качества помечены как блокеры приемки.`, "quality", "Закрыть замечания и приложить подтверждающие документы."));
  if (!context.acceptance.applicationCount && context.schedule.completionPercent > 0) findings.push(finding("high", "Факт есть, КС не подготовлена", `Готовность графика ${percent(context.schedule.completionPercent)}, платежные приложения отсутствуют.`, "acceptance", "Сопоставить подтвержденные объемы с договорными расценками и собрать пакет КС."));
  if (context.acceptance.draftApplications) findings.push(finding("medium", "КС остается в черновике", `${context.acceptance.draftApplications} платежных приложений не отправлены на согласование.`, "acceptance", "Проверить объемы, удержания и документы перед отправкой."));
  if (context.acceptance.submittedApplications) findings.push(finding("medium", "КС ожидает решения", `${context.acceptance.submittedApplications} приложений находятся на согласовании.`, "acceptance", "Проверить срок ответа и замечания заказчика."));
  return findings;
}

function collectCloseoutFindings(context: AiProjectContext) {
  const findings: AiFinding[] = [];
  if (!context.closeout.packageCount) findings.push(finding("high", "Пакет сдачи не сформирован", "В проекте нет пакетов закрытия.", "closeout", "Создать пакет сдачи и обязательный чек-лист документов."));
  if (context.closeout.overduePackages) findings.push(finding("high", "Просрочены пакеты сдачи", `${context.closeout.overduePackages} пакетов не закрыты в срок.`, "closeout", "Назначить владельца и обновить дату передачи."));
  if (context.closeout.incompleteChecklistItems) findings.push(finding("high", "Чек-лист сдачи неполный", `${context.closeout.incompleteChecklistItems} обязательных пунктов не завершены.`, "closeout", "Закрыть обязательные документы и подтверждения."));
  if (context.closeout.warrantiesMissingDates) findings.push(finding("medium", "Гарантия без дат", `${context.closeout.warrantiesMissingDates} гарантийных обязательств не имеют полного периода.`, "closeout", "Указать начало, окончание и срок уведомления."));
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
  if (input.scenario === "onboarding-review") return collectOnboardingFindings(context);
  if (input.scenario === "workforce-review") return collectWorkforceFindings(context);
  if (input.scenario === "field-review") return collectFieldFindings(context);
  if (input.scenario === "quality-review") return collectQualityFindings(context);
  if (input.scenario === "rfi-review") return collectRfiFindings(context);
  if (input.scenario === "claims-review") return collectClaimsFindings(context);
  if (input.scenario === "acceptance-review") return collectAcceptanceFindings(context);
  if (input.scenario === "closeout-review") return collectCloseoutFindings(context);
  return [
    ...collectBudgetFindings(context),
    ...collectScheduleFindings(context),
    ...collectProcurementFindings(context),
    ...collectFinanceFindings(context),
    ...collectRiskFindings(context),
    ...collectWorkforceFindings(context),
    ...collectFieldFindings(context),
    ...collectQualityFindings(context),
    ...collectClaimsFindings(context),
    ...collectAcceptanceFindings(context)
  ];
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
  if (input.scenario === "onboarding-review") actions.push(action("high", "Закрыть стартовые пробелы", "Подтвердить карточку, договор, ВОР, график, документы и ресурсную базу до запуска проекта."));
  if (input.scenario === "workforce-review") actions.push(action("high", "Сверить бригады с графиком", "Закрыть дефицит людей, норм, ставок и допусков по ближайшим фронтам."));
  if (input.scenario === "field-review") actions.push(action("high", "Подтвердить факт смены", "Закрыть рапорт, приложить фото и применить проверенные объемы к актуальному графику."));
  if (input.scenario === "quality-review") actions.push(action("high", "Закрыть блокеры качества", "Приоритизировать приемочные блокеры, назначить владельцев и evidence устранения."));
  if (input.scenario === "rfi-review") actions.push(action("high", "Эскалировать просроченные согласования", "Связать RFI/submittals с ближайшими работами и подтвердить срок ответа."));
  if (input.scenario === "claims-review") actions.push(action("high", "Собрать evidence по изменениям", "Подтвердить основание, объем, стоимость, влияние на срок и дату уведомления."));
  if (input.scenario === "acceptance-review") actions.push(action("high", "Подготовить пакет КС", "Сопоставить утвержденный факт, расценки, качество и комплект подтверждающих документов."));
  if (input.scenario === "closeout-review") actions.push(action("high", "Собрать план сдачи", "Закрыть обязательный чек-лист, пакеты передачи и гарантийные даты."));
  actions.push(action("medium", "Подготовить управленческую сводку", "Собрать короткий отчет: сроки, деньги, снабжение, риски, решения."));
  return Array.from(new Map(actions.map((item) => [`${item.priority}:${item.title}`, item])).values()).slice(0, MAX_ACTIONS);
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
  if (input.scenario === "onboarding-review") return `Старт проекта: ВОР ${context.budget.itemCount} поз., график ${context.schedule.itemCount} работ, документов ${context.documents.length}, ресурсных потребностей ${context.workforce.demandCount}.`;
  if (input.scenario === "workforce-review") return `Ресурсный план: потребность ${Math.ceil(context.workforce.peakHeadcount)} чел. и ${Math.round(context.workforce.plannedHours)} ч; назначено ${context.workforce.assignedHeadcount} чел.; допуски в ожидании ${context.workforce.pendingAdmissions}.`;
  if (input.scenario === "field-review") return `Площадка: ${context.field.reportCount} рапортов, открытых/черновых ${context.field.drafts}, без фото ${context.field.reportsWithoutPhotos}, без примененного прогресса ${context.field.reportsWithoutProgress}.`;
  if (input.scenario === "quality-review") return `Качество: ${context.quality.inspectionCount} проверок, ${context.quality.openIssueCount} открытых замечаний, блокеров приемки ${context.quality.acceptanceBlockers}.`;
  if (input.scenario === "rfi-review") return `Согласования: открытых RFI ${context.collaboration.openRfis}, просроченных ${context.collaboration.overdueRfis}; открытых submittals ${context.collaboration.openSubmittals}.`;
  if (input.scenario === "claims-review") return `Изменения: ${context.commercial.changeOrderCount}, ожидают решения ${context.commercial.pendingChangeOrders}, текущая экспозиция ${money(context.commercial.changeOrderExposure)}.`;
  if (input.scenario === "acceptance-review") return `Приемка и оплата: ${context.acceptance.applicationCount} платежных приложений на ${money(context.acceptance.netAmount)}, блокеров качества ${context.quality.acceptanceBlockers}.`;
  if (input.scenario === "closeout-review") return `Сдача: ${context.closeout.packageCount} пакетов, открытых ${context.closeout.openPackages}, обязательных незакрытых пунктов ${context.closeout.incompleteChecklistItems}.`;
  if (statusForScenario(input, context, findings) === "unknown") {
    return "Недостаточно проверяемых данных для вывода. Заполните указанные в ограничениях источники и повторите анализ.";
  }
  const ranked = rankFindings(findings);
  const signalWord = findings.length % 10 === 1 && findings.length % 100 !== 11
    ? "сигнал"
    : [2, 3, 4].includes(findings.length % 10) && ![12, 13, 14].includes(findings.length % 100)
      ? "сигнала"
      : "сигналов";
  return findings.length > 0
    ? `Найдено ${findings.length} управленческих ${signalWord}. Фокус: ${ranked.slice(0, 3).map((item) => item.title).join(", ")}.${findings.length > MAX_FINDINGS ? ` Показано ${MAX_FINDINGS} приоритетных сигналов.` : ""}`
    : "Критичных отклонений по доступным данным не найдено. Продолжайте контроль сроков, ВОР и снабжения.";
}

function buildDraftText(input: AiRunInput, context: AiProjectContext, findings: AiFinding[]) {
  const subject = `${input.topic || aiScenarioById[input.scenario].title} — ${context.project.name}`;
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
  if (input.scenario === "claims-review") return { recommendedAttachments: ["Договор и условия уведомления", "Рапорты/переписка", "Актуальный график", "Расчет стоимости изменения"] };
  if (input.scenario === "acceptance-review") return { recommendedAttachments: ["Подтвержденный факт", "Исполнительная документация", "Акты качества", "Расчет КС"] };
  if (input.scenario === "closeout-review") return { recommendedAttachments: ["Исполнительный комплект", "Акты приемки", "Паспорта и сертификаты", "Гарантийные обязательства"] };
  return {};
}

function deterministicInsight(input: AiRunInput, context: AiProjectContext, provider: AiInsightResponse["provider"] = "deterministic", extraLimitations: string[] = []): AiInsightResponse {
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

function safeText(value: unknown, max: number) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function sanitizedProviderFindings(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AiFinding[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const severity = ["low", "medium", "high", "critical"].includes(String(record.severity)) ? record.severity as AiSeverity : "medium";
    const title = safeText(record.title, 180);
    const description = safeText(record.description, 1200);
    if (!title || !description) return [];
    const source = safeText(record.source, 120);
    const recommendation = safeText(record.recommendation, 1000);
    return [{ severity, title, description, ...(source ? { source } : {}), ...(recommendation ? { recommendation } : {}) }];
  }).slice(0, MAX_FINDINGS);
}

function sanitizedProviderActions(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): AiRecommendedAction[] => {
    if (!item || typeof item !== "object") return [];
    const record = item as Record<string, unknown>;
    const priority = ["low", "medium", "high"].includes(String(record.priority)) ? record.priority as AiActionPriority : "medium";
    const title = safeText(record.title, 180);
    const description = safeText(record.description, 1000);
    return title && description ? [{ priority, title, description }] : [];
  }).slice(0, MAX_ACTIONS);
}

function sanitizedStringArray(value: unknown, maxItems: number, maxLength: number) {
  if (!Array.isArray(value)) return [];
  return value.map((item) => safeText(item, maxLength)).filter(Boolean).slice(0, maxItems);
}

function uniqueByTitle<T extends { title: string }>(primary: T[], secondary: T[], max: number) {
  const result: T[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const key = item.title.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
    if (result.length >= max) break;
  }
  return result;
}

function uniqueFindings(primary: AiFinding[], secondary: AiFinding[], max: number) {
  const result: AiFinding[] = [];
  const seen = new Set<string>();
  for (const item of [...primary, ...secondary]) {
    const key = `${item.title}:${item.description}:${item.source ?? ""}`.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(item);
  }
  return rankFindings(result).slice(0, max);
}

function mergeProviderInsight(input: AiRunInput, context: AiProjectContext, deterministic: AiInsightResponse, payload: ProviderPayload) {
  const findings = uniqueFindings(deterministic.findings, sanitizedProviderFindings(payload.findings), MAX_FINDINGS);
  const recommendedActions = uniqueByTitle(deterministic.recommendedActions, sanitizedProviderActions(payload.recommendedActions), MAX_ACTIONS);
  const providerSummary = safeText(payload.summary, 1800);
  const summary = providerSummary && deterministic.overallStatus === "on_track"
    ? providerSummary
    : providerSummary
      ? `${deterministic.summary} AI-комментарий: ${providerSummary}`.slice(0, 1800)
      : deterministic.summary;
  const providerLimitations = sanitizedStringArray(payload.dataLimitations, 8, 600);
  const recommendedAttachments = uniqueStrings(
    deterministic.recommendedAttachments ?? [],
    sanitizedStringArray(payload.recommendedAttachments, 8, 180),
    8
  );
  return aiInsightResponseSchema.parse({
    ...deterministic,
    title: deterministic.title,
    scenario: input.scenario,
    overallStatus: statusForScenario(input, context, findings),
    summary,
    findings,
    recommendedActions,
    subject: safeText(payload.subject, 180) || deterministic.subject,
    draftText: safeText(payload.draftText, 6000) || deterministic.draftText,
    recommendedAttachments,
    dataUsed: deterministic.dataUsed,
    dataLimitations: Array.from(new Set([...deterministic.dataLimitations.filter((item) => !item.includes("AI provider key")), ...providerLimitations])).slice(0, 16),
    generatedAt: new Date().toISOString(),
    provider: "openai"
  });
}

function uniqueStrings(primary: string[], secondary: string[], max: number) {
  return Array.from(new Set([...primary, ...secondary].map((item) => item.trim()).filter(Boolean))).slice(0, max);
}

function compactProviderValue(value: unknown, depth = 0): unknown {
  if (depth > 6) return "[TRUNCATED]";
  if (typeof value === "string") return value.slice(0, 900);
  if (Array.isArray(value)) return value.slice(0, depth < 2 ? 6 : 4).map((item) => compactProviderValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, compactProviderValue(item, depth + 1)]));
  }
  return value;
}

function scenarioProviderContext(input: AiRunInput, context: AiProjectContext) {
  const dataKeys = aiScenarioById[input.scenario].dataKeys;
  const selected = Object.fromEntries(dataKeys.flatMap((key) => key in context ? [[key, context[key as keyof AiProjectContext]]] : []));
  const payload = { ...selected, dataLimitations: context.dataLimitations };
  const serialized = JSON.stringify(payload);
  return serialized.length <= MAX_PROVIDER_CONTEXT_CHARS ? payload : compactProviderValue(payload);
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof record.output_text === "string") return record.output_text;
  return (record.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

async function requestStructuredProvider(input: AiRunInput, context: AiProjectContext) {
  const runtime = getOpenAiRuntimeConfig();
  if (!runtime.enabled || !runtime.apiKey) return null;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PROVIDER_TIMEOUT_MS);
  try {
    const response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${runtime.apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        store: false,
        temperature: 0.2,
        text: {
          format: {
            type: "json_schema",
            name: "pgs_project_lifecycle_insight",
            strict: true,
            schema: providerInsightJsonSchema
          }
        },
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: "Ты - Project Lifecycle Copilot строительного проекта. Анализируй только предоставленный контекст PGS. Не выдумывай людей, документы, цены, оплаты, даты или выполненные объемы. Детерминированные расчеты PGS являются источником истины. Добавляй объяснение и приоритеты, но не объявляй безопасность, качество, приемку или оплату подтвержденными без evidence. Не изменяй данные и не обещай выполненных действий."
            }]
          },
          {
            role: "user",
            content: [{
              type: "input_text",
              text: JSON.stringify({
                scenario: input.scenario,
                objective: aiScenarioById[input.scenario].outcome,
                instructions: safeText(input.instructions, 1200),
                topic: safeText(input.topic, 240),
                context: scenarioProviderContext(input, context)
              })
            }]
          }
        ]
      })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error("OpenAI provider returned a non-success status");
    return parseProviderJson(responseText(payload));
  } finally {
    clearTimeout(timeout);
  }
}

export async function runAiScenario(input: AiRunInput): Promise<AiInsightResponse> {
  const context = await buildAiProjectContext(input.projectId);
  const runtime = getOpenAiRuntimeConfig();
  const deterministic = deterministicInsight(input, context, runtime.enabled ? "degraded" : "deterministic");
  if (!runtime.enabled) return deterministicInsight(input, context, "deterministic");

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
