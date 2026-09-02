import { z } from "zod";

const DAY_MS = 86_400_000;

export const projectCalendarShiftRequestSchema = z.object({
  targetStart: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  mode: z.enum(["preview", "commit"]).default("preview"),
  confirmed: z.boolean().default(false)
});

type DateValue = string | Date;

type CalendarShiftInput = {
  project: { startsAt: DateValue; endsAt: DateValue };
  scheduleItems: Array<{ startsAt: DateValue; endsAt: DateValue }>;
  materials: Array<{ neededAt: DateValue; orderByAt?: DateValue | null }>;
  materialNeeds: Array<{ requiredAt: DateValue }>;
  procurementRequests: Array<{ neededAt: DateValue; expectedAt?: DateValue | null }>;
  targetStart: string;
};

function calendarDate(value: DateValue) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) throw new Error("Invalid calendar date");
    return new Date(Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate()));
  }
  const datePart = String(value).slice(0, 10);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(datePart);
  if (!match) throw new Error("Invalid calendar date");
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    throw new Error("Invalid calendar date");
  }
  return parsed;
}

export function dateOnly(value: DateValue) {
  return calendarDate(value).toISOString().slice(0, 10);
}

export function shiftCalendarDate(value: DateValue, deltaDays: number) {
  const parsed = calendarDate(value);
  parsed.setUTCDate(parsed.getUTCDate() + deltaDays);
  return parsed.toISOString().slice(0, 10);
}

function earliest(values: DateValue[]) {
  return values.map(dateOnly).sort()[0];
}

function latest(values: DateValue[]) {
  return values.map(dateOnly).sort().at(-1);
}

export function buildProjectCalendarShiftPreview(input: CalendarShiftInput) {
  const projectStart = dateOnly(input.project.startsAt);
  const projectEnd = dateOnly(input.project.endsAt);
  const scheduleStart = earliest(input.scheduleItems.map((item) => item.startsAt));
  const scheduleEnd = latest(input.scheduleItems.map((item) => item.endsAt));
  const anchorStart = scheduleStart ?? projectStart;
  const targetStart = dateOnly(input.targetStart);
  const deltaDays = Math.round((calendarDate(targetStart).getTime() - calendarDate(anchorStart).getTime()) / DAY_MS);
  if (Math.abs(deltaDays) > 3_650) throw new Error("Calendar shift exceeds ten years");

  const materialOrderDates = input.materials.flatMap((item) => item.orderByAt ? [item.orderByAt] : []);
  const materialNeedDates = input.materials.map((item) => item.neededAt);
  const firstMaterialOrder = earliest(materialOrderDates);
  const firstMaterialNeed = earliest(materialNeedDates);

  return {
    anchor: scheduleStart ? "schedule" as const : "project" as const,
    anchorStart,
    targetStart,
    deltaDays,
    project: {
      startsAt: { before: projectStart, after: targetStart },
      endsAt: { before: projectEnd, after: shiftCalendarDate(projectEnd, deltaDays) }
    },
    schedule: {
      count: input.scheduleItems.length,
      first: scheduleStart ? { before: scheduleStart, after: shiftCalendarDate(scheduleStart, deltaDays) } : null,
      last: scheduleEnd ? { before: scheduleEnd, after: shiftCalendarDate(scheduleEnd, deltaDays) } : null
    },
    materials: {
      count: input.materials.length,
      firstOrder: firstMaterialOrder ? {
        before: firstMaterialOrder,
        after: shiftCalendarDate(firstMaterialOrder, deltaDays)
      } : null,
      firstNeed: firstMaterialNeed ? {
        before: firstMaterialNeed,
        after: shiftCalendarDate(firstMaterialNeed, deltaDays)
      } : null
    },
    materialNeeds: input.materialNeeds.length,
    openProcurementRequests: input.procurementRequests.length
  };
}

export type ProjectCalendarShiftPreview = ReturnType<typeof buildProjectCalendarShiftPreview>;
