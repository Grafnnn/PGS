import { z } from "zod";
import type { DailyReportWorkOutput } from "@/lib/types";
import type { ProductivityNormSample } from "@/lib/workforce-productivity";

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeDailyReportWorkOutputUnit(value: string) {
  const unit = compactText(value)
    .replace(/\s+/g, "")
    .toLocaleLowerCase("ru-RU");
  const aliases: Record<string, string> = {
    "м2": "м²",
    "м^2": "м²",
    "м²": "м²",
    "м3": "м³",
    "м^3": "м³",
    "м³": "м³",
    "шт.": "шт",
    "тн": "т",
    "тонн": "т",
    "пог.м": "м.п.",
    "п.м.": "м.п."
  };
  return aliases[unit] ?? compactText(value);
}

export const dailyReportWorkOutputSchema = z.object({
  scheduleItemId: z.string().trim().min(1).max(200).optional().nullable(),
  profession: z.string().trim().min(2).max(160),
  workName: z.string().trim().min(2).max(240),
  quantity: z.coerce.number().positive().max(1_000_000_000),
  unit: z.string().trim().min(1).max(40),
  laborHours: z.coerce.number().positive().max(10_000_000),
  workerCount: z.coerce.number().int().positive().max(100_000).optional(),
  hoursPerWorker: z.coerce.number().positive().max(24).optional(),
  laborAllocationMode: z.enum(["auto", "manual"]).optional()
}).strict().superRefine((output, context) => {
  if ((output.workerCount === undefined) !== (output.hoursPerWorker === undefined)) {
    context.addIssue({ code: z.ZodIssueCode.custom, message: "Количество людей и часы на человека должны быть указаны вместе." });
  }
}).transform((output) => ({
  ...output,
  scheduleItemId: output.scheduleItemId?.trim() || undefined,
  profession: compactText(output.profession),
  workName: compactText(output.workName),
  unit: normalizeDailyReportWorkOutputUnit(output.unit),
  laborHours: output.workerCount !== undefined && output.hoursPerWorker !== undefined
    ? dailyReportLaborHours(output.workerCount, output.hoursPerWorker)
    : output.laborHours
}));

export const dailyReportWorkOutputsSchema = z.array(dailyReportWorkOutputSchema).max(40);

