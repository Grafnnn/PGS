import { describe, expect, it } from "vitest";
import { dailyReportProgressDeltas, scheduleStatusForActual } from "@/lib/daily-report-progress";

describe("daily report progress", () => {
  it("aggregates measurable output by linked schedule item", () => {
    expect(dailyReportProgressDeltas([
      { scheduleItemId: "schedule-1", profession: "Кровельщик", workName: "Мембрана", quantity: 12, unit: "м²", laborHours: 8 },
      { scheduleItemId: "schedule-1", profession: "Подсобный рабочий", workName: "Мембрана", quantity: 3, unit: "м²", laborHours: 4 },
      { profession: "Мастер", workName: "Осмотр", quantity: 1, unit: "смена", laborHours: 2 }
    ])).toEqual([{ scheduleItemId: "schedule-1", quantity: 15, workNames: ["Мембрана"] }]);
  });

  it("derives a readable schedule state after apply or rollback", () => {
    expect(scheduleStatusForActual("not_started", 100, 25)).toBe("in_progress");
    expect(scheduleStatusForActual("in_progress", 100, 100)).toBe("done");
    expect(scheduleStatusForActual("done", 100, 0)).toBe("not_started");
    expect(scheduleStatusForActual("delayed", 100, 25)).toBe("delayed");
    expect(scheduleStatusForActual("stopped", 100, 0)).toBe("stopped");
  });
});
