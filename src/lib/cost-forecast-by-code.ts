export type Numeric = number | string | { toString(): string };
export type CostCodeForecastTone = "good" | "warn" | "bad" | "neutral";

export type CostForecastInput = {
  costCodes: Array<{ id: string; code: string; name: string; status?: string }>;
  baselineLines: Array<{ costCodeId: string | null; budget: Numeric }>;
  budgetItems: Array<{ costCodeId: string | null; qty: Numeric; plannedUnitPrice: Numeric }>;
  periodLines: Array<{ costCodeId: string | null; earnedValue: Numeric; actualCost: Numeric }>;
  changeOrderItems: Array<{
    costCodeId: string | null;
    quantity: Numeric;
    approvedUnitPrice: Numeric;
    committedUnitPrice: Numeric;
    changeOrder: { status: string };
  }>;
  commitmentLines: Array<{
    costCodeId: string | null;
    scheduledValue: Numeric;
    commitment: { status: string };
    paymentApplicationLines: Array<{
      currentAmount: Numeric;
      materialsStored: Numeric;
      retentionAmount: Numeric;
      application: { status: string };
    }>;
  }>;
  payments: Array<{ costCodeId: string | null; direction: string; status: string; amount: Numeric }>;
};

export type CostCodeForecastLine = {
  costCodeId: string;
  code: string;
  name: string;
  budgetAtCompletion: number;
  approvedChanges: number;
  revisedBudget: number;
  earnedValue: number;
  actualCost: number;
  openCommitments: number;
  costPerformanceIndex: number | null;
  estimateToComplete: number;
  estimateAtCompletion: number;
  varianceAtCompletion: number;
  variancePercent: number | null;
  tone: CostCodeForecastTone;
  sourceQuality: "controlled" | "baseline_only" | "budget_only" | "no_budget";
};

