import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { buildDocumentComplianceIntelligence } from "@/lib/document-compliance-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import { buildRiskExecutiveIntelligence, type RiskExecutiveImportHistoryItem } from "@/lib/risk-executive-intelligence";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type CommandTone = "good" | "warn" | "bad" | "info" | "neutral";

export type CommandCenterAiInsight = {
  title?: string;
  subject?: string;
  summary?: string;
  findings?: Array<{ title: string; description?: string; severity?: string }>;
  recommendedActions?: Array<{ title: string; description?: string; priority?: string }>;
  dataUsed?: string[];
  dataLimitations?: string[];
  provider?: "deterministic" | "openai" | "degraded";
};

export type ProjectCommandCenterInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  dailyReports?: DailyReport[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  readiness?: PipelineReadiness | null;
  documentChecklist?: DocumentChecklistItem[] | null;
  importHistory?: RiskExecutiveImportHistoryItem[] | null;
  intelligence?: {
    completenessScore: number;
    summary: string;
    topRisks: PipelineAction[];
    nextActions: PipelineAction[];
    missingData: string[];
  } | null;
  aiInsight?: CommandCenterAiInsight | null;
};

export type ProjectCommandCenterModel = {
  project: {
    id: string;
    name: string;
    customer: string;
    object: string;
    address: string;
    manager: string;
    status: string;
    startsAt: string;
    endsAt: string;
  };
  health: {
    score: number;
    tone: CommandTone;
    label: string;
    summary: string;
  };
  kpis: Array<{
    key: string;
    label: string;
    value: string;
    tone: CommandTone;
    hint: string;
  }>;
  aiSummary: {
    title: string;
    subject: string;
    bullets: string[];
    recommendedActions: string[];
    recommendedApps: string[];
    provider: string;
    degraded: boolean;
    empty: boolean;
  };
  progress: Array<{
    key: string;
    label: string;
    value: number;
    tone: CommandTone;
    detail: string;
  }>;
  statusBoard: Array<{
    key: string;
    label: string;
    value: string;
    tone: CommandTone;
    detail: string;
    tab: string;
  }>;
  nextActions: Array<{
    key: string;
    title: string;
    detail: string;
    tone: CommandTone;
    tab: string;
  }>;
};

function compactMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safeValue);
  if (absolute >= 1_000_000_000) return `${(safeValue / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(safeValue / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safeValue).toLocaleString("ru-RU")} ₽`;
}

