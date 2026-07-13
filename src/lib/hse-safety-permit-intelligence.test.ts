import { describe, expect, it } from "vitest";
import { buildHseSafetyPermitIntelligence } from "@/lib/hse-safety-permit-intelligence";

describe("hse safety permit intelligence", () => {
  it("stays informational without source data", () => {
    const model = buildHseSafetyPermitIntelligence({ project: { id: "empty" } });
    expect(model.summary.status).toBe("no_data");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
  });
  it("collects report, risk and permit blockers deterministically", () => {
    const model = buildHseSafetyPermitIntelligence({
      project: { id: "p", name: "Smoke" },
      dailyReports: [{ id: "r", projectId: "p", date: "2026-07-13", author: "Прораб", weather: "ясно", workers: 3, engineers: 1, equipment: "кран", completedWorks: "", materialsReceived: "", materialsConsumed: "", downtime: "", issues: "Нарушение ТБ: нет допуска", status: "submitted" }],
      risks: [{ id: "risk", projectId: "p", title: "Пожарная безопасность", reason: "Нет инструктажа", priority: "critical", owner: "ИТР", dueAt: "2026-07-14", status: "open" }],
      documentChecklist: [{ key: "permit", title: "Наряд-допуск", status: "missing", categoryHints: ["safety"], documentIds: [], evidence: [], suggestedNextStep: "Приложить допуск." }]
    });
    expect(model.summary.status).toBe("blocked");
    expect(model.summary.criticalSignals).toBeGreaterThan(0);
    expect(model.summary.permitBlockers).toBe(1);
    expect(model.actions.some((item) => item.ownerRole === "ОТиПБ")).toBe(true);
  });
});
