import { z } from "zod";
import type { BudgetItem, Payment, Project, ScheduleItem } from "@/lib/types";

export const projectControlBaselineStatuses = ["draft", "active", "superseded"] as const;
export const projectControlPeriodStatuses = ["published", "locked", "void"] as const;

export const projectControlBaselineRequestSchema = z.object({
  mode: z.enum(["preview", "create"]),
  name: z.string().trim().min(3).max(120).default("Управленческий baseline"),
  dataDate: z.string().trim().min(10).max(40),
  activate: z.boolean().default(false),
  confirm: z.boolean().default(false),
  notes: z.string().trim().max(1000).optional()
}).strict().superRefine((value, context) => {
  if (Number.isNaN(new Date(value.dataDate).getTime())) context.addIssue({ code: z.ZodIssueCode.custom, path: ["dataDate"], message: "Valid data date is required" });
  if (value.mode === "create" && !value.confirm) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirm"], message: "Explicit confirmation is required" });
});

export const projectControlBaselineActionSchema = z.object({
  action: z.enum(["activate", "delete"]),
  confirm: z.literal(true)
}).strict();

export const projectControlPeriodRequestSchema = z.object({
  mode: z.enum(["preview", "publish"]),
  baselineId: z.string().trim().min(1),
  dataDate: z.string().trim().min(10).max(40),
  label: z.string().trim().min(3).max(120).optional(),
  confirm: z.boolean().default(false)
}).strict().superRefine((value, context) => {
  if (Number.isNaN(new Date(value.dataDate).getTime())) context.addIssue({ code: z.ZodIssueCode.custom, path: ["dataDate"], message: "Valid reporting date is required" });
  if (value.mode === "publish" && !value.confirm) context.addIssue({ code: z.ZodIssueCode.custom, path: ["confirm"], message: "Explicit confirmation is required" });
});

export const projectControlPeriodActionSchema = z.object({
  action: z.enum(["lock", "void"]),
  confirm: z.literal(true)
}).strict();

export type ProjectControlTone = "good" | "warn" | "bad" | "info" | "neutral";
export type ProjectControlBaselineStatus = (typeof projectControlBaselineStatuses)[number];
export type ProjectControlPeriodStatus = (typeof projectControlPeriodStatuses)[number];

export type ProjectControlBaselineLineDraft = {
  budgetItemId: string | null;
  scheduleItemId: string | null;
  costCodeId: string | null;
  sequence: number;
  code: string;
  name: string;
  unit: string;
  plannedQty: number;
  budget: number;
  weight: number;
  plannedStart: string;
  plannedFinish: string;
  sourceQuality: "linked" | "inferred_project_window" | "schedule_without_budget";
};

export type ProjectControlBaselinePreview = {
  summary: {
    status: "ready" | "attention" | "blocked";
    tone: ProjectControlTone;
    budgetAtCompletion: number;
    linkedBudgetValue: number;
    scheduleCoveragePercent: number;
    budgetItemCount: number;
    scheduleItemCount: number;
    linkedScheduleItemCount: number;
    unlinkedBudgetItemCount: number;
    unlinkedScheduleItemCount: number;
    plannedStart: string;
    plannedFinish: string;
    canActivate: boolean;
  };
  lines: ProjectControlBaselineLineDraft[];
  limitations: string[];
};

export type ProjectControlStoredBaselineLine = ProjectControlBaselineLineDraft & { id: string };

export type ProjectControlBaselineRecord = {
  id: string;
  projectId: string;
  sequence: number;
  name: string;
  status: ProjectControlBaselineStatus;
  dataDate: string;
  plannedStart: string;
  plannedFinish: string;
  budgetAtCompletion: number;
  budgetItemCount: number;
  scheduleItemCount: number;
  linkedBudgetValue: number;
  scheduleCoveragePercent: number;
  limitations: string[];
  notes: string | null;
  activatedAt: string | null;
  supersededAt: string | null;
  createdAt: string;
  updatedAt: string;
  lines: ProjectControlStoredBaselineLine[];
};

export type ProjectControlProgressEntry = {
  scheduleItemId?: string | null;
  date: string | Date;
  qty: number;
  status: string;
};