function percent(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  return `${Math.round(safeValue * 10) / 10}%`;
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function toneFromScore(score: number): CommandTone {
  if (score >= 75) return "good";
  if (score >= 45) return "warn";
  return "bad";
}

function dateOrDash(value: string | undefined) {
  if (!value) return "не задано";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function splitSummary(summary: string | undefined) {
  const source = summary?.trim();
  if (!source) return [];
  return source
    .split(/\n+|(?<=\.)\s+/)
    .map((item) => item.replace(/^[-•\d.]+\s*/, "").trim())
    .filter(Boolean)
    .slice(0, 5);
}

function defaultAction(title: string, detail: string, tone: CommandTone, tab: string) {
  return { key: `${tab}:${title}`, title, detail, tone, tab };
}

export function buildProjectCommandCenterModel(input: ProjectCommandCenterInput): ProjectCommandCenterModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const payments = input.payments ?? [];
  const reports = input.dailyReports ?? [];
  const risks = input.risks ?? [];
  const documents = input.documents ?? [];
  const contractAmount = project.contractAmount ?? 0;

  const budget = budgetTotals(contractAmount, budgetItems);
  const works = workTotals(scheduleItems);
  const materialStats = materialTotals(materials);
  const finance = financeTotals(payments);
  const allRisks = [...risks, ...deriveAutoRisks(scheduleItems, materials, payments)];
  const activeRisks = allRisks.filter((risk) => risk.status !== "closed");
  const delayedWorks = scheduleItems.filter((item) => item.status === "delayed");
  const activeRequests = procurementRequests.filter((request) => !["closed", "rejected"].includes(request.status));
  const budgetDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const readinessScore = input.readiness?.score ?? input.intelligence?.completenessScore ?? 0;
  const documentItems = input.documentChecklist ?? [];
  const presentDocuments = documentItems.filter((item) => item.status === "present").length;
  const documentScore = documentItems.length ? (presentDocuments / documentItems.length) * 100 : 0;
  const documentCompliance = buildDocumentComplianceIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist: documentItems,
    importHistory: input.importHistory ?? []
  });
  const scheduleScore = works.completionPercent;
  const materialScore = materials.length ? ((materials.length - materialStats.deficitItems.length) / materials.length) * 100 : 0;
  const financeScore = finance.cashGap < 0 || finance.financingNeed > 0 ? 35 : 80;
  const riskScore = activeRisks.length ? Math.max(15, 100 - activeRisks.length * 12) : 92;
  const riskExecutive = buildRiskExecutiveIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    dailyReports: reports,
    risks,
    documents,
    readiness: input.readiness,
    documentChecklist: documentItems,
    intelligence: input.intelligence,
    importHistory: input.importHistory ?? []
  });
  const healthScore = clampPercent((scheduleScore + materialScore + financeScore + riskScore + readinessScore) / 5);
  const healthTone = toneFromScore(healthScore);
  const aiInsight = input.aiInsight ?? null;
  const aiBullets = [
    ...splitSummary(aiInsight?.summary),
    ...(aiInsight?.findings ?? []).map((item) => `${item.title}${item.description ? `: ${item.description}` : ""}`)
  ].slice(0, 5);
  const fallbackBullets = [
    delayedWorks[0] ? `Просрочка: ${delayedWorks[0].name}` : "График без критичных просрочек в текущем срезе.",
    materialStats.deficitItems[0] ? `Дефицит материала: ${materialStats.deficitItems[0].name}.` : "Критичный дефицит материалов не выявлен.",
    activeRisks[0] ? `Риск: ${activeRisks[0].title}.` : "Риски требуют регулярного обновления после планерки.",
    budgetDeviation > 0 ? `Прогнозный перерасход: ${compactMoney(budgetDeviation)}.` : "Бюджетный прогноз в допустимом коридоре."
  ];
  const recommendedActions = (aiInsight?.recommendedActions ?? []).map((item) => item.title).slice(0, 5);
  const fallbackActions = [
    budgetDeviation > 0 ? "Разобрать статьи перерасхода" : "Проверить бюджетный резерв",
    delayedWorks[0] ? "Вернуть просроченную работу в график" : "Подтвердить ближайшие контрольные точки",
    materialStats.deficitItems[0] ? "Сформировать заявку снабжения" : "Сверить потребность материалов",
    activeRisks[0] ? "Назначить владельца риска" : "Обновить реестр рисков"
  ];

  const nextActions = [
    budgetDeviation > 0
      ? defaultAction("Разобрать перерасход", `Прогноз выше плана на ${compactMoney(budgetDeviation)}.`, "bad", "Бюджет / ВОР")
      : defaultAction("Сверить бюджетный резерв", `Прогнозная прибыль ${compactMoney(budget.forecastProfit)}.`, "good", "Бюджет / ВОР"),
    delayedWorks[0]
      ? defaultAction("Вернуть работу в график", delayedWorks[0].name, "bad", "График")
      : defaultAction("Проверить ближайший этап", scheduleItems[0]?.name ?? "График пока пустой.", "info", "График"),
    materialStats.deficitItems[0]
      ? defaultAction("Закрыть дефицит материала", materialStats.deficitItems[0].name, "warn", "Материалы")
      : defaultAction("Проверить снабжение", "Дефицитные материалы не найдены.", "good", "Материалы"),
    activeRequests[0]
      ? defaultAction("Проверить заявку снабжения", activeRequests[0].title, "warn", "Заявки")
      : defaultAction("Подготовить заявку", "Создать заявку при появлении дефицита.", "info", "Заявки"),
    documentCompliance.summary.blockingKsOrReport
      ? defaultAction("Закрыть документы КС", `${documentCompliance.summary.blockingKsOrReport} блокеров для КС/report package.`, "warn", "Документы")
      : defaultAction("Проверить исполнительный пакет", `Compliance: ${documentCompliance.summary.readiness}.`, "info", "Документы"),
    defaultAction("Проверить решения руководства", riskExecutive.decisions[0]?.title ?? "Decision register готов к проверке.", riskExecutive.decisions.length ? "warn" : "info", "Риски"),
    defaultAction("Сформировать AI-сводку", "Запустить existing AI scenario по клику.", "info", "AI-помощник")
  ];

  return {
    project: {
      id: project.id ?? "project",
      name: project.name ?? "Проект без названия",
      customer: project.customer ?? "Заказчик не указан",
      object: project.object ?? "Объект не указан",
      address: project.address ?? "Адрес не указан",
      manager: project.manager ?? "РП не назначен",
      status: project.status ?? "planning",
      startsAt: dateOrDash(project.startsAt),
      endsAt: dateOrDash(project.endsAt)
    },
    health: {
      score: healthScore,
      tone: healthTone,
      label: healthTone === "good" ? "Управляемо" : healthTone === "warn" ? "Требует внимания" : "Критично",
      summary:
        input.intelligence?.summary ??
        input.readiness?.summary ??
        `Командный срез собран по бюджету, срокам, снабжению, финансам и рискам. Готовность данных: ${readinessScore}%.`
    },
    kpis: [
      { key: "readiness", label: "Готовность данных", value: `${readinessScore}%`, tone: toneFromScore(readinessScore), hint: input.readiness?.status ?? "pipeline" },
      { key: "budget", label: "Бюджетный сигнал", value: compactMoney(budgetDeviation), tone: budgetDeviation > 0 ? "bad" : "good", hint: `Прогноз: ${compactMoney(budget.totalForecastCost)}` },
      { key: "schedule", label: "План / факт", value: percent(works.completionPercent), tone: delayedWorks.length ? "bad" : "info", hint: delayedWorks.length ? `${delayedWorks.length} просроч.` : "Без критичных просрочек" },
      { key: "risks", label: "Открытые риски", value: String(activeRisks.length), tone: activeRisks.length ? "warn" : "good", hint: activeRisks[0]?.title ?? "Нет открытых рисков" },
      { key: "decisions", label: "Решения", value: String(riskExecutive.summary.decisionRequired), tone: riskExecutive.summary.decisionRequired ? "warn" : "good", hint: `Report ${riskExecutive.executiveReport.reportReadiness}` },
      { key: "materials", label: "Снабжение", value: String(materialStats.deficitItems.length), tone: materialStats.deficitItems.length ? "bad" : "good", hint: materialStats.deficitItems[0]?.name ?? "Дефицит не найден" },
      { key: "cash", label: "Cash gap", value: compactMoney(finance.cashGap), tone: finance.cashGap < 0 ? "bad" : "good", hint: `Потребность: ${compactMoney(finance.financingNeed)}` }
    ],
    aiSummary: {
      title: aiInsight?.title ?? "AI executive summary",
      subject: aiInsight?.subject ?? "Что требует внимания по объекту",
      bullets: aiBullets.length ? aiBullets : fallbackBullets,
      recommendedActions: recommendedActions.length ? recommendedActions : fallbackActions,
      recommendedApps: ["ВОР", "График", "Снабжение", "Финансы", "Риски"].filter((item) => item !== "Снабжение" || materials.length),
      provider: aiInsight?.provider ?? "deterministic-preview",
      degraded: aiInsight?.provider === "degraded" || !aiInsight,
      empty: !aiInsight
    },
    progress: [
      { key: "readiness", label: "Pipeline readiness", value: clampPercent(readinessScore), tone: toneFromScore(readinessScore), detail: input.readiness?.summary ?? "Pipeline data loading or unavailable." },
      { key: "documents", label: "Документы", value: clampPercent(documentScore), tone: documentCompliance.summary.readiness === "ready" ? "good" : documentCompliance.summary.readiness === "missing_critical" ? "bad" : documentCompliance.summary.totalRequired ? "warn" : "info", detail: documentCompliance.summary.totalRequired ? `${documentCompliance.summary.missing}/${documentCompliance.summary.totalRequired} missing · КС ${documentCompliance.ksReadiness.readyForKs}` : "Checklist еще не загружен." },
      { key: "schedule", label: "График", value: clampPercent(scheduleScore), tone: delayedWorks.length ? "bad" : "info", detail: delayedWorks.length ? `${delayedWorks.length} работ просрочено` : "План-факт без критичного сигнала." },
      { key: "materials", label: "Материалы", value: clampPercent(materialScore), tone: materialStats.deficitItems.length ? "bad" : "good", detail: materialStats.deficitItems.length ? `${materialStats.deficitItems.length} дефицитных позиций` : "Материалы в норме." },
      { key: "finance", label: "Финансы", value: clampPercent(financeScore), tone: financeScore < 50 ? "bad" : "good", detail: finance.cashGap < 0 ? `Разрыв ${compactMoney(finance.cashGap)}` : "Cashflow без отрицательного сигнала." }
    ],
    statusBoard: [
      { key: "data", label: "Данные проекта", value: input.readiness?.status ?? "loading", tone: toneFromScore(readinessScore), detail: input.readiness?.summary ?? "Нет подтвержденного pipeline snapshot.", tab: "Аналитика" },
      { key: "documents", label: "Документы", value: documentCompliance.summary.readiness, tone: documentCompliance.summary.readiness === "ready" ? "good" : documentCompliance.summary.readiness === "missing_critical" ? "bad" : "warn", detail: documentCompliance.missingDocuments[0]?.suggestedAction ?? documentItems.find((item) => item.status !== "present")?.suggestedNextStep ?? "Проверить КС-ready и executive package.", tab: "Документы" },
      { key: "actions", label: "Следующие шаги", value: String(input.intelligence?.nextActions.length ?? 0), tone: input.intelligence?.nextActions.length ? "warn" : "info", detail: input.intelligence?.nextActions[0]?.title ?? "Действия появятся после загрузки pipeline.", tab: "Аналитика" },
      { key: "executive", label: "Executive report", value: riskExecutive.executiveReport.reportReadiness, tone: riskExecutive.executiveReport.status === "red" ? "bad" : riskExecutive.executiveReport.status === "amber" ? "warn" : riskExecutive.executiveReport.status === "green" ? "good" : "info", detail: riskExecutive.managementSummary.nextManagementAction, tab: "Рапорты" },
      { key: "ai", label: "AI Command Layer", value: aiInsight ? aiInsight.provider ?? "ready" : "по запросу", tone: aiInsight?.provider === "degraded" ? "warn" : "info", detail: aiInsight ? "Есть последний результат сценария." : "Live AI не вызывается автоматически.", tab: "AI-помощник" }
    ],
    nextActions
  };
}
