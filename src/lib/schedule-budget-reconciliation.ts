import type { BudgetItem, ScheduleItem } from "@/lib/types";

type ReconciliationBudgetItem = Pick<BudgetItem, "id" | "section" | "code" | "name" | "unit" | "qty" | "plannedUnitPrice" | "kind">;
type ReconciliationScheduleItem = Pick<ScheduleItem, "id" | "budgetItemId" | "name" | "unit" | "plannedQty" | "dependency">;

export type ScheduleBudgetCandidate = {
  budgetItemId: string;
  code: string;
  section: string;
  name: string;
  unit: string;
  qty: number;
  value: number;
};

export type ScheduleBudgetReconciliationRow = {
  scheduleItemId: string;
  scheduleName: string;
  scheduleSection: string;
  scheduleUnit: string;
  plannedQty: number;
  currentBudgetItemId?: string;
  suggestedBudgetItemId?: string;
  status: "linked" | "automatic" | "ambiguous" | "unmatched" | "invalid_link";
  candidates: ScheduleBudgetCandidate[];
};

export type ScheduleBudgetReconciliation = {
  summary: {
    scheduleItems: number;
    workBudgetItems: number;
    currentLinkedScheduleItems: number;
    projectedLinkedScheduleItems: number;
    automaticMatches: number;
    ambiguousMatches: number;
    unmatchedScheduleItems: number;
    invalidLinks: number;
    totalWorkValue: number;
    currentLinkedWorkValue: number;
    projectedLinkedWorkValue: number;
    currentCoveragePercent: number;
    projectedCoveragePercent: number;
  };
  rows: ScheduleBudgetReconciliationRow[];
};

export type ScheduleBudgetOverride = { scheduleItemId: string; budgetItemId: string };

function normalizeText(value: unknown) {
  return String(value ?? "")
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[‐‑‒–—−]/g, "-")
    .replace(/[«»"']/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeScheduleWorkName(value: string) {
  return normalizeText(value).replace(/^\d+[.)]?\s+/, "").trim();
}

export function normalizeWorkUnit(value: unknown) {
  return normalizeText(value)
    .replace(/\^/g, "")
    .replace(/²/g, "2")
    .replace(/³/g, "3")
    .replace(/[.\s]/g, "")
    .replace(/^квм$/, "м2")
    .replace(/^кубм$/, "м3")
    .replace(/^штук[аи]?$/, "шт");
}

export function scheduleDependencySection(value?: string) {
  const first = String(value ?? "").split("·")[0]?.trim() ?? "";
  return /^раздел(?:\s|$)/iu.test(first) ? first : "";
}

function sameQuantity(left: number, right: number) {
  const tolerance = Math.max(0.011, Math.max(Math.abs(left), Math.abs(right)) * 0.00001);
  return Math.abs(left - right) <= tolerance;
}

function budgetValue(item: ReconciliationBudgetItem) {
  return Math.max(0, Number(item.qty) || 0) * Math.max(0, Number(item.plannedUnitPrice) || 0);
}

function candidate(item: ReconciliationBudgetItem): ScheduleBudgetCandidate {
  return {
    budgetItemId: item.id,
    code: item.code,
    section: item.section,
    name: item.name,
    unit: item.unit,
    qty: Number(item.qty),
    value: budgetValue(item)
  };
}

function percent(value: number, total: number) {
  return total > 0 ? Math.min(100, Math.max(0, value / total * 100)) : 0;
}

