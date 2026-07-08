import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { buildAcceptanceBillingIntelligence } from "@/lib/acceptance-billing-intelligence";
import { buildContractTenderIntelligence } from "@/lib/contract-tender-intelligence";
import { buildDocumentComplianceIntelligence } from "@/lib/document-compliance-intelligence";
import { buildProcurementIntelligenceModel } from "@/lib/procurement-intelligence";
import { buildInitialProjectReadiness } from "@/lib/project-onboarding-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import { buildRiskExecutiveIntelligence, type RiskExecutiveImportHistoryItem } from "@/lib/risk-executive-intelligence";
import { buildScheduleCashflowIntelligenceModel } from "@/lib/schedule-cashflow-intelligence";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type DrilldownTone = "good" | "warn" | "bad" | "info" | "neutral";

export type AiScenario =
  | "summary"
  | "budget-review"
  | "schedule-review"
  | "procurement-review"
  | "finance-review"
  | "contract-review"
  | "risk-review"
  | "document-review"
  | "daily-report-summary"
  | "executive-report"
  | "draft-text";

export type AiInsightResponse = {
  title: string;
  scenario: AiScenario;
  overallStatus?: "on_track" | "attention" | "critical" | "unknown";
  summary: string;
  findings: Array<{ severity: "low" | "medium" | "high" | "critical"; title: string; description: string; source?: string; recommendation?: string }>;
  recommendedActions: Array<{ priority: "low" | "medium" | "high"; title: string; description: string }>;
  subject?: string;
  draftText?: string;
  recommendedAttachments?: string[];
  dataUsed: string[];
  dataLimitations: string[];
  generatedAt: string;
  provider: "deterministic" | "openai" | "degraded";
};

export const drilldownAiScenarios: Array<{ scenario: AiScenario; title: string; description: string; data: string[]; target: string }> = [
  { scenario: "summary", title: "Сводка по проекту", description: "Общий статус, отклонения, риски и действия на 7 дней.", data: ["Проект", "ВОР", "График", "Финансы", "Риски"], target: "AI-помощник" },
  { scenario: "budget-review", title: "Проверить ВОР", description: "Нулевые цены, дубли, подозрительные объемы и недооценка.", data: ["ВОР", "Разделы", "План/факт"], target: "Бюджет / ВОР" },
  { scenario: "schedule-review", title: "Проверить график", description: "Просрочки, владельцы, ближайшие контрольные точки.", data: ["График", "Зависимости", "Факт"], target: "График" },
  { scenario: "procurement-review", title: "Проверить снабжение", description: "Дефицит, поставщики, сроки потребности и draft заявки.", data: ["Материалы", "Заявки", "Поставщики"], target: "Материалы" },
  { scenario: "finance-review", title: "Финансовый анализ", description: "Cash gap, оплаты, просрочки, маржа и проблемные статьи.", data: ["Платежи", "Бюджет", "Договор"], target: "Финансы" },
  { scenario: "contract-review", title: "Проверить договор", description: "Оплата, аванс, приемка, штрафы, изменение объемов и приложения.", data: ["Договор", "ТЗ", "ВОР", "Финансы", "Документы"], target: "Договор / Тендер" },
  { scenario: "risk-review", title: "Собрать риски", description: "Top рисков, владельцы, меры и источники.", data: ["Риски", "График", "Финансы", "Материалы"], target: "Риски" },
  { scenario: "document-review", title: "Документы", description: "Метаданные документов и ограничения без OCR.", data: ["Документы", "Категории", "Версии"], target: "Документы" },
  { scenario: "daily-report-summary", title: "Рапорты", description: "Проблемы площадки, люди, техника и текст отчета.", data: ["Рапорты", "График"], target: "Рапорты" },
  { scenario: "executive-report", title: "Отчет руководителю", description: "Короткая деловая записка по объекту.", data: ["Все разделы"], target: "AI-помощник" },
  { scenario: "draft-text", title: "Подготовить письмо", description: "Draft письма/пояснительной записки по данным проекта.", data: ["Контекст проекта", "Отклонения"], target: "AI-помощник" }
];

