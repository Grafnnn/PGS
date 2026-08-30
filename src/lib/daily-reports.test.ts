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
    expect(canTransitionDailyReport("approved", "draft", "OWNER")).toBe(false);
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
});
