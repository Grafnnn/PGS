import { z } from "zod";
import type {
  DailyReportEquipmentActual,
  DailyReportImpactSummary,
  DailyReportMaterialActual
} from "@/lib/types";

export const dailyReportMaterialActualSchema = z.object({
  materialId: z.string().trim().min(1).max(160),
  kind: z.enum(["received", "consumed"]),
  quantity: z.coerce.number().positive().max(1_000_000_000),
  unit: z.string().trim().min(1).max(40),
  note: z.string().trim().max(500).optional()
}).strict();

export const dailyReportEquipmentActualSchema = z.object({
  name: z.string().trim().min(2).max(180),
  quantity: z.coerce.number().int().positive().max(10_000),
  hours: z.coerce.number().positive().max(100_000),
  downtimeHours: z.coerce.number().nonnegative().max(100_000).default(0),
  note: z.string().trim().max(500).optional()
}).strict();

export const dailyReportMaterialActualsSchema = z.array(dailyReportMaterialActualSchema).max(60);
export const dailyReportEquipmentActualsSchema = z.array(dailyReportEquipmentActualSchema).max(30);

const dailyReportImpactSummarySchema = z.object({
  scheduleItemCount: z.number().int().nonnegative(),
  progressEntryCount: z.number().int().nonnegative(),
  materialUpdateCount: z.number().int().nonnegative(),
  linkedWorkOutputCount: z.number().int().nonnegative(),
  unlinkedWorkOutputCount: z.number().int().nonnegative(),
  laborHours: z.number().nonnegative(),
  equipmentHours: z.number().nonnegative(),
  acceptanceCandidateCount: z.number().int().nonnegative(),
  actionId: z.string().nullable().optional()
}).strict();

export function parseDailyReportMaterialActuals(value: unknown): DailyReportMaterialActual[] {
  const parsed = dailyReportMaterialActualsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseDailyReportEquipmentActuals(value: unknown): DailyReportEquipmentActual[] {
  const parsed = dailyReportEquipmentActualsSchema.safeParse(value);
  return parsed.success ? parsed.data : [];
}

export function parseDailyReportImpactSummary(value: unknown): DailyReportImpactSummary | null {
  const parsed = dailyReportImpactSummarySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function dailyReportMaterialActualsComplete(actuals: DailyReportMaterialActual[]) {
  return actuals.every((item) =>
    item.materialId.trim().length > 0 &&
    Number.isFinite(item.quantity) &&
    item.quantity > 0 &&
    item.unit.trim().length > 0
  );
}

export function dailyReportEquipmentActualsComplete(actuals: DailyReportEquipmentActual[]) {
  return actuals.every((item) =>
    item.name.trim().length >= 2 &&
    Number.isInteger(item.quantity) &&
    item.quantity > 0 &&
    Number.isFinite(item.hours) &&
    item.hours > 0 &&
    Number.isFinite(item.downtimeHours) &&
    item.downtimeHours >= 0
  );
}
