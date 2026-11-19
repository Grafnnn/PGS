import { describe, expect, it } from "vitest";
import { parseProductionJournalPeriod, productionJournalDays } from "@/lib/work-production-journal";
import type { DailyReport } from "@/lib/types";

const report: DailyReport = {
  id: "morning",
  projectId: "project",
  date: "2026-11-19",
  author: "Мастер смены",
  status: "submitted",
  weather: "Облачно",
  workers: 8,
  engineers: 1,
  equipment: "Автокран",
  completedWorks: "Монтаж на второй захватке",
  materialsReceived: "Крепёж",
  materialsConsumed: "Крепёж",
  downtime: "Ожидание крана",
  issues: "",
  workOutputs: [{ profession: "Монтажник", workName: "Монтаж опор", quantity: 2.5, unit: "т", laborHours: 12 }]
};

describe("production journal", () => {
  it("groups submitted facts by day, retains separate shifts and excludes open shifts and drafts", () => {
    const evening = { ...report, id: "evening", status: "checked", phase: "closed" } as const;
    const earlier = { ...report, id: "earlier", date: "2026-11-18", status: "approved" } as const;
    const reports: DailyReport[] = [
      earlier,
      report,
      { ...report, id: "draft", status: "draft", phase: "closed" },
      { ...report, id: "open", status: "submitted", phase: "open" },
      evening
    ];

    expect(productionJournalDays(reports)).toEqual([
      { date: "2026-11-19", reports: [evening, report] },
      { date: "2026-11-18", reports: [earlier] }
    ]);
    expect(reports.map(({ id }) => id)).toEqual(["earlier", "morning", "draft", "open", "evening"]);
  });

  it("includes both period boundaries and supports either boundary on its own", () => {
    const dates = ["2026-11-21", "2026-11-20", "2026-11-19", "2026-11-18"];
    const reports = dates.map((date) => ({ ...report, id: date, date }));

    expect(productionJournalDays(reports, { from: "2026-11-19", to: "2026-11-20" }).map(({ date }) => date)).toEqual(dates.slice(1, 3));
    expect(productionJournalDays(reports, { from: "2026-11-19" }).map(({ date }) => date)).toEqual(dates.slice(0, 3));
    expect(productionJournalDays(reports, { to: "2026-11-19" }).map(({ date }) => date)).toEqual(dates.slice(2));
  });

  it("rejects dates that would roll over to a different day and periods in reverse order", () => {
    expect(parseProductionJournalPeriod("2024-02-29", "2024-02-29")).toEqual({ from: "2024-02-29", to: "2024-02-29" });
    expect(parseProductionJournalPeriod("", "2026-11-19")).toEqual({ to: "2026-11-19" });
    expect(parseProductionJournalPeriod("", "")).toEqual({});
    expect(parseProductionJournalPeriod("2026-02-29", "")).toBeNull();
    expect(parseProductionJournalPeriod("", "2026-11-31")).toBeNull();
    expect(parseProductionJournalPeriod("2026-11-20", "2026-11-19")).toBeNull();
    expect(parseProductionJournalPeriod("2026-11-19T00:00:00.000Z", "")).toBeNull();
  });

  it("finds the dates of actual work mentioned in older narratives or structured output", () => {
    const narrative = { ...report, id: "older", date: "2026-11-18", completedWorks: "Подъём\nопор краном", workOutputs: [] };
    const measured = { ...report, workOutputs: [{ ...report.workOutputs![0], workName: "Подъем опор" }] };
    const planned = { ...narrative, id: "unrelated", completedWorks: "Монтаж ограждения", plannedWorks: "Подъём опор", workCategory: "Подъём опор" };

    const reports = [narrative, planned, measured];
    expect(productionJournalDays(reports, { query: " ПОДЪЕМ  опор " })).toEqual([
      { date: "2026-11-19", reports: [measured] },
      { date: "2026-11-18", reports: [narrative] }
    ]);
    expect(productionJournalDays(reports, { query: "подъём опор", to: "2026-11-18" })[0].reports).toEqual([narrative]);
  });
});
