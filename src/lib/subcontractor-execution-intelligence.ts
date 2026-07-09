import { buildAcceptanceBillingIntelligence } from "@/lib/acceptance-billing-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Payment, Project, ProjectDocument, ProcurementRequest, Risk, ScheduleItem } from "@/lib/types";

export type ExecutionTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ExecutionStatus = "no_data" | "needs_assignment" | "blocked" | "at_risk" | "controlled";
export type ExecutionPriority = "low" | "medium" | "high";

export type ContractorExecutionCard = {
  name: string;
  role: "subcontractor" | "team" | "internal";
  tone: ExecutionTone;
  readiness: string;
  plannedItems: number;
  activeItems: number;
  doneItems: number;
  delayedItems: number;
  stoppedItems: number;
  budgetAmount: number;
  paidAmount: number;
  overdueAmount: number;
  documentBlockers: number;
  riskCount: number;
  latestReport?: string;
  nextAction: string;
};

export type ExecutionFront = {
  id: string;
  title: string;
  owner: string;
  tone: ExecutionTone;
  status: string;
  progress: number;
  plannedQty: number;
  actualQty: number;
  budgetAmount: number;
  blockers: string[];
  nextAction: string;
};

export type ExecutionAction = {
  title: string;
  detail: string;
  ownerRole: "РП" | "ПТО" | "Снабжение" | "Финансы" | "ИТР";
  priority: ExecutionPriority;
  targetTab: "Исполнение" | "График" | "Материалы" | "Документы" | "КС" | "Финансы" | "Риски";
};

export type ExecutionHandoff = {
  title: string;
  copyText: string;
  blockers: string[];
};

export type SubcontractorExecutionSummary = {
  status: ExecutionStatus;
  tone: ExecutionTone;
  headline: string;
  nextStep: string;
  contractorCount: number;
  activeFronts: number;
  delayedFronts: number;
  unassignedItems: number;
  subcontractBudget: number;
  paidToSubcontractors: number;
  overduePayments: number;
  documentBlockers: number;
  riskCount: number;
};

export type SubcontractorExecutionInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  payments?: Payment[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  dailyReports?: DailyReport[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
};

export type SubcontractorExecutionModel = {
  summary: SubcontractorExecutionSummary;
  contractors: ContractorExecutionCard[];
  fronts: ExecutionFront[];
  actions: ExecutionAction[];
  handoff: ExecutionHandoff;
  limitations: string[];
};

function money(value: number) {
  const safeValue = Number.isFinite(value) ? value : 0;
  if (Math.abs(safeValue) >= 1_000_000) return `${(safeValue / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safeValue).toLocaleString("ru-RU")} ₽`;
}

function progress(plannedQty: number, actualQty: number) {
  if (!plannedQty || plannedQty <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((actualQty / plannedQty) * 100)));
}

function budgetAmount(item?: BudgetItem) {
  if (!item) return 0;
  const unitPrice = item.forecastUnitPrice || item.plannedUnitPrice || item.actualUnitPrice || 0;
  return Math.max(0, item.qty * unitPrice);
}

function normalizedOwner(value: string | undefined) {
  const source = value?.trim();
  if (!source) return "Не назначен";
  return source;
}

function ownerRole(name: string): ContractorExecutionCard["role"] {
  const lower = name.toLowerCase();
  if (/подряд|суб|sub|ооо|ип|зао|ао/.test(lower)) return "subcontractor";
  if (/рп|пто|итр|прораб|мастер|инженер/.test(lower)) return "internal";
  return "team";
}

function frontTone(item: ScheduleItem, blockers: string[]): ExecutionTone {
  if (item.status === "delayed" || item.status === "stopped" || blockers.length >= 2) return "bad";
  if (item.status === "in_progress" || blockers.length) return "warn";
  if (item.status === "done") return "good";
  return "info";
}

