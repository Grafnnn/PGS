import { describe, expect, it } from "vitest";
import {
  approvedDailyReportProductivitySamples,
  dailyReportWorkOutputIssues,
  dailyReportWorkOutputNorm,
  dailyReportWorkOutputTotals,
  parseDailyReportWorkOutputs
} from "@/lib/daily-report-work-outputs";

const output = {
  profession: "Каменщик",
  workName: "Кладка стен",
  quantity: 20,
  unit: "м2",
  laborHours: 32
};

describe("daily report work outputs", () => {
  it("calculates a transparent monthly productivity equivalent", () => {
    expect(dailyReportWorkOutputNorm(output)).toEqual({
      norm: 100,
      unit: "м2/чел.-мес."
    });
  });

  it("keeps valid rows and drops malformed persisted JSON rows", () => {
    expect(parseDailyReportWorkOutputs([
      output,
      { ...output, quantity: 0 },
      "invalid"
    ])).toEqual([{ ...output, unit: "м²" }]);
  });

  it("normalizes common units and whitespace before persistence and analytics", () => {
    expect(parseDailyReportWorkOutputs([{
      ...output,
      profession: "  Каменщик   4 разряда ",
      workName: " Кладка   наружных стен ",
      unit: " м2 "
    }])).toEqual([{
      ...output,
      profession: "Каменщик 4 разряда",
      workName: "Кладка наружных стен",
      unit: "м²"
    }]);
  });

  it("preserves the optional project-schedule link on a measurable actual row", () => {
    expect(parseDailyReportWorkOutputs([{ ...output, scheduleItemId: " schedule-1 " }])).toEqual([
      { ...output, scheduleItemId: "schedule-1", unit: "м²" }
    ]);
  });

  it("reports incomplete rows and totals only finite positive labor", () => {
    expect(dailyReportWorkOutputIssues({ ...output, profession: "", laborHours: 0 })).toEqual(expect.objectContaining({
      profession: expect.any(String),
      laborHours: expect.any(String)
    }));
    expect(dailyReportWorkOutputTotals([output, { ...output, laborHours: Number.NaN }])).toEqual({ rows: 2, laborHours: 32 });
  });

  it("uses only approved reports as actual productivity evidence", () => {
    const samples = approvedDailyReportProductivitySamples([
      { status: "draft", workOutputs: [output] },
      { status: "checked", workOutputs: [output] },
      { status: "approved", workOutputs: [output] }
    ]);
    expect(samples).toEqual([expect.objectContaining({
      profession: "Каменщик",
      function: "Кладка стен",
      norm: 100,
      unit: "м²/чел.-мес.",
      source: "daily-report"
    })]);
  });
});