export type ProjectControlPeriodLinePreview = {
  baselineLineId: string;
  sequence: number;
  code: string;
  name: string;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  plannedProgress: number;
  earnedProgress: number;
  actualCostAllocated: boolean;
  status: "not_started" | "on_plan" | "behind" | "late" | "complete" | "limited";
  sourceQuality: ProjectControlBaselineLineDraft["sourceQuality"];
};

export type ProjectControlPeriodPreview = {
  summary: {
    status: "no_data" | "not_started" | "limited" | "controlled" | "attention" | "critical";
    tone: ProjectControlTone;
    headline: string;
    dataDate: string;
    budgetAtCompletion: number;
    plannedValue: number;
    earnedValue: number;
    actualCost: number;
    costVariance: number;
    scheduleVariance: number;
    costPerformanceIndex: number | null;
    schedulePerformanceIndex: number | null;
    estimateAtCompletion: number | null;
    estimateToComplete: number | null;
    varianceAtCompletion: number | null;
    toCompletePerformanceIndex: number | null;
    plannedProgressPercent: number;
    earnedProgressPercent: number;
    forecastFinish: string | null;
    scheduleVarianceDays: number | null;
    actualCostSource: "paid_outgoing";
    actualCostAllocated: number;
    actualCostCoveragePercent: number;
  };
  coverage: {
    scheduleCoveragePercent: number;
    earnedValueCoveragePercent: number;
    actualCostCoveragePercent: number;
    progressEntryCount: number;
    scheduleActualFallbackCount: number;
    paidOutgoingCount: number;
    unallocatedActualCost: number;
  };
  lines: ProjectControlPeriodLinePreview[];
  topVariances: ProjectControlPeriodLinePreview[];
  limitations: string[];
};

export type ProjectControlPeriodRecord = {
  id: string;
  projectId: string;
  baselineId: string;
  sequence: number;
  label: string;
  dataDate: string;
  status: ProjectControlPeriodStatus;
  budgetAtCompletion: number;
  plannedValue: number;
  earnedValue: number;
  actualCost: number;
  costVariance: number;
  scheduleVariance: number;
  costPerformanceIndex: number | null;
  schedulePerformanceIndex: number | null;
  estimateAtCompletion: number | null;
  estimateToComplete: number | null;
  varianceAtCompletion: number | null;
  toCompletePerformanceIndex: number | null;
  plannedProgressPercent: number;
  earnedProgressPercent: number;
  forecastFinish: string | null;
  scheduleVarianceDays: number | null;
  actualCostSource: string;
  actualCostAllocated: number;
  actualCostCoveragePercent: number;
  coverage: ProjectControlPeriodPreview["coverage"];
  limitations: string[];
  publishedAt: string;
  lockedAt: string | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
  baseline: { id: string; sequence: number; name: string; status: string };
  lines: Array<Omit<ProjectControlPeriodLinePreview, "sourceQuality"> & { id: string }>;
};

export type ProjectControlsResponse = {
  activeBaselineId: string | null;
  latestPeriodId: string | null;
  baselines: ProjectControlBaselineRecord[];
  periods: ProjectControlPeriodRecord[];
};

const DAY_MS = 86_400_000;

function finite(value: number) {
  return Number.isFinite(value) ? value : 0;
}

function round(value: number, digits = 2) {
  const scale = 10 ** digits;
  return Math.round(finite(value) * scale) / scale;
}

function clamp(value: number, minimum = 0, maximum = 1) {
  return Math.min(Math.max(finite(value), minimum), maximum);
}

function asDate(value: string | Date) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid project controls date");
  return date;
}

function isoDate(value: string | Date) {
  return asDate(value).toISOString();
}

function plannedProgress(dataDate: Date, start: Date, finish: Date) {
  if (finish.getTime() <= start.getTime()) return dataDate >= finish ? 1 : 0;
  return clamp((dataDate.getTime() - start.getTime()) / (finish.getTime() - start.getTime()));
}

