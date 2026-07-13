import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, Risk, ScheduleItem } from "@/lib/types";

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
  };
  categories: Array<{ key: string; label: string; planned: number; actual: number; forecast: number; deviation: number; tone: CostForecastTone }>;
  signals: Array<{ id: string; title: string; detail: string; tone: CostForecastTone; targetTab: "Бюджет / ВОР" | "Финансы" | "График" | "Материалы" | "Заявки" | "Риски" }>;
  actions: Array<{ title: string; detail: string; ownerRole: "РП" | "Финансовый директор" | "ПТО" | "Снабжение"; priority: "low" | "medium" | "high"; targetTab: "Бюджет / ВОР" | "Финансы" | "График" | "Материалы" | "Заявки" | "Риски" }>;
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
  const work = workTotals(scheduleItems);
  const materialsStats = materialTotals(materials);
  const finance = financeTotals(payments);
  const forecastDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const costToComplete = Math.max(budget.totalForecastCost - budget.totalActualCost, 0);
  const unpaidIncoming = payments.filter((item) => item.direction === "incoming" && item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const unpaidOutgoing = payments.filter((item) => item.direction === "outgoing" && item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const committedOutgoing = payments.filter((item) => item.direction === "outgoing" && ["approved", "paid", "overdue"].includes(item.status)).reduce((sum, item) => sum + item.amount, 0);
  const activeProcurement = procurementRequests.filter((item) => !["closed", "rejected"].includes(item.status));
  const openCriticalRisks = risks.filter((item) => item.status !== "closed" && ["critical", "high"].includes(item.priority));
  const noBaseline = !contractAmount || !budgetItems.length;
  const noActual = budget.totalActualCost <= 0 && !payments.some((item) => item.direction === "outgoing" && item.status === "paid");
  const critical = budget.forecastProfit < 0 || finance.cashGap < 0 || budget.forecastMarginPercent < 5;
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
      const forecast = rows.reduce((sum, item) => sum + item.qty * item.forecastUnitPrice, 0);
      const deviation = forecast - planned;
      return { key: kind, label: categoryLabels[kind], planned: round(planned), actual: round(actual), forecast: round(forecast), deviation: round(deviation), tone: toneForDeviation(deviation, planned) };
    })
    .filter((item) => item.planned || item.actual || item.forecast);

  const signals = [
    ...(forecastDeviation > 0 ? [{ id: "forecast-overrun", title: "Рост прогнозной себестоимости", detail: `Forecast выше плана на ${Math.round(forecastDeviation).toLocaleString("ru-RU")} ₽.`, tone: toneForDeviation(forecastDeviation, budget.totalPlannedCost), targetTab: "Бюджет / ВОР" as const }] : []),
    ...(budget.forecastMarginPercent < 5 && contractAmount ? [{ id: "margin-threshold", title: "Маржа ниже управленческого порога", detail: `Прогнозная маржа ${budget.forecastMarginPercent.toFixed(1)}%.`, tone: "bad" as const, targetTab: "Финансы" as const }] : []),
    ...(finance.cashGap < 0 ? [{ id: "cash-gap", title: "Кассовый разрыв", detail: `Потребность в финансировании ${Math.abs(finance.cashGap).toLocaleString("ru-RU")} ₽.`, tone: "bad" as const, targetTab: "Финансы" as const }] : []),
    ...(materialsStats.deficitItems.length ? [{ id: "material-deficit", title: "Дефицит материалов влияет на остаток работ", detail: `${materialsStats.deficitItems.length} позиций требуют снабжения; активных заявок ${activeProcurement.length}.`, tone: "warn" as const, targetTab: "Материалы" as const }] : []),
    ...(work.overdueItems.length ? [{ id: "schedule-delay", title: "Сроки могут увеличить cost-to-complete", detail: `${work.overdueItems.length} просроченных работ, максимальная задержка ${work.delayDays} дн.`, tone: "warn" as const, targetTab: "График" as const }] : []),
    ...(noActual && !noBaseline ? [{ id: "missing-actual", title: "Нет подтвержденных фактических затрат", detail: "Forecast пока основан на бюджетных ценах, а не на закрытых расходах.", tone: "warn" as const, targetTab: "Финансы" as const }] : [])
  ].slice(0, 8);
  const actions = [
    { title: "Подтвердить cost-to-complete", detail: `Остаток прогнозной себестоимости ${Math.round(costToComplete).toLocaleString("ru-RU")} ₽.`, ownerRole: "Финансовый директор" as const, priority: critical ? "high" as const : "medium" as const, targetTab: "Финансы" as const },
    { title: "Проверить статьи роста", detail: forecastDeviation > 0 ? `${categories.filter((item) => item.deviation > 0).length} категорий выше плана.` : "Рост forecast не выявлен.", ownerRole: "РП" as const, priority: forecastDeviation > 0 ? "high" as const : "low" as const, targetTab: "Бюджет / ВОР" as const },
    { title: "Сверить обязательства снабжения", detail: `${activeProcurement.length} активных заявок · неоплаченные исходящие ${Math.round(unpaidOutgoing).toLocaleString("ru-RU")} ₽.`, ownerRole: "Снабжение" as const, priority: materialsStats.deficitItems.length ? "high" as const : "medium" as const, targetTab: "Заявки" as const },
    { title: "Защитить маржу графиком", detail: work.overdueItems.length ? `Нужно снять ${work.overdueItems.length} просроченных работ до следующего cashflow review.` : "Сверить остаток работ с forecast на планерке.", ownerRole: "ПТО" as const, priority: work.overdueItems.length ? "high" as const : "medium" as const, targetTab: "График" as const }
  ];

  return {
    summary: {
      status, tone, headline, nextStep, contractAmount, plannedCost: budget.totalPlannedCost, actualCost: budget.totalActualCost,
      forecastCost: budget.totalForecastCost, costToComplete, plannedMargin: budget.plannedProfit, forecastMargin: budget.forecastProfit,
      plannedMarginPercent: budget.plannedMarginPercent, forecastMarginPercent: budget.forecastMarginPercent, forecastDeviation,
      completionPercent: work.completionPercent, remainingWorkPercent: Math.max(0, 100 - work.completionPercent), cashGap: finance.cashGap,
      financingNeed: finance.financingNeed, committedOutgoing, unpaidIncoming, unpaidOutgoing
    },
    categories,
    signals,
    actions,
    limitations: [
      noActual ? "Фактическая себестоимость неполная: v1 не подменяет закрытие первичных документов и управленческий учет." : "Факт берется из текущих цен ВОР и платежей; подтвердите его с бухгалтерией.",
      "Прогноз не включает автоматическую индексацию, курсы валют, налоги или резерв по рискам без явного отражения в бюджете.",
      "Стоимость к завершению не записывается обратно в ВОР, платежи или cashflow без явного действия пользователя."
    ]
  };
}
