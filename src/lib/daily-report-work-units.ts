import { normalizeDailyReportWorkOutputUnit } from "@/lib/daily-report-work-outputs";
import type { BudgetItem, DailyReportWorkOutput, ScheduleItem } from "@/lib/types";

function normalizedWorkName(value: string) {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[№#]/g, " ")
    .replace(/[^a-zа-яё0-9]+/gi, " ")
    .trim();
}

function workNameAliases(value: string) {
  const normalized = normalizedWorkName(value);
  const withoutScheduleIndex = normalized.replace(/^(?:\d+\s+)+(?=[a-zа-яё])/i, "");
  return [...new Set([normalized, withoutScheduleIndex].filter(Boolean))];
}

export function isGenericDailyReportUnit(value: string | null | undefined) {
  const normalized = (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/[\s._-]+/g, "");
  return !normalized || ["ед", "едизм", "единица", "единицы", "unit", "units"].includes(normalized);
}

function measuredUnit(value: string | null | undefined) {
  if (isGenericDailyReportUnit(value)) return "";
  return normalizeDailyReportWorkOutputUnit(value ?? "");
}

function inferredBudgetUnit(items: BudgetItem[]) {
  const units = new Map<string, string>();
  for (const item of items) {
    const unit = measuredUnit(item.unit);
    if (unit) units.set(unit.toLocaleLowerCase("ru-RU"), unit);
  }
  return units.size === 1 ? [...units.values()][0] : "";
}

export function buildDailyReportScheduleUnits(
  scheduleItems: ScheduleItem[],
  budgetItems: BudgetItem[] = []
) {
  const eligibleBudgetItems = budgetItems.filter((item) => ["work", "subcontract", "equipment", "other"].includes(item.kind));
  const budgetById = new Map(eligibleBudgetItems.map((item) => [item.id, item]));
  const budgetByAlias = new Map<string, BudgetItem[]>();

  for (const item of eligibleBudgetItems) {
    const aliases = [
      ...workNameAliases(item.name),
      ...(item.code.trim() ? workNameAliases(`${item.code} ${item.name}`) : [])
    ];
    for (const alias of aliases) {
      const matches = budgetByAlias.get(alias) ?? [];
      if (!matches.some((candidate) => candidate.id === item.id)) matches.push(item);
      budgetByAlias.set(alias, matches);
    }
  }

  return new Map(scheduleItems.flatMap((scheduleItem) => {
    const linkedBudget = scheduleItem.budgetItemId ? budgetById.get(scheduleItem.budgetItemId) : undefined;
    const linkedUnit = measuredUnit(linkedBudget?.unit);
    const nameMatches = workNameAliases(scheduleItem.name).flatMap((alias) => budgetByAlias.get(alias) ?? []);
    const namedUnit = inferredBudgetUnit([...new Map(nameMatches.map((item) => [item.id, item])).values()]);
    const scheduleUnit = measuredUnit(scheduleItem.unit);
    const fallbackUnit = normalizeDailyReportWorkOutputUnit(linkedBudget?.unit || scheduleItem.unit || "");
    const resolvedUnit = linkedUnit || namedUnit || scheduleUnit || fallbackUnit;
    return resolvedUnit ? [[scheduleItem.id, resolvedUnit] as const] : [];
  }));
}

export function syncDailyReportWorkOutputUnits(
  outputs: DailyReportWorkOutput[],
  scheduleUnits: ReadonlyMap<string, string>
) {
  return outputs.map((output) => {
    const scheduleUnit = output.scheduleItemId ? scheduleUnits.get(output.scheduleItemId) : undefined;
    return scheduleUnit && normalizeDailyReportWorkOutputUnit(output.unit) !== scheduleUnit
      ? { ...output, unit: scheduleUnit }
      : output;
  });
}
