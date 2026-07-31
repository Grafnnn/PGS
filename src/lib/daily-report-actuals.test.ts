import { describe, expect, it } from "vitest";
import {
  dailyReportEquipmentActualSchema,
  dailyReportEquipmentActualsComplete
} from "@/lib/daily-report-actuals";

describe("daily report equipment actuals", () => {
  it("accepts equipment that spent the shift entirely in downtime", () => {
    const item = { name: "Башенный кран", quantity: 1, hours: 0, downtimeHours: 8 };

    expect(dailyReportEquipmentActualSchema.safeParse(item).success).toBe(true);
    expect(dailyReportEquipmentActualsComplete([item])).toBe(true);
  });

  it("rejects an empty equipment fact with neither work nor downtime", () => {
    const item = { name: "Башенный кран", quantity: 1, hours: 0, downtimeHours: 0 };

    expect(dailyReportEquipmentActualSchema.safeParse(item).success).toBe(false);
    expect(dailyReportEquipmentActualsComplete([item])).toBe(false);
  });
});