function value(input: Numeric | null | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function round(input: number) {
  return Math.round(input * 100) / 100;
}

function total<T>(items: T[], pick: (item: T) => number) {
  return round(items.reduce((sum, item) => sum + pick(item), 0));
}

function forecastTone(varianceAtCompletion: number, revisedBudget: number): CostCodeForecastTone {
  if (revisedBudget <= 0) return "neutral";
  const ratio = varianceAtCompletion / revisedBudget;
  if (ratio < -0.1) return "bad";
  if (ratio < -0.03) return "warn";
  return "good";
}

export function buildCostForecastByCode(input: CostForecastInput) {
  const activeCodes = input.costCodes.filter((item) => item.status !== "archived");
  const baselineAvailable = input.baselineLines.length > 0;
  const periodAvailable = input.periodLines.length > 0;
  const limitations: string[] = [];

  if (!activeCodes.length) limitations.push("Коды затрат не настроены: детализация прогноза недоступна.");
  if (!baselineAvailable) limitations.push("Активный Project Controls baseline отсутствует; используется план ВОР.");
  if (!periodAvailable) limitations.push("Опубликованный контрольный период отсутствует; EV/CPI по кодам не подтверждены.");
  if (input.payments.some((item) => !item.costCodeId && item.status === "paid" && item.direction === "outgoing")) {
    limitations.push("Часть оплаченных расходов не привязана к коду затрат и не входит в строки прогноза.");
  }
  if (input.commitmentLines.some((item) => !item.costCodeId && ["approved", "active", "completed"].includes(item.commitment.status))) {
    limitations.push("Часть обязательств не привязана к коду затрат.");
  }

  const lines = activeCodes.map((costCode): CostCodeForecastLine => {
    const baseline = input.baselineLines.filter((item) => item.costCodeId === costCode.id);
    const budget = input.budgetItems.filter((item) => item.costCodeId === costCode.id);
    const periods = input.periodLines.filter((item) => item.costCodeId === costCode.id);
    const changes = input.changeOrderItems.filter((item) => item.costCodeId === costCode.id && ["approved", "executed"].includes(item.changeOrder.status));
    const commitments = input.commitmentLines.filter((item) => item.costCodeId === costCode.id && ["approved", "active", "completed"].includes(item.commitment.status));
    const paid = input.payments.filter((item) => item.costCodeId === costCode.id && item.direction === "outgoing" && item.status === "paid");

    const budgetAtCompletion = baseline.length
      ? total(baseline, (item) => value(item.budget))
      : total(budget, (item) => Math.max(value(item.qty) * value(item.plannedUnitPrice), 0));
    const approvedChanges = total(changes, (item) => {
      const unitPrice = item.changeOrder.status === "executed" && value(item.committedUnitPrice) > 0
        ? value(item.committedUnitPrice)
        : value(item.approvedUnitPrice);
      return value(item.quantity) * unitPrice;
    });
    const revisedBudget = round(budgetAtCompletion + approvedChanges);
    const earnedValue = total(periods, (item) => value(item.earnedValue));
    const actualCost = periods.length
      ? total(periods, (item) => value(item.actualCost))
      : total(paid, (item) => value(item.amount));
    const openCommitments = total(commitments, (item) => {
      const certified = total(
        item.paymentApplicationLines.filter((line) => ["approved", "paid"].includes(line.application.status)),
        (line) => value(line.currentAmount) + value(line.materialsStored) - value(line.retentionAmount)
      );
      return Math.max(value(item.scheduledValue) - certified, 0);
    });
    const costPerformanceIndex = earnedValue > 0 && actualCost > 0 ? round(earnedValue / actualCost) : null;
    const remainingBudget = Math.max(revisedBudget - earnedValue, 0);
    const performanceEtc = costPerformanceIndex && costPerformanceIndex >= 0.2
      ? remainingBudget / costPerformanceIndex
      : Math.max(revisedBudget - actualCost, 0);
    const estimateToComplete = round(Math.max(openCommitments, performanceEtc));
    const estimateAtCompletion = round(actualCost + estimateToComplete);
    const varianceAtCompletion = round(revisedBudget - estimateAtCompletion);
    const variancePercent = revisedBudget > 0 ? round((varianceAtCompletion / revisedBudget) * 100) : null;
    const sourceQuality = periods.length
      ? "controlled"
      : baseline.length
        ? "baseline_only"
        : budget.length
          ? "budget_only"
          : "no_budget";

    return {
      costCodeId: costCode.id,
      code: costCode.code,
      name: costCode.name,
      budgetAtCompletion,
      approvedChanges,
      revisedBudget,
      earnedValue,
      actualCost,
      openCommitments,
      costPerformanceIndex,
      estimateToComplete,
      estimateAtCompletion,
      varianceAtCompletion,
      variancePercent,
      tone: forecastTone(varianceAtCompletion, revisedBudget),
      sourceQuality
    };
  }).sort((left, right) => left.varianceAtCompletion - right.varianceAtCompletion || left.code.localeCompare(right.code));

  const summary = {
    status: !lines.length ? "no_data" : lines.some((line) => line.tone === "bad") ? "critical" : lines.some((line) => line.tone === "warn") ? "attention" : periodAvailable ? "controlled" : "limited",
    budgetAtCompletion: total(lines, (line) => line.budgetAtCompletion),
    approvedChanges: total(lines, (line) => line.approvedChanges),
    revisedBudget: total(lines, (line) => line.revisedBudget),
    earnedValue: total(lines, (line) => line.earnedValue),
    actualCost: total(lines, (line) => line.actualCost),
    openCommitments: total(lines, (line) => line.openCommitments),
    estimateToComplete: total(lines, (line) => line.estimateToComplete),
    estimateAtCompletion: total(lines, (line) => line.estimateAtCompletion),
    varianceAtCompletion: total(lines, (line) => line.varianceAtCompletion),
    controlledLines: lines.filter((line) => line.sourceQuality === "controlled").length,
    lineCount: lines.length
  };

  return { summary, lines, limitations };
}
