import { describe, expect, it } from "vitest";
import {
  canTransitionDailyReport,
  dailyReportDraftIssues,
  dailyReportStatusLabel,
  dailyReportSubmissionIssues,
  normalizeDailyReportFields
} from "@/lib/daily-reports";

const report = {
  date: "2026-08-31",
  author: "Прораб",
  weather: "Ясно",
  workers: 4,
  engineers: 1,
  equipment: "Кран",
  completedWorks: "Кладка наружных стен",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "",
  issues: "",
  workOutputs: [{ profession: "Каменщик", workName: "Кладка стен", quantity: 20, unit: "м²", laborHours: 32 }]
};

describe("daily report workflow", () => {
  it("enforces the draft, submit, check and approve sequence", () => {
    expect(canTransitionDailyReport("draft", "submitted", "MANAGER")).toBe(true);
    expect(canTransitionDailyReport("draft", "approved", "OWNER")).toBe(false);
    expect(canTransitionDailyReport("submitted", "checked", "MANAGER")).toBe(true);
    expect(canTransitionDailyReport("checked", "approved", "MANAGER")).toBe(false);
    expect(canTransitionDailyReport("checked", "approved", "ADMIN")).toBe(true);
    expect(canTransitionDailyReport("approved", "draft", "OWNER")).toBe(true);
    expect(canTransitionDailyReport("approved", "draft", "ADMIN")).toBe(true);
    expect(canTransitionDailyReport("approved", "draft", "MANAGER")).toBe(false);
  });

  it("rejects unknown states and provides Russian labels", () => {
    expect(canTransitionDailyReport("unknown", "approved", "OWNER")).toBe(false);
    expect(dailyReportStatusLabel("checked")).toBe("Проверен");
  });

  it("normalizes report text and requires a meaningful daily fact", () => {
    expect(normalizeDailyReportFields({ ...report, author: "  Иван   Петров \n", weather: "  " })).toEqual(expect.objectContaining({
      author: "Иван Петров",
      weather: "Не указано"
    }));
    expect(dailyReportDraftIssues({ ...report, completedWorks: "" })).toContainEqual(expect.objectContaining({ field: "completedWorks" }));
  });

  it("blocks implausible labor hours and permits a documented no-work shift", () => {
    expect(dailyReportSubmissionIssues({
      ...report,
      workers: 1,
      engineers: 0,
      workOutputs: [{ ...report.workOutputs[0], laborHours: 25 }]
    })).toContainEqual(expect.objectContaining({ field: "workOutputs" }));

    expect(dailyReportSubmissionIssues({
      ...report,
      workers: 0,
      engineers: 0,
      completedWorks: "Работы не выполнялись",
      downtime: "Остановка из-за штормового предупреждения",
      workOutputs: []
    })).toEqual([]);
  });

  it("accepts a planned open shift but blocks submission until the fact is closed", () => {
    const openShift = {
      ...report,
      phase: "open" as const,
      workCategory: "Кровельные работы",
      workScopes: [
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" as const },
        { workName: "Устройство примыканий", source: "manual" as const }
      ],
      plannedWorks: "Монтаж мембраны на захватке 2",
      completedWorks: "",
      workOutputs: [],
      crewMembers: [{ resourceId: "resource-1", name: "Сотрудник 1", profession: "Кровельщик", kind: "worker" as const, headcount: 1 }]
    };
    expect(dailyReportDraftIssues(openShift)).toEqual([]);
    expect(dailyReportSubmissionIssues(openShift)).toContainEqual(expect.objectContaining({ field: "phase" }));
  });

  it("requires at least one work scope, plan and crew for an open shift", () => {
    expect(dailyReportDraftIssues({
      ...report,
      phase: "open",
      workCategory: "",
      plannedWorks: "",
      completedWorks: "",
      workers: 0,
      engineers: 0,
      crewMembers: []
    })).toEqual(expect.arrayContaining([
      expect.objectContaining({ field: "workScopes" }),
      expect.objectContaining({ field: "plannedWorks" }),
      expect.objectContaining({ field: "crewMembers" })
    ]));
  });

  it("rejects duplicate work scopes instead of silently collapsing the shift plan", () => {
    expect(dailyReportDraftIssues({
      ...report,
      phase: "open",
      workCategory: "",
      workScopes: [
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" },
        { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" }
      ],
      plannedWorks: "Работы на захватке",
      completedWorks: "",
      crewMembers: [{ resourceId: "resource-1", name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }]
    })).toContainEqual(expect.objectContaining({ field: "workScopes" }));
  });
});
