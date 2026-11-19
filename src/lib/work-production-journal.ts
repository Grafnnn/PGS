import type { DailyReport } from "@/lib/types";

export type ProductionJournalPeriod = {
  from?: string;
  to?: string;
};

export type ProductionJournalFilters = ProductionJournalPeriod & { query?: string; work?: string };

export type ProductionJournalDay = {
  date: string;
  reports: DailyReport[];
};

export const productionJournalReportStatuses: readonly DailyReport["status"][] = ["submitted", "checked", "approved"];

function isCalendarDate(value: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value.startsWith("0000")) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

export function parseProductionJournalPeriod(from: string, to: string): ProductionJournalPeriod | null {
  if ((from && !isCalendarDate(from)) || (to && !isCalendarDate(to))) return null;
  if (from && to && from > to) return null;
  return { from: from || undefined, to: to || undefined };
}

export function productionJournalWorkKey(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function productionJournalWorkOptions(days: readonly ProductionJournalDay[]) {
  const namesByKey = new Map<string, string>();

  for (const day of days) {
    for (const report of day.reports) {
      for (const output of report.workOutputs ?? []) {
        const key = productionJournalWorkKey(output.workName);
        if (key && !namesByKey.has(key)) namesByKey.set(key, output.workName.trim());
      }
    }
  }

  return [...namesByKey].map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, "ru-RU"));
}

export function productionJournalDays(
  reports: readonly DailyReport[],
  { from, to, query, work }: ProductionJournalFilters = {}
): ProductionJournalDay[] {
  const reportsByDate = new Map<string, DailyReport[]>();
  const search = productionJournalWorkKey(query ?? "");

  if (work && search && !work.includes(search)) return [];

  for (const report of reports) {
    if (report.phase === "open" || !productionJournalReportStatuses.includes(report.status)) continue;

    const date = report.date.slice(0, 10);
    if (!isCalendarDate(date) || (from && date < from) || (to && date > to)) continue;
    const outputs = report.workOutputs ?? [];
    const matchedOutputs = work ? outputs.filter((output) => productionJournalWorkKey(output.workName) === work) : null;
    if (matchedOutputs && !matchedOutputs.length) continue;
    if (!work && search && ![report.completedWorks, ...outputs.map((output) => output.workName)]
      .some((name) => productionJournalWorkKey(name).includes(search))) continue;

    const entry = matchedOutputs ? { ...report, workOutputs: matchedOutputs } : report;
    const dayReports = reportsByDate.get(date);
    if (dayReports) dayReports.push(entry);
    else reportsByDate.set(date, [entry]);
  }

  return [...reportsByDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, reports]) => ({ date, reports: reports.sort((left, right) => left.id.localeCompare(right.id)) }));
}