export function buildProjectControlBaselinePreview({
  project,
  budgetItems,
  scheduleItems
}: {
  project: Pick<Project, "startsAt" | "endsAt">;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
}): ProjectControlBaselinePreview {
  const projectStart = asDate(project.startsAt);
  const projectFinish = asDate(project.endsAt);
  const safeProjectFinish = projectFinish > projectStart ? projectFinish : new Date(projectStart.getTime() + DAY_MS);
  const budgetAtCompletion = round(budgetItems.reduce((total, item) => total + Math.max(item.qty * item.plannedUnitPrice, 0), 0));
  const lines: ProjectControlBaselineLineDraft[] = [];
  let linkedBudgetValue = 0;
  let linkedScheduleItemCount = 0;
  let sequence = 0;

  for (const budgetItem of [...budgetItems].sort((left, right) => `${left.section}:${left.code}`.localeCompare(`${right.section}:${right.code}`, "ru"))) {
    const budget = Math.max(budgetItem.qty * budgetItem.plannedUnitPrice, 0);
    const linkedSchedule = scheduleItems.filter((item) => item.budgetItemId === budgetItem.id);
    if (!linkedSchedule.length) {
      sequence += 1;
      lines.push({
        budgetItemId: budgetItem.id,
        scheduleItemId: null,
        costCodeId: budgetItem.costCodeId ?? null,
        sequence,
        code: budgetItem.code,
        name: budgetItem.name,
        unit: budgetItem.unit,
        plannedQty: budgetItem.qty,
        budget: round(budget),
        weight: budgetAtCompletion > 0 ? round(budget / budgetAtCompletion, 8) : 0,
        plannedStart: projectStart.toISOString(),
        plannedFinish: safeProjectFinish.toISOString(),
        sourceQuality: "inferred_project_window"
      });
      continue;
    }

    linkedBudgetValue += budget;
    linkedScheduleItemCount += linkedSchedule.length;
    const totalPlannedQty = linkedSchedule.reduce((total, item) => total + Math.max(item.plannedQty, 0), 0);
    for (const scheduleItem of linkedSchedule) {
      sequence += 1;
      const share = totalPlannedQty > 0 ? Math.max(scheduleItem.plannedQty, 0) / totalPlannedQty : 1 / linkedSchedule.length;
      const lineBudget = budget * share;
      lines.push({
        budgetItemId: budgetItem.id,
        scheduleItemId: scheduleItem.id,
        costCodeId: scheduleItem.costCodeId ?? budgetItem.costCodeId ?? null,
        sequence,
        code: budgetItem.code,
        name: scheduleItem.name || budgetItem.name,
        unit: budgetItem.unit,
        plannedQty: Math.max(scheduleItem.plannedQty, 0),
        budget: round(lineBudget),
        weight: budgetAtCompletion > 0 ? round(lineBudget / budgetAtCompletion, 8) : 0,
        plannedStart: isoDate(scheduleItem.startsAt),
        plannedFinish: isoDate(scheduleItem.endsAt),
        sourceQuality: "linked"
      });
    }
  }

  const scheduleWithoutBudget = scheduleItems.filter((item) => !item.budgetItemId || !budgetItems.some((budget) => budget.id === item.budgetItemId));
  for (const scheduleItem of scheduleWithoutBudget) {
    sequence += 1;
    lines.push({
      budgetItemId: null,
      scheduleItemId: scheduleItem.id,
      costCodeId: scheduleItem.costCodeId ?? null,
      sequence,
      code: `SCH-${String(sequence).padStart(3, "0")}`,
      name: scheduleItem.name,
      unit: "работа",
      plannedQty: Math.max(scheduleItem.plannedQty, 0),
      budget: 0,
      weight: 0,
      plannedStart: isoDate(scheduleItem.startsAt),
      plannedFinish: isoDate(scheduleItem.endsAt),
      sourceQuality: "schedule_without_budget"
    });
  }

  const plannedStarts = lines.map((line) => asDate(line.plannedStart).getTime());
  const plannedFinishes = lines.map((line) => asDate(line.plannedFinish).getTime());
  const baselinePlannedStart = plannedStarts.length ? new Date(Math.min(...plannedStarts)) : projectStart;
  const baselinePlannedFinish = plannedFinishes.length ? new Date(Math.max(...plannedFinishes)) : safeProjectFinish;

  const scheduleCoveragePercent = budgetAtCompletion > 0 ? round((linkedBudgetValue / budgetAtCompletion) * 100) : 0;
  const unlinkedBudgetItemCount = budgetItems.filter((item) => !scheduleItems.some((schedule) => schedule.budgetItemId === item.id)).length;
  const canActivate = budgetAtCompletion > 0 && scheduleItems.length > 0;
  const status = !canActivate ? "blocked" : scheduleCoveragePercent >= 80 ? "ready" : "attention";
  const limitations = [
    ...(!budgetItems.length ? ["ВОР не содержит строк затрат: BAC и веса работ не могут быть рассчитаны."] : []),
    ...(!scheduleItems.length ? ["График отсутствует: baseline нельзя активировать без плановых дат."] : []),
    ...(unlinkedBudgetItemCount ? [`${unlinkedBudgetItemCount} строк ВОР не связаны с графиком; для них временно используется окно проекта.`] : []),
    ...(scheduleWithoutBudget.length ? [`${scheduleWithoutBudget.length} работ графика не имеют строки ВОР и не участвуют в BAC/PV/EV.`] : []),
    "PV v1 распределяет бюджет линейно между плановыми датами работы; календарные ресурсы и нелинейные кривые не подменяются.",
    "Baseline является снимком. Изменения ВОР или графика после активации требуют новой ревизии."
  ];

  return {
    summary: {
      status,
      tone: status === "ready" ? "good" : status === "attention" ? "warn" : "bad",
      budgetAtCompletion,
      linkedBudgetValue: round(linkedBudgetValue),
      scheduleCoveragePercent,
      budgetItemCount: budgetItems.length,
      scheduleItemCount: scheduleItems.length,
      linkedScheduleItemCount,
      unlinkedBudgetItemCount,
      unlinkedScheduleItemCount: scheduleWithoutBudget.length,
      plannedStart: baselinePlannedStart.toISOString(),
      plannedFinish: baselinePlannedFinish.toISOString(),
      canActivate
    },
    lines,
    limitations
  };
}

