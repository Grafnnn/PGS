import type {
  DailyReport,
  DailyReportEquipmentActual,
  DailyReportImpactSummary,
  DailyReportMaterialActual,
  DailyReportWorkOutput,
  Material,
  ScheduleItem
} from "@/lib/types";

export type DailyProgressImpactStatus = "ready" | "partial" | "blocked" | "applied" | "not_applicable";

export interface DailyProgressScheduleUpdate {
  scheduleItemId: string;
  budgetItemId: string | null;
  name: string;
  quantity: number;
  plannedQty: number;
  beforeActualQty: number;
  afterActualQty: number;
  beforeStatus: ScheduleItem["status"];
  nextStatus: ScheduleItem["status"];
  outputIndexes: number[];
}

export interface DailyProgressMaterialUpdate {
  materialId: string;
  name: string;
  unit: string;
  receivedQty: number;
  consumedQty: number;
  requiredQty: number;
  beforeDeliveredQty: number;
  afterDeliveredQty: number;
  beforeConsumedQty: number;
  afterConsumedQty: number;
  beforeStatus: Material["status"];
  nextStatus: Material["status"];
  actualIndexes: number[];
}

export interface DailyProgressEntryDraft {
  outputIndex: number;
  scheduleItemId: string;
  workName: string;
  profession: string;
  unit: string;
  quantity: number;
  laborHours: number;
}

export interface DailyProgressImpactPreview {
  reportId: string;
  reportDate: string;
  status: DailyProgressImpactStatus;
  warnings: string[];
  blockers: string[];
  scheduleUpdates: DailyProgressScheduleUpdate[];
  materialUpdates: DailyProgressMaterialUpdate[];
  progressEntries: DailyProgressEntryDraft[];
  labor: {
    workers: number;
    engineers: number;
    laborHours: number;
    professions: string[];
  };
  equipment: {
    entries: number;
    units: number;
    hours: number;
    downtimeHours: number;
  };
  acceptance: {
    candidateCount: number;
    budgetItemIds: string[];
  };
  riskAction: {
    required: boolean;
    priority: "medium" | "high";
    title: string;
    description: string;
  } | null;
  summary: DailyReportImpactSummary;
}

type ReportInput = Pick<
  DailyReport,
  | "id"
  | "date"
  | "author"
  | "workers"
  | "engineers"
  | "downtime"
  | "issues"
  | "workOutputs"
  | "materialActuals"
  | "equipmentActuals"
  | "impactStatus"
  | "impactSummary"
>;

function round(value: number) {
  return Math.round((value + Number.EPSILON) * 1000) / 1000;
}

function normalizedUnit(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, "");
}

function scheduleNextStatus(item: ScheduleItem, afterActualQty: number): ScheduleItem["status"] {
  if (item.status === "delayed" || item.status === "stopped" || item.status === "done") return item.status;
  if (item.plannedQty > 0 && afterActualQty >= item.plannedQty) return "done";
  if (afterActualQty > 0 && item.status === "not_started") return "in_progress";
  return item.status;
}

function materialNextStatus(item: Material, afterDeliveredQty: number, afterConsumedQty: number): Material["status"] {
  if (item.status === "cancelled" || item.status === "closed") return item.status;
  if (item.requiredQty > 0 && afterConsumedQty >= item.requiredQty) return "closed";
  if (item.requiredQty > 0 && afterDeliveredQty >= item.requiredQty) return "delivered";
  return item.status;
}

