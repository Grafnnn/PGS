import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { buildWorkforceEconomics } from "@/lib/workforce-capacity";
import type {
  BudgetItem,
  DailyReport,
  Material,
  Payment,
  ProcurementRequest,
  Project,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  Risk,
  ScheduleItem,
  WorkforceResource
} from "@/lib/types";

export type CostForecastTone = "good" | "warn" | "bad" | "info" | "neutral";
export type CostForecastStatus = "no_data" | "needs_baseline" | "attention" | "controlled" | "critical";

export type CostToCompleteInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
  workforceResources?: WorkforceResource[] | null;
  laborDemands?: ProjectLaborDemand[] | null;
  payrollPolicy?: ProjectPayrollPolicy | null;
  dailyReports?: DailyReport[] | null;
  expenseSummary?: {
    count: number;
    grossAmount: number;
    taxAmount: number;
    receipts: number;
    withoutReceipt: number;
    byCategory: Record<string, number>;
  } | null;
};

export type ReportCostProgressItem = {
  key: string;
  name: string;
  unit: string;
  reportedQty: number;
  plannedQty: number;
  completionPercent: number;
  contractUnitPrice: number;
  estimateCost: number;
  earnedEstimateCost: number;
  laborHours: number;
  matched: boolean;
};

export type CostToCompleteModel = {
  summary: {
    status: CostForecastStatus;
    tone: CostForecastTone;
    headline: string;
    nextStep: string;
    contractAmount: number;
    plannedCost: number;
    actualCost: number;
    forecastCost: number;
    costToComplete: number;
    plannedMargin: number;
    forecastMargin: number;
    plannedMarginPercent: number;
    forecastMarginPercent: number;
    forecastDeviation: number;
    completionPercent: number;
    remainingWorkPercent: number;
    cashGap: number;
    financingNeed: number;
    committedOutgoing: number;
    unpaidIncoming: number;
    unpaidOutgoing: number;
    payrollEmployerCost: number;
    payrollUncoveredCost: number;
    payrollContributions: number;
    totalSpent: number;
    expenseRegisterCost: number;
    reportPayrollCost: number;
    unregisteredPayrollCost: number;
    paidOutgoingActual: number;
  };
  reportProgress: {
    approvedReports: number;
    outputRows: number;
    matchedRows: number;
    unmatchedRows: number;
    completionPercent: number;
    matchedEstimateCost: number;
    earnedEstimateCost: number;
    laborHours: number;
    works: ReportCostProgressItem[];
  };
  spending: {
    totalSpent: number;
    expenseRegisterCost: number;
    reportPayrollCost: number;
    payrollAlreadyRegistered: number;
    unregisteredPayrollCost: number;
    paidOutgoingActual: number;
    budgetActualCost: number;
    expenseCount: number;
    receipts: number;
    withoutReceipt: number;
  };
  categories: Array<{ key: string; label: string; planned: number; actual: number; forecast: number; deviation: number; tone: CostForecastTone }>;
  signals: Array<{ id: string; title: string; detail: string; tone: CostForecastTone; targetTab: "Бюджет / ВОР" | "Финансы" | "График" | "Материалы" | "Заявки" | "Риски" | "ФОТ" }>;
  actions: Array<{ title: string; detail: string; ownerRole: "РП" | "Финансовый директор" | "ПТО" | "Снабжение"; priority: "low" | "medium" | "high"; targetTab: "Бюджет / ВОР" | "Финансы" | "График" | "Материалы" | "Заявки" | "Риски" | "ФОТ" }>;
  limitations: string[];
};

const categoryLabels: Record<BudgetItem["kind"], string> = {
  work: "Работы",
  material: "Материалы",
  equipment: "Техника",
  payroll: "ФОТ",
  subcontract: "Субподряд",
  overhead: "Накладные",
  other: "Прочее"
};

function round(value: number) {
  return Number.isFinite(value) ? Math.round(value * 100) / 100 : 0;
}

function percentage(value: number, base: number) {
  return base > 0 ? round((value / base) * 100) : 0;
}

