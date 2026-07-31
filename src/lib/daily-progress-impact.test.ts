import { describe, expect, it } from "vitest";
import { buildDailyProgressImpact } from "@/lib/daily-progress-impact";
import type { DailyReport, Material, ScheduleItem } from "@/lib/types";

const schedule: ScheduleItem[] = [{
  id: "schedule-1",
  projectId: "project-1",
  budgetItemId: "budget-1",
  name: "Кладка стен",
  owner: "Прораб",
  startsAt: "2026-07-01",
  endsAt: "2026-07-31",
  plannedQty: 100,
  actualQty: 70,
  status: "in_progress"
}];

const materials: Material[] = [{
  id: "material-1",
  projectId: "project-1",
  name: "Кирпич",
  unit: "шт",
  requiredQty: 1000,
  orderedQty: 1000,
  deliveredQty: 600,
  consumedQty: 500,
  plannedUnitPrice: 10,
  actualUnitPrice: 11,
  supplier: "Поставщик",
  neededAt: "2026-07-01",
  status: "in_transit"
}];

function report(patch: Partial<DailyReport> = {}): DailyReport {
  return {
    id: "report-1",
    projectId: "project-1",
    date: "2026-07-30",
    author: "Прораб",
    weather: "Ясно",
    workers: 6,
    engineers: 1,
    equipment: "Кран",
    completedWorks: "Кладка стен",
    materialsReceived: "",
    materialsConsumed: "",
    downtime: "",
    issues: "",
    status: "approved",
    impactStatus: "pending",
    workOutputs: [{
      profession: "Каменщик",
      workName: "Кладка стен",
      quantity: 30,
      unit: "м²",
      laborHours: 48,
      scheduleItemId: "schedule-1"
    }],
    materialActuals: [{ materialId: "material-1", kind: "consumed", quantity: 80, unit: "шт" }],
    equipmentActuals: [{ name: "Кран", quantity: 1, hours: 7, downtimeHours: 0 }],
    ...patch
  };
}

describe("daily progress impact", () => {
  it("builds explicit schedule, material, labor and acceptance effects", () => {
    const preview = buildDailyProgressImpact(report(), schedule, materials);
    expect(preview.status).toBe("ready");
    expect(preview.scheduleUpdates[0]).toMatchObject({
      beforeActualQty: 70,
      afterActualQty: 100,
      nextStatus: "done",
      budgetItemId: "budget-1"
    });
    expect(preview.materialUpdates[0]).toMatchObject({
      beforeConsumedQty: 500,
      afterConsumedQty: 580
    });
    expect(preview.labor.laborHours).toBe(48);
    expect(preview.equipment.hours).toBe(7);
    expect(preview.acceptance.candidateCount).toBe(1);
  });

  it("keeps unlinked work as productivity evidence without changing schedule", () => {
    const preview = buildDailyProgressImpact(report({
      workOutputs: [{ profession: "Подсобный рабочий", workName: "Уборка", quantity: 10, unit: "м²", laborHours: 4 }]
    }), schedule, materials);
    expect(preview.status).toBe("partial");
    expect(preview.scheduleUpdates).toHaveLength(0);
    expect(preview.summary.unlinkedWorkOutputCount).toBe(1);
    expect(preview.warnings.join(" ")).toContain("останется только фактом ФОТ");
  });

  it("blocks stale links and material unit mismatches", () => {
    const preview = buildDailyProgressImpact(report({
      workOutputs: [{ ...report().workOutputs![0], scheduleItemId: "missing" }],
      materialActuals: [{ materialId: "material-1", kind: "received", quantity: 10, unit: "т" }]
    }), schedule, materials);
    expect(preview.status).toBe("blocked");
    expect(preview.blockers).toHaveLength(2);
  });

  it("creates an explicit risk action proposal for downtime", () => {
    const preview = buildDailyProgressImpact(report({ downtime: "Ожидание крана 2 часа" }), schedule, materials);
    expect(preview.riskAction).toMatchObject({ required: true, priority: "high" });
  });

  it("marks an already applied report without proposing a second commit", () => {
    const preview = buildDailyProgressImpact(report({ impactStatus: "applied" }), schedule, materials);
    expect(preview.status).toBe("applied");
    expect(preview.scheduleUpdates).toEqual([]);
  });

  it("keeps legacy approved reports out of retroactive impact commits", () => {
    const preview = buildDailyProgressImpact(report({ impactStatus: "not_applicable" }), schedule, materials);
    expect(preview.status).toBe("not_applicable");
    expect(preview.scheduleUpdates).toEqual([]);
    expect(preview.summary.scheduleItemCount).toBe(0);
  });
});
