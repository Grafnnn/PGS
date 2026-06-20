import type { BudgetItem, Material, Payment, Risk, ScheduleItem } from "./types";

const sum = (items: number[]) => items.reduce((total, item) => total + item, 0);
export const money = (value: number) =>
  new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
export const percent = (value: number) => `${Number.isFinite(value) ? value.toFixed(1) : "0.0"}%`;

export function budgetTotals(contractAmount: number, items: BudgetItem[]) {
  const plannedByKind = (kind: BudgetItem["kind"]) =>
    sum(items.filter((item) => item.kind === kind).map((item) => item.qty * item.plannedUnitPrice));
  const actualByKind = (kind: BudgetItem["kind"]) =>
    sum(items.filter((item) => item.kind === kind).map((item) => item.qty * item.actualUnitPrice));
  const forecastByKind = (kind: BudgetItem["kind"]) =>
    sum(items.filter((item) => item.kind === kind).map((item) => item.qty * item.forecastUnitPrice));

  const totalPlannedCost = sum(items.map((item) => item.qty * item.plannedUnitPrice));
  const totalActualCost = sum(items.map((item) => item.qty * item.actualUnitPrice));
  const totalForecastCost = sum(items.map((item) => item.qty * item.forecastUnitPrice));

  return {
    plannedByKind,
    actualByKind,
    forecastByKind,
    totalContractAmount: contractAmount,
    totalPlannedCost,
    totalActualCost,
    totalForecastCost,
    plannedProfit: contractAmount - totalPlannedCost,
    actualProfit: contractAmount - totalActualCost,
    forecastProfit: contractAmount - totalForecastCost,
    plannedMarginPercent: ((contractAmount - totalPlannedCost) / contractAmount) * 100,
    actualMarginPercent: ((contractAmount - totalActualCost) / contractAmount) * 100,
    forecastMarginPercent: ((contractAmount - totalForecastCost) / contractAmount) * 100
  };
}

export function workTotals(items: ScheduleItem[], today = new Date()) {
  const plannedWorkAmount = sum(items.map((item) => item.plannedQty));
  const completedWorkAmount = sum(items.map((item) => item.actualQty));
  const overdueItems = items.filter((item) => new Date(item.endsAt) < today && item.status !== "done");

  return {
    plannedWorkAmount,
    completedWorkAmount,
    remainingWorkAmount: Math.max(plannedWorkAmount - completedWorkAmount, 0),
    completionPercent: plannedWorkAmount ? (completedWorkAmount / plannedWorkAmount) * 100 : 0,
    overdueItems,
    delayDays: overdueItems.reduce((max, item) => {
      const diff = Math.ceil((today.getTime() - new Date(item.endsAt).getTime()) / 86_400_000);
      return Math.max(max, diff);
    }, 0)
  };
}

export function materialTotals(items: Material[]) {
  const requiredQty = sum(items.map((item) => item.requiredQty));
  const orderedQty = sum(items.map((item) => item.orderedQty));
  const deliveredQty = sum(items.map((item) => item.deliveredQty));
  const consumedQty = sum(items.map((item) => item.consumedQty));
  const plannedMaterialCost = sum(items.map((item) => item.requiredQty * item.plannedUnitPrice));
  const actualMaterialCost = sum(items.map((item) => item.orderedQty * item.actualUnitPrice));

  return {
    requiredQty,
    orderedQty,
    deliveredQty,
    consumedQty,
    remainingQty: Math.max(deliveredQty - consumedQty, 0),
    plannedMaterialCost,
    actualMaterialCost,
    materialOverrun: actualMaterialCost - plannedMaterialCost,
    deficitItems: items.filter((item) => item.deliveredQty < item.requiredQty && item.status !== "closed")
  };
}

export function financeTotals(payments: Payment[], openingBalance = 1_500_000) {
  const incomingPayments = sum(payments.filter((payment) => payment.direction === "incoming").map((payment) => payment.amount));
  const outgoingPayments = sum(payments.filter((payment) => payment.direction === "outgoing").map((payment) => payment.amount));
  const closingBalance = openingBalance + incomingPayments - outgoingPayments;

  return {
    openingBalance,
    incomingPayments,
    outgoingPayments,
    closingBalance,
    cashGap: Math.min(closingBalance, 0),
    financingNeed: closingBalance < 0 ? Math.abs(closingBalance) : 0,
    periodProfit: incomingPayments - outgoingPayments,
    cumulativeProfit: closingBalance - openingBalance
  };
}

export function deriveAutoRisks(schedule: ScheduleItem[], materials: Material[], payments: Payment[]): Risk[] {
  const today = new Date();
  const risks: Risk[] = [];

  for (const item of schedule) {
    if (new Date(item.endsAt) < today && item.status !== "done") {
      risks.push({
        id: `auto-schedule-${item.id}`,
        projectId: item.projectId,
        title: `Просрочка работы: ${item.name}`,
        reason: `Плановая дата окончания ${item.endsAt}, статус ${item.status}.`,
        priority: "high",
        owner: item.owner,
        dueAt: new Date(today.getTime() + 3 * 86_400_000).toISOString().slice(0, 10),
        status: "open"
      });
    }
  }

  for (const item of materials) {
    if (item.requiredQty > item.orderedQty && new Date(item.neededAt) <= new Date(today.getTime() + 7 * 86_400_000)) {
      risks.push({
        id: `auto-material-${item.id}`,
        projectId: item.projectId,
        title: `Материал не закрыт закупкой: ${item.name}`,
        reason: `Требуется ${item.requiredQty} ${item.unit}, заказано ${item.orderedQty} ${item.unit}.`,
        priority: "critical",
        owner: "Снабжение",
        dueAt: item.neededAt,
        status: "open"
      });
    }
  }

  const finance = financeTotals(payments);
  if (finance.cashGap < 0) {
    risks.push({
      id: "auto-cash-gap",
      projectId: payments[0]?.projectId ?? "project-demo",
      title: "Кассовый разрыв по проекту",
      reason: `Прогнозный отрицательный баланс ${money(finance.cashGap)}.`,
      priority: "critical",
      owner: "Финансовый директор",
      dueAt: new Date(today.getTime() + 2 * 86_400_000).toISOString().slice(0, 10),
      status: "open"
    });
  }

  return risks;
}
