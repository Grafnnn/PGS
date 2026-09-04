import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import type { AiProjectContext } from "./types";

const LIMIT = 8;
const QUERY_LIMIT = 200;

export class AiContextUnavailableError extends Error {
  constructor(message = "Контекст проекта временно недоступен.") {
    super(message);
    this.name = "AiContextUnavailableError";
  }
}

function decimal(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string") return Number(value) || 0;
  if (value && typeof value === "object" && "toNumber" in value && typeof value.toNumber === "function") {
    return value.toNumber();
  }
  return 0;
}

function iso(value: Date | string | null | undefined) {
  if (!value) return "";
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

async function optionalContextQuery<T>(
  query: () => Promise<T>,
  fallback: T,
  limitation: string,
  limitations: string[]
) {
  try {
    return await query();
  } catch {
    limitations.push(limitation);
    return fallback;
  }
}

function daysUntil(dateValue: string) {
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return Number.POSITIVE_INFINITY;
  return Math.ceil((date.getTime() - Date.now()) / 86_400_000);
}

function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

const emptyExpenses: AiProjectContext["expenses"] = {
  count: 0,
  total: 0,
  unclassified: 0,
  recognitionPending: 0,
  topCategories: []
};

const emptyWorkforce: AiProjectContext["workforce"] = {
  demandCount: 0,
  plannedHours: 0,
  peakHeadcount: 0,
  missingProductivityNorms: 0,
  missingSalaryRates: 0,
  assignmentCount: 0,
  assignedHeadcount: 0,
  pendingAdmissions: 0
};

const emptyQuality: AiProjectContext["quality"] = {
  inspectionCount: 0,
  inspectionsDue: 0,
  openIssueCount: 0,
  criticalOrHighIssues: 0,
  acceptanceBlockers: 0,
  overdueIssues: 0,
  missingOwners: 0,
  missingCorrectiveActions: 0,
  topIssues: []
};

const emptyCollaboration: AiProjectContext["collaboration"] = {
  openRfis: 0,
  overdueRfis: 0,
  unansweredRfis: 0,
  openSubmittals: 0,
  overdueSubmittals: 0
};

const emptyCommercial: AiProjectContext["commercial"] = {
  changeOrderCount: 0,
  pendingChangeOrders: 0,
  changeOrderExposure: 0,
  unpricedChangeOrders: 0,
  scheduleImpactDays: 0,
  commitmentCount: 0,
  activeCommitmentValue: 0,
  unmatchedInvoices: 0,
  overdueInvoices: 0
};

const emptyAcceptance: AiProjectContext["acceptance"] = {
  applicationCount: 0,
  draftApplications: 0,
  submittedApplications: 0,
  approvedApplications: 0,
  netAmount: 0
};

const emptyControls: AiProjectContext["controls"] = {
  periodAvailable: false,
  dataDate: "",
  earnedValue: 0,
  actualCost: 0,
  costPerformanceIndex: null,
  schedulePerformanceIndex: null,
  estimateAtCompletion: null,
  varianceAtCompletion: null,
  scheduleVarianceDays: null
};

const emptyCloseout: AiProjectContext["closeout"] = {
  packageCount: 0,
  openPackages: 0,
  overduePackages: 0,
  requiredChecklistItems: 0,
  incompleteChecklistItems: 0,
  warrantyCount: 0,
  warrantiesMissingDates: 0
};

async function loadExpenseContext(projectId: string, limitations: string[]) {
  const rows = await optionalContextQuery(
    () => prisma.projectExpense.findMany({
      where: { projectId },
      orderBy: { expenseDate: "desc" },
      take: QUERY_LIMIT,
      select: { category: true, grossAmount: true, recognitionStatus: true, costCodeId: true }
    }),
    [],
    "Реестр расходов временно недоступен.",
    limitations
  );
  const categories = new Map<string, { amount: number; count: number }>();
  for (const row of rows) {
    const key = row.category?.trim() || "Без статьи";
    const current = categories.get(key) ?? { amount: 0, count: 0 };
    current.amount += decimal(row.grossAmount);
    current.count += 1;
    categories.set(key, current);
  }
  return {
    count: rows.length,
    total: rows.reduce((sum, row) => sum + decimal(row.grossAmount), 0),
    unclassified: rows.filter((row) => !row.costCodeId || !row.category?.trim()).length,
    recognitionPending: rows.filter((row) => ["pending", "processing", "needs_review"].includes(row.recognitionStatus)).length,
    topCategories: Array.from(categories.entries())
      .map(([category, value]) => ({ category, ...value }))
      .sort((left, right) => right.amount - left.amount)
      .slice(0, LIMIT)
  } satisfies AiProjectContext["expenses"];
}

async function loadWorkforceContext(projectId: string, limitations: string[]) {
  const [demands, assignments, pendingAdmissions] = await Promise.all([
    optionalContextQuery(
      () => prisma.projectLaborDemand.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { plannedHours: true, peakHeadcount: true, productivityNorm: true, grossMonthlySalary: true }
      }),
      [],
      "Потребность в рабочей силе временно недоступна.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectResourceAssignment.findMany({
        where: { projectId, status: { notIn: ["cancelled", "closed"] } },
        take: QUERY_LIMIT,
        select: { resource: { select: { headcount: true } } }
      }),
      [],
      "Назначения ресурсов временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.workforceAdmissionRequest.count({ where: { projectId, status: { in: ["draft", "submitted", "pending"] } } }),
      0,
      "Заявки на допуск временно недоступны.",
      limitations
    )
  ]);
  return {
    demandCount: demands.length,
    plannedHours: demands.reduce((sum, row) => sum + decimal(row.plannedHours), 0),
    peakHeadcount: demands.reduce((sum, row) => sum + decimal(row.peakHeadcount), 0),
    missingProductivityNorms: demands.filter((row) => decimal(row.productivityNorm) <= 0).length,
    missingSalaryRates: demands.filter((row) => decimal(row.grossMonthlySalary) <= 0).length,
    assignmentCount: assignments.length,
    assignedHeadcount: assignments.reduce((sum, row) => sum + row.resource.headcount, 0),
    pendingAdmissions
  } satisfies AiProjectContext["workforce"];
}

