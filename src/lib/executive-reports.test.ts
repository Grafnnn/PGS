import { describe, expect, it } from "vitest";
import { canTransitionExecutiveReport, executiveReportCreateSchema, executiveReportSourceSnapshot, executiveReportUpdateSchema } from "@/lib/executive-reports";

describe("executive report contracts", () => {
  it("keeps generation and publication explicit", () => {
    expect(executiveReportCreateSchema.parse({ reportDate: "2026-07-14" })).toEqual({ reportDate: "2026-07-14" });
    expect(executiveReportUpdateSchema.parse({ status: "published", publishConfirmed: true })).toEqual({ status: "published", publishConfirmed: true });
    expect(() => executiveReportUpdateSchema.parse({ publishConfirmed: true })).toThrow();
    expect(() => executiveReportUpdateSchema.parse({ status: "approved" })).toThrow();
  });

  it("allows only forward report lifecycle transitions", () => {
    expect(canTransitionExecutiveReport("draft", "published")).toBe(true);
    expect(canTransitionExecutiveReport("published", "archived")).toBe(true);
    expect(canTransitionExecutiveReport("published", "draft")).toBe(false);
    expect(canTransitionExecutiveReport("archived", "published")).toBe(false);
  });

  it("captures counts instead of copying project records into the source snapshot", () => {
    const snapshot = executiveReportSourceSnapshot({
      budgetItems: [{ secret: "not copied" }],
      scheduleItems: [],
      materials: [1, 2],
      procurementRequests: [],
      payments: [],
      dailyReports: [1],
      risks: []
    });
    expect(snapshot).toMatchObject({ budgetItems: 1, materials: 2, dailyReports: 1 });
    expect(JSON.stringify(snapshot)).not.toContain("not copied");
  });
});