export type ProjectIntelligenceInput = {
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
    quickActions?: Array<{ title: string; prompt: string; deterministicAnswer: string }>;
  } | null;
};

export type ProjectIntelligenceDrilldownModel = {
  nav: Array<{ id: string; label: string; tone: DrilldownTone; count?: number }>;
  baseline: {
    tone: DrilldownTone;
    templateTitle: string;
    templateDescription: string;
    readiness: string;
    score: number;
    modules: string[];
    firstActions: string[];
    missingData: string[];
    limitations: string[];
    empty: boolean;
    ctaTab: "Обзор";
  };
  documents: {
    tone: DrilldownTone;
    score: number;
    present: number;
    total: number;
    missing: DocumentChecklistItem[];
    presentItems: DocumentChecklistItem[];
    complianceReadiness: string;
    ksReadiness: string;
    executivePackageReadiness: string;
    missingCritical: number;
    weeklyActions: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    blockingPackages: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "Документы";
  };
  risks: {
    tone: DrilldownTone;
    total: number;
    critical: number;
    high: number;
    decisionRequired: number;
    reportReadiness: string;
    top: Array<{ title: string; detail: string; priority: string; owner?: string; dueAt?: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "Риски";
  };
  schedule: {
    tone: DrilldownTone;
    completionPercent: number;
    overdueCount: number;
    delayDays: number;
    packageCount: number;
    blockedPackageCount: number;
    readinessLabel: string;
    nextPlanLabel: string;
    timeline: Array<{ title: string; detail: string; status: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "График";
  };
  financeVor: {
    tone: DrilldownTone;
    plannedCost: string;
    forecastCost: string;
    forecastProfit: string;
    budgetDeviation: string;
    cashGap: string;
    financingNeed: string;
    cashflowStatus: string;
    peakCashWeek: string;
    peakCashNeed: string;
    empty: boolean;
    ctaTab: "Бюджет / ВОР";
    financeTab: "Финансы";
  };
  procurement: {
    tone: DrilldownTone;
    deficitCount: number;
    candidateCount: number;
    activeRequestCount: number;
    readinessLabel: string;
    estimatedDraftTotal: string;
    warningCount: number;
    deficitItems: Array<{ name: string; detail: string; tone: DrilldownTone }>;
    requests: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "Материалы";
    requestTab: "Заявки";
  };
  contractTender: {
    tone: DrilldownTone;
    score: number;
    readiness: string;
    decision: string;
    contractValue: string;
    forecastProfit: string;
    highRisks: number;
    criticalRisks: number;
    missingCriticalDocs: number;
    terms: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    risks: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    actions: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "Договор / Тендер";
    documentsTab: "Документы";
  };
  acceptanceBilling: {
    tone: DrilldownTone;
    status: string;
    readyAmount: string;
    blockedAmount: string;
    readyItems: number;
    blockedItems: number;
    missingFactItems: number;
    documentBlockers: number;
    nextStep: string;
    packageItems: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    risks: Array<{ title: string; detail: string; tone: DrilldownTone }>;
    empty: boolean;
    ctaTab: "КС";
    documentsTab: "Документы";
  };
  reports: {
    tone: DrilldownTone;
    latestReport?: { title: string; detail: string; status: string };
    nextExecutiveAction: string;
    executiveStatus: string;
    reportReadiness: string;
    decisionsRequired: number;
    missingData: string[];
    empty: boolean;
    reportTab: "Рапорты";
    executiveScenario: "executive-report";
  };
  ai: {
    tone: DrilldownTone;
    scenarios: typeof drilldownAiScenarios;
    dataUsed: string[];
    limitations: string[];
    hasResult: boolean;
  };
};

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function compactMoney(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  const absolute = Math.abs(safeValue);
  if (absolute >= 1_000_000_000) return `${(safeValue / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(safeValue / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safeValue).toLocaleString("ru-RU")} ₽`;
}

function readableDate(value?: string) {
  if (!value) return "дата не задана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function toneFromPercent(score: number): DrilldownTone {
  if (score >= 75) return "good";
  if (score >= 45) return "warn";
  return "bad";
}

function toneFromRiskPriority(priority: string): DrilldownTone {
  if (priority === "critical" || priority === "high") return "bad";
  if (priority === "medium") return "warn";
  if (priority === "low") return "info";
  return "neutral";
}

function toneFromScheduleStatus(status: string): DrilldownTone {
  if (status === "done") return "good";
  if (status === "delayed" || status === "stopped") return "bad";
  if (status === "in_progress") return "warn";
  return "info";
}

function toneFromRequestPriority(priority: string): DrilldownTone {
  if (priority === "critical") return "bad";
  if (priority === "high" || priority === "medium") return "warn";
  return "info";
}

export function buildProjectIntelligenceDrilldownModel(input: ProjectIntelligenceInput): ProjectIntelligenceDrilldownModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const payments = input.payments ?? [];
  const reports = input.dailyReports ?? [];
  const risks = input.risks ?? [];
  const documents = input.documents ?? [];
  const documentChecklist = input.documentChecklist ?? [];
  const contractAmount = project.contractAmount ?? 0;
  const onboardingBaseline = buildInitialProjectReadiness(project);

  const budget = budgetTotals(contractAmount, budgetItems);
  const works = workTotals(scheduleItems);
  const materialStats = materialTotals(materials);
  const finance = financeTotals(payments);
  const autoRisks = deriveAutoRisks(scheduleItems, materials, payments);
  const procurementIntelligence = buildProcurementIntelligenceModel({
    projectName: project.name ?? "Проект",
    materials,
    procurementRequests,
    importHistory: input.importHistory ?? []
  });
  const scheduleCashflow = buildScheduleCashflowIntelligenceModel({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    importHistory: input.importHistory ?? []
  });
  const acceptanceBilling = buildAcceptanceBillingIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist,
    importHistory: input.importHistory ?? []
  });
  const contractTender = buildContractTenderIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist
  });
  const riskExecutive = buildRiskExecutiveIntelligence({
    ...input,
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    dailyReports: reports,
    risks,
    documents,
    documentChecklist,
    importHistory: input.importHistory ?? []
  });
  const allRisks = [...risks, ...autoRisks].filter((risk) => risk.status !== "closed");
  const criticalRisks = allRisks.filter((risk) => risk.priority === "critical");
  const highRisks = allRisks.filter((risk) => risk.priority === "high");
  const presentDocuments = documentChecklist.filter((item) => item.status === "present");
  const missingDocuments = documentChecklist.filter((item) => item.status !== "present");
  const documentScore = documentChecklist.length ? (presentDocuments.length / documentChecklist.length) * 100 : 0;
  const documentCompliance = buildDocumentComplianceIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist,
    importHistory: input.importHistory ?? []
  });
  const budgetDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const activeRequests = procurementRequests.filter((request) => !["closed", "rejected"].includes(request.status));
  const financeTone: DrilldownTone = finance.cashGap < 0 || budgetDeviation > 0 ? "bad" : budget.forecastProfit < 0 ? "warn" : "good";
  const procurementTone: DrilldownTone = procurementIntelligence.tone === "neutral" ? "info" : procurementIntelligence.tone;
  const scheduleTone: DrilldownTone = works.overdueItems.length ? "bad" : scheduleItems.length ? "info" : "neutral";
  const riskTone: DrilldownTone = riskExecutive.summary.critical || criticalRisks.length ? "bad" : riskExecutive.summary.high || highRisks.length || riskExecutive.summary.totalOpen || allRisks.length ? "warn" : "good";
  const reportsTone: DrilldownTone = riskExecutive.executiveReport.status === "red" ? "bad" : riskExecutive.executiveReport.status === "amber" ? "warn" : riskExecutive.executiveReport.status === "green" ? "good" : "info";

  const aiDataUsed = Array.from(
    new Set([
      ...(input.intelligence?.quickActions?.map((item) => item.title) ?? []),
      ...drilldownAiScenarios.flatMap((item) => item.data)
    ])
  ).slice(0, 10);
  const procurementSignals = procurementIntelligence.candidates.length
    ? procurementIntelligence.candidates.slice(0, 5).map((material) => ({
        name: material.name,
        detail: `${material.deficitQty} ${material.unit} · ${material.sourceSection} · ${material.suggestedAction}`,
        tone: material.warnings.length ? "warn" as const : "bad" as const
      }))
    : materialStats.deficitItems.slice(0, 5).map((material) => ({
        name: material.name,
        detail: `Требуется ${material.requiredQty} ${material.unit}, доставлено ${material.deliveredQty} ${material.unit}, нужно к ${readableDate(material.neededAt)}`,
        tone: material.status === "required" ? "bad" as const : "warn" as const
      }));

  return {
    nav: [
      { id: "baseline", label: "Baseline", tone: toneFromPercent(onboardingBaseline.score), count: onboardingBaseline.baseline.expectedMissingData.length },
      { id: "documents", label: "Документы", tone: documentCompliance.summary.readiness === "ready" ? "good" : documentCompliance.summary.readiness === "missing_critical" ? "bad" : documentCompliance.summary.totalRequired ? "warn" : "info", count: documentCompliance.summary.missing || missingDocuments.length },
      { id: "risks", label: "Риски", tone: riskTone, count: Math.max(allRisks.length, riskExecutive.summary.totalOpen) },
      { id: "schedule", label: "График", tone: scheduleTone, count: works.overdueItems.length },
      { id: "finance-vor", label: "ВОР / финансы", tone: financeTone },
      { id: "contract-tender", label: "Договор", tone: contractTender.summary.tone === "neutral" ? "info" : contractTender.summary.tone, count: contractTender.summary.highRisks + contractTender.summary.criticalRisks },
      { id: "acceptance-billing", label: "КС", tone: acceptanceBilling.summary.tone, count: acceptanceBilling.summary.readyItems || acceptanceBilling.summary.blockedItems },
      { id: "procurement", label: "Снабжение", tone: procurementTone, count: procurementIntelligence.summary.candidates || materialStats.deficitItems.length },
      { id: "reports", label: "Executive", tone: reportsTone },
      { id: "ai-recommendations", label: "AI", tone: "info", count: drilldownAiScenarios.length }
    ],
    baseline: {
      tone: toneFromPercent(onboardingBaseline.score),
      templateTitle: onboardingBaseline.template.title,
      templateDescription: onboardingBaseline.template.description,
      readiness: onboardingBaseline.baseline.readiness,
      score: onboardingBaseline.score,
      modules: onboardingBaseline.baseline.modulesEnabled,
      firstActions: onboardingBaseline.baseline.firstActions.slice(0, 6),
      missingData: onboardingBaseline.missingData.slice(0, 8),
      limitations: onboardingBaseline.baseline.limitations.slice(0, 3),
      empty: onboardingBaseline.baseline.templateId === "empty",
      ctaTab: "Обзор"
    },
    documents: {
      tone: documentCompliance.summary.readiness === "ready" ? "good" : documentCompliance.summary.readiness === "missing_critical" ? "bad" : documentCompliance.summary.totalRequired ? "warn" : documentChecklist.length ? toneFromPercent(documentScore) : "info",
      score: clampPercent(documentScore),
      present: presentDocuments.length,
      total: documentChecklist.length,
      missing: missingDocuments.slice(0, 6),
      presentItems: presentDocuments.slice(0, 4),
      complianceReadiness: documentCompliance.summary.readiness,
      ksReadiness: documentCompliance.ksReadiness.readyForKs,
      executivePackageReadiness: documentCompliance.executivePackage.readiness,
      missingCritical: documentCompliance.summary.urgentHigh,
      weeklyActions: documentCompliance.weeklyPlan.slice(0, 4).map((item) => ({
        title: item.title,
        detail: `${item.ownerRole} · ${item.supports}`,
        tone: item.blocking ? "warn" : "info"
      })),
      blockingPackages: documentCompliance.workPackageMap
        .filter((item) => item.readiness === "blocked")
        .slice(0, 4)
        .map((item) => ({
          title: item.title,
          detail: item.blockingDocs.slice(0, 2).join("; ") || "Документы пакета не готовы.",
          tone: "bad"
        })),
      empty: documentChecklist.length === 0 && documentCompliance.summary.totalRequired === 0,
      ctaTab: "Документы"
    },
    risks: {
      tone: riskTone,
      total: Math.max(allRisks.length, riskExecutive.summary.totalOpen),
      critical: Math.max(criticalRisks.length, riskExecutive.summary.critical),
      high: Math.max(highRisks.length, riskExecutive.summary.high),
      decisionRequired: riskExecutive.summary.decisionRequired,
      reportReadiness: riskExecutive.summary.reportReadiness,
      top: (riskExecutive.risks.length
        ? riskExecutive.risks.slice(0, 5).map((risk) => ({
            title: risk.title,
            detail: risk.description,
            priority: risk.severity,
            owner: risk.ownerRole,
            dueAt: risk.decisionRequired ? "decision required" : undefined,
            tone: toneFromRiskPriority(risk.severity)
          }))
        : allRisks
        .slice()
        .sort((left, right) => {
          const rank = { critical: 4, high: 3, medium: 2, low: 1 };
          return (rank[right.priority] ?? 0) - (rank[left.priority] ?? 0);
        })
        .slice(0, 5)
        .map((risk) => ({
          title: risk.title,
          detail: risk.reason,
          priority: risk.priority,
          owner: risk.owner,
          dueAt: readableDate(risk.dueAt),
          tone: toneFromRiskPriority(risk.priority)
        }))),
      empty: allRisks.length === 0 && riskExecutive.risks.length === 0,
      ctaTab: "Риски"
    },
    schedule: {
      tone: scheduleTone,
      completionPercent: clampPercent(works.completionPercent),
      overdueCount: works.overdueItems.length,
      delayDays: works.delayDays,
      packageCount: scheduleCashflow.summary.packageCount,
      blockedPackageCount: scheduleCashflow.summary.blockedPackages,
      readinessLabel: scheduleCashflow.readiness.label,
      nextPlanLabel: scheduleCashflow.timeline[0]?.label ?? "нужен ВОР / график",
      timeline: scheduleItems.slice(0, 6).map((item) => ({
        title: item.name,
        detail: `${readableDate(item.startsAt)} - ${readableDate(item.endsAt)} · ${item.owner}`,
        status: item.status,
        tone: toneFromScheduleStatus(item.status)
      })),
      empty: scheduleItems.length === 0,
      ctaTab: "График"
    },
    financeVor: {
      tone: financeTone,
      plannedCost: compactMoney(budget.totalPlannedCost),
      forecastCost: compactMoney(budget.totalForecastCost),
      forecastProfit: compactMoney(budget.forecastProfit),
      budgetDeviation: compactMoney(budgetDeviation),
      cashGap: compactMoney(finance.cashGap),
      financingNeed: compactMoney(finance.financingNeed),
      cashflowStatus: scheduleCashflow.readiness.label,
      peakCashWeek: scheduleCashflow.summary.peakCashWeek,
      peakCashNeed: compactMoney(scheduleCashflow.summary.peakCashNeed),
      empty: budgetItems.length === 0 && payments.length === 0,
      ctaTab: "Бюджет / ВОР",
      financeTab: "Финансы"
    },
    procurement: {
      tone: procurementTone,
      deficitCount: materialStats.deficitItems.length,
      candidateCount: procurementIntelligence.summary.candidates,
      activeRequestCount: activeRequests.length,
      readinessLabel: procurementIntelligence.readiness.label,
      estimatedDraftTotal: compactMoney(procurementIntelligence.summary.estimatedTotal),
      warningCount: procurementIntelligence.summary.warnings + procurementIntelligence.summary.missingRows,
      deficitItems: procurementSignals,
      requests: activeRequests.slice(0, 4).map((request) => ({
        title: request.title,
        detail: `${request.items.length} поз. · ${readableDate(request.neededAt)} · ${request.status}`,
        tone: toneFromRequestPriority(request.priority)
      })),
      empty: materials.length === 0 && procurementRequests.length === 0,
      ctaTab: "Материалы",
      requestTab: "Заявки"
    },
    contractTender: {
      tone: contractTender.summary.tone === "neutral" ? "info" : contractTender.summary.tone,
      score: contractTender.summary.score,
      readiness: contractTender.summary.readiness,
      decision: contractTender.summary.headline,
      contractValue: contractTender.summary.contractValueLabel,
      forecastProfit: compactMoney(contractTender.summary.forecastProfit),
      highRisks: contractTender.summary.highRisks,
      criticalRisks: contractTender.summary.criticalRisks,
      missingCriticalDocs: contractTender.summary.missingCriticalDocs,
      terms: contractTender.terms.slice(0, 6).map((term) => ({
        title: term.label,
        detail: `${term.value} · ${term.evidence[0]}`,
        tone: term.tone === "neutral" ? "info" : term.tone
      })),
      risks: contractTender.risks.slice(0, 5).map((risk) => ({
        title: risk.title,
        detail: risk.description,
        tone: risk.severity === "critical" || risk.severity === "high" ? "bad" : risk.severity === "medium" ? "warn" : "info"
      })),
      actions: contractTender.actions.slice(0, 4).map((action) => ({
        title: action.title,
        detail: action.detail,
        tone: action.priority === "urgent" || action.priority === "high" ? "warn" : "info"
      })),
      empty: contractTender.summary.readiness === "no_data",
      ctaTab: "Договор / Тендер",
      documentsTab: "Документы"
    },
    acceptanceBilling: {
      tone: acceptanceBilling.summary.tone,
      status: acceptanceBilling.summary.status,
      readyAmount: compactMoney(acceptanceBilling.summary.readyAmount),
      blockedAmount: compactMoney(acceptanceBilling.summary.blockedAmount),
      readyItems: acceptanceBilling.summary.readyItems,
      blockedItems: acceptanceBilling.summary.blockedItems,
      missingFactItems: acceptanceBilling.summary.missingFactItems,
      documentBlockers: acceptanceBilling.summary.documentBlockers,
      nextStep: acceptanceBilling.summary.nextStep,
      packageItems: [...acceptanceBilling.packageDraft.readyItems, ...acceptanceBilling.packageDraft.blockedItems].slice(0, 5).map((item) => ({
        title: item.title,
        detail: `${compactMoney(item.billableAmount)} · ${item.status} · ${item.suggestedAction}`,
        tone: item.status === "ready" ? "good" : item.status === "needs_fact" ? "info" : item.status === "needs_documents" ? "warn" : "bad"
      })),
      risks: acceptanceBilling.risks.slice(0, 4).map((risk) => ({
        title: risk.title,
        detail: risk.description,
        tone: risk.severity === "critical" || risk.severity === "high" ? "bad" : risk.severity === "medium" ? "warn" : "info"
      })),
      empty: acceptanceBilling.summary.status === "no_data",
      ctaTab: "КС",
      documentsTab: "Документы"
    },
    reports: {
      tone: reportsTone,
      latestReport: reports[0]
        ? {
            title: `${readableDate(reports[0].date)} · ${reports[0].author}`,
            detail: reports[0].issues || reports[0].completedWorks || "Рапорт без проблемных заметок.",
            status: reports[0].status
          }
        : undefined,
      nextExecutiveAction: riskExecutive.managementSummary.nextManagementAction,
      executiveStatus: riskExecutive.executiveReport.status,
      reportReadiness: riskExecutive.executiveReport.reportReadiness,
      decisionsRequired: riskExecutive.decisions.length,
      missingData: riskExecutive.summary.missingSources,
      empty: reports.length === 0 && riskExecutive.summary.reportReadiness === "no_data",
      reportTab: "Рапорты",
      executiveScenario: "executive-report"
    },
    ai: {
      tone: "info",
      scenarios: drilldownAiScenarios,
      dataUsed: aiDataUsed,
      limitations: input.intelligence?.missingData?.slice(0, 6) ?? [],
      hasResult: false
    }
  };
}