function buildScheduleUpdates(
  outputs: DailyReportWorkOutput[],
  scheduleItems: ScheduleItem[],
  warnings: string[],
  blockers: string[]
) {
  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));
  const grouped = new Map<string, { quantity: number; outputIndexes: number[] }>();
  const progressEntries: DailyProgressEntryDraft[] = [];

  outputs.forEach((output, outputIndex) => {
    if (!output.scheduleItemId) {
      warnings.push(`Строка «${output.workName}» не привязана к графику и останется только фактом ФОТ/выработки.`);
      return;
    }
    const scheduleItem = scheduleById.get(output.scheduleItemId);
    if (!scheduleItem) {
      blockers.push(`Для строки «${output.workName}» не найдена выбранная работа графика.`);
      return;
    }
    const current = grouped.get(scheduleItem.id) ?? { quantity: 0, outputIndexes: [] };
    current.quantity = round(current.quantity + output.quantity);
    current.outputIndexes.push(outputIndex);
    grouped.set(scheduleItem.id, current);
    progressEntries.push({
      outputIndex,
      scheduleItemId: scheduleItem.id,
      workName: output.workName,
      profession: output.profession,
      unit: output.unit,
      quantity: output.quantity,
      laborHours: output.laborHours
    });
  });

  const updates = [...grouped.entries()].map(([scheduleItemId, value]) => {
    const item = scheduleById.get(scheduleItemId)!;
    const afterActualQty = round(item.actualQty + value.quantity);
    if (item.plannedQty > 0 && afterActualQty > item.plannedQty) {
      warnings.push(`Факт по «${item.name}» превысит план на ${round(afterActualQty - item.plannedQty).toLocaleString("ru-RU")} ед.`);
    }
    return {
      scheduleItemId,
      budgetItemId: item.budgetItemId ?? null,
      name: item.name,
      quantity: value.quantity,
      plannedQty: item.plannedQty,
      beforeActualQty: item.actualQty,
      afterActualQty,
      beforeStatus: item.status,
      nextStatus: scheduleNextStatus(item, afterActualQty),
      outputIndexes: value.outputIndexes
    };
  });

  return { updates, progressEntries };
}

function buildMaterialUpdates(
  actuals: DailyReportMaterialActual[],
  materials: Material[],
  warnings: string[],
  blockers: string[]
) {
  const materialById = new Map(materials.map((item) => [item.id, item]));
  const grouped = new Map<string, { receivedQty: number; consumedQty: number; actualIndexes: number[] }>();

  actuals.forEach((actual, actualIndex) => {
    const material = materialById.get(actual.materialId);
    if (!material) {
      blockers.push(`Для строки материала №${actualIndex + 1} не найдена выбранная позиция.`);
      return;
    }
    if (material.status === "cancelled") {
      blockers.push(`Материал «${material.name}» отменён и не может принимать новый факт.`);
      return;
    }
    if (normalizedUnit(actual.unit) !== normalizedUnit(material.unit)) {
      blockers.push(`Единица «${actual.unit}» не совпадает с единицей «${material.unit}» у материала «${material.name}».`);
      return;
    }
    const current = grouped.get(material.id) ?? { receivedQty: 0, consumedQty: 0, actualIndexes: [] };
    if (actual.kind === "received") current.receivedQty = round(current.receivedQty + actual.quantity);
    else current.consumedQty = round(current.consumedQty + actual.quantity);
    current.actualIndexes.push(actualIndex);
    grouped.set(material.id, current);
  });

  return [...grouped.entries()].map(([materialId, value]) => {
    const item = materialById.get(materialId)!;
    const afterDeliveredQty = round(item.deliveredQty + value.receivedQty);
    const afterConsumedQty = round(item.consumedQty + value.consumedQty);
    if (afterConsumedQty > afterDeliveredQty) {
      warnings.push(`Расход «${item.name}» станет выше учтённой поставки на ${round(afterConsumedQty - afterDeliveredQty).toLocaleString("ru-RU")} ${item.unit}.`);
    }
    return {
      materialId,
      name: item.name,
      unit: item.unit,
      receivedQty: value.receivedQty,
      consumedQty: value.consumedQty,
      requiredQty: item.requiredQty,
      beforeDeliveredQty: item.deliveredQty,
      afterDeliveredQty,
      beforeConsumedQty: item.consumedQty,
      afterConsumedQty,
      beforeStatus: item.status,
      nextStatus: materialNextStatus(item, afterDeliveredQty, afterConsumedQty),
      actualIndexes: value.actualIndexes
    };
  });
}

function equipmentSummary(actuals: DailyReportEquipmentActual[]) {
  return actuals.reduce(
    (summary, item) => ({
      entries: summary.entries + 1,
      units: summary.units + item.quantity,
      hours: round(summary.hours + item.hours),
      downtimeHours: round(summary.downtimeHours + item.downtimeHours)
    }),
    { entries: 0, units: 0, hours: 0, downtimeHours: 0 }
  );
}