export function buildScheduleBudgetReconciliation(
  scheduleItems: ReconciliationScheduleItem[],
  budgetItems: ReconciliationBudgetItem[]
): ScheduleBudgetReconciliation {
  const currentSchedule = scheduleItems.slice();
  const workBudget = budgetItems.filter((item) => item.kind === "work");
  const budgetById = new Map(budgetItems.map((item) => [item.id, item]));
  const workByName = new Map<string, ReconciliationBudgetItem[]>();
  for (const item of workBudget) {
    const key = normalizeText(item.name);
    workByName.set(key, [...(workByName.get(key) ?? []), item]);
  }

  const reserved = new Set<string>();
  const preliminary = currentSchedule.map((item) => {
    const linked = item.budgetItemId ? budgetById.get(item.budgetItemId) : undefined;
    if (linked) reserved.add(linked.id);
    const scheduleName = normalizeScheduleWorkName(item.name);
    const scheduleSection = scheduleDependencySection(item.dependency);
    const scheduleUnit = normalizeWorkUnit(item.unit);
    let candidates = (workByName.get(scheduleName) ?? []).slice();

    if (scheduleSection) {
      const sectionMatches = candidates.filter((entry) => normalizeText(entry.section) === normalizeText(scheduleSection));
      if (sectionMatches.length) candidates = sectionMatches;
    }
    if (scheduleUnit) {
      const unitMatches = candidates.filter((entry) => normalizeWorkUnit(entry.unit) === scheduleUnit);
      if (unitMatches.length) candidates = unitMatches;
    }
    if (Number(item.plannedQty) > 0) {
      const quantityMatches = candidates.filter((entry) => sameQuantity(Number(entry.qty), Number(item.plannedQty)));
      if (quantityMatches.length) candidates = quantityMatches;
    }

    return { item, linked, scheduleSection, scheduleUnit, candidates };
  });

  const candidateUseCount = new Map<string, number>();
  for (const row of preliminary) {
    if (row.linked) continue;
    for (const item of row.candidates) {
      if (!reserved.has(item.id)) candidateUseCount.set(item.id, (candidateUseCount.get(item.id) ?? 0) + 1);
    }
  }

  const rows: ScheduleBudgetReconciliationRow[] = preliminary.map((row) => {
    const available = row.candidates.filter((item) => !reserved.has(item.id));
    const unique = available.length === 1 && candidateUseCount.get(available[0].id) === 1 ? available[0] : undefined;
    const invalidLink = Boolean(row.item.budgetItemId && !row.linked);
    return {
      scheduleItemId: row.item.id,
      scheduleName: row.item.name,
      scheduleSection: row.scheduleSection,
      scheduleUnit: row.item.unit ?? "",
      plannedQty: Number(row.item.plannedQty),
      currentBudgetItemId: row.linked?.id,
      suggestedBudgetItemId: unique?.id,
      status: row.linked ? "linked" : unique ? "automatic" : available.length ? "ambiguous" : invalidLink ? "invalid_link" : "unmatched",
      candidates: available.map(candidate)
    };
  });

  const totalWorkValue = workBudget.reduce((sum, item) => sum + budgetValue(item), 0);
  const currentIds = new Set(rows.flatMap((row) => row.currentBudgetItemId ? [row.currentBudgetItemId] : []));
  const projectedIds = new Set(rows.flatMap((row) => {
    const budgetItemId = row.currentBudgetItemId ?? row.suggestedBudgetItemId;
    return budgetItemId ? [budgetItemId] : [];
  }));
  const currentLinkedWorkValue = workBudget.filter((item) => currentIds.has(item.id)).reduce((sum, item) => sum + budgetValue(item), 0);
  const projectedLinkedWorkValue = workBudget.filter((item) => projectedIds.has(item.id)).reduce((sum, item) => sum + budgetValue(item), 0);

  return {
    summary: {
      scheduleItems: rows.length,
      workBudgetItems: workBudget.length,
      currentLinkedScheduleItems: rows.filter((row) => row.status === "linked").length,
      projectedLinkedScheduleItems: rows.filter((row) => row.currentBudgetItemId || row.suggestedBudgetItemId).length,
      automaticMatches: rows.filter((row) => row.status === "automatic").length,
      ambiguousMatches: rows.filter((row) => row.status === "ambiguous").length,
      unmatchedScheduleItems: rows.filter((row) => row.status === "unmatched").length,
      invalidLinks: rows.filter((row) => row.status === "invalid_link").length,
      totalWorkValue,
      currentLinkedWorkValue,
      projectedLinkedWorkValue,
      currentCoveragePercent: percent(currentLinkedWorkValue, totalWorkValue),
      projectedCoveragePercent: percent(projectedLinkedWorkValue, totalWorkValue)
    },
    rows
  };
}

export function resolveScheduleBudgetOverrides(
  reconciliation: ScheduleBudgetReconciliation,
  overrides: ScheduleBudgetOverride[]
) {
  const rowById = new Map(reconciliation.rows.map((row) => [row.scheduleItemId, row]));
  const selected = new Map(overrides.map((item) => [item.scheduleItemId, item.budgetItemId]));
  const used = new Set(reconciliation.rows.flatMap((row) => row.currentBudgetItemId ? [row.currentBudgetItemId] : []));
  const links: Array<{ scheduleItemId: string; budgetItemId: string; unit: string }> = [];

  for (const row of reconciliation.rows) {
    if (row.currentBudgetItemId) continue;
    const budgetItemId = selected.get(row.scheduleItemId) ?? row.suggestedBudgetItemId;
    if (!budgetItemId) continue;
    const match = row.candidates.find((item) => item.budgetItemId === budgetItemId);
    if (!match) throw new Error(`Недопустимая связь для работы ${row.scheduleItemId}.`);
    if (used.has(budgetItemId)) throw new Error(`Строка сметы ${budgetItemId} выбрана более одного раза.`);
    used.add(budgetItemId);
    links.push({ scheduleItemId: row.scheduleItemId, budgetItemId, unit: match.unit });
  }

  for (const item of overrides) {
    if (!rowById.has(item.scheduleItemId)) throw new Error(`Работа ${item.scheduleItemId} не найдена в текущем графике.`);
  }
  return links;
}