async function loadQualityContext(projectId: string, limitations: string[]) {
  const [inspections, issues] = await Promise.all([
    optionalContextQuery(
      () => prisma.projectQualityInspection.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, scheduledAt: true }
      }),
      [],
      "Инспекции качества временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectQualityIssue.findMany({
        where: { projectId, status: { notIn: ["closed", "void"] } },
        orderBy: [{ acceptanceBlocker: "desc" }, { dueAt: "asc" }],
        take: QUERY_LIMIT,
        select: { id: true, title: true, severity: true, status: true, dueAt: true, responsibleParty: true, correctiveAction: true, acceptanceBlocker: true }
      }),
      [],
      "Замечания качества временно недоступны.",
      limitations
    )
  ]);
  const now = Date.now();
  const isOverdue = (value: Date | null) => Boolean(value && value.getTime() < now);
  return {
    inspectionCount: inspections.length,
    inspectionsDue: inspections.filter((row) => row.status !== "closed" && isOverdue(row.scheduledAt)).length,
    openIssueCount: issues.length,
    criticalOrHighIssues: issues.filter((row) => ["critical", "high"].includes(row.severity)).length,
    acceptanceBlockers: issues.filter((row) => row.acceptanceBlocker).length,
    overdueIssues: issues.filter((row) => isOverdue(row.dueAt)).length,
    missingOwners: issues.filter((row) => !row.responsibleParty?.trim()).length,
    missingCorrectiveActions: issues.filter((row) => !row.correctiveAction?.trim()).length,
    topIssues: issues.slice(0, LIMIT).map((row) => ({
      id: row.id,
      title: row.title,
      severity: row.severity,
      status: row.status,
      dueAt: iso(row.dueAt),
      responsibleParty: row.responsibleParty ?? "",
      acceptanceBlocker: row.acceptanceBlocker
    }))
  } satisfies AiProjectContext["quality"];
}

async function loadCollaborationContext(projectId: string, limitations: string[]) {
  const [rfis, submittals] = await Promise.all([
    optionalContextQuery(
      () => prisma.projectRfi.findMany({ where: { projectId }, take: QUERY_LIMIT, select: { status: true, dueAt: true, answeredAt: true } }),
      [],
      "RFI временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectSubmittal.findMany({ where: { projectId }, take: QUERY_LIMIT, select: { status: true, dueAt: true } }),
      [],
      "Согласования материалов временно недоступны.",
      limitations
    )
  ]);
  const now = Date.now();
  const openStatuses = new Set(["draft", "open", "sent", "submitted", "under_review", "pending"]);
  return {
    openRfis: rfis.filter((row) => openStatuses.has(row.status)).length,
    overdueRfis: rfis.filter((row) => openStatuses.has(row.status) && row.dueAt && row.dueAt.getTime() < now).length,
    unansweredRfis: rfis.filter((row) => openStatuses.has(row.status) && !row.answeredAt).length,
    openSubmittals: submittals.filter((row) => openStatuses.has(row.status)).length,
    overdueSubmittals: submittals.filter((row) => openStatuses.has(row.status) && row.dueAt && row.dueAt.getTime() < now).length
  } satisfies AiProjectContext["collaboration"];
}

