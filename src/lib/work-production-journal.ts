import type { DailyReport } from "@/lib/types";

export type ProductionJournalPeriod = {
  from?: string;
  to?: string;
};

export type ProductionJournalFilters = ProductionJournalPeriod & { query?: string };

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

function searchableText(value: string) {
  return value.toLocaleLowerCase("ru-RU").replace(/ё/g, "е").replace(/\s+/g, " ").trim();
}

export function productionJournalDays(
  reports: readonly DailyReport[],
  { from, to, query }: ProductionJournalFilters = {}
): ProductionJournalDay[] {
  const reportsByDate = new Map<string, DailyReport[]>();
  const search = searchableText(query ?? "");

  for (const report of reports) {
    if (report.phase === "open" || !productionJournalReportStatuses.includes(report.status)) continue;

    const date = report.date.slice(0, 10);
    if (!isCalendarDate(date) || (from && date < from) || (to && date > to)) continue;
    if (search && ![report.completedWorks, ...(report.workOutputs ?? []).map((output) => output.workName)]
      .some((work) => searchableText(work).includes(search))) continue;

    const dayReports = reportsByDate.get(date);
    if (dayReports) dayReports.push(report);
    else reportsByDate.set(date, [report]);
  }

  return [...reportsByDate.entries()]
    .sort(([left], [right]) => right.localeCompare(left))
    .map(([date, reports]) => ({ date, reports: reports.sort((left, right) => left.id.localeCompare(right.id)) }));
}