function isSubcontractDocument(document: ProjectDocument) {
  const text = `${document.category} ${document.title} ${document.fileName ?? ""}`.toLowerCase();
  return /подряд|суб|исполн|акт|кс|договор/.test(text);
}

function isBlockingDocument(item: DocumentChecklistItem) {
  return item.status !== "present" && /акт|кс|исполн|сертифик|паспорт|журнал|схем|договор|подряд/i.test(`${item.title} ${item.suggestedNextStep ?? ""}`);
}

function sortByPriority<T extends { tone: ExecutionTone }>(items: T[]) {
  const rank: Record<ExecutionTone, number> = { bad: 4, warn: 3, info: 2, neutral: 1, good: 0 };
  return [...items].sort((left, right) => (rank[right.tone] ?? 0) - (rank[left.tone] ?? 0));
}

function makeAction(title: string, detail: string, ownerRole: ExecutionAction["ownerRole"], priority: ExecutionPriority, targetTab: ExecutionAction["targetTab"]): ExecutionAction {
  return { title, detail, ownerRole, priority, targetTab };
}

export function buildSubcontractorExecutionIntelligence(input: SubcontractorExecutionInput): SubcontractorExecutionModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const payments = input.payments ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const reports = input.dailyReports ?? [];
  const risks = input.risks ?? [];
  const documents = input.documents ?? [];
  const documentChecklist = input.documentChecklist ?? [];

  const budgetById = new Map(budgetItems.map((item) => [item.id, item]));
  const subcontractBudgetItems = budgetItems.filter((item) => item.kind === "subcontract");
  const subcontractBudget = subcontractBudgetItems.reduce((sum, item) => sum + budgetAmount(item), 0);
  const subcontractPayments = payments.filter((payment) => payment.category === "subcontractor");
  const paidToSubcontractors = subcontractPayments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
  const overduePayments = subcontractPayments.filter((payment) => payment.status === "overdue").reduce((sum, payment) => sum + payment.amount, 0);
  const blockingDocumentCount = documentChecklist.filter(isBlockingDocument).length;
  const subcontractDocuments = documents.filter(isSubcontractDocument);

  const fronts = scheduleItems.map<ExecutionFront>((item) => {
    const owner = normalizedOwner(item.owner);
    const relatedBudget = item.budgetItemId ? budgetById.get(item.budgetItemId) : undefined;
    const blockers: string[] = [];
    if (owner === "Не назначен") blockers.push("Не назначен ответственный/подрядчик.");
    if (item.status === "delayed") blockers.push("Фронт в просрочке.");
    if (item.status === "stopped") blockers.push("Фронт остановлен.");
    if (item.plannedQty > 0 && item.actualQty <= 0 && item.status !== "not_started") blockers.push("Нет подтвержденного факта.");
    if (relatedBudget?.kind === "subcontract" && !subcontractDocuments.length) blockers.push("Нет договора/акта подрядчика в документах.");

    return {
      id: item.id,
      title: item.name,
      owner,
      tone: frontTone(item, blockers),
      status: item.status,
      progress: progress(item.plannedQty, item.actualQty),
      plannedQty: item.plannedQty,
      actualQty: item.actualQty,
      budgetAmount: budgetAmount(relatedBudget),
      blockers,
      nextAction: blockers[0] ?? (item.status === "done" ? "Проверить готовность к КС." : "Подтвердить недельный план и факт.")
    };
  });

  const ownerNames = Array.from(new Set([...fronts.map((item) => item.owner), ...subcontractPayments.map((payment) => payment.counterparty).filter(Boolean)]));
  const contractors = ownerNames.map<ContractorExecutionCard>((name) => {
    const ownerFronts = fronts.filter((front) => front.owner === name);
    const ownerPayments = subcontractPayments.filter((payment) => payment.counterparty === name);
    const ownerRisks = risks.filter((risk) => risk.status !== "closed" && (risk.owner === name || risk.title.toLowerCase().includes(name.toLowerCase())));
    const latestReport = reports.find((report) => report.author === name || report.completedWorks.toLowerCase().includes(name.toLowerCase()) || report.issues.toLowerCase().includes(name.toLowerCase()));
    const delayedItems = ownerFronts.filter((front) => front.status === "delayed").length;
    const stoppedItems = ownerFronts.filter((front) => front.status === "stopped").length;
    const documentBlockers = ownerFronts.reduce((sum, front) => sum + front.blockers.filter((blocker) => /договор|акт|документ/i.test(blocker)).length, 0);
    const paidAmount = ownerPayments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0);
    const overdueAmount = ownerPayments.filter((payment) => payment.status === "overdue").reduce((sum, payment) => sum + payment.amount, 0);
    const tone: ExecutionTone = stoppedItems || delayedItems || overdueAmount || ownerRisks.some((risk) => risk.priority === "critical" || risk.priority === "high")
      ? "bad"
      : documentBlockers || ownerRisks.length || ownerFronts.some((front) => front.status === "in_progress")
        ? "warn"
        : ownerFronts.length
          ? "good"
          : "info";

    return {
      name,
      role: ownerRole(name),
      tone,
      readiness: tone === "bad" ? "нужен контроль" : tone === "warn" ? "в работе" : tone === "good" ? "контролируемо" : "нет фронтов",
      plannedItems: ownerFronts.length,
      activeItems: ownerFronts.filter((front) => front.status === "in_progress").length,
      doneItems: ownerFronts.filter((front) => front.status === "done").length,
      delayedItems,
      stoppedItems,
      budgetAmount: ownerFronts.reduce((sum, front) => sum + front.budgetAmount, 0),
      paidAmount,
      overdueAmount,
      documentBlockers,
      riskCount: ownerRisks.length,
      latestReport: latestReport ? `${latestReport.date}: ${latestReport.issues || latestReport.completedWorks}` : undefined,
      nextAction: overdueAmount
        ? "Сверить просроченные оплаты подрядчика."
        : delayedItems || stoppedItems
          ? "Разобрать причины отклонения и согласовать восстановительный план."
          : documentBlockers
            ? "Закрыть договор/акт/исполнительный комплект."
            : "Подтвердить недельный план и готовность фронта."
    };
  });

  const unassignedItems = fronts.filter((front) => front.owner === "Не назначен").length;
  const delayedFronts = fronts.filter((front) => front.status === "delayed" || front.status === "stopped").length;
  const activeFronts = fronts.filter((front) => front.status === "in_progress").length;
  const activeExecutionRisks = risks.filter((risk) => risk.status !== "closed" && /подряд|исполн|срок|фронт|акт|кс|документ/i.test(`${risk.title} ${risk.reason} ${risk.owner}`));
  const hasExecutionData = scheduleItems.length > 0 || subcontractBudgetItems.length > 0 || subcontractPayments.length > 0 || reports.length > 0;

  const status: ExecutionStatus = !hasExecutionData
    ? "no_data"
    : unassignedItems
      ? "needs_assignment"
      : delayedFronts || overduePayments || blockingDocumentCount
        ? "blocked"
        : activeExecutionRisks.length
          ? "at_risk"
          : "controlled";
  const tone: ExecutionTone = status === "controlled" ? "good" : status === "at_risk" || status === "needs_assignment" ? "warn" : status === "no_data" ? "info" : "bad";
  const headline = status === "controlled" ? "Исполнение контролируемо" : status === "no_data" ? "Нет данных исполнения" : status === "needs_assignment" ? "Нужно назначить исполнителей" : status === "at_risk" ? "Исполнение под риском" : "Есть блокеры исполнения";

  const acceptance = buildAcceptanceBillingIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials: [],
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist
  });

  const actions: ExecutionAction[] = [];
  if (!hasExecutionData) actions.push(makeAction("Назначить исполнителей фронтов", "Добавить график, владельцев работ и подрядные строки ВОР.", "РП", "high", "График"));
  if (unassignedItems) actions.push(makeAction("Назначить ответственных", `${unassignedItems} фронтов без владельца.`, "РП", "high", "График"));
  if (delayedFronts) actions.push(makeAction("Собрать восстановительный план", `${delayedFronts} фронтов задержаны или остановлены.`, "ИТР", "high", "Исполнение"));
  if (blockingDocumentCount) actions.push(makeAction("Закрыть исполнительные документы", `${blockingDocumentCount} документальных блокеров мешают закрытию.`, "ПТО", "high", "Документы"));
  if (overduePayments) actions.push(makeAction("Сверить оплаты подрядчиков", `Просрочено ${money(overduePayments)} по подрядным платежам.`, "Финансы", "medium", "Финансы"));
  if (acceptance.summary.blockedItems) actions.push(makeAction("Сверить КС с исполнением", `${acceptance.summary.blockedItems} позиций КС заблокированы.`, "ПТО", "medium", "КС"));
  if (!actions.length) actions.push(makeAction("Подтвердить недельный план подрядчиков", "Сверить фронты, документы, факт и КС-ready пакет.", "РП", "medium", "Исполнение"));

  const topFronts = sortByPriority(fronts).slice(0, 6);
  const handoffBlockers = [
    ...topFronts.flatMap((front) => front.blockers.map((blocker) => `${front.title}: ${blocker}`)),
    ...activeExecutionRisks.slice(0, 4).map((risk) => `${risk.title}: ${risk.reason}`),
    ...(blockingDocumentCount ? [`Документы: ${blockingDocumentCount} блокеров по исполнительному/КС пакету.`] : [])
  ].slice(0, 8);

  const handoffLines = [
    `Execution control: ${project.name ?? "проект"}`,
    `Статус: ${headline} (${status}). ${contractors.length} исполнителей/владельцев, ${activeFronts} активных фронтов, ${delayedFronts} проблемных.`,
    `Подрядный бюджет: ${money(subcontractBudget)}. Оплачено подрядчикам: ${money(paidToSubcontractors)}. Просрочено: ${money(overduePayments)}.`,
    "",
    "Исполнители:",
    ...(contractors.length ? contractors.slice(0, 6).map((contractor) => `- ${contractor.name}: ${contractor.readiness}; ${contractor.nextAction}`) : ["- Исполнители не определены по доступным данным."]),
    "",
    "Блокеры:",
    ...(handoffBlockers.length ? handoffBlockers.map((item) => `- ${item}`) : ["- Критичных блокеров по доступным данным не выявлено."]),
    "",
    "Следующие действия:",
    ...actions.slice(0, 5).map((action) => `- ${action.ownerRole}: ${action.title}. ${action.detail}`)
  ];

  return {
    summary: {
      status,
      tone,
      headline,
      nextStep: actions[0]?.detail ?? "Проверить фронты и подрядчиков.",
      contractorCount: contractors.length,
      activeFronts,
      delayedFronts,
      unassignedItems,
      subcontractBudget,
      paidToSubcontractors,
      overduePayments,
      documentBlockers: blockingDocumentCount,
      riskCount: activeExecutionRisks.length
    },
    contractors: sortByPriority(contractors).slice(0, 8),
    fronts: topFronts,
    actions,
    handoff: {
      title: `Execution handoff: ${project.name ?? "проект"}`,
      copyText: handoffLines.join("\n"),
      blockers: handoffBlockers
    },
    limitations: [
      "Модель использует владельцев графика, подрядные строки ВОР, платежи, документы, риски и рапорты.",
      "Без отдельного справочника подрядчиков имена исполнителей выводятся из owner/counterparty полей.",
      "Не создает поручения, платежи, КС или документы автоматически."
    ]
  };
}
