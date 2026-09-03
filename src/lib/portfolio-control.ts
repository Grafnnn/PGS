import { scheduleProgressPercent } from "./calculations";

export type PortfolioHealth = "critical" | "attention" | "stable" | "no_data";

export interface PortfolioProjectSource {
  id: string;
  name: string;
  code?: string | null;
  customer: string;
  manager: string;
  status: string;
  contractAmount: number;
  startsAt: string;
  endsAt: string;
  budgetItems: Array<{ qty: number; plannedUnitPrice: number; forecastUnitPrice: number; kind: string }>;
  scheduleItems: Array<{ name: string; plannedQty: number; actualQty: number; status: string; endsAt: string }>;
  materials: Array<{ requiredQty: number; orderedQty: number; deliveredQty: number; status: string; neededAt: string }>;
  payments: Array<{ direction: string; amount: number; status: string; plannedAt: string; paidAt?: string | null }>;
  expenses: Array<{
    grossAmount: number;
    category: string;
    currency: string;
    items?: Array<{ amount: number; category: string }>;
  }>;
  risks: Array<{ priority: string; status: string; dueAt: string }>;
  actionItems: Array<{ priority: string; status: string; dueAt?: string | null; assignee?: string | null }>;
}

export interface PortfolioProjectRow {
  id: string;
  name: string;
  code?: string | null;
  customer: string;
  manager: string;
  status: string;
  contractAmount: number;
  forecastCost: number;
  forecastProfit: number;
  forecastMarginPercent: number | null;
  actualExpenses: number;
  excludedNonRubExpenses: number;
  financialForecastAvailable: boolean;
  budgetDeviation: number;
  progressPercent: number | null;
  cashExposure: number;
  paidIncoming: number;
  paidOutgoing: number;
  criticalRisks: number;
  activeRisks: number;
  overdueActions: number;
  openActions: number;
  delayedWorks: number;
  materialDeficits: number;
  nextMilestone?: { name: string; date: string };
  health: PortfolioHealth;
  healthScore: number | null;
  coveragePercent: number;
  attentionReasons: string[];
}

export interface PortfolioControlModel {
  generatedAt: string;
  summary: {
    projectCount: number;
    activeProjects: number;
    contractAmount: number;
    forecastCost: number;
    forecastProfit: number;
    actualExpenses: number;
    excludedNonRubExpenses: number;
    financialForecastProjects: number;
    paidIncoming: number;
    paidOutgoing: number;
    cashExposure: number;
    criticalProjects: number;
    attentionProjects: number;
    noDataProjects: number;
    overdueActions: number;
  };
  projects: PortfolioProjectRow[];
  cashflow: Array<{ month: string; label: string; incoming: number; outgoing: number; net: number }>;
  workload: Array<{ manager: string; projects: number; delayedWorks: number; criticalRisks: number; overdueActions: number; score: number }>;
  attention: Array<{ projectId: string; projectName: string; health: PortfolioHealth; reason: string }>;
}

const number = (value: number) => Number.isFinite(value) ? value : 0;
const sum = (values: number[]) => values.reduce((total, value) => total + number(value), 0);
const monthKey = (value: string) => value.slice(0, 7);

const costKindLabels: Record<string, string> = {
  work: "Работы",
  material: "Материалы",
  equipment: "Техника",
  payroll: "ФОТ",
  subcontract: "Субподряд",
  overhead: "Накладные",
  other: "Прочее"
};

const expenseCategoryKinds: Record<string, string> = {
  materials: "material",
  labor: "payroll",
  equipment: "equipment",
  subcontract: "subcontract",
  transport: "overhead",
  travel: "overhead",
  overhead: "overhead",
  tax: "overhead",
  services: "other",
  other: "other"
};

function isClosed(status: string) {
  return ["closed", "done", "completed", "archived", "cancelled"].includes(status.toLowerCase());
}

function isPaid(status: string) {
  return status.toLowerCase() === "paid";
}

