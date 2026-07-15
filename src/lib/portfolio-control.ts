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
  budgetItems: Array<{ qty: number; plannedUnitPrice: number; forecastUnitPrice: number }>;
  scheduleItems: Array<{ name: string; plannedQty: number; actualQty: number; status: string; endsAt: string }>;
  materials: Array<{ requiredQty: number; orderedQty: number; deliveredQty: number; status: string; neededAt: string }>;
  payments: Array<{ direction: string; amount: number; status: string; plannedAt: string; paidAt?: string | null }>;
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
  const plannedCost = sum(source.budgetItems.map((item) => item.qty * item.plannedUnitPrice));
  const forecastCost = sum(source.budgetItems.map((item) => item.qty * item.forecastUnitPrice));
  const plannedQty = sum(source.scheduleItems.map((item) => item.plannedQty));
  const actualQty = sum(source.scheduleItems.map((item) => item.actualQty));
  const progressPercent = plannedQty > 0 ? Math.min(100, Math.max(0, (actualQty / plannedQty) * 100)) : null;
  const forecastProfit = source.contractAmount - forecastCost;
  const forecastMarginPercent = source.contractAmount > 0 ? (forecastProfit / source.contractAmount) * 100 : null;
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
  const evidence = [source.budgetItems.length, source.scheduleItems.length, source.materials.length, source.payments.length, source.risks.length + source.actionItems.length]
    .filter(Boolean).length;
  const coveragePercent = evidence * 20;
  const budgetDeviation = forecastCost - plannedCost;
  const reasons: string[] = [];
  if (forecastMarginPercent !== null && forecastMarginPercent < 0) reasons.push("Отрицательная прогнозная маржа");
  else if (budgetDeviation > 0) reasons.push("Прогноз затрат выше плана");
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
