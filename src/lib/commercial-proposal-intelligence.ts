import { budgetTotals, workTotals } from "@/lib/calculations";
import { buildContractTenderIntelligence } from "@/lib/contract-tender-intelligence";
import { buildDocumentComplianceIntelligence } from "@/lib/document-compliance-intelligence";
import { buildProcurementIntelligenceModel, type ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import { buildScheduleCashflowIntelligenceModel } from "@/lib/schedule-cashflow-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type ProposalTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ProposalReadinessStatus =
  | "no_data"
  | "needs_vor"
  | "needs_prices"
  | "needs_schedule"
  | "needs_documents"
  | "needs_contract_review"
  | "partial"
  | "ready_for_internal_review"
  | "ready_for_customer_review";

export type ProposalVatMode = "included" | "excluded" | "no_vat" | "unknown";

export type CommercialProposalInput = {
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
  importHistory?: ProcurementImportHistoryItem[] | null;
};

export type ProposalReadiness = {
  status: ProposalReadinessStatus;
  tone: ProposalTone;
  label: string;
  blockers: string[];
  warnings: string[];
  missingData: string[];
  decisionRequired: string[];
  canSendToCustomer: boolean;
};

export type CommercialPriceSummary = {
  totalAmount?: number;
  workAmount?: number;
  materialAmount?: number;
  procurementAmount?: number;
  unknownAmount: number;
  unpricedRowsCount: number;
  vatMode: ProposalVatMode;
  vatPercent?: number;
  vatAmount?: number;
  totalWithVat?: number;
  totalWithoutVat?: number;
  assumptions: string[];
  limitations: string[];
};

export type ProposalScopeSummary = {
  projectName: string;
  customer: string;
  object: string;
  address: string;
  included: string[];
  notConfirmed: string[];
  assumptions: string[];
  volumeChangeNote: string;
  missingScopeRisks: string[];
};

export type WorkMaterialSplit = {
  workCategories: Array<{ label: string; amount: number; count: number }>;
  materialCategories: Array<{ label: string; amount: number; count: number }>;
  unknownRows: Array<{ title: string; reason: string }>;
  skippedRows: string[];
  unpricedRows: Array<{ title: string; section: string }>;
};

export type ProposalScheduleSummary = {
  label: string;
  period: string;
  durationDays?: number;
  plannedItems: number;
  overdueItems: number;
  procurementBlockers: string[];
  limitations: string[];
};

export type ProcurementProposalNotes = {
  readiness: string;
  majorCategories: string[];
  assumptions: string[];
  missingMaterialData: string[];
  certificateNotes: string[];
};

export type ProposalContractRisk = {
  title: string;
  detail: string;
  tone: ProposalTone;
  internalOnly: boolean;
};

export type SubmissionDocumentChecklistItem = {
  title: string;
  status: "ready" | "missing" | "needs_review";
  source: string;
  reason: string;
};

export type CustomerProposalDraft = {
  title: string;
  customerFacingSummary: string;
  scopeSection: string;
  priceSection: string;
  scheduleSection: string;
  materialsSection: string;
  documentsSection: string;
  assumptionsAndExclusions: string;
  risksAndLimitations: string;
  nextSteps: string;
  footerNote: string;
  copyText: string;
};

export type InternalApprovalMemo = {
  decision: "send_now" | "send_after_fixes" | "not_ready";
  title: string;
  financialRisks: string[];
  contractRisks: string[];
  documentBlockers: string[];
  scheduleBlockers: string[];
  recommendedManagementDecision: string;
  missingInputs: string[];
  copyText: string;
};

export type TenderSubmissionChecklist = {
  items: SubmissionDocumentChecklistItem[];
  missingCount: number;
  readyCount: number;
};

export type ProposalAction = {
  title: string;
  detail: string;
  ownerRole: "project_manager" | "finance" | "pto" | "procurement" | "document_controller" | "executive";
  priority: "low" | "medium" | "high";
};

export type CommercialProposalIntelligence = {
  readiness: ProposalReadiness;
  priceSummary: CommercialPriceSummary;
  scopeSummary: ProposalScopeSummary;
  workMaterialSplit: WorkMaterialSplit;
  scheduleSummary: ProposalScheduleSummary;
  procurementNotes: ProcurementProposalNotes;
  contractTenderRisks: ProposalContractRisk[];
  submissionChecklist: TenderSubmissionChecklist;
  customerProposalDraft: CustomerProposalDraft;
  internalApprovalMemo: InternalApprovalMemo;
  actions: ProposalAction[];
  limitations: string[];
};

function compactMoney(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "не рассчитано";
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function dateLabel(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function daysBetween(start?: string, finish?: string) {
  if (!start || !finish) return undefined;
  const startDate = new Date(start);
  const finishDate = new Date(finish);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(finishDate.getTime())) return undefined;
  const days = Math.ceil((finishDate.getTime() - startDate.getTime()) / 86_400_000);
  return days > 0 ? days : undefined;
}

function amountFor(item: BudgetItem, mode: "planned" | "forecast" = "forecast") {
  const price = mode === "planned" ? item.plannedUnitPrice : item.forecastUnitPrice || item.plannedUnitPrice;
  if (item.qty <= 0 || price <= 0) return 0;
  return item.qty * price;
}

function groupBudget(items: BudgetItem[]) {
  const groups = new Map<string, { label: string; amount: number; count: number }>();
  for (const item of items) {
    const key = item.section || item.kind || "Прочее";
    const existing = groups.get(key) ?? { label: key, amount: 0, count: 0 };
    existing.amount += amountFor(item);
    existing.count += 1;
    groups.set(key, existing);
  }
  return Array.from(groups.values()).sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label, "ru"));
}

