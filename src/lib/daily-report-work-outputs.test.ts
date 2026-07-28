import { describe, expect, it } from "vitest";
import {
  approvedDailyReportProductivitySamples,
  dailyReportWorkOutputNorm,
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
    ])).toEqual([output]);
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
      unit: "м2/чел.-мес.",
      source: "daily-report"
    })]);
  });
});