function toneForDeviation(deviation: number, planned: number): CostForecastTone {
  if (planned <= 0) return deviation > 0 ? "warn" : "neutral";
  const share = deviation / planned;
  if (share > 0.1) return "bad";
  if (share > 0.03) return "warn";
  return "good";
}

function normalizedWorkName(value: string) {
  return value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/[№#]/g, " ").replace(/[^a-zа-яё0-9]+/gi, " ").trim();
}

function workNameAliases(value: string) {
  const normalized = normalizedWorkName(value);
  const withoutScheduleIndex = normalized.replace(/^\d+\s+(?=[a-zа-яё])/i, "");
  return [...new Set([normalized, withoutScheduleIndex].filter(Boolean))];
}

function normalizedUnit(value: string) {
  const compact = value.normalize("NFKC").trim().toLocaleLowerCase("ru-RU").replace(/[.,]/g, "").replace(/\s+/g, "");
  if (["m2", "м2", "квм"].includes(compact)) return "м2";
  if (["m3", "м3", "кубм"].includes(compact)) return "м3";
  if (["пм", "мп", "погм"].includes(compact)) return "погм";
  if (["шт", "штука", "штук"].includes(compact)) return "шт";
  if (["ч", "час", "часов"].includes(compact)) return "ч";
  return compact;
}

function reportCostProgress(reports: DailyReport[], scheduleItems: ScheduleItem[], budgetItems: BudgetItem[]) {
  const approvedReports = reports.filter((item) => item.status === "approved" && (item.phase ?? "closed") === "closed");
  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));
  const scheduleByName = new Map(scheduleItems.map((item) => [normalizedWorkName(item.name), item]));
  const eligibleBudget = budgetItems.filter((item) => item.kind === "work" || item.kind === "subcontract");
  const budgetById = new Map(eligibleBudget.map((item) => [item.id, item]));
  const budgetByName = new Map<string, BudgetItem>();
  for (const item of eligibleBudget) {
    const aliases = [
      ...workNameAliases(item.name),
      ...(item.code.trim() ? workNameAliases(`${item.code} ${item.name}`) : [])
    ];
    for (const alias of aliases) {
      const existing = budgetByName.get(alias);
      if (!existing || (existing.plannedUnitPrice <= 0 && item.plannedUnitPrice > 0)) budgetByName.set(alias, item);
    }
  }
  const buckets = new Map<string, ReportCostProgressItem>();
  let outputRows = 0;
  let matchedRows = 0;

  for (const report of approvedReports) {
    for (const output of report.workOutputs ?? []) {
      outputRows += 1;
      const normalizedName = normalizedWorkName(output.workName);
      const schedule = (output.scheduleItemId ? scheduleById.get(output.scheduleItemId) : undefined) ?? scheduleByName.get(normalizedName);
      const linkedBudget = schedule?.budgetItemId ? budgetById.get(schedule.budgetItemId) : undefined;
      const namedBudget = [...workNameAliases(schedule?.name ?? ""), ...workNameAliases(output.workName)]
        .map((alias) => budgetByName.get(alias))
        .find(Boolean);
      const budget = linkedBudget?.plannedUnitPrice ? linkedBudget : namedBudget ?? linkedBudget;
      const compatibleBudget = budget && (!budget.unit || normalizedUnit(budget.unit) === normalizedUnit(output.unit)) ? budget : undefined;
      const matched = Boolean(schedule || compatibleBudget);
      if (matched) matchedRows += 1;
      const key = compatibleBudget ? `budget:${compatibleBudget.id}` : schedule ? `schedule:${schedule.id}` : `unmatched:${normalizedName}:${normalizedUnit(output.unit)}`;
      const plannedQty = Math.max(0, compatibleBudget?.qty ?? schedule?.plannedQty ?? 0);
      const contractUnitPrice = Math.max(0, compatibleBudget?.plannedUnitPrice ?? 0);
      const estimateCost = plannedQty * contractUnitPrice;
      const existing = buckets.get(key);
      if (existing) {
        existing.reportedQty += Math.max(0, output.quantity);
        existing.laborHours += Math.max(0, output.laborHours);
        continue;
      }
      buckets.set(key, {
        key,
        name: compatibleBudget?.name ?? schedule?.name ?? output.workName,
        unit: compatibleBudget?.unit ?? output.unit,
        reportedQty: Math.max(0, output.quantity),
        plannedQty,
        completionPercent: 0,
        contractUnitPrice,
        estimateCost,
        earnedEstimateCost: 0,
        laborHours: Math.max(0, output.laborHours),
        matched
      });
    }
  }

  const works = [...buckets.values()].map((item) => {
    const completionPercent = item.plannedQty > 0 ? item.reportedQty / item.plannedQty * 100 : 0;
    return {
      ...item,
      reportedQty: round(item.reportedQty),
      completionPercent: round(completionPercent),
      estimateCost: round(item.estimateCost),
      earnedEstimateCost: round(item.estimateCost * Math.min(Math.max(completionPercent, 0), 100) / 100),
      laborHours: round(item.laborHours)
    };
  }).sort((left, right) => right.estimateCost - left.estimateCost || right.reportedQty - left.reportedQty);
  const matchedWorks = works.filter((item) => item.matched && item.plannedQty > 0);
  const matchedEstimateCost = matchedWorks.reduce((sum, item) => sum + item.estimateCost, 0);
  const earnedEstimateCost = matchedWorks.reduce((sum, item) => sum + item.earnedEstimateCost, 0);
  const completionPercent = matchedEstimateCost > 0
    ? percentage(earnedEstimateCost, matchedEstimateCost)
    : matchedWorks.length
      ? round(matchedWorks.reduce((sum, item) => sum + Math.min(item.completionPercent, 100), 0) / matchedWorks.length)
      : 0;

  return {
    approvedReports: approvedReports.length,
    outputRows,
    matchedRows,
    unmatchedRows: outputRows - matchedRows,
    completionPercent,
    matchedEstimateCost: round(matchedEstimateCost),
    earnedEstimateCost: round(earnedEstimateCost),
    laborHours: round(works.reduce((sum, item) => sum + item.laborHours, 0)),
    works
  };
}