async function loadCommercialContext(projectId: string, limitations: string[]) {
  const [changeOrders, commitments, applications, invoices] = await Promise.all([
    optionalContextQuery(
      () => prisma.projectChangeOrder.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, estimatedAmount: true, proposedAmount: true, submittedAmount: true, approvedAmount: true, scheduleImpactDays: true }
      }),
      [],
      "Изменения и претензии временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectCommitment.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, lines: { select: { scheduledValue: true } } }
      }),
      [],
      "Договорные обязательства временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectPaymentApplication.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, netAmount: true }
      }),
      [],
      "Платежные приложения временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectInvoice.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, matchStatus: true, dueDate: true }
      }),
      [],
      "Счета проекта временно недоступны.",
      limitations
    )
  ]);
  const pendingStatuses = new Set(["draft", "potential", "submitted", "under_review", "pending"]);
  const now = Date.now();
  const exposure = (row: (typeof changeOrders)[number]) => Math.max(decimal(row.approvedAmount), decimal(row.submittedAmount), decimal(row.proposedAmount), decimal(row.estimatedAmount));
  const commercial: AiProjectContext["commercial"] = {
    changeOrderCount: changeOrders.length,
    pendingChangeOrders: changeOrders.filter((row) => pendingStatuses.has(row.status)).length,
    changeOrderExposure: changeOrders.reduce((sum, row) => sum + exposure(row), 0),
    unpricedChangeOrders: changeOrders.filter((row) => exposure(row) <= 0).length,
    scheduleImpactDays: changeOrders.reduce((sum, row) => sum + Math.max(0, row.scheduleImpactDays), 0),
    commitmentCount: commitments.length,
    activeCommitmentValue: commitments
      .filter((row) => !["rejected", "void", "terminated"].includes(row.status))
      .reduce((sum, row) => sum + row.lines.reduce((lineSum, line) => lineSum + decimal(line.scheduledValue), 0), 0),
    unmatchedInvoices: invoices.filter((row) => row.matchStatus === "unmatched").length,
    overdueInvoices: invoices.filter((row) => row.status !== "paid" && row.dueDate.getTime() < now).length
  };
  const acceptance: AiProjectContext["acceptance"] = {
    applicationCount: applications.length,
    draftApplications: applications.filter((row) => row.status === "draft").length,
    submittedApplications: applications.filter((row) => ["submitted", "under_review"].includes(row.status)).length,
    approvedApplications: applications.filter((row) => ["approved", "paid"].includes(row.status)).length,
    netAmount: applications.reduce((sum, row) => sum + decimal(row.netAmount), 0)
  };
  return { commercial, acceptance };
}

async function loadControlsContext(projectId: string, limitations: string[]) {
  const period = await optionalContextQuery(
    () => prisma.projectControlPeriod.findFirst({
      where: { projectId, status: { not: "void" } },
      orderBy: { dataDate: "desc" },
      select: {
        dataDate: true,
        earnedValue: true,
        actualCost: true,
        costPerformanceIndex: true,
        schedulePerformanceIndex: true,
        estimateAtCompletion: true,
        varianceAtCompletion: true,
        scheduleVarianceDays: true
      }
    }),
    null,
    "Последний период проектного контроля временно недоступен.",
    limitations
  );
  if (!period) return emptyControls;
  return {
    periodAvailable: true,
    dataDate: iso(period.dataDate),
    earnedValue: decimal(period.earnedValue),
    actualCost: decimal(period.actualCost),
    costPerformanceIndex: period.costPerformanceIndex === null ? null : decimal(period.costPerformanceIndex),
    schedulePerformanceIndex: period.schedulePerformanceIndex === null ? null : decimal(period.schedulePerformanceIndex),
    estimateAtCompletion: period.estimateAtCompletion === null ? null : decimal(period.estimateAtCompletion),
    varianceAtCompletion: period.varianceAtCompletion === null ? null : decimal(period.varianceAtCompletion),
    scheduleVarianceDays: period.scheduleVarianceDays
  } satisfies AiProjectContext["controls"];
}

