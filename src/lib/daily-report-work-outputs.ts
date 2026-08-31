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
  laborHours: z.coerce.number().positive().max(10_000_000)
}).strict().transform((output) => ({
  ...output,
  scheduleItemId: output.scheduleItemId?.trim() || undefined,
  profession: compactText(output.profession),
  workName: compactText(output.workName),
  unit: normalizeDailyReportWorkOutputUnit(output.unit)
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
  return issues;
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
