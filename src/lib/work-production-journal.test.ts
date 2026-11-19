import { describe, expect, it } from "vitest";
import {
  parseProductionJournalPeriod,
  productionJournalDays,
  productionJournalVolumeTotals,
  productionJournalWorkKey,
  productionJournalWorkOptions
} from "@/lib/work-production-journal";
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
  it("sums filtered volumes by unit across shifts, with or without dates", () => {
    const base = { ...report.workOutputs![0], workName: "Демонтаж покрытия" };
    const reports: DailyReport[] = [
      { ...report, id: "latest-morning", workOutputs: [
        { ...base, quantity: 0.1, unit: "м²" },
        { ...base, quantity: 350, unit: "м³", workName: "Другая работа" }
      ] },
      { ...report, id: "latest-evening", workOutputs: [{ ...base, quantity: 0.2, unit: "м2" }] },
      { ...report, id: "earlier", date: "2026-11-18", workOutputs: [{ ...base, quantity: 0.000004, unit: "м³" }] },
      { ...report, id: "draft", status: "draft", workOutputs: [{ ...base, quantity: 10, unit: "м³" }] }
    ];
    const work = productionJournalWorkKey(base.workName);

    expect(productionJournalVolumeTotals(productionJournalDays(reports, { work }))).toEqual([
      { unit: "м²", quantity: 0.3 },
      { unit: "м³", quantity: 0.000004 }
    ]);
    expect(productionJournalVolumeTotals(productionJournalDays(reports, { work, from: "2026-11-19", to: "2026-11-19" }))).toEqual([
      { unit: "м²", quantity: 0.3 }
    ]);
    expect(productionJournalVolumeTotals(productionJournalDays(reports, { work, to: "2026-11-17" }))).toEqual([]);
  });

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

  it("offers actual work once and keeps only that work across dates, preserving recorded units", () => {
    const template = report.workOutputs![0];
    const concrete = { ...template, workName: "Устройство перекрытий", quantity: 2.5, unit: "м³" };
    const otherWork = { ...template, workName: "Устройство перекрытий над подвалом", quantity: 12, unit: "м²" };
    const historical = { ...template, workName: " УСТРОЙСТВО  ПЕРЕКРЫТИЙ ", quantity: 3, unit: "шт" };
    const latest = { ...report, workOutputs: [concrete, otherWork] };
    const earlier: DailyReport = { ...report, id: "previous", date: "2026-11-18", status: "approved", workOutputs: [historical] };
    const narrativeOnly = { ...report, id: "narrative", date: "2026-11-17", workOutputs: [], completedWorks: concrete.workName, workCategory: "Монолит" };
    const draft: DailyReport = { ...report, id: "draft", status: "draft", workOutputs: [{ ...template, workName: "Земляные работы" }] };
    const reports = [latest, earlier, narrativeOnly, draft];
    const work = productionJournalWorkKey(concrete.workName);

    expect(productionJournalWorkOptions(productionJournalDays(reports))).toEqual([
      { value: work, label: concrete.workName },
      { value: productionJournalWorkKey(otherWork.workName), label: otherWork.workName }
    ]);

    const matches = productionJournalDays(reports, { work });
    expect(matches.map((day) => [day.date, day.reports.map(({ workOutputs }) => workOutputs)])).toEqual([
      ["2026-11-19", [[concrete]]],
      ["2026-11-18", [[historical]]]
    ]);
    expect(latest.workOutputs).toEqual([concrete, otherWork]);
    expect(productionJournalDays(reports, { work, from: "2026-11-19" })).toEqual(matches.slice(0, 1));
    expect(productionJournalDays(reports, { work, query: "над подвалом" })).toEqual([]);
    expect(productionJournalDays(reports, { work: "устройство" })).toEqual([]);
    expect(productionJournalDays(reports, { work: " " })).toEqual([]);
    expect(productionJournalDays(reports, { work: "" })).toEqual(productionJournalDays(reports));
    expect(productionJournalWorkKey(" ПОДЪЁМ\n опор ")).toBe("подъем опор");
  });
});