export function parseDailyReportWorkOutputs(value: unknown): DailyReportWorkOutput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((item) => {
    const parsed = dailyReportWorkOutputSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function dailyReportWorkOutputsComplete(outputs: DailyReportWorkOutput[]) {
  return outputs.every((item) => Object.keys(dailyReportWorkOutputIssues(item)).length === 0);
}

export type DailyReportWorkOutputIssueField = keyof DailyReportWorkOutput;

export function dailyReportWorkOutputIssues(output: DailyReportWorkOutput): Partial<Record<DailyReportWorkOutputIssueField, string>> {
  const issues: Partial<Record<DailyReportWorkOutputIssueField, string>> = {};
  if (output.profession.trim().length < 2 || output.profession.length > 160) issues.profession = "Укажите профессию (от 2 до 160 символов).";
  if (output.workName.trim().length < 2 || output.workName.length > 240) issues.workName = "Укажите выполненную работу (от 2 до 240 символов).";
  if (!Number.isFinite(output.quantity) || output.quantity <= 0 || output.quantity > 1_000_000_000) issues.quantity = "Объём должен быть больше нуля и не превышать 1 млрд.";
  if (!output.unit.trim() || output.unit.length > 40) issues.unit = "Укажите единицу измерения (до 40 символов).";
  if (!Number.isFinite(output.laborHours) || output.laborHours <= 0 || output.laborHours > 10_000_000) issues.laborHours = "Трудозатраты должны быть больше нуля и не превышать 10 млн часов.";
  if (output.workerCount !== undefined && (!Number.isInteger(output.workerCount) || output.workerCount <= 0 || output.workerCount > 100_000)) issues.workerCount = "Количество людей должно быть целым числом больше нуля.";
  if (output.hoursPerWorker !== undefined && (!Number.isFinite(output.hoursPerWorker) || output.hoursPerWorker <= 0 || output.hoursPerWorker > 24)) issues.hoursPerWorker = "Часы на человека должны быть больше нуля и не превышать 24.";
  if ((output.workerCount === undefined) !== (output.hoursPerWorker === undefined)) {
    issues.workerCount = "Укажите количество людей и часы на человека.";
    issues.hoursPerWorker = "Укажите количество людей и часы на человека.";
  }
  return issues;
}

function roundLabor(value: number) {
  return Math.round(value * 1000) / 1000;
}

function roundHours(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

export function dailyReportLaborHours(workerCount: number, hoursPerWorker: number) {
  if (!Number.isFinite(workerCount) || !Number.isFinite(hoursPerWorker)) return 0;
  return roundLabor(Math.max(0, workerCount) * Math.max(0, hoursPerWorker));
}

export function dailyReportLaborCapacity(headcount: number, shiftHours: number) {
  return dailyReportLaborHours(headcount, shiftHours);
}

export function dailyReportWorkOutputAllocation(output: DailyReportWorkOutput, shiftHours: number) {
  if (output.workerCount !== undefined && output.hoursPerWorker !== undefined) {
    return { workerCount: output.workerCount, hoursPerWorker: output.hoursPerWorker };
  }
  if (!Number.isFinite(output.laborHours) || output.laborHours <= 0) {
    return { workerCount: 0, hoursPerWorker: 0 };
  }
  const safeShiftHours = Number.isFinite(shiftHours) && shiftHours > 0 ? shiftHours : 8;
  const workerCount = Math.max(1, Math.ceil(Math.max(0, output.laborHours) / safeShiftHours));
  return {
    workerCount,
    hoursPerWorker: roundLabor(output.laborHours / workerCount)
  };
}

export function allocateDailyReportLabor(
  outputs: DailyReportWorkOutput[],
  headcount: number,
  shiftHours: number,
  force = false
): DailyReportWorkOutput[] {
  const capacity = dailyReportLaborCapacity(headcount, shiftHours);
  if (!outputs.length || capacity <= 0) return outputs;
  const autoIndexes = outputs.flatMap((output, index) => (
    force || output.laborAllocationMode === "auto" || output.laborHours <= 0 ? [index] : []
  ));
  if (!autoIndexes.length) return outputs;
  const autoSet = new Set(autoIndexes);
  const manuallyAllocated = force ? 0 : outputs.reduce((sum, output, index) => (
    autoSet.has(index) ? sum : sum + Math.max(0, output.laborHours)
  ), 0);
  const availableUnits = Math.max(0, Math.round((capacity - manuallyAllocated) * 1000));
  if (availableUnits <= 0) return outputs.map((output, index) => autoSet.has(index)
    ? { ...output, workerCount: undefined, hoursPerWorker: undefined, laborHours: 0, laborAllocationMode: "auto" as const }
    : output);
  const baseUnits = Math.floor(availableUnits / autoIndexes.length);
  const extraUnits = availableUnits % autoIndexes.length;
  const autoPosition = new Map(autoIndexes.map((index, position) => [index, position]));
  return outputs.map((output, index) => {
    if (!autoSet.has(index)) return output;
    const position = autoPosition.get(index) ?? 0;
    const share = (baseUnits + (position < extraUnits ? 1 : 0)) / 1000;
    if (share <= 0) {
      return { ...output, workerCount: undefined, hoursPerWorker: undefined, laborHours: 0, laborAllocationMode: "auto" as const };
    }
    const workerCount = Math.max(1, Math.floor(headcount));
    const hoursPerWorker = roundHours(share / workerCount);
    return {
      ...output,
      workerCount,
      hoursPerWorker,
      laborHours: dailyReportLaborHours(workerCount, hoursPerWorker),
      laborAllocationMode: "auto" as const
    };
  });
}

export function dailyReportWorkOutputTotals(outputs: DailyReportWorkOutput[]) {
  return {
    rows: outputs.length,
    laborHours: Math.round(outputs.reduce((sum, output) => sum + (Number.isFinite(output.laborHours) ? Math.max(0, output.laborHours) : 0), 0) * 1000) / 1000
  };
}

function baseUnit(value: string) {
  return value
    .trim()
    .replace(/\s*\/\s*(?:чел(?:овеко)?[.\s-]*мес(?:яц)?(?:а|ев)?|чел(?:овек)?)[.\s]*$/iu, "")
    .trim();
}

export function dailyReportWorkOutputNorm(output: DailyReportWorkOutput, workingHoursPerMonth = 160) {
  if (output.quantity <= 0 || output.laborHours <= 0 || workingHoursPerMonth <= 0) return null;
  const unit = baseUnit(output.unit);
  if (!unit) return null;
  return {
    norm: Math.round(output.quantity * workingHoursPerMonth / output.laborHours * 1000) / 1000,
    unit: `${unit}/чел.-мес.`
  };
}

export function approvedDailyReportProductivitySamples(
  reports: Array<{ status: string; workOutputs: unknown }>,
  workingHoursPerMonth = 160
): ProductivityNormSample[] {
  return reports.flatMap((report) => {
    if (report.status !== "approved") return [];
    return parseDailyReportWorkOutputs(report.workOutputs).flatMap((output) => {
      const actual = dailyReportWorkOutputNorm(output, workingHoursPerMonth);
      if (!actual) return [];
      return [{
        category: "worker" as const,
        profession: output.profession,
        function: output.workName,
        norm: actual.norm,
        unit: actual.unit,
        weight: Math.max(0.1, Math.min(24, output.laborHours / workingHoursPerMonth)),
        source: "daily-report" as const
      }];
    });
  });
}
