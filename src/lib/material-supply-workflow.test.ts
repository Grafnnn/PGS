import { describe, expect, it } from "vitest";
import { buildMaterialSupplyWorkflow, DEFAULT_SUPPLY_LEAD_DAYS } from "./material-supply-workflow";
import type { Material, ProcurementRequest, ScheduleItem } from "./types";

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "material-1",
    projectId: "project-1",
    costCodeId: "cost-1",
    name: "Мембрана кровельная",
    unit: "м2",
    requiredQty: 100,
    orderedQty: 0,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 500,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-09-20",
    status: "required",
    ...overrides
  };
}

function schedule(overrides: Partial<ScheduleItem> = {}): ScheduleItem {
  return {
    id: "schedule-1",
    projectId: "project-1",
    costCodeId: "cost-1",
    name: "Монтаж мембраны",
    owner: "ПТО",
    startsAt: "2026-09-18",
    endsAt: "2026-09-25",
    plannedQty: 100,
    actualQty: 0,
    status: "not_started",
    ...overrides
  };
}

describe("material supply workflow", () => {
  it("opens the request window fourteen days before the earliest production need", () => {
    const model = buildMaterialSupplyWorkflow({ materials: [material()], scheduleItems: [schedule()], procurementRequests: [], today: "2026-09-04" });
    expect(model.leadTimeDays).toBe(DEFAULT_SUPPLY_LEAD_DAYS);
    expect(model.dueDemands[0]).toMatchObject({ deliveryAt: "2026-09-18", requestAt: "2026-09-04", source: "schedule", deficitQty: 100 });
    expect(model.groups[0].items).toHaveLength(1);
  });

  it("keeps later needs in the upcoming plan instead of creating them early", () => {
    const model = buildMaterialSupplyWorkflow({ materials: [material({ neededAt: "2026-10-20", costCodeId: null })], scheduleItems: [], procurementRequests: [], today: "2026-09-04" });
    expect(model.dueDemands).toEqual([]);
    expect(model.upcomingDemands[0].requestAt).toBe("2026-10-06");
  });

  it("does not duplicate a material covered by an active request", () => {
    const request: ProcurementRequest = {
      id: "request-1",
      projectId: "project-1",
      title: "Мембрана",
      initiator: "ПТО",
      neededAt: "2026-09-18",
      priority: "high",
      status: "submitted",
      items: [{ materialId: "material-1", name: "Мембрана кровельная", qty: 100, unit: "м2" }]
    };
    const model = buildMaterialSupplyWorkflow({ materials: [material()], scheduleItems: [schedule()], procurementRequests: [request], today: "2026-09-10" });
    expect(model.dueDemands).toEqual([]);
    expect(model.demands[0]).toMatchObject({ phase: "covered", activeRequestId: "request-1" });
  });

  it("keeps an uncovered balance in the plan when an active request is only partial", () => {
    const request: ProcurementRequest = {
      id: "request-1",
      projectId: "project-1",
      title: "Часть мембраны",
      initiator: "ПТО",
      neededAt: "2026-09-18",
      priority: "high",
      status: "draft",
      items: [{ materialId: "material-1", name: "Мембрана кровельная", qty: 40, unit: "м2" }]
    };
    const model = buildMaterialSupplyWorkflow({ materials: [material()], scheduleItems: [schedule()], procurementRequests: [request], today: "2026-09-10" });
    expect(model.dueDemands[0]).toMatchObject({ deficitQty: 60, phase: "due", activeRequestId: "request-1" });
  });

  it("calculates the warehouse balance from delivered minus consumed quantities", () => {
    const model = buildMaterialSupplyWorkflow({ materials: [material({ requiredQty: 80, orderedQty: 80, deliveredQty: 80, consumedQty: 25 })], scheduleItems: [], procurementRequests: [], today: "2026-09-04" });
    expect(model.warehouse[0]).toMatchObject({ onHandQty: 55, stockValue: 27_500 });
    expect(model.summary.warehouseValue).toBe(27_500);
  });
});