function calculateCashExposure(payments: PortfolioProjectSource["payments"]) {
  let balance = 0;
  let minimum = 0;
  for (const payment of [...payments].sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))) {
    balance += payment.direction === "incoming" ? number(payment.amount) : -number(payment.amount);
    minimum = Math.min(minimum, balance);
  }
  return minimum;
}

function calculateProject(source: PortfolioProjectSource, now: Date): PortfolioProjectRow {
  const nowTime = now.getTime();
  const hasBudget = source.budgetItems.length > 0;
  const plannedCost = sum(source.budgetItems.map((item) => item.qty * item.plannedUnitPrice));
  const budgetForecastCost = sum(source.budgetItems.map((item) => item.qty * item.forecastUnitPrice));
  const rubExpenses = source.expenses.filter((item) => item.currency.toUpperCase() === "RUB");
  const excludedNonRubExpenses = source.expenses.length - rubExpenses.length;
  const actualExpenses = sum(rubExpenses.map((item) => item.grossAmount));
  const financialForecastAvailable = hasBudget;
  const forecastCost = financialForecastAvailable ? Math.max(budgetForecastCost, actualExpenses) : 0;
  const progressPercent = scheduleProgressPercent(source.scheduleItems);
  const forecastProfit = financialForecastAvailable ? source.contractAmount - forecastCost : 0;
  const forecastMarginPercent = financialForecastAvailable && source.contractAmount > 0 ? (forecastProfit / source.contractAmount) * 100 : null;
  const paidIncoming = sum(source.payments.filter((item) => item.direction === "incoming" && isPaid(item.status)).map((item) => item.amount));
  const paidOutgoing = sum(source.payments.filter((item) => item.direction === "outgoing" && isPaid(item.status)).map((item) => item.amount));
  const activeRisks = source.risks.filter((item) => !isClosed(item.status));
  const criticalRisks = activeRisks.filter((item) => item.priority === "critical").length;
  const openActions = source.actionItems.filter((item) => !isClosed(item.status));
  const overdueActions = openActions.filter((item) => item.dueAt && new Date(item.dueAt).getTime() < nowTime).length;
  const delayedWorks = source.scheduleItems.filter((item) => item.status === "delayed" || (!isClosed(item.status) && new Date(item.endsAt).getTime() < nowTime)).length;
  const materialDeficits = source.materials.filter((item) => !isClosed(item.status) && item.deliveredQty < item.requiredQty).length;
  const nextSchedule = source.scheduleItems
    .filter((item) => !isClosed(item.status) && new Date(item.endsAt).getTime() >= nowTime)
    .sort((a, b) => a.endsAt.localeCompare(b.endsAt))[0];
  const cashExposure = calculateCashExposure(source.payments);
  const evidence = [hasBudget || actualExpenses > 0, source.scheduleItems.length, source.materials.length, source.payments.length, source.risks.length + source.actionItems.length]
    .filter(Boolean).length;
  const coveragePercent = evidence * 20;
  const budgetDeviation = hasBudget ? forecastCost - plannedCost : 0;
  const actualAboveBudgetForecast = hasBudget && actualExpenses > budgetForecastCost;
  const budgetMissing = !hasBudget && actualExpenses > 0;
  const reasons: string[] = [];
  if (forecastMarginPercent !== null && forecastMarginPercent < 0) reasons.push("Отрицательная прогнозная маржа");
  if (budgetMissing) reasons.push("Фактические расходы не сопоставлены с бюджетом");
  else if (actualAboveBudgetForecast) reasons.push("Фактические расходы выше прогноза затрат");
  else if (budgetDeviation > 0) reasons.push("Прогноз затрат выше плана");
  if (excludedNonRubExpenses) reasons.push(`Расходы не в RUB исключены из итога: ${excludedNonRubExpenses}`);
  if (cashExposure < 0) reasons.push("Есть кассовый разрыв в плане платежей");
  if (criticalRisks) reasons.push(`Критические риски: ${criticalRisks}`);
  if (overdueActions) reasons.push(`Просроченные действия: ${overdueActions}`);
  if (delayedWorks) reasons.push(`Просроченные работы: ${delayedWorks}`);
  if (materialDeficits) reasons.push(`Дефицитные материалы: ${materialDeficits}`);

  let health: PortfolioHealth;
  let healthScore: number | null;
  if (evidence < 2) {
    health = "no_data";
    healthScore = null;
  } else {
    const penalty = Math.min(100,
      (forecastMarginPercent !== null && forecastMarginPercent < 0 ? 35 : budgetDeviation > 0 ? 12 : 0) +
      (budgetMissing ? 26 : 0) +
      (excludedNonRubExpenses ? 8 : 0) +
      (cashExposure < 0 ? 22 : 0) + criticalRisks * 20 + overdueActions * 6 + delayedWorks * 7 + materialDeficits * 4
    );
    healthScore = Math.max(0, 100 - penalty);
    health = healthScore < 45 ? "critical" : healthScore < 75 ? "attention" : "stable";
  }

  return {
    id: source.id,
    name: source.name,
    code: source.code,
    customer: source.customer,
    manager: source.manager,
    status: source.status,
    contractAmount: number(source.contractAmount),
    forecastCost,
    forecastProfit,
    forecastMarginPercent,
    actualExpenses,
    excludedNonRubExpenses,
    financialForecastAvailable,
    budgetDeviation,
    progressPercent,
    cashExposure,
    paidIncoming,
    paidOutgoing,
    criticalRisks,
    activeRisks: activeRisks.length,
    overdueActions,
    openActions: openActions.length,
    delayedWorks,
    materialDeficits,
    nextMilestone: nextSchedule ? { name: nextSchedule.name, date: nextSchedule.endsAt } : undefined,
    health,
    healthScore,
    coveragePercent,
    attentionReasons: reasons.length ? reasons : evidence < 2 ? ["Недостаточно данных для оценки"] : ["Критичных отклонений не выявлено"]
  };
}

