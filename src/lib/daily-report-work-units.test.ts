import { describe, expect, it } from "vitest";
import { buildDailyReportScheduleUnits, isGenericDailyReportUnit, syncDailyReportWorkOutputUnits } from "@/lib/daily-report-work-units";
import type { BudgetItem, ScheduleItem } from "@/lib/types";

const schedule = (patch: Partial<ScheduleItem> = {}): ScheduleItem => ({
  id: "schedule-1",
  projectId: "project-1",
  name: "10 Демонтаж рулонной гидроизоляции",
  owner: "ПТО",
  startsAt: "2026-09-01",
  endsAt: "2026-09-10",
  plannedQty: 1765.81,
  actualQty: 550,
  unit: "ед.",
  status: "in_progress",
  ...patch
});

const budget = (patch: Partial<BudgetItem> = {}): BudgetItem => ({
  id: "budget-1",
  projectId: "project-1",
  section: "Демонтаж",
  code: "1",
  name: "Демонтаж рулонной гидроизоляции",
  unit: "м2",
  qty: 1765.81,
  plannedUnitPrice: 190,
  actualUnitPrice: 0,
  forecastUnitPrice: 190,
  kind: "work",
  source: "КП",
  ...patch
});

describe("daily report estimate units", () => {
  it("uses the linked estimate unit instead of a generic schedule unit", () => {
    const units = buildDailyReportScheduleUnits(
      [schedule({ budgetItemId: "budget-1" })],
      [budget()]
    );

    expect(units.get("schedule-1")).toBe("м²");
  });

  it("matches an unlinked schedule row to one estimate row without its numeric prefix", () => {
    const units = buildDailyReportScheduleUnits([schedule()], [budget()]);

    expect(units.get("schedule-1")).toBe("м²");
  });

  it("matches dotted numeric schedule prefixes normalized from imported GPR rows", () => {
    const units = buildDailyReportScheduleUnits([
      schedule({ name: "10.1 Демонтаж рулонной гидроизоляции" })
    ], [budget()]);

    expect(units.get("schedule-1")).toBe("м²");
  });

  it("does not guess between estimate rows with conflicting units", () => {
    const units = buildDailyReportScheduleUnits([schedule({ unit: "пог.м" })], [
      budget(),
      budget({ id: "budget-2", unit: "м3" })
    ]);

    expect(units.get("schedule-1")).toBe("м.п.");
  });

  it("updates an existing linked output with the resolved estimate unit", () => {
    const outputs = syncDailyReportWorkOutputUnits([{
      scheduleItemId: "schedule-1",
      profession: "Кровельщик",
      workName: "10 Демонтаж рулонной гидроизоляции",
      quantity: 10,
      unit: "ед.",
      laborHours: 8
    }], new Map([["schedule-1", "м²"]]));

    expect(outputs[0].unit).toBe("м²");
    expect(isGenericDailyReportUnit("ед.")).toBe(true);
    expect(isGenericDailyReportUnit("м²")).toBe(false);
  });
});
