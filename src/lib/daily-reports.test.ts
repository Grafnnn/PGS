import { describe, expect, it } from "vitest";
import { canTransitionDailyReport, dailyReportStatusLabel } from "@/lib/daily-reports";

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
});
