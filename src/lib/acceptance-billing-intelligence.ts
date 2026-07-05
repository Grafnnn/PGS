import { buildDocumentComplianceIntelligence } from "@/lib/document-compliance-intelligence";
import { buildScheduleCashflowIntelligenceModel, type ScheduleCashflowImportHistoryItem } from "@/lib/schedule-cashflow-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type AcceptanceBillingTone = "good" | "warn" | "bad" | "info" | "neutral";
export type AcceptanceBillingStatus = "no_data" | "needs_fact" | "needs_documents" | "blocked" | "partial_ready" | "ready_for_review";
export type AcceptanceItemStatus = "ready" | "blocked" | "needs_fact" | "needs_documents" | "needs_review";
export type AcceptanceBlockerKind = "quantity" | "price" | "fact" | "documents" | "risk" | "schedule" | "procurement";
export type AcceptanceOwnerRole = "project_manager" | "pto" | "finance" | "site_engineer" | "procurement" | "executive";

export type AcceptanceBillingImportHistoryItem = ScheduleCashflowImportHistoryItem;

export type AcceptanceBlocker = {
  kind: AcceptanceBlockerKind;
  message: string;
  ownerRole: AcceptanceOwnerRole;
};

export type AcceptanceBillingItem = {
  id: string;
  title: string;
  section: string;
  source: "schedule" | "budget";
  sourceId: string;
  unit: string;
  plannedQty: number;
  completedQty: number;
  billableQty: number;
  unitPrice: number;
  contractAmount: number;
  billableAmount: number;
  status: AcceptanceItemStatus;
  blockers: AcceptanceBlocker[];
  warnings: string[];
  evidence: string[];
  suggestedAction: string;
};

export type AcceptancePackageDraft = {
  title: string;
  status: AcceptanceBillingStatus;
  periodLabel: string;
  readyItems: AcceptanceBillingItem[];
  blockedItems: AcceptanceBillingItem[];
  totalReadyAmount: number;
  totalBlockedAmount: number;
  requiredDocuments: string[];
  customerSubmissionChecklist: string[];
  limitations: string[];
};

export type AcceptanceBillingRisk = {
  id: string;
  title: string;
  severity: "low" | "medium" | "high" | "critical";
  description: string;
  suggestedAction: string;
  ownerRole: AcceptanceOwnerRole;
  evidence: string[];
};

export type AcceptanceBillingAction = {
  id: string;
  title: string;
  detail: string;
  priority: "low" | "medium" | "high" | "urgent";
  ownerRole: AcceptanceOwnerRole;
  targetTab: "КС" | "Документы" | "График" | "Финансы" | "Риски" | "Материалы";
};

export type AcceptanceCashflowImpact = {
  readyToInvoice: number;
  blockedBilling: number;
  paidByCustomer: number;
  plannedCustomerReceipts: number;
  outstandingAfterReadyBilling: number;
  note: string;
};

export type AcceptanceBillingSummary = {
  status: AcceptanceBillingStatus;
  tone: AcceptanceBillingTone;
  candidateItems: number;
  readyItems: number;
  blockedItems: number;
  readyAmount: number;
  blockedAmount: number;
  contractScopeAmount: number;
  completedAmount: number;
  missingFactItems: number;
  documentBlockers: number;
  riskBlockers: number;
  procurementBlockers: number;
  readinessLabel: string;
  nextStep: string;
};

export type AcceptanceBillingIntelligenceInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
  importHistory?: AcceptanceBillingImportHistoryItem[] | null;
  today?: string;
};

export type AcceptanceBillingIntelligenceModel = {
  summary: AcceptanceBillingSummary;
  items: AcceptanceBillingItem[];
  packageDraft: AcceptancePackageDraft;
  cashflowImpact: AcceptanceCashflowImpact;
  risks: AcceptanceBillingRisk[];
  actions: AcceptanceBillingAction[];
  executiveSummary: {
    title: string;
    text: string;
    limitations: string[];
  };
};