async function loadCloseoutContext(projectId: string, limitations: string[]) {
  const [packages, warranties] = await Promise.all([
    optionalContextQuery(
      () => prisma.projectCloseoutPackage.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { status: true, dueAt: true, checklistItems: { select: { required: true, status: true } } }
      }),
      [],
      "Пакеты сдачи временно недоступны.",
      limitations
    ),
    optionalContextQuery(
      () => prisma.projectWarrantyObligation.findMany({
        where: { projectId },
        take: QUERY_LIMIT,
        select: { startsAt: true, endsAt: true }
      }),
      [],
      "Гарантийные обязательства временно недоступны.",
      limitations
    )
  ]);
  const now = Date.now();
  const checklist = packages.flatMap((row) => row.checklistItems);
  return {
    packageCount: packages.length,
    openPackages: packages.filter((row) => !["closed", "accepted", "void"].includes(row.status)).length,
    overduePackages: packages.filter((row) => !["closed", "accepted", "void"].includes(row.status) && row.dueAt && row.dueAt.getTime() < now).length,
    requiredChecklistItems: checklist.filter((row) => row.required).length,
    incompleteChecklistItems: checklist.filter((row) => row.required && !["complete", "completed", "accepted"].includes(row.status)).length,
    warrantyCount: warranties.length,
    warrantiesMissingDates: warranties.filter((row) => !row.startsAt || !row.endsAt).length
  } satisfies AiProjectContext["closeout"];
}

