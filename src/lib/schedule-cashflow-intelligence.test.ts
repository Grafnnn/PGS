import { describe, expect, it } from "vitest";
import { buildScheduleCashflowIntelligenceModel, type ScheduleCashflowImportHistoryItem } from "@/lib/schedule-cashflow-intelligence";
import type { ImportPreviewRow } from "@/lib/excel/import-types";
import type { BudgetItem, Material, Payment, ProcurementRequest, ScheduleItem } from "@/lib/types";

function budget(overrides: Partial<BudgetItem> = {}): BudgetItem {
  return {
    id: "budget-1",
    projectId: "project-demo",
    section: "Монолитные работы",
    code: "M-1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 10,
    plannedUnitPrice: 7000,
    actualUnitPrice: 0,
    forecastUnitPrice: 7000,
    kind: "work",
    source: "test",
    ...overrides
  };
}

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "mat-1",
    projectId: "project-demo",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 12,
    orderedQty: 0,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-07-08",
    status: "required",
    ...overrides
  };
}

function payment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: "pay-1",
    projectId: "project-demo",
    title: "Аванс заказчика",
    counterparty: "Заказчик",
    direction: "incoming",
    plannedAt: "2026-07-03",
    amount: 20_000,
    status: "planned",
    category: "customer",
    ...overrides
  };
}

function previewRow(overrides: Partial<ImportPreviewRow> = {}): ImportPreviewRow {
  return {
    id: "row-1",
    sheetName: "ВОР",
    sourceRowNumber: 7,
    status: "ready",
    entityType: "budgetItem",
    section: "Отделочные работы",
    name: "Штукатурка стен",
    unit: "м2",
    quantity: 100,
    unitPrice: 500,
    totalAmount: 50_000,
    normalizedJson: {},
    warnings: [],
    errors: [],
    suspiciousFlags: [],
    ...overrides
  };
}

function importHistory(rows: ImportPreviewRow[]): ScheduleCashflowImportHistoryItem[] {
  return [
    {
      id: "batch-1",
      fileName: "vor.xlsx",
      status: "committed",
      committedAt: "2026-07-01T10:00:00.000Z",
      preview: {
        summary: {
          totalRows: rows.length,
          parsedRows: rows.length,
          readyRows: rows.filter((row) => row.status === "ready").length,
          warningRows: rows.filter((row) => row.status === "warning").length,
          errorRows: rows.filter((row) => row.status === "error").length,
          skippedRows: 0,
          ignoredRows: 0,
          sections: 1,
          budgetItems: rows.filter((row) => row.entityType === "budgetItem").length,
          materials: rows.filter((row) => row.entityType === "material").length,
          scheduleItems: 0,
          workRows: rows.filter((row) => row.entityType === "budgetItem").length,
          materialRows: rows.filter((row) => row.entityType === "material").length,
          unknownRows: rows.filter((row) => row.entityType === "unknown").length,
          duplicateRows: 0,
          hiddenRows: 0,
          formulaCells: 0,
          errors: rows.filter((row) => row.status === "error").length,
          warnings: rows.filter((row) => row.status === "warning").length
        },
        previewRows: rows,
        unknownRows: rows
          .filter((row) => row.entityType === "unknown")
          .map((row) => ({ sheetName: row.sheetName, rowNumber: row.sourceRowNumber, reason: "unknown", values: [row.name ?? "unknown"] }))
      }
    }
  ];
}

