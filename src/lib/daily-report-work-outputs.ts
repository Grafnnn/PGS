import { z } from "zod";
import type { DailyReportWorkOutput } from "@/lib/types";
import type { ProductivityNormSample } from "@/lib/workforce-productivity";

export const dailyReportWorkOutputSchema = z.object({
  profession: z.string().trim().min(2).max(160),
  workName: z.string().trim().min(2).max(240),
  quantity: z.coerce.number().positive().max(1_000_000_000),
  unit: z.string().trim().min(1).max(40),
  laborHours: z.coerce.number().positive().max(10_000_000)
}).strict();

export const dailyReportWorkOutputsSchema = z.array(dailyReportWorkOutputSchema).max(40);

export function parseDailyReportWorkOutputs(value: unknown): DailyReportWorkOutput[] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 40).flatMap((item) => {
    const parsed = dailyReportWorkOutputSchema.safeParse(item);
    return parsed.success ? [parsed.data] : [];
  });
}

export function dailyReportWorkOutputsComplete(outputs: DailyReportWorkOutput[]) {
  return outputs.every((item) =>
    item.profession.trim().length >= 2 &&
    item.workName.trim().length >= 2 &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    item.unit.trim().length > 0 &&
    Number.isFinite(item.laborHours) &&
    item.laborHours > 0
  );
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