export function buildDailyProgressImpact(
  report: ReportInput,
  scheduleItems: ScheduleItem[],
  materials: Material[]
): DailyProgressImpactPreview {
  const outputs = report.workOutputs ?? [];
  const materialActuals = report.materialActuals ?? [];
  const equipment = equipmentSummary(report.equipmentActuals ?? []);
  const warnings: string[] = [];
  const blockers: string[] = [];
  const { updates: scheduleUpdates, progressEntries } = buildScheduleUpdates(outputs, scheduleItems, warnings, blockers);
  const materialUpdates = buildMaterialUpdates(materialActuals, materials, warnings, blockers);
  const issues = report.issues.trim();
  const downtime = report.downtime.trim();
  const riskActionRequired = Boolean(issues || downtime || equipment.downtimeHours > 0);
  const actionableCount = progressEntries.length + materialUpdates.length + (riskActionRequired ? 1 : 0);
  if (!actionableCount && !blockers.length) {
    blockers.push("Нет привязанных работ, структурированных материалов или отклонений для применения.");
  }

  const budgetItemIds = [...new Set(scheduleUpdates.map((item) => item.budgetItemId).filter((value): value is string => Boolean(value)))];
  const linkedWorkOutputCount = progressEntries.length;
  const unlinkedWorkOutputCount = Math.max(0, outputs.length - linkedWorkOutputCount);
  const laborHours = round(outputs.reduce((sum, item) => sum + item.laborHours, 0));
  const computedSummary: DailyReportImpactSummary = {
    scheduleItemCount: scheduleUpdates.length,
    progressEntryCount: progressEntries.length,
    materialUpdateCount: materialUpdates.length,
    linkedWorkOutputCount,
    unlinkedWorkOutputCount,
    laborHours,
    equipmentHours: equipment.hours,
    acceptanceCandidateCount: budgetItemIds.length,
    actionId: null
  };
  const summary = report.impactStatus === "applied" && report.impactSummary
    ? report.impactSummary
    : report.impactStatus === "not_applicable"
      ? {
          scheduleItemCount: 0,
          progressEntryCount: 0,
          materialUpdateCount: 0,
          linkedWorkOutputCount: 0,
          unlinkedWorkOutputCount: outputs.length,
          laborHours,
          equipmentHours: equipment.hours,
          acceptanceCandidateCount: 0,
          actionId: null
        }
      : computedSummary;
  const status: DailyProgressImpactStatus =
    report.impactStatus === "applied"
      ? "applied"
      : report.impactStatus === "not_applicable"
        ? "not_applicable"
        : blockers.length
          ? "blocked"
          : warnings.length
            ? "partial"
            : "ready";
  const details = [
    issues ? `Проблемы: ${issues}` : "",
    downtime ? `Простои: ${downtime}` : "",
    equipment.downtimeHours > 0 ? `Простой техники: ${equipment.downtimeHours.toLocaleString("ru-RU")} маш.-ч.` : ""
  ].filter(Boolean);

  return {
    reportId: report.id,
    reportDate: report.date,
    status,
    warnings: status === "applied" || status === "not_applicable" ? [] : warnings,
    blockers: status === "applied" || status === "not_applicable" ? [] : blockers,
    scheduleUpdates: status === "applied" || status === "not_applicable" ? [] : scheduleUpdates,
    materialUpdates: status === "applied" || status === "not_applicable" ? [] : materialUpdates,
    progressEntries: status === "applied" || status === "not_applicable" ? [] : progressEntries,
    labor: {
      workers: report.workers,
      engineers: report.engineers,
      laborHours,
      professions: [...new Set(outputs.map((item) => item.profession).filter(Boolean))]
    },
    equipment,
    acceptance: {
      candidateCount: status === "applied" ? summary.acceptanceCandidateCount : status === "not_applicable" ? 0 : budgetItemIds.length,
      budgetItemIds: status === "applied" || status === "not_applicable" ? [] : budgetItemIds
    },
    riskAction: status !== "applied" && status !== "not_applicable" && riskActionRequired
      ? {
          required: true,
          priority: downtime || equipment.downtimeHours > 0 ? "high" : "medium",
          title: `Разобрать отклонения рапорта за ${report.date}`,
          description: details.join("\n").slice(0, 2000)
        }
      : null,
    summary
  };
}