export function buildPortfolioControlModel(sources: PortfolioProjectSource[], now = new Date()): PortfolioControlModel {
  const projects = sources.map((source) => calculateProject(source, now)).sort((a, b) => {
    const rank: Record<PortfolioHealth, number> = { critical: 0, attention: 1, no_data: 2, stable: 3 };
    return rank[a.health] - rank[b.health] || a.name.localeCompare(b.name, "ru");
  });
  const cashflowMap = new Map<string, { incoming: number; outgoing: number }>();
  for (const source of sources) {
    for (const payment of source.payments) {
      const key = monthKey(payment.plannedAt);
      const bucket = cashflowMap.get(key) ?? { incoming: 0, outgoing: 0 };
      if (payment.direction === "incoming") bucket.incoming += number(payment.amount);
      else bucket.outgoing += number(payment.amount);
      cashflowMap.set(key, bucket);
    }
  }
  const cashflow = [...cashflowMap.entries()].sort(([a], [b]) => a.localeCompare(b)).slice(-12).map(([month, value]) => ({
    month,
    label: new Date(`${month}-01T00:00:00Z`).toLocaleDateString("ru-RU", { month: "short", year: "2-digit", timeZone: "UTC" }),
    incoming: value.incoming,
    outgoing: value.outgoing,
    net: value.incoming - value.outgoing
  }));
  const workloadMap = new Map<string, { projects: number; delayedWorks: number; criticalRisks: number; overdueActions: number }>();
  for (const project of projects) {
    const manager = project.manager.trim() || "Не назначен";
    const current = workloadMap.get(manager) ?? { projects: 0, delayedWorks: 0, criticalRisks: 0, overdueActions: 0 };
    current.projects += 1;
    current.delayedWorks += project.delayedWorks;
    current.criticalRisks += project.criticalRisks;
    current.overdueActions += project.overdueActions;
    workloadMap.set(manager, current);
  }
  const workload = [...workloadMap.entries()].map(([manager, value]) => ({
    manager,
    ...value,
    score: value.projects * 10 + value.delayedWorks * 4 + value.criticalRisks * 7 + value.overdueActions * 3
  })).sort((a, b) => b.score - a.score || a.manager.localeCompare(b.manager, "ru"));
  const attention = projects.flatMap((project) => project.attentionReasons
    .filter((reason) => project.health !== "stable" || reason !== "Критичных отклонений не выявлено")
    .slice(0, 2)
    .map((reason) => ({ projectId: project.id, projectName: project.name, health: project.health, reason })))
    .slice(0, 8);

  return {
    generatedAt: now.toISOString(),
    summary: {
      projectCount: projects.length,
      activeProjects: projects.filter((project) => ["active", "planning"].includes(project.status)).length,
      contractAmount: sum(projects.map((project) => project.contractAmount)),
      forecastCost: sum(projects.map((project) => project.forecastCost)),
      forecastProfit: sum(projects.map((project) => project.forecastProfit)),
      actualExpenses: sum(projects.map((project) => project.actualExpenses)),
      excludedNonRubExpenses: sum(projects.map((project) => project.excludedNonRubExpenses)),
      financialForecastProjects: projects.filter((project) => project.financialForecastAvailable).length,
      paidIncoming: sum(projects.map((project) => project.paidIncoming)),
      paidOutgoing: sum(projects.map((project) => project.paidOutgoing)),
      cashExposure: sum(projects.map((project) => project.cashExposure)),
      criticalProjects: projects.filter((project) => project.health === "critical").length,
      attentionProjects: projects.filter((project) => project.health === "attention").length,
      noDataProjects: projects.filter((project) => project.health === "no_data").length,
      overdueActions: sum(projects.map((project) => project.overdueActions))
    },
    projects,
    cashflow,
    workload,
    attention
  };
}