describe("schedule cashflow intelligence model", () => {
  it("asks for import when no budget or import rows exist", () => {
    const model = buildScheduleCashflowIntelligenceModel({ project: { name: "Empty" } });

    expect(model.status).toBe("needs_import");
    expect(model.summary.packageCount).toBe(0);
    expect(model.executivePlan.draftText).toContain("Нет полностью готовых пакетов");
  });

  it("builds work packages from budget sections and material dependencies", () => {
    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Demo", startsAt: "2026-07-01" },
      budgetItems: [budget(), budget({ id: "budget-2", section: "Монолитные работы", name: "Армирование", qty: 5, plannedUnitPrice: 10_000 })],
      materials: [material()],
      procurementRequests: []
    });

    expect(model.summary.packageCount).toBe(1);
    expect(model.packages[0]).toMatchObject({ section: "Монолитные работы", category: "Монолит", readiness: "needs_materials" });
    expect(model.packages[0].dependencies).toContain("Бетон В25");
    expect(model.readiness.blockers.some((item) => item.includes("пакетов"))).toBe(true);
  });

  it("does not block on materials already covered by active requests", () => {
    const request: ProcurementRequest = {
      id: "req-1",
      projectId: "project-demo",
      title: "Бетон",
      initiator: "ПТО",
      neededAt: "2026-07-05",
      priority: "high",
      status: "draft",
      items: [{ materialId: "mat-1", name: "Бетон В25", qty: 12, unit: "м3" }]
    };

    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Demo", startsAt: "2026-07-01" },
      budgetItems: [budget()],
      materials: [material()],
      procurementRequests: [request]
    });

    expect(model.packages[0].readiness).toBe("ready");
    expect(model.summary.blockedPackages).toBe(0);
  });

  it("derives packages from committed import preview when persisted budget is empty", () => {
    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Demo" },
      budgetItems: [],
      importHistory: importHistory([previewRow()])
    });

    expect(model.status).toBe("draft_ready");
    expect(model.packages[0]).toMatchObject({ section: "Отделочные работы", category: "Отделка" });
    expect(model.timeline[0].label).toBe("Неделя 1");
  });

  it("keeps missing quantity, missing price, and unknown rows visible as blockers", () => {
    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Demo" },
      budgetItems: [budget({ qty: 0, plannedUnitPrice: 0 })],
      importHistory: importHistory([previewRow({ id: "unknown", entityType: "unknown", name: "Комментарий", status: "skipped" })])
    });

    expect(model.status).toBe("blocked");
    expect(model.packages[0].blockers).toEqual(expect.arrayContaining(["1 строк без количества", "1 строк без цены"]));
    expect(model.summary.unknownRows).toBeGreaterThan(0);
    expect(model.risks.some((risk) => risk.title.includes("Unknown"))).toBe(true);
  });

  it("builds weekly cashflow and executive plan without inventing payment terms", () => {
    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Demo", startsAt: "2026-07-01" },
      budgetItems: [budget({ plannedUnitPrice: 15_000 })],
      payments: [payment({ amount: 10_000 })]
    });

    expect(model.cashflow[0]).toMatchObject({ incomingPlanned: 10_000 });
    expect(model.summary.peakCashNeed).toBeGreaterThan(0);
    expect(model.executivePlan.financeCashNeeds[0]).toContain("покрыть");
    expect(model.executivePlan.draftText).toContain("Cashflow");
  });

  it("aligns weekly cashflow to confirmed schedule dates and imported KS allocations", () => {
    const scheduleItems: ScheduleItem[] = [
      {
        id: "schedule-1",
        projectId: "project-demo",
        name: "Демонтаж покрытия",
        owner: "ПТО",
        startsAt: "2026-09-07",
        endsAt: "2026-09-19",
        plannedQty: 10,
        actualQty: 0,
        status: "not_started",
        dependency: "Раздел 1. Демонтажные работы · Профиль ГПР: G01 · Недельный план КС: Н1 600 ₽; Н2 400 ₽"
      },
      {
        id: "schedule-2",
        projectId: "project-demo",
        name: "Устройство мембраны",
        owner: "ПТО",
        startsAt: "2026-09-14",
        endsAt: "2026-09-26",
        plannedQty: 20,
        actualQty: 0,
        status: "not_started",
        dependency: "Раздел 2. Новая кровля · Профиль ГПР: G02 · Недельный план КС: Н2 500 ₽; Н3 1500 ₽"
      }
    ];

    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Троицк", startsAt: "2026-08-25", endsAt: "2026-11-30" },
      budgetItems: [
        budget({ id: "budget-1", section: "Раздел 1. Демонтажные работы", qty: 10, plannedUnitPrice: 100 }),
        budget({ id: "budget-2", section: "Раздел 2.", name: "Устройство мембраны", qty: 20, plannedUnitPrice: 100 })
      ],
      scheduleItems
    });

    expect(model.status).toBe("scheduled");
    expect(model.summary.scheduleWeeks).toBe(3);
    expect(model.timeline.map((week) => week.label)).toEqual(["07.09 - 13.09", "14.09 - 20.09", "21.09 - 27.09"]);
    expect(model.timeline.map((week) => week.workAmount)).toEqual([600, 900, 1500]);
    expect(model.timeline[1]?.packages).toEqual(["Раздел 1. Демонтажные работы", "Раздел 2."]);
    expect(model.timeline.reduce((sum, week) => sum + week.totalAmount, 0)).toBe(3000);
  });

  it("matches approved GPR stage metadata to the corresponding budget section", () => {
    const model = buildScheduleCashflowIntelligenceModel({
      project: { name: "Троицк", startsAt: "2026-09-01" },
      budgetItems: [budget({ section: "Раздел 1. Демонтажные работы", qty: 10, plannedUnitPrice: 100 })],
      scheduleItems: [{
        id: "gpr-1",
        projectId: "project-demo",
        name: "G02 · Захватка 1 · Демонтаж кровли",
        owner: "Демонтажная бригада",
        startsAt: "2026-09-07",
        endsAt: "2026-09-19",
        plannedQty: 100,
        actualQty: 0,
        unit: "%",
        progressMode: "milestone",
        status: "not_started",
        dependency: "Этап ГПР: 1. Демонтажные работы · Предшественник/допуск: G01"
      }]
    });

    expect(model.timeline.map((week) => week.label)).toEqual(["07.09 - 13.09", "14.09 - 20.09"]);
    expect(model.timeline.map((week) => week.workAmount)).toEqual([500, 500]);
  });
});