function vatMode(project: Partial<Project>, documents: ProjectDocument[]): ProposalVatMode {
  if (project.vatMode === "no_vat") return "no_vat";
  if (project.vatMode === "vat") return "included";
  const haystack = documents.map((doc) => `${doc.category} ${doc.title} ${doc.fileName ?? ""}`).join(" ").toLowerCase();
  if (/без\s+ндс/.test(haystack)) return "no_vat";
  if (/ндс/.test(haystack)) return "included";
  return "unknown";
}

function inferVatPercent(documents: ProjectDocument[]) {
  const haystack = documents.map((doc) => `${doc.title} ${doc.fileName ?? ""}`).join(" ");
  const match = haystack.match(/ндс[^\d]{0,20}(\d{1,2})(?:[,.]\d+)?\s*%/i) ?? haystack.match(/(\d{1,2})(?:[,.]\d+)?\s*%\s*ндс/i);
  const value = match?.[1] ? Number(match[1]) : undefined;
  return Number.isFinite(value) ? value : undefined;
}

export function buildCommercialPriceSummary(input: CommercialProposalInput): CommercialPriceSummary {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const documents = input.documents ?? [];
  const budget = budgetTotals(project.contractAmount ?? 0, budgetItems);
  const workItems = budgetItems.filter((item) => item.kind !== "material");
  const materialBudgetItems = budgetItems.filter((item) => item.kind === "material");
  const workAmount = workItems.reduce((sum, item) => sum + amountFor(item), 0);
  const budgetMaterialAmount = materialBudgetItems.reduce((sum, item) => sum + amountFor(item), 0);
  const materialAmount = Math.max(budgetMaterialAmount, materials.reduce((sum, item) => sum + Math.max(item.requiredQty, 0) * Math.max(item.plannedUnitPrice, 0), 0));
  const procurementAmount = procurementRequests.reduce((sum, request) => sum + request.items.reduce((itemSum, item) => {
    const material = materials.find((candidate) => candidate.id === item.materialId);
    return itemSum + Math.max(item.qty, 0) * Math.max(material?.plannedUnitPrice ?? 0, 0);
  }, 0), 0);
  const unpricedRows = budgetItems.filter((item) => item.qty <= 0 || (item.plannedUnitPrice <= 0 && item.forecastUnitPrice <= 0));
  const unknownAmount = Math.max((project.contractAmount ?? 0) - Math.max(budget.totalForecastCost, workAmount + materialAmount), 0);
  const mode = vatMode(project, documents);
  const vatPercent = mode === "no_vat" ? undefined : inferVatPercent(documents) ?? (mode === "included" ? 20 : undefined);
  const totalAmount = project.contractAmount && project.contractAmount > 0 ? project.contractAmount : budget.totalForecastCost || undefined;
  const vatAmount = totalAmount && vatPercent && mode === "included" ? Math.round(totalAmount * (vatPercent / (100 + vatPercent))) : totalAmount && vatPercent && mode === "excluded" ? Math.round(totalAmount * (vatPercent / 100)) : undefined;
  const totalWithoutVat = totalAmount && vatAmount && mode === "included" ? totalAmount - vatAmount : mode === "no_vat" ? totalAmount : undefined;
  const totalWithVat = totalAmount && vatAmount && mode === "excluded" ? totalAmount + vatAmount : mode === "included" || mode === "no_vat" ? totalAmount : undefined;

  return {
    totalAmount,
    workAmount: workAmount || undefined,
    materialAmount: materialAmount || undefined,
    procurementAmount: procurementAmount || undefined,
    unknownAmount,
    unpricedRowsCount: unpricedRows.length,
    vatMode: mode,
    vatPercent,
    vatAmount,
    totalWithVat,
    totalWithoutVat,
    assumptions: [
      totalAmount ? "Сумма КП взята из карточки проекта или прогнозной стоимости ВОР." : "Сумма КП не рассчитана: нет договорной суммы и ВОР.",
      materialAmount ? "Материальная часть рассчитана по ВОР/materials с доступными плановыми ценами." : "Материальная часть не подтверждена отдельными ценами.",
      procurementAmount ? "Заявки снабжения учитываются как справочный сигнал, не как финальная цена." : "КП поставщиков/заявки не формируют отдельную подтвержденную сумму."
    ],
    limitations: [
      ...(!totalAmount ? ["Нет суммы для коммерческого предложения."] : []),
      ...(unpricedRows.length ? [`${unpricedRows.length} строк ВОР без количества или цены не включены как ready.`] : []),
      ...(mode === "unknown" ? ["Режим НДС не подтвержден."] : []),
      ...(unknownAmount > 0 ? ["Есть разница между суммой проекта и расшифровкой ВОР/материалов."] : [])
    ]
  };
}