export function buildPortfolioCostStructure(sources: PortfolioProjectSource[]) {
  const buckets = new Map<string, { key: string; label: string; forecast: number; actual: number }>();
  const bucket = (key: string) => {
    const normalized = costKindLabels[key] ? key : "other";
    const current = buckets.get(normalized) ?? { key: normalized, label: costKindLabels[normalized], forecast: 0, actual: 0 };
    buckets.set(normalized, current);
    return current;
  };

  for (const source of sources) {
    for (const item of source.budgetItems) {
      bucket(item.kind).forecast += number(item.qty) * number(item.forecastUnitPrice);
    }
    for (const expense of source.expenses) {
      if (expense.currency.toUpperCase() !== "RUB") continue;
      const grossAmount = number(expense.grossAmount);
      const lines = expense.items ?? [];
      const linesAmount = sum(lines.map((line) => number(line.amount)));
      const useLines = lines.length > 0 && linesAmount > 0 && linesAmount <= grossAmount + 0.01;
      if (useLines) {
        for (const line of lines) {
          const kind = line.category.startsWith("custom:") ? "other" : (expenseCategoryKinds[line.category] ?? "other");
          bucket(kind).actual += number(line.amount);
        }
        const unallocated = Math.max(0, grossAmount - linesAmount);
        if (unallocated > 0.01) {
          const kind = expense.category.startsWith("custom:") ? "other" : (expenseCategoryKinds[expense.category] ?? "other");
          bucket(kind).actual += unallocated;
        }
      } else {
        const kind = expense.category.startsWith("custom:") ? "other" : (expenseCategoryKinds[expense.category] ?? "other");
        bucket(kind).actual += grossAmount;
      }
    }
  }

  return [...buckets.values()]
    .filter((item) => item.forecast > 0 || item.actual > 0)
    .sort((left, right) => Math.max(right.forecast, right.actual) - Math.max(left.forecast, left.actual));
}