export async function buildAiProjectContext(projectId: string): Promise<AiProjectContext> {
  const databaseAvailable = Boolean(process.env.DATABASE_URL);
  const dataLimitations: string[] = [];
  let bundle;
  if (databaseAvailable) {
    try {
      bundle = await getProjectBundleFromDb(projectId);
    } catch {
      throw new AiContextUnavailableError();
    }
    if (!bundle) throw new AiContextUnavailableError("Проект не найден или недоступен для AI-анализа.");
  } else {
    bundle = getProjectBundle(projectId);
  }
  const documents = databaseAvailable
    ? await optionalContextQuery(
        () => prisma.document
          .findMany({ where: { projectId }, orderBy: { createdAt: "desc" }, take: LIMIT })
          .then((items) => items.map(serializeDocument)),
        [],
        "Метаданные документов временно недоступны.",
        dataLimitations
      )
    : [];
  const supplierQuotes = databaseAvailable
    ? await optionalContextQuery(
        () => prisma.supplierQuote
          .findMany({ where: { projectId }, include: { supplier: true }, orderBy: { createdAt: "desc" }, take: LIMIT })
          .then((items) =>
            items.map((item) => ({
              id: item.id,
              material: item.material,
              supplier: item.supplier.name,
              price: Number(item.price),
              deliveryDays: item.deliveryDays,
              vatIncluded: item.vatIncluded
            }))
          ),
        [],
        "КП поставщиков временно недоступны.",
        dataLimitations
      )
    : [];
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const works = workTotals(bundle.scheduleItems);
  const materials = materialTotals(bundle.materials);
  const finance = financeTotals(bundle.payments);

  const sectionMap = new Map<string, { forecastCost: number; items: number }>();
  for (const item of bundle.budgetItems) {
    const current = sectionMap.get(item.section) ?? { forecastCost: 0, items: 0 };
    current.forecastCost += item.qty * item.forecastUnitPrice;
    current.items += 1;
    sectionMap.set(item.section, current);
  }

  const duplicateMap = new Map<string, { name: string; count: number; sections: Set<string> }>();
  for (const item of bundle.budgetItems) {
    const key = normalizeName(item.name);
    const current = duplicateMap.get(key) ?? { name: item.name, count: 0, sections: new Set<string>() };
    current.count += 1;
    current.sections.add(item.section);
    duplicateMap.set(key, current);
  }

  const quoteMaterials = new Set(supplierQuotes.map((quote) => normalizeName(quote.material)));
  const paidIncoming = bundle.payments.filter((payment) => payment.direction === "incoming" && payment.status === "paid").reduce((total, payment) => total + payment.amount, 0);
  const paidOutgoing = bundle.payments.filter((payment) => payment.direction === "outgoing" && payment.status === "paid").reduce((total, payment) => total + payment.amount, 0);
  let expenses: AiProjectContext["expenses"] = emptyExpenses;
  let workforce: AiProjectContext["workforce"] = emptyWorkforce;
  let quality: AiProjectContext["quality"] = emptyQuality;
  let collaboration: AiProjectContext["collaboration"] = emptyCollaboration;
  let commercial: AiProjectContext["commercial"] = emptyCommercial;
  let acceptance: AiProjectContext["acceptance"] = emptyAcceptance;
  let controls: AiProjectContext["controls"] = emptyControls;
  let closeout: AiProjectContext["closeout"] = emptyCloseout;

  if (databaseAvailable) {
    const extended = await Promise.all([
      loadExpenseContext(projectId, dataLimitations),
      loadWorkforceContext(projectId, dataLimitations),
      loadQualityContext(projectId, dataLimitations),
      loadCollaborationContext(projectId, dataLimitations),
      loadCommercialContext(projectId, dataLimitations),
      loadControlsContext(projectId, dataLimitations),
      loadCloseoutContext(projectId, dataLimitations)
    ]);
    expenses = extended[0];
    workforce = extended[1];
    quality = extended[2];
    collaboration = extended[3];
    commercial = extended[4].commercial;
    acceptance = extended[4].acceptance;
    controls = extended[5];
    closeout = extended[6];
  }

  const field: AiProjectContext["field"] = {
    reportCount: bundle.dailyReports.length,
    drafts: bundle.dailyReports.filter((report) => report.phase === "open" || report.status === "draft").length,
    reportsWithIssues: bundle.dailyReports.filter((report) => Boolean(report.issues?.trim() || report.downtime?.trim())).length,
    reportsWithoutPhotos: bundle.dailyReports.filter((report) => !(report.evidenceDocuments?.length ?? 0)).length,
    reportsWithoutProgress: bundle.dailyReports.filter((report) => !report.progressImpact?.applied).length
  };

  if (bundle.budgetItems.length > LIMIT) dataLimitations.push(`ВОР ограничена top-${LIMIT} проблемных/агрегированных позиций.`);
  if (bundle.scheduleItems.length > LIMIT) dataLimitations.push(`График ограничен top-${LIMIT} работ.`);
  if (bundle.materials.length > LIMIT) dataLimitations.push(`Материалы ограничены top-${LIMIT} критичных позиций.`);
  if (!supplierQuotes.length) dataLimitations.push("КП поставщиков не найдены или не подключены к контексту: AI не подтверждает рыночные цены.");
  dataLimitations.push("Документы анализируются по метаданным: OCR/извлеченный текст пока не подключены.");

  return {
    project: {
      id: bundle.project.id,
      name: bundle.project.name,
      customer: bundle.project.customer,
      object: bundle.project.object,
      address: bundle.project.address,
      status: bundle.project.status,
      manager: bundle.project.manager,
      contractAmount: bundle.project.contractAmount,
      startsAt: bundle.project.startsAt,
      endsAt: bundle.project.endsAt
    },
    budget: {
      itemCount: bundle.budgetItems.length,
      totalPlannedCost: budget.totalPlannedCost,
      totalActualCost: budget.totalActualCost,
      totalForecastCost: budget.totalForecastCost,
      forecastProfit: budget.forecastProfit,
      forecastMarginPercent: budget.forecastMarginPercent,
      zeroPrices: bundle.budgetItems.filter((item) => item.plannedUnitPrice <= 0 || item.forecastUnitPrice <= 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, section: item.section })),
      zeroQty: bundle.budgetItems.filter((item) => item.qty <= 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, section: item.section })),
      missingUnits: bundle.budgetItems.filter((item) => !item.unit?.trim()).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, section: item.section })),
      duplicateNames: Array.from(duplicateMap.values())
        .filter((item) => item.count > 1)
        .map((item) => ({ name: item.name, count: item.count, sections: Array.from(item.sections).slice(0, LIMIT) }))
        .slice(0, LIMIT),
      largeItems: bundle.budgetItems
        .map((item) => {
          const amount = item.qty * item.forecastUnitPrice;
          return { id: item.id, name: item.name, section: item.section, amount, sharePercent: bundle.project.contractAmount ? (amount / bundle.project.contractAmount) * 100 : 0 };
        })
        .filter((item) => item.sharePercent >= 8)
        .sort((left, right) => right.amount - left.amount)
        .slice(0, LIMIT),
      suspicious: bundle.budgetItems
        .filter((item) => item.qty * item.forecastUnitPrice > bundle.project.contractAmount * 0.12 || item.forecastUnitPrice > item.plannedUnitPrice * 1.15)
        .slice(0, LIMIT)
        .map((item) => ({ id: item.id, name: item.name, section: item.section, reason: item.forecastUnitPrice > item.plannedUnitPrice * 1.15 ? "Прогнозная цена выше плановой более чем на 15%" : "Крупная доля в договорной сумме" })),
      sections: Array.from(sectionMap.entries())
        .map(([name, value]) => ({ name, ...value }))
        .sort((left, right) => right.forecastCost - left.forecastCost)
        .slice(0, LIMIT)
    },
    schedule: {
      itemCount: bundle.scheduleItems.length,
      completionPercent: works.completionPercent,
      delayed: bundle.scheduleItems.filter((item) => item.status === "delayed").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, owner: item.owner, endsAt: item.endsAt, dependency: item.dependency })),
      upcoming: bundle.scheduleItems.filter((item) => {
        const days = daysUntil(item.startsAt);
        return days >= 0 && days <= 14 && item.status !== "done";
      }).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, owner: item.owner, startsAt: item.startsAt, endsAt: item.endsAt })),
      missingOwners: bundle.scheduleItems.filter((item) => !item.owner).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name })),
      missingDates: bundle.scheduleItems.filter((item) => !item.startsAt || !item.endsAt).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, owner: item.owner }))
    },
    materials: {
      itemCount: bundle.materials.length,
      deficit: materials.deficitItems.slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, unit: item.unit, shortage: item.requiredQty - item.orderedQty, neededAt: item.neededAt, supplier: item.supplier })),
      dueSoon: bundle.materials.filter((item) => {
        const days = daysUntil(item.neededAt);
        return days >= 0 && days <= 7 && item.status !== "closed";
      }).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, neededAt: item.neededAt, status: item.status })),
      overBudget: bundle.materials.filter((item) => item.actualUnitPrice > item.plannedUnitPrice && item.actualUnitPrice > 0).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, plannedUnitPrice: item.plannedUnitPrice, actualUnitPrice: item.actualUnitPrice })),
      missingSupplier: bundle.materials.filter((item) => !item.supplier || item.supplier === "Не выбран").slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name }))
    },
    procurement: {
      active: bundle.procurementRequests.filter((item) => item.status !== "closed" && item.status !== "rejected").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, status: item.status, priority: item.priority, neededAt: item.neededAt })),
      critical: bundle.procurementRequests.filter((item) => item.priority === "critical" || item.priority === "high").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, priority: item.priority, neededAt: item.neededAt })),
      supplierQuotes,
      materialsWithoutQuotes: bundle.materials.filter((item) => !quoteMaterials.has(normalizeName(item.name))).slice(0, LIMIT).map((item) => ({ id: item.id, name: item.name, supplier: item.supplier }))
    },
    finance: {
      paymentCount: bundle.payments.length,
      incomingPayments: finance.incomingPayments,
      outgoingPayments: finance.outgoingPayments,
      cashGap: finance.cashGap,
      financingNeed: finance.financingNeed,
      paidIncoming,
      unpaidIncoming: Math.max(finance.incomingPayments - paidIncoming, 0),
      paidOutgoing,
      unpaidOutgoing: Math.max(finance.outgoingPayments - paidOutgoing, 0),
      overdue: bundle.payments.filter((item) => item.status === "overdue").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, amount: item.amount, plannedAt: item.plannedAt }))
    },
    risks: bundle.risks.filter((item) => item.status !== "closed").slice(0, LIMIT).map((item) => ({ id: item.id, title: item.title, priority: item.priority, status: item.status, owner: item.owner, dueAt: item.dueAt, reason: item.reason })),
    documents: documents.map((item) => ({ id: item.id, title: item.fileName ?? item.title, category: item.category, mimeType: item.mimeType, uploadedAt: item.uploadedAt ?? item.createdAt, previewAvailable: item.previewAvailable })),
    dailyReports: bundle.dailyReports.slice(0, LIMIT).map((item) => ({ id: item.id, date: item.date, author: item.author, completedWorks: item.completedWorks, issues: item.issues, status: item.status, workers: item.workers, engineers: item.engineers })),
    expenses,
    workforce,
    field,
    quality,
    collaboration,
    commercial,
    acceptance,
    controls,
    closeout,
    dataLimitations
  };
}