const blockedStatuses = new Set(["delayed", "stopped"]);

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function compactMoney(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 1_000_000_000) return `${(safe / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (abs >= 1_000_000) return `${(safe / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safe).toLocaleString("ru-RU")} ₽`;
}

function readableDate(value?: string) {
  if (!value) return "дата не задана";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function amount(qty: number, price: number) {
  return Math.max(qty, 0) * Math.max(price, 0);
}

function unitPrice(item?: BudgetItem) {
  if (!item) return 0;
  return item.actualUnitPrice > 0 ? item.actualUnitPrice : item.forecastUnitPrice > 0 ? item.forecastUnitPrice : item.plannedUnitPrice;
}

function billableQty(completedQty: number, plannedQty: number) {
  if (completedQty <= 0) return 0;
  if (plannedQty <= 0) return completedQty;
  return Math.min(completedQty, plannedQty);
}

function sectionKey(value: string) {
  return normalize(value).replace(/[^a-zа-я0-9]+/gi, "-") || "section";
}

function blocker(kind: AcceptanceBlockerKind, message: string, ownerRole: AcceptanceOwnerRole): AcceptanceBlocker {
  return { kind, message, ownerRole };
}

function statusFromBlockers(itemBlockers: AcceptanceBlocker[], completedQty: number): AcceptanceItemStatus {
  if (itemBlockers.some((item) => item.kind === "fact")) return "needs_fact";
  if (itemBlockers.some((item) => item.kind === "documents")) return "needs_documents";
  if (itemBlockers.length) return "blocked";
  if (completedQty <= 0) return "needs_fact";
  return "ready";
}

function matchDocumentsByPackageId(packageId: string, section: string, docMap: ReturnType<typeof buildDocumentComplianceIntelligence>["workPackageMap"]) {
  const byId = docMap.find((item) => item.id === packageId);
  if (byId) return byId;
  const normalizedSection = normalize(section);
  return docMap.find((item) => normalize(item.sourceSection) === normalizedSection || normalize(item.title) === normalizedSection);
}

function procurementBlockers(section: string, materials: Material[], procurementRequests: ProcurementRequest[]) {
  const value = normalize(section);
  const activeRequestNames = new Set(
    procurementRequests
      .filter((request) => !["closed", "rejected"].includes(request.status))
      .flatMap((request) => request.items.map((item) => normalize(item.name)))
  );
  return materials.filter((material) => {
    const name = normalize(material.name);
    const related =
      (/монолит|бетон|армат|фундамент|плита/.test(value) && /бетон|армат/.test(name)) ||
      (/сети|труб|канал|вод|электр|кабель/.test(value) && /труб|пнд|кабель|электр/.test(name)) ||
      (/землян|котлован|грунт/.test(value) && /песок|щеб|грунт/.test(name)) ||
      (/кров|изоляц/.test(value) && /гидро|мембран|утепл/.test(name));
    const deficit = material.requiredQty > Math.max(material.deliveredQty, material.orderedQty);
    return related && deficit && !activeRequestNames.has(name);
  });
}

function buildScheduleItems(input: AcceptanceBillingIntelligenceInput, documentModel: ReturnType<typeof buildDocumentComplianceIntelligence>) {
  const budgetById = new Map((input.budgetItems ?? []).map((item) => [item.id, item]));
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const globalRiskBlockers = (input.risks ?? []).filter((risk) => risk.status !== "closed" && (risk.priority === "critical" || risk.priority === "high"));

  return (input.scheduleItems ?? []).map<AcceptanceBillingItem>((schedule) => {
    const budgetItem = schedule.budgetItemId ? budgetById.get(schedule.budgetItemId) : undefined;
    const plannedQty = schedule.plannedQty > 0 ? schedule.plannedQty : budgetItem?.qty ?? 0;
    const completedQty = Math.max(schedule.actualQty, 0);
    const price = unitPrice(budgetItem);
    const section = budgetItem?.section ?? schedule.name;
    const packageDocs = matchDocumentsByPackageId(schedule.id, section, documentModel.workPackageMap);
    const missingDocs = packageDocs?.blockingDocs ?? [];
    const materialBlockers = procurementBlockers(section, materials, procurementRequests);
    const blockers = [
      ...(plannedQty <= 0 ? [blocker("quantity", "Не задан плановый объем для закрытия.", "pto")] : []),
      ...(price <= 0 ? [blocker("price", "Не задана цена ВОР/прогнозная цена.", "finance")] : []),
      ...(completedQty <= 0 ? [blocker("fact", "Нет подтвержденного фактического объема.", "site_engineer")] : []),
      ...missingDocs.slice(0, 3).map((doc) => blocker("documents", `Не закрыт документ: ${doc}.`, "pto")),
      ...(blockedStatuses.has(schedule.status) ? [blocker("schedule", `Работа в статусе ${schedule.status}.`, "project_manager")] : []),
      ...materialBlockers.slice(0, 2).map((material) => blocker("procurement", `Материал не закрыт снабжением: ${material.name}.`, "procurement")),
      ...globalRiskBlockers.slice(0, 2).map((risk) => blocker("risk", `Открыт риск ${risk.priority}: ${risk.title}.`, "project_manager"))
    ];
    const qty = billableQty(completedQty, plannedQty);
    const itemStatus = statusFromBlockers(blockers, completedQty);
    return {
      id: `schedule:${schedule.id}`,
      title: schedule.name,
      section,
      source: "schedule",
      sourceId: schedule.id,
      unit: budgetItem?.unit ?? "",
      plannedQty,
      completedQty,
      billableQty: qty,
      unitPrice: price,
      contractAmount: amount(plannedQty || budgetItem?.qty || 0, price),
      billableAmount: amount(qty, price),
      status: itemStatus,
      blockers,
      warnings: [
        schedule.actualQty > schedule.plannedQty && schedule.plannedQty > 0 ? "Факт превышает плановый объем, нужна проверка ПТО." : "",
        !schedule.budgetItemId ? "Работа не привязана к позиции ВОР." : ""
      ].filter(Boolean),
      evidence: [`График: ${readableDate(schedule.startsAt)} - ${readableDate(schedule.endsAt)}`, `Статус: ${schedule.status}`, `Ответственный: ${schedule.owner}`],
      suggestedAction:
        itemStatus === "ready"
          ? "Проверить строку в проекте КС и включить в пакет на согласование."
          : blockers[0]?.message ?? "Проверить исходные данные по работе."
    };
  });
}

function buildBudgetOnlyItems(input: AcceptanceBillingIntelligenceInput, existingSourceIds: Set<string>, documentModel: ReturnType<typeof buildDocumentComplianceIntelligence>) {
  const materials = input.materials ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const globalRiskBlockers = (input.risks ?? []).filter((risk) => risk.status !== "closed" && (risk.priority === "critical" || risk.priority === "high"));

  return (input.budgetItems ?? [])
    .filter((item) => item.kind !== "material" && !existingSourceIds.has(item.id))
    .map<AcceptanceBillingItem>((item) => {
      const price = unitPrice(item);
      const packageId = `budget-section:${sectionKey(item.section)}`;
      const packageDocs = matchDocumentsByPackageId(packageId, item.section, documentModel.workPackageMap);
      const missingDocs = packageDocs?.blockingDocs ?? [];
      const materialBlockers = procurementBlockers(item.section, materials, procurementRequests);
      const blockers = [
        ...(item.qty <= 0 ? [blocker("quantity", "В позиции ВОР не задан объем.", "pto")] : []),
        ...(price <= 0 ? [blocker("price", "В позиции ВОР не задана цена.", "finance")] : []),
        blocker("fact", "Нет фактического объема из графика/рапорта для закрытия.", "site_engineer"),
        ...missingDocs.slice(0, 2).map((doc) => blocker("documents", `Не закрыт документ: ${doc}.`, "pto")),
        ...materialBlockers.slice(0, 2).map((material) => blocker("procurement", `Материал не закрыт снабжением: ${material.name}.`, "procurement")),
        ...globalRiskBlockers.slice(0, 1).map((risk) => blocker("risk", `Открыт риск ${risk.priority}: ${risk.title}.`, "project_manager"))
      ];
      return {
        id: `budget:${item.id}`,
        title: item.name,
        section: item.section,
        source: "budget",
        sourceId: item.id,
        unit: item.unit,
        plannedQty: item.qty,
        completedQty: 0,
        billableQty: 0,
        unitPrice: price,
        contractAmount: amount(item.qty, price),
        billableAmount: 0,
        status: "needs_fact",
        blockers,
        warnings: [],
        evidence: [`ВОР: ${item.code || item.section}`, `Источник: ${item.source}`],
        suggestedAction: "Зафиксировать фактический объем через график/рапорт перед включением в КС."
      };
    });
}

function summaryStatus(input: {
  hasData: boolean;
  readyItems: number;
  blockedItems: number;
  missingFactItems: number;
  documentBlockers: number;
  riskBlockers: number;
  procurementBlockers: number;
}): AcceptanceBillingStatus {
  if (!input.hasData) return "no_data";
  if (!input.readyItems && input.missingFactItems) return "needs_fact";
  if (!input.readyItems && input.documentBlockers) return "needs_documents";
  if (!input.readyItems && (input.riskBlockers || input.procurementBlockers || input.blockedItems)) return "blocked";
  if (input.readyItems && input.blockedItems) return "partial_ready";
  if (input.readyItems) return "ready_for_review";
  return "needs_fact";
}

function toneFromStatus(status: AcceptanceBillingStatus): AcceptanceBillingTone {
  if (status === "ready_for_review") return "good";
  if (status === "partial_ready" || status === "needs_documents") return "warn";
  if (status === "blocked") return "bad";
  if (status === "needs_fact") return "info";
  return "neutral";
}

function readinessLabel(status: AcceptanceBillingStatus) {
  const labels: Record<AcceptanceBillingStatus, string> = {
    no_data: "нет данных",
    needs_fact: "нужен факт",
    needs_documents: "нужны документы",
    blocked: "заблокировано",
    partial_ready: "частично готово",
    ready_for_review: "готово к проверке"
  };
  return labels[status];
}

function buildRisks(summary: AcceptanceBillingSummary, items: AcceptanceBillingItem[]): AcceptanceBillingRisk[] {
  const risks: AcceptanceBillingRisk[] = [];
  if (summary.missingFactItems) {
    risks.push({
      id: "acceptance:missing-fact",
      title: "Нет подтвержденного факта для КС",
      severity: summary.readyItems ? "medium" : "high",
      description: `${summary.missingFactItems} позиций нельзя закрывать без фактического объема.`,
      suggestedAction: "ПТО/площадке нужно подтвердить объемы через график, рапорт или акт.",
      ownerRole: "pto",
      evidence: items.filter((item) => item.status === "needs_fact").slice(0, 3).map((item) => item.title)
    });
  }
  if (summary.documentBlockers) {
    risks.push({
      id: "acceptance:document-blockers",
      title: "Документы блокируют закрытие",
      severity: "high",
      description: `${summary.documentBlockers} документальных блокеров мешают КС/закрытию.`,
      suggestedAction: "Собрать исполнительные схемы, акты скрытых работ, сертификаты и фотофиксацию по блокирующим пакетам.",
      ownerRole: "pto",
      evidence: items.flatMap((item) => item.blockers.filter((blockerItem) => blockerItem.kind === "documents").map((blockerItem) => `${item.title}: ${blockerItem.message}`)).slice(0, 4)
    });
  }
  if (summary.riskBlockers) {
    risks.push({
      id: "acceptance:risk-blockers",
      title: "Открытые риски требуют решения до предъявления",
      severity: "high",
      description: `${summary.riskBlockers} рисковых блокеров попали в пакет закрытия.`,
      suggestedAction: "РП должен подтвердить, можно ли предъявлять объемы при открытых рисках.",
      ownerRole: "project_manager",
      evidence: items.flatMap((item) => item.blockers.filter((blockerItem) => blockerItem.kind === "risk").map((blockerItem) => `${item.title}: ${blockerItem.message}`)).slice(0, 4)
    });
  }
  if (summary.procurementBlockers) {
    risks.push({
      id: "acceptance:procurement-blockers",
      title: "Материалы/снабжение мешают закрытию",
      severity: "medium",
      description: `${summary.procurementBlockers} снабженческих блокеров требуют проверки перед КС.`,
      suggestedAction: "Проверить поставку, сертификаты и закрывающие документы по материалам.",
      ownerRole: "procurement",
      evidence: items.flatMap((item) => item.blockers.filter((blockerItem) => blockerItem.kind === "procurement").map((blockerItem) => `${item.title}: ${blockerItem.message}`)).slice(0, 4)
    });
  }
  return risks;
}

function buildActions(summary: AcceptanceBillingSummary, packageDraft: AcceptancePackageDraft, risks: AcceptanceBillingRisk[]): AcceptanceBillingAction[] {
  const actions: AcceptanceBillingAction[] = [];
  if (summary.readyItems) {
    actions.push({
      id: "acceptance:review-ready-package",
      title: "Проверить проект КС",
      detail: `${summary.readyItems} позиций на ${compactMoney(summary.readyAmount)} готовы к проверке ПТО/РП.`,
      priority: summary.blockedItems ? "high" : "medium",
      ownerRole: "pto",
      targetTab: "КС"
    });
  }
  if (summary.documentBlockers) {
    actions.push({
      id: "acceptance:collect-docs",
      title: "Закрыть документы к КС",
      detail: packageDraft.requiredDocuments.slice(0, 3).join("; ") || "Проверить исполнительный комплект.",
      priority: "urgent",
      ownerRole: "pto",
      targetTab: "Документы"
    });
  }
  if (summary.missingFactItems) {
    actions.push({
      id: "acceptance:confirm-fact",
      title: "Подтвердить фактические объемы",
      detail: `${summary.missingFactItems} позиций ждут факт от площадки/графика.`,
      priority: summary.readyItems ? "medium" : "high",
      ownerRole: "site_engineer",
      targetTab: "График"
    });
  }
  if (summary.procurementBlockers) {
    actions.push({
      id: "acceptance:procurement-proof",
      title: "Сверить материалы и сертификаты",
      detail: `${summary.procurementBlockers} блокеров снабжения нужно закрыть до предъявления.`,
      priority: "medium",
      ownerRole: "procurement",
      targetTab: "Материалы"
    });
  }
  for (const risk of risks.slice(0, 3)) {
    actions.push({
      id: `acceptance:risk-action:${risk.id}`,
      title: risk.suggestedAction,
      detail: risk.description,
      priority: risk.severity === "critical" ? "urgent" : risk.severity,
      ownerRole: risk.ownerRole,
      targetTab: "Риски"
    });
  }
  return actions.slice(0, 8);
}

export function buildAcceptanceBillingIntelligence(input: AcceptanceBillingIntelligenceInput): AcceptanceBillingIntelligenceModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const payments = input.payments ?? [];
  const documentModel = buildDocumentComplianceIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments,
    risks: input.risks ?? [],
    documents: input.documents ?? [],
    documentChecklist: input.documentChecklist ?? [],
    importHistory: input.importHistory ?? []
  });
  const scheduleModel = buildScheduleCashflowIntelligenceModel({
    project,
    budgetItems,
    scheduleItems,
    materials: input.materials ?? [],
    procurementRequests: input.procurementRequests ?? [],
    payments,
    importHistory: input.importHistory ?? [],
    today: input.today
  });
  const scheduledBudgetIds = new Set(scheduleItems.map((item) => item.budgetItemId).filter(Boolean) as string[]);
  const scheduleAcceptanceItems = buildScheduleItems(input, documentModel);
  const budgetOnlyItems = buildBudgetOnlyItems(input, scheduledBudgetIds, documentModel);
  const items = [...scheduleAcceptanceItems, ...budgetOnlyItems].sort((left, right) => {
    const rank: Record<AcceptanceItemStatus, number> = { ready: 0, needs_documents: 1, blocked: 2, needs_fact: 3, needs_review: 4 };
    return rank[left.status] - rank[right.status] || left.section.localeCompare(right.section, "ru");
  });
  const readyItems = items.filter((item) => item.status === "ready");
  const blockedItems = items.filter((item) => item.status !== "ready");
  const documentBlockers = items.reduce((sum, item) => sum + item.blockers.filter((blockerItem) => blockerItem.kind === "documents").length, 0);
  const riskBlockers = items.reduce((sum, item) => sum + item.blockers.filter((blockerItem) => blockerItem.kind === "risk").length, 0);
  const procurementBlockerCount = items.reduce((sum, item) => sum + item.blockers.filter((blockerItem) => blockerItem.kind === "procurement").length, 0);
  const missingFactItems = items.filter((item) => item.blockers.some((blockerItem) => blockerItem.kind === "fact")).length;
  const hasData = budgetItems.length > 0 || scheduleItems.length > 0 || (input.importHistory ?? []).some((item) => item.preview);
  const readyAmount = readyItems.reduce((sum, item) => sum + item.billableAmount, 0);
  const blockedAmount = blockedItems.reduce((sum, item) => sum + item.billableAmount, 0);
  const completedAmount = items.reduce((sum, item) => sum + item.billableAmount, 0);
  const contractScopeAmount = budgetItems.filter((item) => item.kind !== "material").reduce((sum, item) => sum + amount(item.qty, unitPrice(item)), 0);
  const status = summaryStatus({
    hasData,
    readyItems: readyItems.length,
    blockedItems: blockedItems.length,
    missingFactItems,
    documentBlockers,
    riskBlockers,
    procurementBlockers: procurementBlockerCount
  });
  const summary: AcceptanceBillingSummary = {
    status,
    tone: toneFromStatus(status),
    candidateItems: items.length,
    readyItems: readyItems.length,
    blockedItems: blockedItems.length,
    readyAmount,
    blockedAmount,
    contractScopeAmount,
    completedAmount,
    missingFactItems,
    documentBlockers,
    riskBlockers,
    procurementBlockers: procurementBlockerCount,
    readinessLabel: readinessLabel(status),
    nextStep:
      status === "ready_for_review"
        ? "Проверить пакет и отправить на согласование."
        : status === "partial_ready"
          ? "Отделить готовые строки КС от блокеров и закрыть документы/факт."
          : status === "needs_documents"
            ? "Собрать документы, блокирующие КС."
            : status === "needs_fact"
              ? "Подтвердить фактические объемы."
              : status === "blocked"
                ? "Снять рисковые и снабженческие блокеры."
                : "Загрузить ВОР/график и подтвердить фактическое выполнение."
  };
  const packageDraft: AcceptancePackageDraft = {
    title: `Проект КС / предъявления: ${project.name ?? "проект"}`,
    status,
    periodLabel: input.today ? `на ${readableDate(input.today)}` : scheduleModel.timeline[0]?.label ?? "текущий период не задан",
    readyItems,
    blockedItems,
    totalReadyAmount: readyAmount,
    totalBlockedAmount: blockedAmount,
    requiredDocuments: Array.from(
      new Set([
        ...documentModel.closeoutReadiness.requiredReportPackage,
        ...blockedItems.flatMap((item) => item.blockers.filter((blockerItem) => blockerItem.kind === "documents").map((blockerItem) => blockerItem.message.replace(/^Не закрыт документ: /, "").replace(/\.$/, "")))
      ])
    ).slice(0, 10),
    customerSubmissionChecklist: [
      "Реестр выполненных объемов",
      "Черновик КС-2 / ведомость объемов",
      "КС-3 / справка стоимости",
      "Исполнительная документация по закрываемым работам",
      "Фотофиксация и подтверждение факта",
      "Список ограничений и незакрытых блокеров"
    ],
    limitations: [
      "Официальные печатные формы КС-2/КС-3 не формируются в этом MVP.",
      "Сумма к предъявлению считается только из фактических объемов и доступной цены.",
      documentBlockers ? `Документальные блокеры: ${documentBlockers}.` : "",
      riskBlockers ? `Открытые риски: ${riskBlockers}.` : "",
      procurementBlockerCount ? `Снабженческие блокеры: ${procurementBlockerCount}.` : ""
    ].filter(Boolean)
  };
  const customerIncoming = payments.filter((payment) => payment.direction === "incoming" && payment.category === "customer");
  const paidByCustomer = customerIncoming.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const plannedCustomerReceipts = customerIncoming.filter((payment) => payment.status !== "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const cashflowImpact: AcceptanceCashflowImpact = {
    readyToInvoice: readyAmount,
    blockedBilling: blockedAmount,
    paidByCustomer,
    plannedCustomerReceipts,
    outstandingAfterReadyBilling: Math.max(readyAmount - plannedCustomerReceipts, 0),
    note: readyAmount
      ? `Потенциальное предъявление ${compactMoney(readyAmount)}. Проверьте график поступлений заказчика.`
      : "Нет подтвержденной суммы к предъявлению; cashflow не должен считать ее поступлением."
  };
  const risks = buildRisks(summary, items);
  const actions = buildActions(summary, packageDraft, risks);
  const executiveSummary = {
    title: "КС / Acceptance & Billing Workflow",
    text:
      status === "ready_for_review"
        ? `К предъявлению готово ${compactMoney(readyAmount)} по ${readyItems.length} позициям.`
        : status === "partial_ready"
          ? `Частично готово ${compactMoney(readyAmount)}, заблокировано ${compactMoney(blockedAmount)}.`
          : status === "no_data"
            ? "Нет данных ВОР/графика для расчета КС."
            : `КС пока не готова: ${summary.nextStep}`,
    limitations: packageDraft.limitations
  };

  return { summary, items, packageDraft, cashflowImpact, risks, actions, executiveSummary };
}