export function buildWorkMaterialSplit(input: CommercialProposalInput): WorkMaterialSplit {
  const budgetItems = input.budgetItems ?? [];
  const materialItems = budgetItems.filter((item) => item.kind === "material");
  const workItems = budgetItems.filter((item) => item.kind !== "material");
  const unpricedRows = budgetItems
    .filter((item) => item.qty <= 0 || (item.plannedUnitPrice <= 0 && item.forecastUnitPrice <= 0))
    .map((item) => ({ title: item.name || item.code || "Позиция ВОР", section: item.section || "Без раздела" }));
  const unknownRows = budgetItems
    .filter((item) => item.kind === "other" || /unknown|не распозн/i.test(`${item.source} ${item.comment ?? ""}`))
    .map((item) => ({ title: item.name || "Неопознанная строка", reason: item.comment ?? item.source ?? "Требует ручной классификации." }));

  return {
    workCategories: groupBudget(workItems).slice(0, 8),
    materialCategories: groupBudget(materialItems).slice(0, 8),
    unknownRows: unknownRows.slice(0, 12),
    skippedRows: (input.importHistory ?? []).flatMap((item) => item.preview?.unknownRows?.map((row) => `${item.fileName}: ${row.values[0] || row.reason}`) ?? []).slice(0, 12),
    unpricedRows: unpricedRows.slice(0, 12)
  };
}

