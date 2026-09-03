import { describe, expect, it } from "vitest";
import {
  allocateDailyReportLabor,
  applyDailyReportCrewAssignments,
  approvedDailyReportProductivitySamples,
  autoAssignDailyReportCrew,
  dailyReportCrewAssignmentIssues,
  dailyReportLaborCapacity,
  dailyReportWorkOutputIssues,
  dailyReportWorkOutputNorm,
  dailyReportWorkOutputTotals,
  parseDailyReportWorkOutputs,
  toggleDailyReportCrewAssignment
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

  it("distributes one crew shift across several works without double counting people", () => {
    const rows = allocateDailyReportLabor([
      { ...output, workName: "Работа 1", laborHours: 0, laborAllocationMode: "auto" },
      { ...output, workName: "Работа 2", laborHours: 0, laborAllocationMode: "auto" }
    ], 12, 8);

    expect(dailyReportLaborCapacity(12, 8)).toBe(96);
    expect(rows).toEqual([
      expect.objectContaining({ workerCount: 6, hoursPerWorker: 8, laborHours: 48, laborAllocationMode: "auto" }),
      expect.objectContaining({ workerCount: 6, hoursPerWorker: 8, laborHours: 48, laborAllocationMode: "auto" })
    ]);
    expect(dailyReportWorkOutputTotals(rows).laborHours).toBe(96);
  });

  it("leaves excess work unassigned instead of counting one full-shift worker twice", () => {
    const rows = allocateDailyReportLabor([
      { ...output, workName: "Работа 1", laborHours: 0 },
      { ...output, workName: "Работа 2", laborHours: 0 }
    ], 1, 8);

    expect(rows).toEqual([
      expect.objectContaining({ workerCount: 1, hoursPerWorker: 8, laborHours: 8 }),
      expect.objectContaining({ workerCount: undefined, hoursPerWorker: undefined, laborHours: 0 })
    ]);
  });

  it("preserves manual rows and gives the remaining shift capacity to automatic rows", () => {
    const rows = allocateDailyReportLabor([
      { ...output, laborHours: 16, workerCount: 2, hoursPerWorker: 8, laborAllocationMode: "manual" },
      { ...output, workName: "Работа 2", laborHours: 0, laborAllocationMode: "auto" }
    ], 12, 8);

    expect(rows[0]).toEqual(expect.objectContaining({ workerCount: 2, hoursPerWorker: 8, laborHours: 16, laborAllocationMode: "manual" }));
    expect(rows[1]).toEqual(expect.objectContaining({ workerCount: 10, hoursPerWorker: 8, laborHours: 80, laborAllocationMode: "auto" }));
  });

  it("keeps fractional allocation totals inside the exact shift capacity", () => {
    const rows = allocateDailyReportLabor(Array.from({ length: 3 }, (_, index) => ({
      ...output,
      workName: `Работа ${index + 1}`,
      laborHours: 0,
      laborAllocationMode: "auto" as const
    })), 10, 8);

    expect(dailyReportWorkOutputTotals(rows).laborHours).toBe(80);
  });

  it("derives persisted person-hours from people and hours per person", () => {
    expect(parseDailyReportWorkOutputs([{
      ...output,
      laborHours: 999,
      workerCount: 3,
      hoursPerWorker: 7.5,
      laborAllocationMode: "manual"
    }])).toEqual([expect.objectContaining({ workerCount: 3, hoursPerWorker: 7.5, laborHours: 22.5 })]);
  });

  it("derives professions and eight-hour labor from the named project crew", () => {
    const crew = [
      { resourceId: "worker-1", name: "Иван", profession: "Кровельщик", kind: "worker" as const, headcount: 1 },
      { resourceId: "worker-2", name: "Пётр", profession: "Монтажник", kind: "worker" as const, headcount: 1 },
      { resourceId: "engineer-1", name: "Анна", profession: "Инженер ПТО", kind: "engineer" as const, headcount: 1 }
    ];
    const rows = autoAssignDailyReportCrew([
      { ...output, profession: "", workName: "Работа 1", laborHours: 0 },
      { ...output, profession: "", workName: "Работа 2", laborHours: 0 }
    ], crew, 8, true);

    expect(rows).toEqual([
      expect.objectContaining({ crewResourceIds: ["worker-1"], profession: "Кровельщик", workerCount: 1, hoursPerWorker: 8, laborHours: 8 }),
      expect.objectContaining({ crewResourceIds: ["worker-2"], profession: "Монтажник", workerCount: 1, hoursPerWorker: 8, laborHours: 8 })
    ]);
    expect(rows.flatMap((row) => row.crewResourceIds ?? [])).not.toContain("engineer-1");
  });

  it("moves a named worker between works and rejects foreign or duplicate assignments", () => {
    const crew = [
      { resourceId: "worker-1", name: "Иван", profession: "Кровельщик", kind: "worker" as const, headcount: 1 },
      { resourceId: "worker-2", name: "Пётр", profession: "Монтажник", kind: "worker" as const, headcount: 1 }
    ];
    const rows = applyDailyReportCrewAssignments([
      { ...output, crewResourceIds: ["worker-1"] },
      { ...output, workName: "Работа 2", crewResourceIds: ["worker-2"] }
    ], crew, 8);
    const moved = toggleDailyReportCrewAssignment(rows, 1, "worker-1", crew, 8);

    expect(moved[0].crewResourceIds).toBeUndefined();
    expect(moved[1]).toEqual(expect.objectContaining({ crewResourceIds: ["worker-2", "worker-1"], workerCount: 2, laborHours: 16 }));
    expect(dailyReportCrewAssignmentIssues([
      { ...output, crewResourceIds: ["worker-1"] },
      { ...output, workName: "Работа 2", crewResourceIds: ["worker-1"] }
    ], crew)).toContain("две работы");
    expect(dailyReportCrewAssignmentIssues([{ ...output, crewResourceIds: ["foreign-worker"] }], crew)).toContain("не входит");
  });
});
