import { describe, expect, it } from "vitest";
import {
  dailyReportWorkScopeLabel,
  dailyReportWorkScopeSummary,
  dailyReportWorkScopesComplete,
  parseDailyReportWorkScopes,
  seedDailyReportWorkOutputs
} from "@/lib/daily-report-work-scopes";

describe("daily report work scopes", () => {
  it("keeps legacy reports readable as one manual work scope", () => {
    expect(parseDailyReportWorkScopes(undefined, "  Монтаж   кровли ")).toEqual([
      { workName: "Монтаж кровли", source: "manual" }
    ]);
  });

  it("normalizes structured scopes and rejects duplicate selections", () => {
    const scopes = [
      { scheduleItemId: "schedule-1", workName: " Монтаж мембраны ", source: "schedule" },
      { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" },
      { workName: " Устройство   примыканий ", source: "manual" }
    ];

    expect(parseDailyReportWorkScopes(scopes)).toEqual([
      { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" },
      { workName: "Устройство примыканий", source: "manual" }
    ]);
    expect(dailyReportWorkScopesComplete(scopes)).toBe(false);
    expect(parseDailyReportWorkScopes([{ workName: "Ручная позиция", source: "schedule" }])).toEqual([
      { scheduleItemId: undefined, workName: "Ручная позиция", source: "manual" }
    ]);
  });

  it("builds compact report labels without losing the full structured list", () => {
    const scopes = [
      { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" as const },
      { scheduleItemId: "schedule-2", workName: "Утепление", source: "schedule" as const },
      { workName: "Устройство примыканий", source: "manual" as const }
    ];

    expect(dailyReportWorkScopeLabel(scopes)).toBe("Монтаж мембраны · Утепление · +1");
    expect(dailyReportWorkScopeSummary(scopes)).toContain("Устройство примыканий");
  });

  it("seeds one separate actual-output row per selected work and preserves entered facts", () => {
    const scopes = [
      { scheduleItemId: "schedule-1", workName: "Монтаж мембраны", source: "schedule" as const },
      { workName: "Устройство примыканий", source: "manual" as const }
    ];
    const outputs = [{
      scheduleItemId: "schedule-1",
      profession: "Кровельщик",
      workName: "Монтаж мембраны",
      quantity: 120,
      unit: "м²",
      laborHours: 32
    }];

    expect(seedDailyReportWorkOutputs(scopes, outputs)).toEqual([
      outputs[0],
      {
        scheduleItemId: undefined,
        profession: "",
        workName: "Устройство примыканий",
        quantity: 0,
        unit: "",
        laborHours: 0
      }
    ]);
  });
});