export function buildScopeSummary(input: CommercialProposalInput): ProposalScopeSummary {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const split = buildWorkMaterialSplit(input);
  const included = Array.from(new Set(budgetItems.map((item) => item.section).filter(Boolean))).slice(0, 8);
  const notConfirmed = [
    ...(!budgetItems.length ? ["Состав работ не подтвержден ВОР/сметой."] : []),
    ...(split.unknownRows.length ? ["Есть строки с неизвестной классификацией."] : []),
    ...(split.unpricedRows.length ? ["Есть позиции без цены/количества."] : [])
  ];
  return {
    projectName: project.name ?? "Проект без названия",
    customer: project.customer ?? "Заказчик не указан",
    object: project.object ?? "Объект не указан",
    address: project.address ?? "Адрес не указан",
    included,
    notConfirmed,
    assumptions: [
      "Состав КП построен по текущим данным проекта и требует ручной проверки перед отправкой.",
      budgetItems.length ? "Разделы scope взяты из ВОР/бюджета." : "Scope должен быть заполнен вручную или через импорт ВОР."
    ],
    volumeChangeNote: input.documents?.some((doc) => /договор|тендер|тз|кп/i.test(`${doc.category} ${doc.title}`))
      ? "Условия изменения объемов нужно сверить с договором/ТЗ."
      : "Условия изменения объемов не подтверждены исходным договором/ТЗ.",
    missingScopeRisks: notConfirmed
  };
}

export function buildVatSummary(input: CommercialProposalInput) {
  const price = buildCommercialPriceSummary(input);
  return {
    mode: price.vatMode,
    percent: price.vatPercent,
    vatAmount: price.vatAmount,
    totalWithVat: price.totalWithVat,
    totalWithoutVat: price.totalWithoutVat,
    limitations: price.limitations.filter((item) => /НДС/i.test(item))
  };
}

export function buildScheduleProposalSummary(input: CommercialProposalInput): ProposalScheduleSummary {
  const project = input.project ?? {};
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const schedule = buildScheduleCashflowIntelligenceModel({
    project,
    budgetItems: input.budgetItems ?? [],
    scheduleItems,
    materials,
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    importHistory: input.importHistory ?? []
  });
  const duration = daysBetween(project.startsAt, project.endsAt);
  const procurementBlockers = materials
    .filter((item) => item.requiredQty > item.orderedQty && item.status !== "closed")
    .slice(0, 5)
    .map((item) => `${item.name}: требуется ${item.requiredQty} ${item.unit}, заказано ${item.orderedQty} ${item.unit}.`);
  return {
    label: schedule.readiness.label,
    period: project.startsAt && project.endsAt ? `${dateLabel(project.startsAt)} - ${dateLabel(project.endsAt)}` : "сроки не подтверждены",
    durationDays: duration,
    plannedItems: scheduleItems.length,
    overdueItems: workTotals(scheduleItems).overdueItems.length,
    procurementBlockers,
    limitations: [
      ...(!scheduleItems.length ? ["График работ не сформирован."] : []),
      ...(!duration ? ["Период исполнения не подтвержден датами проекта."] : []),
      ...(procurementBlockers.length ? ["Есть снабженческие блокеры, влияющие на срок подачи/исполнения."] : [])
    ]
  };
}

export function buildProcurementProposalNotes(input: CommercialProposalInput): ProcurementProposalNotes {
  const procurement = buildProcurementIntelligenceModel({
    projectName: input.project?.name ?? "Проект",
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    importHistory: input.importHistory ?? []
  });
  return {
    readiness: procurement.readiness.label,
    majorCategories: procurement.groupsByCategory.map((item) => `${item.label}: ${compactMoney(item.estimatedTotal)}`).slice(0, 6),
    assumptions: [
      procurement.summary.candidates ? "Материальные потребности построены по текущим material candidates." : "Нет валидных material candidates для подтверждения снабжения.",
      "КП поставщиков и сроки поставки требуют ручной проверки снабжением."
    ],
    missingMaterialData: [
      ...procurement.missingRows.map((item) => `${item.name}: ${item.reason}`),
      ...procurement.warnings
    ].slice(0, 8),
    certificateNotes: procurement.groupsByCategory.length ? ["Для ключевых материалов нужен комплект сертификатов/паспортов качества."] : ["Материальные сертификаты определятся после уточнения номенклатуры."]
  };
}

