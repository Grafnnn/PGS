import { describe, expect, it } from "vitest";
import { buildProjectCalendarShiftPreview, projectCalendarShiftRequestSchema, shiftCalendarDate } from "./project-calendar-shift";

describe("project calendar shift", () => {
  it("uses the first scheduled work as the operational anchor", () => {
    const preview = buildProjectCalendarShiftPreview({
      project: { startsAt: "2026-08-25", endsAt: "2026-11-30" },
      scheduleItems: [
        { startsAt: "2026-09-07", endsAt: "2026-09-19" },
        { startsAt: "2026-11-02", endsAt: "2026-11-13" }
      ],
      materials: [
        { orderByAt: "2026-09-04", neededAt: "2026-09-07" },
        { orderByAt: null, neededAt: "2026-09-18" }
      ],
      materialNeeds: [{ requiredAt: "2026-09-07" }],
      procurementRequests: [],
      targetStart: "2026-09-02"
    });

    expect(preview).toMatchObject({
      anchor: "schedule",
      anchorStart: "2026-09-07",
      targetStart: "2026-09-02",
      deltaDays: -5,
      project: {
        startsAt: { before: "2026-08-25", after: "2026-09-02" },
        endsAt: { before: "2026-11-30", after: "2026-11-25" }
      },
      schedule: {
        count: 2,
        first: { before: "2026-09-07", after: "2026-09-02" },
        last: { before: "2026-11-13", after: "2026-11-08" }
      },
      materials: {
        count: 2,
        firstOrder: { before: "2026-09-04", after: "2026-08-30" },
        firstNeed: { before: "2026-09-07", after: "2026-09-02" }
      },
      materialNeeds: 1,
      openProcurementRequests: 0
    });
  });

  it("falls back to the project start when the schedule is empty", () => {
    const preview = buildProjectCalendarShiftPreview({
      project: { startsAt: "2026-09-10", endsAt: "2026-10-10" },
      scheduleItems: [],
      materials: [],
      materialNeeds: [],
      procurementRequests: [],
      targetStart: "2026-09-02"
    });

    expect(preview.anchor).toBe("project");
    expect(preview.deltaDays).toBe(-8);
    expect(preview.project.endsAt.after).toBe("2026-10-02");
    expect(preview.schedule.first).toBeNull();
  });

  it("keeps date arithmetic stable across month boundaries", () => {
    expect(shiftCalendarDate("2026-03-02", -5)).toBe("2026-02-25");
    expect(projectCalendarShiftRequestSchema.safeParse({ targetStart: "02.09.2026" }).success).toBe(false);
    expect(() => shiftCalendarDate("2026-02-31", 1)).toThrow("Invalid calendar date");
  });
});