function reportPayrollCost(reports: DailyReport[], resources: WorkforceResource[], policy: ProjectPayrollPolicy) {
  const resourceById = new Map(resources.map((item) => [item.id, item]));
  const payrollResources = resources.filter((item) => item.kind !== "equipment" && item.employmentType !== "subcontract" && item.status === "active");
  const contributionMultiplier = 1 + (policy.insuranceContributionRate + policy.accidentContributionRate) / 100;
  const employerHourlyCost = (resource: WorkforceResource) => {
    const base = resource.hourlyCost > 0
      ? resource.hourlyCost
      : resource.grossMonthlySalary / Math.max(1, policy.workingHoursPerMonth);
    return Math.max(0, base) * contributionMultiplier;
  };
  const fallbackRates = payrollResources
    .map((item) => ({ rate: employerHourlyCost(item), weight: Math.max(1, item.headcount) }))
    .filter((item) => item.rate > 0);
  const fallbackWeight = fallbackRates.reduce((sum, item) => sum + item.weight, 0);
  const fallbackRate = fallbackWeight > 0 ? fallbackRates.reduce((sum, item) => sum + item.rate * item.weight, 0) / fallbackWeight : 0;

  return round(reports
    .filter((item) => item.status === "approved" && (item.phase ?? "closed") === "closed")
    .reduce((total, report) => {
      const crewRates = (report.crewMembers ?? []).flatMap((member) => {
        const resource = resourceById.get(member.resourceId);
        if (!resource || resource.kind === "equipment" || resource.employmentType === "subcontract") return [];
        const rate = employerHourlyCost(resource);
        return rate > 0 ? [{ rate, weight: Math.max(1, member.headcount) }] : [];
      });
      const weight = crewRates.reduce((sum, item) => sum + item.weight, 0);
      const hourlyRate = weight > 0 ? crewRates.reduce((sum, item) => sum + item.rate * item.weight, 0) / weight : fallbackRate;
      const structuredLabor = (report.workOutputs ?? []).reduce((sum, item) => sum + Math.max(0, item.laborHours), 0);
      const laborHours = structuredLabor > 0 ? structuredLabor : Math.max(0, report.workers + report.engineers) * Math.max(0, report.shiftHours ?? 8);
      return total + laborHours * hourlyRate;
    }, 0));
}

