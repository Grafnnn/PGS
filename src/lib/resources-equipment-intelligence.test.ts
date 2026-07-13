import { describe, expect, it } from "vitest";
import { buildResourcesEquipmentIntelligence } from "@/lib/resources-equipment-intelligence";

describe("resources equipment intelligence", () => {
  it("stays informational without daily reports", () => {
    const model = buildResourcesEquipmentIntelligence({ project: { id: "empty" } });
    expect(model.summary.status).toBe("no_reports");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
  });

  it("turns equipment downtime and stopped works into deterministic blockers", () => {
    const model = buildResourcesEquipmentIntelligence({
      project: { id: "p", name: "Smoke" },
      dailyReports: [
        { id: "old", projectId: "p", date: "2026-07-10", author: "Прораб", weather: "ясно", workers: 10, engineers: 2, equipment: "Кран, экскаватор", completedWorks: "Монтаж", materialsReceived: "", materialsConsumed: "", downtime: "", issues: "", status: "approved" },
        { id: "new", projectId: "p", date: "2026-07-11", author: "Прораб", weather: "дождь", workers: 4, engineers: 1, equipment: "Кран", completedWorks: "Монтаж", materialsReceived: "", materialsConsumed: "", downtime: "Поломка крана, простой техники", issues: "", status: "submitted" }
      ],
      scheduleItems: [{ id: "s", projectId: "p", name: "Монтаж", owner: "ПТО", startsAt: "2026-07-01", endsAt: "2026-07-12", plannedQty: 10, actualQty: 4, status: "stopped" }]
    });
    expect(model.summary.status).toBe("blocked");
    expect(model.summary.equipmentUnits).toBe(2);
    expect(model.summary.equipmentDowntimeReports).toBe(1);
    expect(model.signals.some((item) => item.title.includes("Простой"))).toBe(true);
    expect(model.actions.some((item) => item.ownerRole === "Механик")).toBe(true);
  });
});
