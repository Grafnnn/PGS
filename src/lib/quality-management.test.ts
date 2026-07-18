import { describe, expect, it } from "vitest";
import {
  qualityEvidenceCreateSchema,
  qualityIssueCreateSchema,
  qualityIssuePrefix,
  qualityManagementSummary,
  resolveInspectionTransition,
  resolveQualityIssueTransition
} from "@/lib/quality-management";

describe("quality management domain", () => {
  it("moves inspections through the controlled lifecycle", () => {
    expect(resolveInspectionTransition("planned", "start")).toBe("in_progress");
    expect(resolveInspectionTransition("in_progress", "complete", 0)).toBe("passed");
    expect(resolveInspectionTransition("in_progress", "complete", 2)).toBe("failed");
    expect(resolveInspectionTransition("failed", "close")).toBe("closed");
    expect(() => resolveInspectionTransition("planned", "close")).toThrow(/not allowed/);
  });

  it("moves NCR and Punch records through verification", () => {
    expect(resolveQualityIssueTransition("open", "start")).toBe("in_progress");
    expect(resolveQualityIssueTransition("in_progress", "submit_verification")).toBe("ready_for_verification");
    expect(resolveQualityIssueTransition("ready_for_verification", "verify")).toBe("verified");
    expect(resolveQualityIssueTransition("verified", "close")).toBe("closed");
    expect(resolveQualityIssueTransition("closed", "reopen")).toBe("in_progress");
    expect(() => resolveQualityIssueTransition("open", "verify")).toThrow(/not allowed/);
  });

  it("summarizes only active quality exposure", () => {
    const now = new Date("2026-07-19T12:00:00.000Z");
    const summary = qualityManagementSummary(
      [
        { status: "planned", scheduledAt: new Date("2026-07-18T12:00:00.000Z") },
        { status: "failed", scheduledAt: null },
        { status: "closed", scheduledAt: null }
      ],
      [
        { status: "open", severity: "critical", acceptanceBlocker: true, dueAt: new Date("2026-07-18T12:00:00.000Z"), costImpact: "125000", scheduleImpactDays: 4 },
        { status: "closed", severity: "critical", acceptanceBlocker: true, dueAt: new Date("2026-07-18T12:00:00.000Z"), costImpact: "900000", scheduleImpactDays: 30 }
      ],
      now
    );

    expect(summary).toMatchObject({
      inspections: 3,
      inspectionsDue: 1,
      failedInspections: 1,
      openIssues: 1,
      criticalIssues: 1,
      overdueIssues: 1,
      acceptanceBlockers: 1,
      costExposure: 125000,
      scheduleExposureDays: 4
    });
  });

  it("validates bounded issue and evidence inputs", () => {
    expect(qualityIssuePrefix("ncr")).toBe("NCR");
    expect(qualityIssuePrefix("punch")).toBe("PCH");
    expect(qualityIssueCreateSchema.parse({
      title: "Отклонение защитного слоя",
      description: "Фактическая толщина не соответствует рабочей документации",
      type: "ncr",
      acceptanceBlocker: true,
      costImpact: "35000"
    })).toMatchObject({ type: "ncr", acceptanceBlocker: true, costImpact: 35000 });
    expect(() => qualityIssueCreateSchema.parse({ title: "x", description: "y", unknown: true })).toThrow();
    expect(() => qualityEvidenceCreateSchema.parse({ documentId: "", phase: "closure" })).toThrow();
  });
});
