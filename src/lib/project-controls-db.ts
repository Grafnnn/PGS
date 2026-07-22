import { Prisma } from "@prisma/client";
import type { ProjectControlBaselineLineDraft, ProjectControlBaselineStatus, ProjectControlPeriodStatus } from "@/lib/project-controls";

export const projectControlBaselineInclude = Prisma.validator<Prisma.ProjectControlBaselineInclude>()({
  lines: { orderBy: { sequence: "asc" } }
});

export const projectControlPeriodInclude = Prisma.validator<Prisma.ProjectControlPeriodInclude>()({
  baseline: { select: { id: true, sequence: true, name: true, status: true } },
  lines: { orderBy: { sequence: "asc" } }
});

type BaselineRecord = Prisma.ProjectControlBaselineGetPayload<{ include: typeof projectControlBaselineInclude }>;
type PeriodRecord = Prisma.ProjectControlPeriodGetPayload<{ include: typeof projectControlPeriodInclude }>;

function stringList(value: Prisma.JsonValue) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

export function serializeProjectControlBaseline(item: BaselineRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    sequence: item.sequence,
    name: item.name,
    status: item.status as ProjectControlBaselineStatus,
    dataDate: item.dataDate.toISOString(),
    plannedStart: item.plannedStart.toISOString(),
    plannedFinish: item.plannedFinish.toISOString(),
    budgetAtCompletion: Number(item.budgetAtCompletion),
    budgetItemCount: item.budgetItemCount,
    scheduleItemCount: item.scheduleItemCount,
    linkedBudgetValue: Number(item.linkedBudgetValue),
    scheduleCoveragePercent: Number(item.scheduleCoveragePercent),
    limitations: stringList(item.limitations),
    notes: item.notes,
    activatedAt: item.activatedAt?.toISOString() ?? null,
    supersededAt: item.supersededAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    lines: item.lines.map((line) => ({
      id: line.id,
      baselineId: line.baselineId,
      budgetItemId: line.budgetItemId,
      scheduleItemId: line.scheduleItemId,
      costCodeId: line.costCodeId,
      sequence: line.sequence,
      code: line.code,
      name: line.name,
      unit: line.unit,
      plannedQty: Number(line.plannedQty),
      budget: Number(line.budget),
      weight: Number(line.weight),
      plannedStart: line.plannedStart.toISOString(),
      plannedFinish: line.plannedFinish.toISOString(),
      sourceQuality: line.sourceQuality as ProjectControlBaselineLineDraft["sourceQuality"]
    }))
  };
}

export function serializeProjectControlPeriod(item: PeriodRecord) {
  const nullableNumber = (value: Prisma.Decimal | null) => value === null ? null : Number(value);
  return {
    id: item.id,
    projectId: item.projectId,
    baselineId: item.baselineId,
    sequence: item.sequence,
    label: item.label,
    dataDate: item.dataDate.toISOString(),
    status: item.status as ProjectControlPeriodStatus,
    budgetAtCompletion: Number(item.budgetAtCompletion),
    plannedValue: Number(item.plannedValue),
    earnedValue: Number(item.earnedValue),
    actualCost: Number(item.actualCost),
    costVariance: Number(item.costVariance),
    scheduleVariance: Number(item.scheduleVariance),
    costPerformanceIndex: nullableNumber(item.costPerformanceIndex),
    schedulePerformanceIndex: nullableNumber(item.schedulePerformanceIndex),
    estimateAtCompletion: nullableNumber(item.estimateAtCompletion),
    estimateToComplete: nullableNumber(item.estimateToComplete),
    varianceAtCompletion: nullableNumber(item.varianceAtCompletion),
    toCompletePerformanceIndex: nullableNumber(item.toCompletePerformanceIndex),
    plannedProgressPercent: Number(item.plannedProgressPercent),
    earnedProgressPercent: Number(item.earnedProgressPercent),
    forecastFinish: item.forecastFinish?.toISOString() ?? null,
    scheduleVarianceDays: item.scheduleVarianceDays,
    actualCostSource: item.actualCostSource,
    actualCostAllocated: Number(item.actualCostAllocated),
    actualCostCoveragePercent: Number(item.actualCostCoveragePercent),
    coverage: item.coverage,
    limitations: stringList(item.limitations),
    publishedAt: item.publishedAt.toISOString(),
    lockedAt: item.lockedAt?.toISOString() ?? null,
    voidedAt: item.voidedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    baseline: item.baseline,
    lines: item.lines.map((line) => ({
      id: line.id,
      baselineLineId: line.baselineLineId,
      sequence: line.sequence,
      code: line.code,
      name: line.name,
      plannedValue: Number(line.plannedValue),
      earnedValue: Number(line.earnedValue),
      actualCost: Number(line.actualCost),
      costVariance: Number(line.costVariance),
      scheduleVariance: Number(line.scheduleVariance),
      plannedProgress: Number(line.plannedProgress),
      earnedProgress: Number(line.earnedProgress),
      actualCostAllocated: line.actualCostAllocated,
      status: line.status
    }))
  };
}
