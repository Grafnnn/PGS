import { buildAcceptanceBillingIntelligence } from "@/lib/acceptance-billing-intelligence";
import { buildContractTenderIntelligence } from "@/lib/contract-tender-intelligence";
import { buildProcurementIntelligenceModel, type ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import { buildDocumentComplianceIntelligence, type DocumentPriority } from "@/lib/document-compliance-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import { buildScheduleCashflowIntelligenceModel } from "@/lib/schedule-cashflow-intelligence";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type RiskSeverity = "low" | "medium" | "high" | "critical";
export type ExecutiveTone = "green" | "amber" | "red" | "unknown";
export type ReportReadiness = "ready" | "partial" | "blocked" | "no_data";
export type RiskCategory = "import" | "documents" | "procurement" | "schedule" | "cashflow" | "finance" | "quality" | "reporting" | "data_quality" | "access" | "unknown";
export type SourceArea = "ВОР" | "Documents" | "Procurement" | "Schedule" | "Cashflow" | "Finance" | "Contract" | "Acceptance" | "Reports" | "Project Intelligence";
export type OwnerRole = "project_manager" | "procurement" | "finance" | "executive" | "document_controller" | "estimator" | "unknown";
export type RiskStatus = "open" | "needs_review" | "blocked" | "mitigated" | "informational";
export type Confidence = "low" | "medium" | "high";

export type RiskExecutiveImportHistoryItem = ProcurementImportHistoryItem;

export type RiskItem = {
  id: string;
  title: string;
  description: string;
  severity: RiskSeverity;
  category: RiskCategory;
  sourceArea: SourceArea;
  sourceRef: string;
  status: RiskStatus;
  suggestedAction: string;
  decisionRequired: boolean;
  decisionText?: string;
  ownerRole: OwnerRole;
  confidence: Confidence;
  evidence: string[];
  createdFrom: string;
};

export type RiskSummary = {
  totalOpen: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  decisionRequired: number;
  blockedExecution: number;
  dataQuality: number;
  byCategory: Array<{ category: RiskCategory; count: number }>;
  bySource: Array<{ sourceArea: SourceArea; count: number }>;
  missingSources: SourceArea[];
  reportReadiness: ReportReadiness;
};

export type DecisionItem = {
  id: string;
  title: string;
  reason: string;
  sourceRiskId?: string;
  sourceArea: SourceArea;
  priority: "low" | "medium" | "high" | "urgent";
  decisionOwnerRole: OwnerRole;
  requiredBy: string;
  options: string[];
  impact: Array<"schedule" | "cashflow" | "procurement" | "documents" | "reporting">;
  recommendedNextStep: string;
};

export type ActionItem = {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "urgent";
  ownerRole: OwnerRole;
  sourceArea: SourceArea;
  dueHint: "today_next" | "this_week" | "before_procurement" | "before_execution" | "before_executive_report";
  linkedRiskId?: string;
  linkedDecisionId?: string;
  status: "suggested" | "blocked" | "ready" | "informational";
};

export type ExecutiveWeeklyReport = {
  status: ExecutiveTone;
  statusReason: string;
  reportReadiness: ReportReadiness;
  topRisks: RiskItem[];
  topActions: ActionItem[];
  decisionsRequiredCount: number;
  missingData: SourceArea[];
  sections: Array<{ title: string; text: string }>;
  copyText: string;
};

export type ManagementStatusSummary = {
  status: ExecutiveTone;
  headline: string;
  summary: string;
  nextManagementAction: string;
};

export type RiskExecutiveInput = {
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
  intelligence?: {
    completenessScore: number;
    summary: string;
    topRisks: PipelineAction[];
    nextActions: PipelineAction[];
    missingData: string[];
  } | null;
  importHistory?: RiskExecutiveImportHistoryItem[] | null;
};

export type RiskExecutiveIntelligenceModel = {
  risks: RiskItem[];
  summary: RiskSummary;
  decisions: DecisionItem[];
  actions: ActionItem[];
  executiveReport: ExecutiveWeeklyReport;
  managementSummary: ManagementStatusSummary;
};

const severityRank: Record<RiskSeverity, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function compactMoney(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 1_000_000_000) return `${(safe / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (abs >= 1_000_000) return `${(safe / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safe).toLocaleString("ru-RU")} ₽`;
}

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function risk(input: Omit<RiskItem, "confidence"> & { confidence?: Confidence }): RiskItem {
  return { confidence: input.confidence ?? "medium", ...input };
}

function uniq<T>(items: T[]) {
  return Array.from(new Set(items));
}

function addRiskUnique(target: RiskItem[], item: RiskItem) {
  if (target.some((riskItem) => riskItem.id === item.id)) return;
  target.push(item);
}

function severityToDecisionPriority(severity: RiskSeverity): DecisionItem["priority"] {
  if (severity === "critical") return "urgent";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function actionPriority(severity: RiskSeverity): ActionItem["priority"] {
  return severityToDecisionPriority(severity);
}

function severityFromDocumentPriority(priority: DocumentPriority): RiskSeverity {
  if (priority === "urgent") return "critical";
  if (priority === "high") return "high";
  if (priority === "medium") return "medium";
  return "low";
}

function ownerRoleFromDocumentRole(role: string): OwnerRole {
  if (role === "procurement") return "procurement";
  if (role === "finance") return "finance";
  if (role === "executive") return "executive";
  if (role === "document_controller") return "document_controller";
  if (role === "project_manager" || role === "site_engineer" || role === "subcontractor") return "project_manager";
  return "unknown";
}

function mapExistingRisk(existing: Risk): RiskItem {
  const status: RiskStatus = existing.status === "closed" ? "mitigated" : existing.status === "deferred" ? "blocked" : existing.status === "in_progress" ? "needs_review" : "open";
  return risk({
    id: `manual:${existing.id}`,
    title: existing.title,
    description: existing.reason || "Риск добавлен вручную, требуется управленческое описание причины.",
    severity: existing.priority,
    category: "unknown",
    sourceArea: "Project Intelligence",
    sourceRef: existing.id,
    status,
    suggestedAction: "Проверить владельца, срок и план снижения риска.",
    decisionRequired: existing.priority === "critical" || existing.priority === "high",
    decisionText: existing.priority === "critical" || existing.priority === "high" ? "Подтвердить решение по снижению ручного риска." : undefined,
    ownerRole: "project_manager",
    confidence: "high",
    evidence: [existing.reason, existing.owner ? `Владелец: ${existing.owner}` : "", existing.dueAt ? `Срок: ${existing.dueAt}` : ""].filter(Boolean),
    createdFrom: "manual-risk"
  });
}

export function buildRiskSignalsFromImport(input: RiskExecutiveInput): RiskItem[] {
  const risks: RiskItem[] = [];
  const importHistory = input.importHistory ?? [];
  const latest = importHistory.find((item) => item.status === "committed" && item.preview) ?? importHistory.find((item) => item.preview);
  const preview = latest?.preview;
  const budgetItems = input.budgetItems ?? [];
  const missingQty = budgetItems.filter((item) => item.qty <= 0);
  const missingPrice = budgetItems.filter((item) => item.plannedUnitPrice <= 0 && item.forecastUnitPrice <= 0);
  const unknownRows = (preview?.unknownRows.length ?? 0) + (preview?.previewRows?.filter((row) => row.entityType === "unknown" && row.status !== "skipped").length ?? 0);
  const warningRows = preview?.summary.warningRows ?? preview?.summary.warnings ?? 0;
  const skippedTotals = preview?.previewRows?.filter((row) => row.status === "skipped" || row.suspiciousFlags.includes("skippedTotalRow")).length ?? 0;

  if (!preview && !budgetItems.length) {
    addRiskUnique(
      risks,
      risk({
        id: "import:no-vor-data",
        title: "Нет ВОР / сметы для управленческого анализа",
        description: "Без ВОР система не может надежно сформировать бюджет, снабжение, график и executive report.",
        severity: "critical",
        category: "data_quality",
        sourceArea: "ВОР",
        sourceRef: "budget-items",
        status: "blocked",
        suggestedAction: "Загрузить ВОР или внести ключевые бюджетные позиции вручную.",
        decisionRequired: true,
        decisionText: "Решить, какой источник ВОР считать управленческой базой проекта.",
        ownerRole: "estimator",
        confidence: "high",
        evidence: ["budgetItems: 0", "import preview: missing"],
        createdFrom: "import-signals"
      })
    );
  }

  if (unknownRows > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "import:unknown-rows",
        title: "Есть нераспознанные строки ВОР",
        description: `${unknownRows} строк не попали в рабочие данные и требуют ручной классификации.`,
        severity: unknownRows >= 10 ? "high" : "medium",
        category: "import",
        sourceArea: "ВОР",
        sourceRef: latest?.id ?? "preview",
        status: "needs_review",
        suggestedAction: "Разобрать unknown rows и назначить тип: работа, материал, график или примечание.",
        decisionRequired: unknownRows >= 10,
        decisionText: unknownRows >= 10 ? "Подтвердить правила классификации спорных строк ВОР." : undefined,
        ownerRole: "estimator",
        evidence: [`unknown rows: ${unknownRows}`, latest?.fileName ? `файл: ${latest.fileName}` : ""].filter(Boolean),
        createdFrom: "import-signals"
      })
    );
  }

  if (missingQty.length) {
    addRiskUnique(
      risks,
      risk({
        id: "import:missing-quantities",
        title: "В ВОР есть позиции без количества",
        description: `${missingQty.length} позиций не могут быть использованы для надежного план-факта и графика.`,
        severity: missingQty.length >= 5 ? "high" : "medium",
        category: "data_quality",
        sourceArea: "ВОР",
        sourceRef: "budget.qty",
        status: "needs_review",
        suggestedAction: "ПТО/сметчику нужно подтвердить объемы по позициям без количества.",
        decisionRequired: missingQty.length >= 5,
        decisionText: missingQty.length >= 5 ? "Утвердить источник объемов для спорных позиций." : undefined,
        ownerRole: "estimator",
        evidence: missingQty.slice(0, 4).map((item) => `${item.section}: ${item.name}`),
        createdFrom: "import-signals"
      })
    );
  }

  if (missingPrice.length) {
    const amount = missingPrice.reduce((sum, item) => sum + Math.max(item.qty, 0), 0);
    addRiskUnique(
      risks,
      risk({
        id: "import:missing-prices",
        title: "Есть позиции без цены",
        description: `${missingPrice.length} позиций не дают надежный прогноз себестоимости и cashflow.`,
        severity: missingPrice.length >= 5 || amount > 100 ? "high" : "medium",
        category: "finance",
        sourceArea: "ВОР",
        sourceRef: "budget.price",
        status: "needs_review",
        suggestedAction: "Запросить цены/КП и обновить плановую или прогнозную стоимость.",
        decisionRequired: true,
        decisionText: "Подтвердить, можно ли выпускать управленческий отчет до оценки этих позиций.",
        ownerRole: "finance",
        evidence: missingPrice.slice(0, 4).map((item) => `${item.section}: ${item.name}`),
        createdFrom: "import-signals"
      })
    );
  }

  if (warningRows > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "import:warning-rows",
        title: "Импорт содержит строки с предупреждениями",
        description: `${warningRows} предупреждений нужно проверить до принятия ВОР как управленческой базы.`,
        severity: "medium",
        category: "data_quality",
        sourceArea: "ВОР",
        sourceRef: latest?.id ?? "preview",
        status: "needs_review",
        suggestedAction: "Открыть историю импорта и проверить предупреждения по строкам.",
        decisionRequired: false,
        ownerRole: "estimator",
        evidence: [`warnings: ${warningRows}`, skippedTotals ? `subtotal/skipped rows ignored: ${skippedTotals}` : ""].filter(Boolean),
        createdFrom: "import-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromProcurement(input: RiskExecutiveInput): RiskItem[] {
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const model = buildProcurementIntelligenceModel({
    projectName: input.project?.name ?? "Проект",
    materials,
    procurementRequests,
    importHistory: input.importHistory ?? []
  });
  const risks: RiskItem[] = [];

  if (!materials.length) {
    return [
      risk({
        id: "procurement:no-materials",
        title: "Нет реестра материалов",
        description: "Снабжение нельзя оценить без потребностей по материалам.",
        severity: "high",
        category: "procurement",
        sourceArea: "Procurement",
        sourceRef: "materials",
        status: "blocked",
        suggestedAction: "Сформировать материалы из ВОР или внести потребности вручную.",
        decisionRequired: true,
        decisionText: "Определить источник потребности по материалам.",
        ownerRole: "procurement",
        confidence: "high",
        evidence: ["materials: 0"],
        createdFrom: "procurement-signals"
      })
    ];
  }

  if (model.summary.candidates > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "procurement:deficit-candidates",
        title: "Есть материалы к срочной заявке",
        description: `${model.summary.candidates} позиций имеют дефицит и могут быть вынесены в draft заявки.`,
        severity: model.summary.candidates >= 5 ? "high" : "medium",
        category: "procurement",
        sourceArea: "Procurement",
        sourceRef: "procurement.candidates",
        status: "open",
        suggestedAction: "Проверить кандидатов и явно создать заявку снабжения.",
        decisionRequired: model.summary.candidates >= 5,
        decisionText: model.summary.candidates >= 5 ? "Утвердить приоритет закупок по дефицитным материалам." : undefined,
        ownerRole: "procurement",
        evidence: model.candidates.slice(0, 4).map((item) => `${item.name}: дефицит ${item.deficitQty} ${item.unit}`),
        createdFrom: "procurement-signals"
      })
    );
  }

  if (model.summary.warnings > 0 || model.missingRows.length > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "procurement:warnings",
        title: "Снабжение содержит неполные данные",
        description: "Часть материалов нельзя безопасно отправлять в закупку без проверки количества, цены, поставщика или классификации.",
        severity: model.summary.warnings + model.missingRows.length >= 5 ? "high" : "medium",
        category: "data_quality",
        sourceArea: "Procurement",
        sourceRef: "procurement.warnings",
        status: "needs_review",
        suggestedAction: "Проверить warnings и missing rows перед формированием заявок.",
        decisionRequired: false,
        ownerRole: "procurement",
        evidence: model.missingRows.slice(0, 4).map((item) => `${item.name}: ${item.reason}`),
        createdFrom: "procurement-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromSchedule(input: RiskExecutiveInput): RiskItem[] {
  const scheduleItems = input.scheduleItems ?? [];
  const risks: RiskItem[] = [];
  const delayed = scheduleItems.filter((item) => item.status === "delayed" || item.status === "stopped");
  const model = buildScheduleCashflowIntelligenceModel({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems,
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    importHistory: input.importHistory ?? []
  });

  if (!scheduleItems.length && !(input.budgetItems ?? []).length) {
    addRiskUnique(
      risks,
      risk({
        id: "schedule:no-data",
        title: "Нет графика и рабочих пакетов",
        description: "Нельзя оценить сроки и недельный план без графика или ВОР-пакетов.",
        severity: "high",
        category: "schedule",
        sourceArea: "Schedule",
        sourceRef: "schedule",
        status: "blocked",
        suggestedAction: "Создать график вручную или подготовить draft графика из ВОР.",
        decisionRequired: true,
        decisionText: "Решить, по какому графику вести управление проектом.",
        ownerRole: "project_manager",
        evidence: ["scheduleItems: 0", "budgetItems: 0"],
        createdFrom: "schedule-signals"
      })
    );
  }

  if (delayed.length) {
    addRiskUnique(
      risks,
      risk({
        id: "schedule:delayed-work",
        title: "Есть просроченные или остановленные работы",
        description: `${delayed.length} работ требуют управленческого вмешательства.`,
        severity: delayed.length >= 3 ? "critical" : "high",
        category: "schedule",
        sourceArea: "Schedule",
        sourceRef: "schedule.status",
        status: "blocked",
        suggestedAction: "Назначить план возврата в график и проверить зависимые материалы.",
        decisionRequired: true,
        decisionText: "Утвердить восстановительный план по просроченным работам.",
        ownerRole: "project_manager",
        confidence: "high",
        evidence: delayed.slice(0, 4).map((item) => `${item.name}: ${item.status}`),
        createdFrom: "schedule-signals"
      })
    );
  }

  if (model.summary.blockedPackages > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "schedule:blocked-packages",
        title: "Пакеты графика имеют блокеры",
        description: `${model.summary.blockedPackages} пакетов не готовы для надежного недельного плана.`,
        severity: model.summary.blockedPackages >= 3 ? "high" : "medium",
        category: "schedule",
        sourceArea: "Schedule",
        sourceRef: "schedule.packages",
        status: "needs_review",
        suggestedAction: "Разобрать блокеры пакетов: объемы, цены, материалы, зависимости.",
        decisionRequired: model.summary.blockedPackages >= 3,
        decisionText: model.summary.blockedPackages >= 3 ? "Решить, можно ли запускать работы до устранения блокеров." : undefined,
        ownerRole: "project_manager",
        evidence: model.packages.filter((item) => item.blockers.length).slice(0, 4).map((item) => `${item.section}: ${item.blockers.join("; ")}`),
        createdFrom: "schedule-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromCashflow(input: RiskExecutiveInput): RiskItem[] {
  const model = buildScheduleCashflowIntelligenceModel({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    importHistory: input.importHistory ?? []
  });
  const risks: RiskItem[] = [];
  const payments = input.payments ?? [];
  const overduePayments = payments.filter((payment) => payment.status === "overdue");

  if (model.summary.peakCashNeed > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "cashflow:peak-need",
        title: "Пиковая потребность в финансировании",
        description: `Черновой cashflow показывает пик потребности ${compactMoney(model.summary.peakCashNeed)}.`,
        severity: model.summary.peakCashNeed >= 1_000_000 ? "high" : "medium",
        category: "cashflow",
        sourceArea: "Cashflow",
        sourceRef: "cashflow.peak",
        status: "open",
        suggestedAction: "Проверить поступления, авансы и переносы оплат до запуска пакетов.",
        decisionRequired: model.summary.peakCashNeed >= 1_000_000,
        decisionText: model.summary.peakCashNeed >= 1_000_000 ? "Подтвердить источник покрытия пика cashflow." : undefined,
        ownerRole: "finance",
        evidence: [`peak week: ${model.summary.peakCashWeek}`, `peak need: ${compactMoney(model.summary.peakCashNeed)}`],
        createdFrom: "cashflow-signals"
      })
    );
  }

  if (overduePayments.length) {
    addRiskUnique(
      risks,
      risk({
        id: "cashflow:overdue-payments",
        title: "Есть просроченные платежи",
        description: `${overduePayments.length} платежей требуют финансового решения.`,
        severity: "high",
        category: "finance",
        sourceArea: "Finance",
        sourceRef: "payments.overdue",
        status: "blocked",
        suggestedAction: "Финдиректору нужно подтвердить график закрытия просрочек.",
        decisionRequired: true,
        decisionText: "Утвердить порядок погашения просроченных платежей.",
        ownerRole: "finance",
        evidence: overduePayments.slice(0, 4).map((payment) => `${payment.title}: ${compactMoney(payment.amount)}`),
        createdFrom: "cashflow-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromDocuments(input: RiskExecutiveInput): RiskItem[] {
  const checklist = input.documentChecklist ?? [];
  const risks: RiskItem[] = [];
  const missing = checklist.filter((item) => item.status !== "present");
  const coreMissing = missing.filter((item) => /договор|смета|вор|график|финанс/i.test(item.title));
  const compliance = buildDocumentComplianceIntelligence({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    risks: input.risks ?? [],
    documents: input.documents ?? [],
    documentChecklist: checklist,
    importHistory: input.importHistory ?? []
  });

  if (!checklist.length) {
    return [
      risk({
        id: "documents:no-checklist",
        title: "Нет document checklist",
        description: "Executive report будет неполным без проверки договора, ВОР, графика, финансирования и исполнительной документации.",
        severity: "medium",
        category: "documents",
        sourceArea: "Documents",
        sourceRef: "document-checklist",
        status: "needs_review",
        suggestedAction: "Загрузить или проверить ключевые документы проекта.",
        decisionRequired: false,
        ownerRole: "document_controller",
        evidence: ["documentChecklist: 0"],
        createdFrom: "document-signals"
      })
    ];
  }

  if (missing.length) {
    addRiskUnique(
      risks,
      risk({
        id: "documents:missing-required",
        title: "Не все документы готовы для executive report",
        description: `${missing.length} документов отсутствуют или требуют проверки.`,
        severity: coreMissing.length ? "high" : "medium",
        category: "documents",
        sourceArea: "Documents",
        sourceRef: "document-checklist",
        status: "needs_review",
        suggestedAction: "Закрыть missing/degraded документы перед отправкой отчета руководству.",
        decisionRequired: coreMissing.length > 0,
        decisionText: coreMissing.length ? "Решить, можно ли выпускать отчет без ключевых документов." : undefined,
        ownerRole: "document_controller",
        evidence: missing.slice(0, 5).map((item) => `${item.title}: ${item.suggestedNextStep}`),
        createdFrom: "document-signals"
      })
    );
  }

  for (const item of compliance.complianceRisks.slice(0, 8)) {
    const severity = severityFromDocumentPriority(item.priority);
    addRiskUnique(
      risks,
      risk({
        id: `documents:compliance:${item.id}`,
        title: item.title,
        description: item.description,
        severity,
        category: "documents",
        sourceArea: "Documents",
        sourceRef: item.sourceArea,
        status: severity === "critical" ? "blocked" : "needs_review",
        suggestedAction: item.suggestedAction,
        decisionRequired: severity === "critical" || severity === "high",
        decisionText: severity === "critical" || severity === "high" ? "Подтвердить план закрытия документального блокера." : undefined,
        ownerRole: ownerRoleFromDocumentRole(item.ownerRole),
        confidence: "medium",
        evidence: item.evidence,
        createdFrom: "document-compliance-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromAcceptance(input: RiskExecutiveInput): RiskItem[] {
  const model = buildAcceptanceBillingIntelligence({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    risks: input.risks ?? [],
    documents: input.documents ?? [],
    documentChecklist: input.documentChecklist ?? [],
    importHistory: input.importHistory ?? []
  });
  const risks: RiskItem[] = [];

  if (model.summary.status === "no_data") return risks;

  if (model.summary.missingFactItems > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "acceptance:missing-fact",
        title: "КС не готова: нет подтвержденного факта",
        description: `${model.summary.missingFactItems} позиций нельзя предъявлять без фактического объема.`,
        severity: model.summary.readyItems ? "medium" : "high",
        category: "reporting",
        sourceArea: "Acceptance",
        sourceRef: "acceptance.fact",
        status: "needs_review",
        suggestedAction: "ПТО и площадке нужно подтвердить объемы перед включением в КС.",
        decisionRequired: !model.summary.readyItems,
        decisionText: !model.summary.readyItems ? "Решить, переносить ли предъявление до подтверждения факта." : undefined,
        ownerRole: "project_manager",
        evidence: model.items.filter((item) => item.status === "needs_fact").slice(0, 4).map((item) => item.title),
        createdFrom: "acceptance-billing-signals"
      })
    );
  }

  if (model.summary.documentBlockers > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "acceptance:document-blockers",
        title: "Документы блокируют КС",
        description: `${model.summary.documentBlockers} документальных блокеров мешают закрытию выполненных объемов.`,
        severity: "high",
        category: "documents",
        sourceArea: "Acceptance",
        sourceRef: "acceptance.documents",
        status: "blocked",
        suggestedAction: "Закрыть исполнительную документацию, акты скрытых работ, сертификаты и фотофиксацию.",
        decisionRequired: true,
        decisionText: "Подтвердить, можно ли предъявлять частичный пакет без всех документов.",
        ownerRole: "document_controller",
        evidence: model.packageDraft.requiredDocuments.slice(0, 5),
        createdFrom: "acceptance-billing-signals"
      })
    );
  }

  if (model.summary.readyAmount > 0 && model.summary.blockedAmount > 0) {
    addRiskUnique(
      risks,
      risk({
        id: "acceptance:partial-billing",
        title: "КС готова частично",
        description: `К проверке готово ${compactMoney(model.summary.readyAmount)}, но ${compactMoney(model.summary.blockedAmount)} остаются заблокированы.`,
        severity: "medium",
        category: "finance",
        sourceArea: "Acceptance",
        sourceRef: "acceptance.package",
        status: "needs_review",
        suggestedAction: "Отделить готовые строки КС от блокеров и согласовать частичное предъявление.",
        decisionRequired: model.summary.blockedAmount >= model.summary.readyAmount,
        decisionText: model.summary.blockedAmount >= model.summary.readyAmount ? "Решить, выпускать ли частичную КС." : undefined,
        ownerRole: "finance",
        evidence: [`ready: ${compactMoney(model.summary.readyAmount)}`, `blocked: ${compactMoney(model.summary.blockedAmount)}`],
        createdFrom: "acceptance-billing-signals"
      })
    );
  }

  return risks;
}

export function buildRiskSignalsFromContractTender(input: RiskExecutiveInput): RiskItem[] {
  const model = buildContractTenderIntelligence({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    risks: input.risks ?? [],
    documents: input.documents ?? [],
    documentChecklist: input.documentChecklist ?? []
  });

  if (model.summary.readiness === "no_data") return [];

  return model.risks.slice(0, 8).map((item) => risk({
    id: `contract:${item.id}`,
    title: item.title,
    description: item.description,
    severity: item.severity,
    category:
      item.category === "documents" ? "documents"
        : item.category === "cashflow" ? "cashflow"
          : item.category === "payment" || item.category === "price" ? "finance"
            : item.category === "schedule" ? "schedule"
              : item.category === "data_quality" ? "data_quality"
                : "unknown",
    sourceArea: "Contract",
    sourceRef: item.id,
    status: item.severity === "critical" ? "blocked" : "needs_review",
    suggestedAction: item.suggestedAction,
    decisionRequired: item.decisionRequired,
    decisionText: item.decisionRequired ? `Решить договорный риск: ${item.title}` : undefined,
    ownerRole: item.category === "payment" || item.category === "cashflow" || item.category === "price" ? "finance" : item.category === "documents" || item.category === "acceptance" ? "document_controller" : "executive",
    evidence: item.evidence,
    createdFrom: "contract-tender-intelligence",
    confidence: model.summary.dataLimitations.length ? "medium" : "high"
  }));
}

export function buildProjectRiskRegister(input: RiskExecutiveInput): RiskItem[] {
  const manualRisks = (input.risks ?? []).map(mapExistingRisk);
  return [
    ...manualRisks,
    ...buildRiskSignalsFromImport(input),
    ...buildRiskSignalsFromProcurement(input),
    ...buildRiskSignalsFromSchedule(input),
    ...buildRiskSignalsFromCashflow(input),
    ...buildRiskSignalsFromDocuments(input),
    ...buildRiskSignalsFromContractTender(input),
    ...buildRiskSignalsFromAcceptance(input)
  ].sort((left, right) => severityRank[right.severity] - severityRank[left.severity] || left.title.localeCompare(right.title, "ru"));
}

function sourcePresent(input: RiskExecutiveInput, source: SourceArea) {
  if (source === "ВОР") return Boolean((input.budgetItems ?? []).length || (input.importHistory ?? []).some((item) => item.preview));
  if (source === "Documents") return Boolean((input.documentChecklist ?? []).length || (input.documents ?? []).length);
  if (source === "Procurement") return Boolean((input.materials ?? []).length || (input.procurementRequests ?? []).length);
  if (source === "Schedule") return Boolean((input.scheduleItems ?? []).length || (input.budgetItems ?? []).length);
  if (source === "Cashflow" || source === "Finance") return Boolean((input.payments ?? []).length || (input.budgetItems ?? []).length);
  if (source === "Contract") return Boolean((input.documents ?? []).some((document) => normalize(`${document.title} ${document.category} ${document.fileName ?? ""}`).includes("договор")) || (input.documentChecklist ?? []).some((item) => normalize(`${item.key} ${item.title}`).includes("договор")));
  if (source === "Acceptance") return Boolean((input.scheduleItems ?? []).length || (input.budgetItems ?? []).length);
  if (source === "Reports") return Boolean((input.dailyReports ?? []).length);
  return Boolean(input.readiness || input.intelligence);
}

export function buildRiskSummary(risks: RiskItem[], input: RiskExecutiveInput): RiskSummary {
  const openRisks = risks.filter((riskItem) => riskItem.status !== "mitigated" && riskItem.status !== "informational");
  const missingSources = (["ВОР", "Documents", "Procurement", "Schedule", "Cashflow", "Contract"] as SourceArea[]).filter((source) => !sourcePresent(input, source));
  const categoryCounts = new Map<RiskCategory, number>();
  const sourceCounts = new Map<SourceArea, number>();
  for (const item of openRisks) {
    categoryCounts.set(item.category, (categoryCounts.get(item.category) ?? 0) + 1);
    sourceCounts.set(item.sourceArea, (sourceCounts.get(item.sourceArea) ?? 0) + 1);
  }
  const critical = openRisks.filter((item) => item.severity === "critical").length;
  const high = openRisks.filter((item) => item.severity === "high").length;
  const reportReadiness: ReportReadiness = missingSources.length >= 4 ? "no_data" : critical || missingSources.length >= 3 ? "blocked" : high || missingSources.length ? "partial" : openRisks.length ? "partial" : "ready";
  return {
    totalOpen: openRisks.length,
    critical,
    high,
    medium: openRisks.filter((item) => item.severity === "medium").length,
    low: openRisks.filter((item) => item.severity === "low").length,
    decisionRequired: openRisks.filter((item) => item.decisionRequired).length,
    blockedExecution: openRisks.filter((item) => item.status === "blocked" || item.severity === "critical").length,
    dataQuality: openRisks.filter((item) => item.category === "data_quality" || item.category === "import").length,
    byCategory: Array.from(categoryCounts.entries()).map(([category, count]) => ({ category, count })),
    bySource: Array.from(sourceCounts.entries()).map(([sourceArea, count]) => ({ sourceArea, count })),
    missingSources,
    reportReadiness
  };
}

export function buildDecisionRegister(risks: RiskItem[]): DecisionItem[] {
  return risks
    .filter((item) => item.decisionRequired || item.severity === "critical" || item.severity === "high")
    .slice(0, 12)
    .map((item) => ({
      id: `decision:${item.id}`,
      title: item.decisionText ?? `Принять решение: ${item.title}`,
      reason: item.description,
      sourceRiskId: item.id,
      sourceArea: item.sourceArea,
      priority: severityToDecisionPriority(item.severity),
      decisionOwnerRole: item.ownerRole === "unknown" ? "executive" : item.ownerRole,
      requiredBy: item.sourceArea === "Schedule" || item.sourceArea === "Procurement" ? "before execution" : "before executive report",
      options: item.sourceArea === "ВОР"
        ? ["Уточнить данные и отложить отчет", "Принять ВОР как предварительную базу с ограничением"]
        : item.sourceArea === "Procurement"
          ? ["Сформировать заявку сейчас", "Сначала проверить КП/количество"]
          : item.sourceArea === "Acceptance"
            ? ["Выпустить частичную КС", "Сначала закрыть блокеры факта и документов"]
            : ["Назначить владельца решения", "Зафиксировать ограничение в executive report"],
      impact: uniq([
        item.sourceArea === "Schedule" ? "schedule" : null,
        item.sourceArea === "Procurement" ? "procurement" : null,
        item.sourceArea === "Cashflow" || item.sourceArea === "Finance" || item.sourceArea === "Acceptance" ? "cashflow" : null,
        item.sourceArea === "Documents" || item.sourceArea === "Acceptance" ? "documents" : null,
        "reporting"
      ].filter(Boolean) as DecisionItem["impact"]),
      recommendedNextStep: item.suggestedAction
    }));
}

export function buildActionRegister(risks: RiskItem[], decisions: DecisionItem[]): ActionItem[] {
  const linkedDecisionByRisk = new Map(decisions.map((decision) => [decision.sourceRiskId, decision.id]));
  return risks.slice(0, 16).map((item) => ({
    id: `action:${item.id}`,
    title: item.suggestedAction,
    description: item.description,
    priority: actionPriority(item.severity),
    ownerRole: item.ownerRole,
    sourceArea: item.sourceArea,
    dueHint:
      item.sourceArea === "Procurement"
        ? "before_procurement"
        : item.sourceArea === "Schedule"
          ? "before_execution"
          : item.sourceArea === "Documents" || item.sourceArea === "Acceptance"
            ? "before_executive_report"
            : item.severity === "critical"
              ? "today_next"
              : "this_week",
    linkedRiskId: item.id,
    linkedDecisionId: linkedDecisionByRisk.get(item.id),
    status: item.status === "blocked" ? "blocked" : item.severity === "low" ? "informational" : "suggested"
  }));
}

function statusFromSummary(summary: RiskSummary): ExecutiveTone {
  if (summary.reportReadiness === "no_data") return "unknown";
  if (summary.critical || summary.blockedExecution) return "red";
  if (summary.high || summary.reportReadiness === "partial") return "amber";
  if (summary.reportReadiness === "ready" && !summary.missingSources.length) return "green";
  return "unknown";
}

function readinessFromSummary(summary: RiskSummary): ReportReadiness {
  return summary.reportReadiness;
}

function russianStatus(status: ExecutiveTone) {
  if (status === "red") return "красный";
  if (status === "amber") return "желтый";
  if (status === "green") return "зеленый";
  return "не определен";
}

export function buildExecutiveWeeklyReport(input: RiskExecutiveInput, risks: RiskItem[], summary: RiskSummary, decisions: DecisionItem[], actions: ActionItem[]): ExecutiveWeeklyReport {
  const status = statusFromSummary(summary);
  const reportReadiness = readinessFromSummary(summary);
  const topRisks = risks.filter((item) => item.status !== "mitigated").slice(0, 3);
  const topActions = actions.slice(0, 3);
  const projectName = input.project?.name ?? "проект";
  const scheduleModel = buildScheduleCashflowIntelligenceModel({
    project: input.project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    importHistory: input.importHistory ?? []
  });
  const procurementModel = buildProcurementIntelligenceModel({
    projectName,
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    importHistory: input.importHistory ?? []
  });
  const missingText = summary.missingSources.length ? `Не хватает источников: ${summary.missingSources.join(", ")}.` : "Ключевые источники для управленческого отчета присутствуют.";
  const statusReason =
    status === "red"
      ? "есть критичные риски или блокеры исполнения"
      : status === "amber"
        ? "есть высокие риски или частичная готовность данных"
        : status === "green"
          ? "критичных управленческих сигналов по доступным данным нет"
        : "Недостаточно данных для уверенной оценки";

  const sections = [
    { title: "Статус проекта", text: `Статус ${projectName}: ${russianStatus(status)}. Причина: ${statusReason}. ${missingText}` },
    { title: "Работы на ближайший период", text: scheduleModel.executivePlan.thisWeekFocus.join("; ") || "Нет подтвержденного недельного фокуса по графику." },
    { title: "Снабжение", text: procurementModel.candidates.length ? `К заявке снабжения: ${procurementModel.candidates.slice(0, 3).map((item) => item.name).join(", ")}.` : "Критичные кандидаты снабжения по доступным данным не выявлены." },
    { title: "График", text: scheduleModel.readiness.blockers.length ? `Блокеры графика: ${scheduleModel.readiness.blockers.join("; ")}.` : scheduleModel.readiness.nextStep },
    { title: "Финансы / cashflow", text: scheduleModel.summary.peakCashNeed ? `Пиковая потребность cashflow: ${compactMoney(scheduleModel.summary.peakCashNeed)} (${scheduleModel.summary.peakCashWeek}).` : "Пиковая потребность cashflow по текущему черновику не выявлена." },
    { title: "Риски", text: topRisks.length ? topRisks.map((item) => `${item.severity}: ${item.title}`).join("; ") : "Открытых рисков по доступным данным нет, но это не заменяет регулярный риск-ревью." },
    { title: "Решения руководства", text: decisions.length ? decisions.slice(0, 3).map((item) => item.title).join("; ") : "Срочные решения руководства по доступным данным не сформированы." },
    { title: "Следующие действия", text: topActions.length ? topActions.map((item) => item.title).join("; ") : "Обновить исходные данные проекта и повторить риск-анализ." }
  ];

  return {
    status,
    statusReason,
    reportReadiness,
    topRisks,
    topActions,
    decisionsRequiredCount: decisions.length,
    missingData: summary.missingSources,
    sections,
    copyText: sections.map((section) => `${section.title}\n${section.text}`).join("\n\n")
  };
}

export function buildManagementStatusSummary(report: ExecutiveWeeklyReport): ManagementStatusSummary {
  const headline =
    report.status === "red"
      ? "Требуется управленческое решение"
      : report.status === "amber"
        ? "Проект требует внимания"
        : report.status === "green"
          ? "Проект управляем по доступным данным"
          : "Недостаточно данных для статуса";
  return {
    status: report.status,
    headline,
    summary: report.sections[0]?.text ?? "Executive summary не сформирован из-за отсутствия данных.",
    nextManagementAction: report.topActions[0]?.title ?? report.topRisks[0]?.suggestedAction ?? "Обновить данные проекта и повторить анализ."
  };
}

export function buildRiskExecutiveIntelligence(input: RiskExecutiveInput): RiskExecutiveIntelligenceModel {
  const risks = buildProjectRiskRegister(input);
  const summary = buildRiskSummary(risks, input);
  const decisions = buildDecisionRegister(risks);
  const actions = buildActionRegister(risks, decisions);
  const executiveReport = buildExecutiveWeeklyReport(input, risks, summary, decisions, actions);
  const managementSummary = buildManagementStatusSummary(executiveReport);
  return { risks, summary, decisions, actions, executiveReport, managementSummary };
}