export function buildContractTenderProposalRisks(input: CommercialProposalInput): ProposalContractRisk[] {
  const contract = buildContractTenderIntelligence({
    project: input.project ?? {},
    budgetItems: input.budgetItems ?? [],
    scheduleItems: input.scheduleItems ?? [],
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments: input.payments ?? [],
    risks: input.risks ?? [],
    documents: input.documents ?? [],
    documentChecklist: input.documentChecklist ?? []
  });
  return [
    ...contract.risks.map((risk) => ({
      title: risk.title,
      detail: risk.description,
      tone: risk.severity === "critical" || risk.severity === "high" ? "bad" as const : risk.severity === "medium" ? "warn" as const : "info" as const,
      internalOnly: risk.category === "payment" || risk.category === "penalty" || risk.category === "cashflow"
    })),
    ...contract.actions.slice(0, 3).map((action) => ({
      title: action.title,
      detail: action.detail,
      tone: action.priority === "urgent" ? "bad" as const : action.priority === "high" ? "warn" as const : "info" as const,
      internalOnly: true
    }))
  ].slice(0, 10);
}

export function buildSubmissionDocumentChecklist(input: CommercialProposalInput): TenderSubmissionChecklist {
  const docs = buildDocumentComplianceIntelligence({
    project: input.project ?? {},
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
  const base: SubmissionDocumentChecklistItem[] = [
    { title: "Коммерческое предложение", status: "needs_review", source: "PGS draft", reason: "Текст КП сформирован как черновик и требует ручной проверки." },
    { title: "Структура цены / ВОР", status: (input.budgetItems ?? []).length ? "needs_review" : "missing", source: "ВОР", reason: (input.budgetItems ?? []).length ? "Есть ВОР/бюджет, требуется сверить цены." : "Нет ВОР/сметы." },
    { title: "График выполнения работ", status: (input.scheduleItems ?? []).length ? "needs_review" : "missing", source: "График", reason: (input.scheduleItems ?? []).length ? "Есть плановые работы." : "Нет графика." },
    { title: "Условия оплаты / НДС", status: buildCommercialPriceSummary(input).vatMode !== "unknown" ? "needs_review" : "missing", source: "Финансы/договор", reason: "Проверить вручную перед подачей." },
    { title: "Карточка компании / реквизиты", status: docs.requiredDocuments.some((item) => /реквизит|карточк/i.test(item.title) && item.status !== "missing") ? "needs_review" : "missing", source: "Документы", reason: "Для тендерной подачи обычно нужен реквизитный блок." },
    { title: "Замечания к договору / ТЗ", status: buildContractTenderProposalRisks(input).length ? "needs_review" : "missing", source: "Договор / Тендер", reason: "Риски должны быть проверены до отправки финального КП." }
  ];
  const clientDocs = docs.requiredDocuments
    .filter((item) => item.requiredFor.includes("client_submission"))
    .slice(0, 8)
    .map<SubmissionDocumentChecklistItem>((item) => ({
      title: item.title,
      status: item.status === "uploaded" || item.status === "verified" ? "ready" : item.status === "missing" || item.status === "needed" ? "missing" : "needs_review",
      source: item.sourceArea,
      reason: item.suggestedAction
    }));
  const items = [...base, ...clientDocs];
  return {
    items,
    missingCount: items.filter((item) => item.status === "missing").length,
    readyCount: items.filter((item) => item.status === "ready").length
  };
}

export function buildProposalReadiness(input: CommercialProposalInput): ProposalReadiness {
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const documents = input.documents ?? [];
  const price = buildCommercialPriceSummary(input);
  const contractRisks = buildContractTenderProposalRisks(input);
  const submission = buildSubmissionDocumentChecklist(input);
  const missingData = [
    ...(!budgetItems.length ? ["ВОР/смета"] : []),
    ...(!price.totalAmount ? ["сумма КП"] : []),
    ...(price.unpricedRowsCount ? ["цены/количества по всем строкам"] : []),
    ...(!scheduleItems.length ? ["график"] : []),
    ...(price.vatMode === "unknown" ? ["режим НДС"] : []),
    ...(!documents.length ? ["исходные документы"] : []),
    ...(submission.missingCount ? ["документы подачи"] : [])
  ];
  const blockers = [
    ...(!budgetItems.length ? ["Нет ВОР/сметы для структуры цены."] : []),
    ...(!price.totalAmount ? ["Нет подтвержденной суммы КП."] : []),
    ...(price.unpricedRowsCount ? [`${price.unpricedRowsCount} строк без цены/количества.`] : []),
    ...(!scheduleItems.length ? ["Нет графика выполнения работ."] : []),
    ...(contractRisks.some((risk) => risk.tone === "bad") ? ["Есть критичные договорные/тендерные риски."] : []),
    ...(submission.missingCount ? [`${submission.missingCount} документов подачи отсутствуют.`] : [])
  ];
  const warnings = [
    ...(price.vatMode === "unknown" ? ["НДС не подтвержден."] : []),
    ...(!documents.length ? ["Нет загруженных документов/ТЗ/договора."] : []),
    ...(contractRisks.length ? ["Риски договора нужно проверить до отправки заказчику."] : [])
  ];
  const decisionRequired = [
    ...(price.unknownAmount > 0 ? ["Подтвердить разницу между суммой проекта и расшифровкой."] : []),
    ...(contractRisks.length ? ["Решение руководителя по договорным рискам."] : []),
    ...(submission.items.some((item) => item.status === "needs_review") ? ["Проверить пакет документов подачи."] : [])
  ];
  const status: ProposalReadinessStatus = !budgetItems.length && !scheduleItems.length && !documents.length
    ? "no_data"
    : !budgetItems.length
      ? "needs_vor"
      : !price.totalAmount || price.unpricedRowsCount
        ? "needs_prices"
        : !scheduleItems.length
          ? "needs_schedule"
          : submission.missingCount
            ? "needs_documents"
            : contractRisks.some((risk) => risk.tone === "bad")
              ? "needs_contract_review"
              : decisionRequired.length
                ? "ready_for_internal_review"
                : "ready_for_customer_review";
  const tone: ProposalTone = status === "ready_for_customer_review" ? "good" : status === "ready_for_internal_review" ? "warn" : status === "no_data" ? "neutral" : "bad";
  const labels: Record<ProposalReadinessStatus, string> = {
    no_data: "Нет данных для КП",
    needs_vor: "Нужен ВОР",
    needs_prices: "Нужны цены",
    needs_schedule: "Нужен график",
    needs_documents: "Нужны документы",
    needs_contract_review: "Нужен contract review",
    partial: "Частично готово",
    ready_for_internal_review: "На внутреннее согласование",
    ready_for_customer_review: "Можно готовить отправку"
  };
  return {
    status,
    tone,
    label: labels[status],
    blockers,
    warnings,
    missingData,
    decisionRequired,
    canSendToCustomer: status === "ready_for_customer_review"
  };
}

export function buildCustomerProposalDraft(input: CommercialProposalInput): CustomerProposalDraft {
  const project = input.project ?? {};
  const price = buildCommercialPriceSummary(input);
  const scope = buildScopeSummary(input);
  const schedule = buildScheduleProposalSummary(input);
  const procurement = buildProcurementProposalNotes(input);
  const risks = buildContractTenderProposalRisks(input).filter((risk) => !risk.internalOnly);
  const submission = buildSubmissionDocumentChecklist(input);
  const missing = buildProposalReadiness(input).missingData;
  const title = `Коммерческое предложение по проекту "${scope.projectName}"`;
  const customerFacingSummary = `Предлагаем рассмотреть выполнение работ по объекту "${scope.object}"${scope.address ? ` по адресу: ${scope.address}` : ""}. Черновик подготовлен на основании данных PGS и требует ручной проверки перед отправкой.`;
  const scopeSection = scope.included.length ? `В состав предложения включены разделы: ${scope.included.join(", ")}.` : "Состав работ не подтвержден ВОР/сметой и должен быть заполнен вручную.";
  const priceSection = `Предварительная сумма: ${compactMoney(price.totalAmount)}. НДС: ${price.vatMode === "no_vat" ? "без НДС" : price.vatMode === "included" ? `включен${price.vatPercent ? `, ${price.vatPercent}%` : ""}` : price.vatMode === "excluded" ? `начисляется отдельно${price.vatPercent ? `, ${price.vatPercent}%` : ""}` : "не подтвержден"}.`;
  const scheduleSection = `Ориентировочный период выполнения: ${schedule.period}${schedule.durationDays ? ` (${schedule.durationDays} дн.)` : ""}. ${schedule.limitations.length ? `Ограничения: ${schedule.limitations.join("; ")}.` : ""}`;
  const materialsSection = `Снабжение: ${procurement.readiness}. ${procurement.majorCategories.length ? `Ключевые категории: ${procurement.majorCategories.join("; ")}.` : "Материальные категории требуют уточнения."}`;
  const documentsSection = `Пакет подачи: готово ${submission.readyCount}, отсутствует ${submission.missingCount}. Документы требуют сверки перед отправкой.`;
  const assumptionsAndExclusions = [...scope.assumptions, ...price.assumptions, ...procurement.assumptions].slice(0, 8).join("\n");
  const risksAndLimitations = [...risks.map((risk) => `${risk.title}: ${risk.detail}`), ...price.limitations, ...missing.map((item) => `Не заполнено: ${item}`)].slice(0, 10).join("\n") || "Критичные ограничения не выявлены по доступным данным, требуется ручная проверка.";
  const nextSteps = "Следующий шаг: проверить исходные данные, подтвердить цену/НДС/сроки и согласовать пакет подачи ответственным руководителем.";
  const footerNote = "Черновик не является финальной офертой или юридическим заключением. Перед отправкой заказчику требуется ручная проверка.";
  const copyText = [title, "", customerFacingSummary, "", "Состав работ:", scopeSection, "", "Цена:", priceSection, "", "Сроки:", scheduleSection, "", "Материалы и снабжение:", materialsSection, "", "Документы:", documentsSection, "", "Допущения и исключения:", assumptionsAndExclusions, "", "Ограничения:", risksAndLimitations, "", nextSteps, "", footerNote].join("\n");
  return {
    title,
    customerFacingSummary,
    scopeSection,
    priceSection,
    scheduleSection,
    materialsSection,
    documentsSection,
    assumptionsAndExclusions,
    risksAndLimitations,
    nextSteps,
    footerNote,
    copyText
  };
}

export function buildInternalApprovalMemo(input: CommercialProposalInput): InternalApprovalMemo {
  const readiness = buildProposalReadiness(input);
  const price = buildCommercialPriceSummary(input);
  const contractRisks = buildContractTenderProposalRisks(input);
  const documents = buildSubmissionDocumentChecklist(input);
  const schedule = buildScheduleProposalSummary(input);
  const decision: InternalApprovalMemo["decision"] = readiness.canSendToCustomer ? "send_now" : readiness.status === "ready_for_internal_review" ? "send_after_fixes" : "not_ready";
  const title = decision === "send_now" ? "КП можно выносить на отправку после финальной проверки" : decision === "send_after_fixes" ? "КП можно отправлять после закрытия замечаний" : "КП не готово к отправке";
  const financialRisks = [
    ...(price.unpricedRowsCount ? [`${price.unpricedRowsCount} строк без цены/количества.`] : []),
    ...(price.vatMode === "unknown" ? ["НДС не подтвержден."] : []),
    ...(price.unknownAmount > 0 ? [`Не расшифровано ${compactMoney(price.unknownAmount)} относительно суммы проекта.`] : [])
  ];
  const contractRiskNotes = contractRisks.filter((risk) => risk.internalOnly || risk.tone === "bad").map((risk) => `${risk.title}: ${risk.detail}`).slice(0, 6);
  const documentBlockers = documents.items.filter((item) => item.status === "missing").map((item) => item.title).slice(0, 8);
  const scheduleBlockers = schedule.limitations;
  const recommendedManagementDecision = decision === "send_now"
    ? "Разрешить подготовку финальной версии КП и сопроводительного письма."
    : decision === "send_after_fixes"
      ? "Закрыть замечания, затем вынести КП на повторное согласование."
      : "Не отправлять КП до заполнения базовых данных.";
  const copyText = [
    title,
    `Решение: ${decision}.`,
    `Рекомендация: ${recommendedManagementDecision}`,
    "",
    "Финансы:",
    financialRisks.join("\n") || "Критичных финансовых блокеров по доступным данным нет.",
    "",
    "Договор/тендер:",
    contractRiskNotes.join("\n") || "Критичных договорных блокеров по доступным данным нет.",
    "",
    "Документы:",
    documentBlockers.join("\n") || "Критичных отсутствующих документов в списке подачи не выявлено.",
    "",
    "Сроки:",
    scheduleBlockers.join("\n") || "Критичных сроковых блокеров по доступным данным нет."
  ].join("\n");
  return {
    decision,
    title,
    financialRisks,
    contractRisks: contractRiskNotes,
    documentBlockers,
    scheduleBlockers,
    recommendedManagementDecision,
    missingInputs: readiness.missingData,
    copyText
  };
}

export function buildTenderSubmissionChecklist(input: CommercialProposalInput) {
  return buildSubmissionDocumentChecklist(input);
}

export function buildProposalActions(input: CommercialProposalInput): ProposalAction[] {
  const readiness = buildProposalReadiness(input);
  const actions: ProposalAction[] = [];
  if (readiness.missingData.includes("ВОР/смета")) actions.push({ title: "Импортировать или проверить ВОР", detail: "Без ВОР нельзя собрать структуру цены.", ownerRole: "pto", priority: "high" });
  if (readiness.missingData.includes("цены/количества по всем строкам")) actions.push({ title: "Заполнить цены и количества", detail: "Нулевые строки не включаются в готовое КП.", ownerRole: "finance", priority: "high" });
  if (readiness.missingData.includes("график")) actions.push({ title: "Подготовить график", detail: "Срок исполнения должен быть подтвержден до подачи.", ownerRole: "project_manager", priority: "medium" });
  if (readiness.missingData.includes("режим НДС")) actions.push({ title: "Подтвердить НДС", detail: "Указать режим НДС и ставку вручную.", ownerRole: "finance", priority: "high" });
  if (readiness.missingData.includes("документы подачи")) actions.push({ title: "Собрать пакет подачи", detail: "Закрыть missing документы и реквизиты.", ownerRole: "document_controller", priority: "medium" });
  for (const item of buildContractTenderProposalRisks(input).slice(0, 3)) {
    actions.push({ title: item.title, detail: item.detail, ownerRole: item.internalOnly ? "executive" : "project_manager", priority: item.tone === "bad" ? "high" : "medium" });
  }
  if (!actions.length) actions.push({ title: "Провести финальную ручную проверку КП", detail: "PGS подготовил draft, но отправка требует проверки ответственным.", ownerRole: "executive", priority: "medium" });
  return actions.slice(0, 10);
}

export function buildProposalLimitations(input: CommercialProposalInput) {
  return Array.from(new Set([
    ...buildCommercialPriceSummary(input).limitations,
    ...buildScheduleProposalSummary(input).limitations,
    ...buildScopeSummary(input).missingScopeRisks,
    ...buildProposalReadiness(input).warnings,
    "PGS не формирует юридически финальную оферту без ручного review."
  ])).slice(0, 12);
}

export function buildCommercialProposalIntelligence(input: CommercialProposalInput): CommercialProposalIntelligence {
  const readiness = buildProposalReadiness(input);
  return {
    readiness,
    priceSummary: buildCommercialPriceSummary(input),
    scopeSummary: buildScopeSummary(input),
    workMaterialSplit: buildWorkMaterialSplit(input),
    scheduleSummary: buildScheduleProposalSummary(input),
    procurementNotes: buildProcurementProposalNotes(input),
    contractTenderRisks: buildContractTenderProposalRisks(input),
    submissionChecklist: buildTenderSubmissionChecklist(input),
    customerProposalDraft: buildCustomerProposalDraft(input),
    internalApprovalMemo: buildInternalApprovalMemo(input),
    actions: buildProposalActions(input),
    limitations: buildProposalLimitations(input)
  };
}