export function buildProjectControlPeriodPreview({
  baseline,
  lines,
  scheduleItems,
  progressEntries,
  payments,
  dataDate
}: {
  baseline: { budgetAtCompletion: number; plannedStart: string | Date; plannedFinish: string | Date; scheduleCoveragePercent: number; limitations?: string[] };
  lines: ProjectControlStoredBaselineLine[];
  scheduleItems: ScheduleItem[];
  progressEntries: ProjectControlProgressEntry[];
  payments: Payment[];
  dataDate: string | Date;
}): ProjectControlPeriodPreview {
  const cutOff = asDate(dataDate);
  const baselineStart = asDate(baseline.plannedStart);
  const baselineFinish = asDate(baseline.plannedFinish);
  const budgetAtCompletion = round(Math.max(baseline.budgetAtCompletion, 0));
  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));
  const acceptedProgress = progressEntries.filter((entry) => entry.scheduleItemId && asDate(entry.date) <= cutOff && ["submitted", "checked", "approved"].includes(entry.status));
  const progressBySchedule = new Map<string, number>();
  for (const entry of acceptedProgress) progressBySchedule.set(entry.scheduleItemId!, (progressBySchedule.get(entry.scheduleItemId!) ?? 0) + Math.max(entry.qty, 0));

  const actualPayments = payments.filter((payment) => payment.direction === "outgoing" && payment.status === "paid" && payment.paidAt && asDate(payment.paidAt) <= cutOff);
  const actualCost = round(actualPayments.reduce((total, payment) => total + Math.max(payment.amount, 0), 0));
  const paymentByCostCode = new Map<string, number>();
  for (const payment of actualPayments) {
    if (!payment.costCodeId) continue;
    paymentByCostCode.set(payment.costCodeId, (paymentByCostCode.get(payment.costCodeId) ?? 0) + Math.max(payment.amount, 0));
  }
  const baselineBudgetByCostCode = new Map<string, number>();
  for (const line of lines) {
    if (!line.costCodeId) continue;
    baselineBudgetByCostCode.set(line.costCodeId, (baselineBudgetByCostCode.get(line.costCodeId) ?? 0) + Math.max(line.budget, 0));
  }

  let fallbackCount = 0;
  let earnedCoveredBudget = 0;
  const periodLines = lines.map<ProjectControlPeriodLinePreview>((line) => {
    const start = asDate(line.plannedStart);
    const finish = asDate(line.plannedFinish);
    const plannedShare = plannedProgress(cutOff, start, finish);
    const scheduleItem = line.scheduleItemId ? scheduleById.get(line.scheduleItemId) : undefined;
    const confirmedQty = line.scheduleItemId ? progressBySchedule.get(line.scheduleItemId) : undefined;
    let earnedShare = 0;
    if (scheduleItem && line.plannedQty > 0) {
      if (confirmedQty !== undefined) earnedShare = clamp(confirmedQty / line.plannedQty);
      else if (cutOff >= start) {
        earnedShare = clamp(Math.max(scheduleItem.actualQty, 0) / line.plannedQty);
        fallbackCount += 1;
      }
      earnedCoveredBudget += Math.max(line.budget, 0);
    }
    const plannedValue = round(line.budget * plannedShare);
    const earnedValue = round(line.budget * earnedShare);
    const costCodeActual = line.costCodeId ? paymentByCostCode.get(line.costCodeId) ?? 0 : 0;
    const costCodeBudget = line.costCodeId ? baselineBudgetByCostCode.get(line.costCodeId) ?? 0 : 0;
    const lineActualCost = costCodeActual > 0 && costCodeBudget > 0 ? round(costCodeActual * (line.budget / costCodeBudget)) : 0;
    const costVariance = round(earnedValue - lineActualCost);
    const scheduleVariance = round(earnedValue - plannedValue);
    const status = line.sourceQuality !== "linked"
      ? "limited"
      : earnedShare >= 1
        ? "complete"
        : cutOff > finish
          ? "late"
          : plannedValue > 0 && scheduleVariance / Math.max(line.budget, 1) < -0.1
            ? "behind"
            : plannedShare <= 0 && earnedShare <= 0
              ? "not_started"
              : "on_plan";
    return {
      baselineLineId: line.id,
      sequence: line.sequence,
      code: line.code,
      name: line.name,
      plannedValue,
      earnedValue,
      actualCost: lineActualCost,
      costVariance,
      scheduleVariance,
      plannedProgress: round(plannedShare * 100),
      earnedProgress: round(earnedShare * 100),
      actualCostAllocated: lineActualCost > 0,
      status,
      sourceQuality: line.sourceQuality
    };
  });

  const plannedValue = round(periodLines.reduce((total, line) => total + line.plannedValue, 0));
  const earnedValue = round(periodLines.reduce((total, line) => total + line.earnedValue, 0));
  const actualCostAllocated = round(Math.min(periodLines.reduce((total, line) => total + line.actualCost, 0), actualCost));
  const costVariance = round(earnedValue - actualCost);
  const scheduleVariance = round(earnedValue - plannedValue);
  const costPerformanceIndex = actualCost > 0 ? round(earnedValue / actualCost, 4) : null;
  const schedulePerformanceIndex = plannedValue > 0 ? round(earnedValue / plannedValue, 4) : null;
  const estimateAtCompletion = costPerformanceIndex && costPerformanceIndex > 0 ? round(budgetAtCompletion / costPerformanceIndex) : null;
  const estimateToComplete = estimateAtCompletion === null ? null : round(Math.max(estimateAtCompletion - actualCost, 0));
  const varianceAtCompletion = estimateAtCompletion === null ? null : round(budgetAtCompletion - estimateAtCompletion);
  const toCompletePerformanceIndex = budgetAtCompletion > actualCost ? round((budgetAtCompletion - earnedValue) / (budgetAtCompletion - actualCost), 4) : null;
  const plannedProgressPercent = budgetAtCompletion > 0 ? round((plannedValue / budgetAtCompletion) * 100) : 0;
  const earnedProgressPercent = budgetAtCompletion > 0 ? round((earnedValue / budgetAtCompletion) * 100) : 0;
  const actualCostCoveragePercent = actualCost > 0 ? round(clamp(actualCostAllocated / actualCost) * 100) : 0;
  const earnedValueCoveragePercent = budgetAtCompletion > 0 ? round((earnedCoveredBudget / budgetAtCompletion) * 100) : 0;
  const duration = Math.max(baselineFinish.getTime() - baselineStart.getTime(), DAY_MS);
  const forecastFinish = schedulePerformanceIndex && schedulePerformanceIndex > 0
    ? new Date(baselineStart.getTime() + duration / schedulePerformanceIndex)
    : null;
  const scheduleVarianceDays = forecastFinish ? Math.ceil((forecastFinish.getTime() - baselineFinish.getTime()) / DAY_MS) : null;
  const unallocatedActualCost = round(Math.max(actualCost - actualCostAllocated, 0));
  const missingActualCost = earnedValue > 0 && actualCost === 0;
  const dataLimited = baseline.scheduleCoveragePercent < 80 || earnedValueCoveragePercent < 80 || missingActualCost || (actualCost > 0 && actualCostCoveragePercent < 80);
  const critical = (costPerformanceIndex !== null && costPerformanceIndex < 0.85) || (schedulePerformanceIndex !== null && schedulePerformanceIndex < 0.85);
  const attention = (costPerformanceIndex !== null && costPerformanceIndex < 0.95) || (schedulePerformanceIndex !== null && schedulePerformanceIndex < 0.95);
  const notStarted = Boolean(budgetAtCompletion && !plannedValue && !earnedValue && !actualCost);
  const status = !budgetAtCompletion ? "no_data" : notStarted ? "not_started" : critical ? "critical" : dataLimited ? "limited" : attention ? "attention" : "controlled";
  const tone: ProjectControlTone = status === "controlled" ? "good" : status === "critical" ? "bad" : status === "no_data" ? "info" : "warn";
  const headline = status === "no_data"
    ? "Для Project Controls нужен активный baseline"
    : status === "not_started"
      ? "На выбранную дату плановое освоение ещё не началось"
    : status === "limited"
      ? "Показатели рассчитаны, но покрытие исходных данных требует проверки"
      : status === "critical"
        ? "Стоимость или сроки выходят за критический порог"
        : status === "attention"
          ? "Период требует корректирующих действий"
          : "Стоимость и сроки находятся в управленческом коридоре";
  const limitations = [
    ...(baseline.limitations ?? []),
    ...(earnedValueCoveragePercent < 80 ? [`EV подтвержден для ${earnedValueCoveragePercent.toFixed(1)}% BAC; остальные работы не имеют связанного факта.`] : []),
    ...(fallbackCount ? [`Для ${fallbackCount} работ использован накопительный actualQty графика из-за отсутствия подтвержденных записей выполнения на дату.`] : []),
    ...(missingActualCost ? ["Выполнение подтверждено, но оплаченный факт затрат отсутствует: CPI, EAC и финансовый прогноз пока не рассчитываются."] : []),
    ...(unallocatedActualCost > 0 ? [`${Math.round(unallocatedActualCost).toLocaleString("ru-RU")} ₽ фактических оплат не распределены по cost code и учитываются только в агрегированном AC.`] : []),
    "AC v1 включает только оплаченные исходящие платежи на дату отчета; начисления и незакрытая первичка должны быть отражены отдельно.",
    "CPI/SPI и EAC являются управленческими индикаторами и не заменяют бухгалтерский учет или утвержденный календарно-сетевой расчет."
  ];
  const topVariances = [...periodLines]
    .filter((line) => line.plannedValue || line.earnedValue || line.actualCost || line.scheduleVariance || line.costVariance)
    .sort((left, right) => (Math.abs(right.scheduleVariance) + Math.abs(right.costVariance)) - (Math.abs(left.scheduleVariance) + Math.abs(left.costVariance)))
    .slice(0, 8);

  return {
    summary: {
      status,
      tone,
      headline,
      dataDate: cutOff.toISOString(),
      budgetAtCompletion,
      plannedValue,
      earnedValue,
      actualCost,
      costVariance,
      scheduleVariance,
      costPerformanceIndex,
      schedulePerformanceIndex,
      estimateAtCompletion,
      estimateToComplete,
      varianceAtCompletion,
      toCompletePerformanceIndex,
      plannedProgressPercent,
      earnedProgressPercent,
      forecastFinish: forecastFinish?.toISOString() ?? null,
      scheduleVarianceDays,
      actualCostSource: "paid_outgoing",
      actualCostAllocated,
      actualCostCoveragePercent
    },
    coverage: {
      scheduleCoveragePercent: round(baseline.scheduleCoveragePercent),
      earnedValueCoveragePercent,
      actualCostCoveragePercent,
      progressEntryCount: acceptedProgress.length,
      scheduleActualFallbackCount: fallbackCount,
      paidOutgoingCount: actualPayments.length,
      unallocatedActualCost
    },
    lines: periodLines,
    topVariances,
    limitations: [...new Set(limitations)]
  };
}
