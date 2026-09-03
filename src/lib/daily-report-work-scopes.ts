import { z } from "zod";
import type { DailyReportWorkOutput, DailyReportWorkScope } from "@/lib/types";

function compactText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizedName(value: string) {
  return compactText(value).toLocaleLowerCase("ru-RU");
}

export const dailyReportWorkScopeSchema = z.object({
  scheduleItemId: z.string().trim().min(1).max(200).optional().nullable(),
  workName: z.string().trim().min(2).max(240),
  source: z.enum(["schedule", "manual"])
}).strict().transform((scope) => ({
  scheduleItemId: scope.scheduleItemId?.trim() || undefined,
  workName: compactText(scope.workName),
  source: scope.scheduleItemId ? "schedule" as const : "manual" as const
}));

export const dailyReportWorkScopesSchema = z.array(dailyReportWorkScopeSchema).max(20).superRefine((scopes, context) => {
  const seen = new Set<string>();
  for (const [index, scope] of scopes.entries()) {
    const key = dailyReportWorkScopeKey(scope);
    if (seen.has(key)) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Один вид работ нельзя добавлять в смену дважды.",
        path: [index]
      });
    }
    seen.add(key);
  }
});

export function dailyReportWorkScopeKey(scope: Pick<DailyReportWorkScope, "scheduleItemId" | "workName">) {
  return scope.scheduleItemId ? `schedule:${scope.scheduleItemId}` : `manual:${normalizedName(scope.workName)}`;
}

export function parseDailyReportWorkScopes(value: unknown, legacyWorkCategory = ""): DailyReportWorkScope[] {
  const raw = Array.isArray(value) ? value.slice(0, 20) : [];
  const parsed: DailyReportWorkScope[] = raw.flatMap((item) => {
    const result = dailyReportWorkScopeSchema.safeParse(item);
    return result.success ? [result.data] : [];
  });
  if (!parsed.length && compactText(legacyWorkCategory).length >= 2) {
    parsed.push({ workName: compactText(legacyWorkCategory), source: "manual" });
  }

  const seen = new Set<string>();
  return parsed.filter((scope) => {
    const key = dailyReportWorkScopeKey(scope);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function dailyReportWorkScopesComplete(value: unknown) {
  return Array.isArray(value) && value.length > 0 && dailyReportWorkScopesSchema.safeParse(value).success;
}

export function dailyReportWorkScopeSummary(scopes: DailyReportWorkScope[], fallback = "") {
  const names = parseDailyReportWorkScopes(scopes, fallback).map((scope) => scope.workName);
  if (!names.length) return compactText(fallback).slice(0, 240);

  const included: string[] = [];
  for (const name of names) {
    const next = [...included, name].join(" · ");
    const remaining = names.length - included.length - 1;
    const suffix = remaining > 0 ? ` · +${remaining}` : "";
    if (`${next}${suffix}`.length > 240) break;
    included.push(name);
  }
  if (!included.length) return names[0].slice(0, 240);
  const remaining = names.length - included.length;
  return `${included.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
}

export function dailyReportWorkScopeLabel(scopes: unknown, fallback = "Смена", maxItems = 2) {
  const parsed = parseDailyReportWorkScopes(scopes, fallback === "Смена" ? "" : fallback);
  if (!parsed.length) return compactText(fallback) || "Смена";
  const visible = parsed.slice(0, Math.max(1, maxItems)).map((scope) => scope.workName);
  const remaining = parsed.length - visible.length;
  return `${visible.join(" · ")}${remaining > 0 ? ` · +${remaining}` : ""}`;
}

export function seedDailyReportCompletedWorks(
  scopes: DailyReportWorkScope[],
  completedWorks: string
) {
  if (completedWorks.trim()) return completedWorks;
  return parseDailyReportWorkScopes(scopes).map((scope) => scope.workName).join("\n");
}

export function syncDailyReportCompletedWorks(
  previousScopes: DailyReportWorkScope[],
  nextScopes: DailyReportWorkScope[],
  completedWorks: string
) {
  const previousDefault = seedDailyReportCompletedWorks(previousScopes, "");
  if (completedWorks.trim() && completedWorks !== previousDefault) return completedWorks;
  return seedDailyReportCompletedWorks(nextScopes, "");
}

export function seedDailyReportWorkOutputs(
  scopes: DailyReportWorkScope[],
  outputs: DailyReportWorkOutput[],
  scheduleUnits: ReadonlyMap<string, string> = new Map()
) {
  const next = [...outputs];
  const linkedScheduleIds = new Set(outputs.flatMap((output) => output.scheduleItemId ? [output.scheduleItemId] : []));
  const linkedNames = new Set(outputs.map((output) => normalizedName(output.workName)));

  for (const scope of parseDailyReportWorkScopes(scopes)) {
    const alreadyLinked = scope.scheduleItemId
      ? linkedScheduleIds.has(scope.scheduleItemId)
      : linkedNames.has(normalizedName(scope.workName));
    if (alreadyLinked || next.length >= 40) continue;
    next.push({
      scheduleItemId: scope.scheduleItemId,
      profession: "",
      workName: scope.workName,
      quantity: 0,
      unit: scope.scheduleItemId ? scheduleUnits.get(scope.scheduleItemId) ?? "" : "",
      laborHours: 0
    });
    if (scope.scheduleItemId) linkedScheduleIds.add(scope.scheduleItemId);
    linkedNames.add(normalizedName(scope.workName));
  }
  return next;
}