export function buildCostToCompleteIntelligence(input: CostToCompleteInput): CostToCompleteModel {
  const project = input.project ?? {};
  const budgetItems = input.budgetItems ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const payments = input.payments ?? [];
  const procurementRequests = input.procurementRequests ?? [];
  const risks = input.risks ?? [];
  const contractAmount = Math.max(project.contractAmount ?? 0, 0);
  const budget = budgetTotals(contractAmount, budgetItems);
  const workforce = buildWorkforceEconomics({
    resources: input.workforceResources ?? [],
    demands: input.laborDemands ?? [],
    policy: input.payrollPolicy,
    budgetItems,
    contractAmount
  });
  const work = workTotals(scheduleItems);
  const reportProgress = reportCostProgress(input.dailyReports ?? [], scheduleItems, budgetItems);
  const materialsStats = materialTotals(materials);
  const finance = financeTotals(payments);
  const expenseSummary = input.expenseSummary;
  const expenseRegisterCost = Math.max(0, expenseSummary?.grossAmount ?? 0);
  const payrollAlreadyRegistered = Math.max(0, (expenseSummary?.byCategory.labor ?? 0) + (expenseSummary?.byCategory.tax ?? 0));
  const calculatedReportPayroll = reportPayrollCost(input.dailyReports ?? [], input.workforceResources ?? [], workforce.policy);
  const unregisteredPayrollCost = Math.max(0, calculatedReportPayroll - payrollAlreadyRegistered);
  const totalSpent = expenseRegisterCost + unregisteredPayrollCost;
  const paidOutgoingActual = payments
    .filter((item) => item.direction === "outgoing" && item.status === "paid")
    .reduce((sum, item) => sum + item.amount, 0);
  const recognizedActualCost = Math.max(budget.totalActualCost, totalSpent);
  const forecastCost = Math.max(workforce.adjustedForecastCost, recognizedActualCost);
  const forecastProfit = contractAmount - forecastCost;
  const forecastMarginPercent = contractAmount > 0 ? forecastProfit / contractAmount * 100 : 0;
  const forecastDeviation = forecastCost - budget.totalPlannedCost;
  const costToComplete = Math.max(forecastCost - recognizedActualCost, 0);
  const unpaidIncoming = payments.filter((item) => item.direction === "incoming" && item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const unpaidOutgoing = payments.filter((item) => item.direction === "outgoing" && item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const committedOutgoing = payments.filter((item) => item.direction === "outgoing" && ["approved", "paid", "overdue"].includes(item.status)).reduce((sum, item) => sum + item.amount, 0);
  const activeProcurement = procurementRequests.filter((item) => !["closed", "rejected"].includes(item.status));
  const openCriticalRisks = risks.filter((item) => item.status !== "closed" && ["critical", "high"].includes(item.priority));
  const noBaseline = !contractAmount || !budgetItems.length;
  const noActual = recognizedActualCost <= 0 && paidOutgoingActual <= 0;
  const critical = forecastProfit < 0 || finance.cashGap < 0 || forecastMarginPercent < 5;
  const attention = forecastDeviation > 0 || work.overdueItems.length > 0 || materialsStats.deficitItems.length > 0 || openCriticalRisks.length > 0;
  const status: CostForecastStatus = noBaseline ? "no_data" : critical ? "critical" : noActual ? "needs_baseline" : attention ? "attention" : "controlled";
  const tone: CostForecastTone = status === "critical" ? "bad" : status === "attention" || status === "needs_baseline" ? "warn" : status === "no_data" ? "info" : "good";
  const headline = status === "no_data"
    ? "Для прогноза нужны договорная сумма и ВОР"
    : status === "critical"
      ? "Прогноз маржи или ликвидности требует немедленного решения"
      : status === "needs_baseline"
        ? "Прогноз есть, но фактические затраты еще не подтверждены"
        : status === "attention"
          ? "Прогноз требует проверки отклонений и обязательств"
          : "Прогноз затрат и маржи находится под контролем";
  const nextStep = status === "no_data"
    ? "Загрузить ВОР и заполнить договорную сумму проекта."
    : status === "critical"
      ? "Согласовать антикризисный план: сокращение затрат, финансирование и пересмотр сроков/объемов."
      : status === "needs_baseline"
        ? "Подтвердить факт затрат по ключевым статьям и оплатам, затем обновить forecast."
        : attention
          ? "Проверить статьи с ростом forecast, обязательства снабжения и влияние графика."
          : "На ближайшей планерке подтвердить фактические затраты и остаток работ.";

  const categories = (Object.keys(categoryLabels) as BudgetItem["kind"][])
    .map((kind) => {
      const rows = budgetItems.filter((item) => item.kind === kind);
      const planned = rows.reduce((sum, item) => sum + item.qty * item.plannedUnitPrice, 0);
      const actual = rows.reduce((sum, item) => sum + item.qty * item.actualUnitPrice, 0);
      const baseForecast = rows.reduce((sum, item) => sum + item.qty * item.forecastUnitPrice, 0);
      const forecast = kind === "payroll" ? baseForecast + workforce.uncoveredEmployerCost : baseForecast;
      const deviation = forecast - planned;
      return { key: kind, label: categoryLabels[kind], planned: round(planned), actual: round(actual), forecast: round(forecast), deviation: round(deviation), tone: toneForDeviation(deviation, planned) };
    })
    .filter((item) => item.planned || item.actual || item.forecast);

  const signals = [
    ...(forecastDeviation > 0 ? [{ id: "forecast-overrun", title: "Рост прогнозной себестоимости", detail: `Forecast выше плана на ${Math.round(forecastDeviation).toLocaleString("ru-RU")} ₽.`, tone: toneForDeviation(forecastDeviation, budget.totalPlannedCost), targetTab: "Бюджет / ВОР" as const }] : []),
    ...(forecastMarginPercent < 5 && contractAmount ? [{ id: "margin-threshold", title: "Маржа ниже управленческого порога", detail: `Прогнозная маржа ${forecastMarginPercent.toFixed(1)}%.`, tone: "bad" as const, targetTab: "Финансы" as const }] : []),
    ...(workforce.uncoveredEmployerCost > 0 ? [{ id: "payroll-gap", title: "Полная стоимость ФОТ выше бюджета", detail: `Оклад и начисления работодателя не покрыты ВОР на ${Math.round(workforce.uncoveredEmployerCost).toLocaleString("ru-RU")} ₽.`, tone: "warn" as const, targetTab: "ФОТ" as const }] : []),
    ...(finance.cashGap < 0 ? [{ id: "cash-gap", title: "Кассовый разрыв", detail: `Потребность в финансировании ${Math.abs(finance.cashGap).toLocaleString("ru-RU")} ₽.`, tone: "bad" as const, targetTab: "Финансы" as const }] : []),
    ...(materialsStats.deficitItems.length ? [{ id: "material-deficit", title: "Дефицит материалов влияет на остаток работ", detail: `${materialsStats.deficitItems.length} позиций требуют снабжения; активных заявок ${activeProcurement.length}.`, tone: "warn" as const, targetTab: "Материалы" as const }] : []),
    ...(work.overdueItems.length ? [{ id: "schedule-delay", title: "Сроки могут увеличить cost-to-complete", detail: `${work.overdueItems.length} просроченных работ, максимальная задержка ${work.delayDays} дн.`, tone: "warn" as const, targetTab: "График" as const }] : []),
    ...(noActual && !noBaseline ? [{ id: "missing-actual", title: "Нет подтвержденных фактических затрат", detail: "Forecast пока основан на бюджетных ценах, а не на закрытых расходах.", tone: "warn" as const, targetTab: "Финансы" as const }] : [])
  ].slice(0, 8);
  const actions = [
    { title: "Подтвердить cost-to-complete", detail: `Остаток прогнозной себестоимости ${Math.round(costToComplete).toLocaleString("ru-RU")} ₽.`, ownerRole: "Финансовый директор" as const, priority: critical ? "high" as const : "medium" as const, targetTab: "Финансы" as const },
    { title: "Проверить статьи роста", detail: forecastDeviation > 0 ? `${categories.filter((item) => item.deviation > 0).length} категорий выше плана.` : "Рост forecast не выявлен.", ownerRole: "РП" as const, priority: forecastDeviation > 0 ? "high" as const : "low" as const, targetTab: "Бюджет / ВОР" as const },
    { title: "Сверить обязательства снабжения", detail: `${activeProcurement.length} активных заявок · неоплаченные исходящие ${Math.round(unpaidOutgoing).toLocaleString("ru-RU")} ₽.`, ownerRole: "Снабжение" as const, priority: materialsStats.deficitItems.length ? "high" as const : "medium" as const, targetTab: "Заявки" as const },
    { title: "Защитить маржу графиком", detail: work.overdueItems.length ? `Нужно снять ${work.overdueItems.length} просроченных работ до следующего cashflow review.` : "Сверить остаток работ с forecast на планерке.", ownerRole: "ПТО" as const, priority: work.overdueItems.length ? "high" as const : "medium" as const, targetTab: "График" as const },
    ...(workforce.totalEmployerCost ? [{
      title: "Сверить ФОТ и начисления",
      detail: `Полная стоимость труда ${Math.round(workforce.totalEmployerCost).toLocaleString("ru-RU")} ₽, включая начисления ${Math.round(workforce.employerContributions).toLocaleString("ru-RU")} ₽.`,
      ownerRole: "Финансовый директор" as const,
      priority: workforce.uncoveredEmployerCost > 0 ? "high" as const : "medium" as const,
      targetTab: "ФОТ" as const
    }] : [])
  ];

  return {
    summary: {
      status, tone, headline, nextStep, contractAmount, plannedCost: budget.totalPlannedCost, actualCost: recognizedActualCost,
      forecastCost, costToComplete, plannedMargin: budget.plannedProfit, forecastMargin: forecastProfit,
      plannedMarginPercent: budget.plannedMarginPercent, forecastMarginPercent, forecastDeviation,
      completionPercent: work.completionPercent, remainingWorkPercent: Math.max(0, 100 - work.completionPercent), cashGap: finance.cashGap,
      financingNeed: finance.financingNeed, committedOutgoing, unpaidIncoming, unpaidOutgoing,
      payrollEmployerCost: workforce.totalEmployerCost,
      payrollUncoveredCost: workforce.uncoveredEmployerCost,
      payrollContributions: workforce.employerContributions,
      totalSpent,
      expenseRegisterCost,
      reportPayrollCost: calculatedReportPayroll,
      unregisteredPayrollCost,
      paidOutgoingActual
    },
    reportProgress,
    spending: {
      totalSpent,
      expenseRegisterCost,
      reportPayrollCost: calculatedReportPayroll,
      payrollAlreadyRegistered,
      unregisteredPayrollCost,
      paidOutgoingActual,
      budgetActualCost: budget.totalActualCost,
      expenseCount: expenseSummary?.count ?? 0,
      receipts: expenseSummary?.receipts ?? 0,
      withoutReceipt: expenseSummary?.withoutReceipt ?? 0
    },
    categories,
    signals,
    actions,
    limitations: [
      noActual ? "Фактическая себестоимость неполная: нет подтверждённых расходов, ФОТ по рапортам или фактических цен ВОР." : "Факт затрат собирается из реестра расходов и расчётного ФОТ по утверждённым рапортам; фактические цены ВОР используются как сверочный минимум.",
      "Исходящие платежи показаны для сверки движения денег и не прибавляются повторно к расходам и ФОТ.",
      "Выполнение по рапортам учитывает только утверждённые структурированные строки; несопоставленные с графиком/ВОР работы показаны отдельно.",
      "ФОТ включает настроенные страховые начисления работодателя; НДФЛ показывается отдельно как удержание и не добавляется повторно к себестоимости.",
      "Прогноз не включает автоматическую индексацию, курсы валют или резерв по рискам без явного отражения в бюджете.",
      "Стоимость к завершению не записывается обратно в ВОР, платежи или cashflow без явного действия пользователя."
    ]
  };
}
