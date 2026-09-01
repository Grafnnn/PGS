import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildProcurementWorkbook } from "./procurement-export";
import type { Material, ProcurementRequest } from "./types";

describe("procurement workbook export", () => {
  it("exports grouped requests, line balances and warehouse stock", () => {
    const request: ProcurementRequest = {
      id: "request-1",
      projectId: "project-1",
      requestNumber: "SUP-001",
      title: "Кровельные материалы",
      initiator: "ПТО",
      neededAt: "2026-09-20",
      expectedAt: "2026-09-18",
      priority: "high",
      status: "expected",
      items: [{ id: "line-1", materialId: "material-1", name: "Мембрана", qty: 100, receivedQty: 40, unit: "м2" }]
    };
    const material = {
      id: "material-1", projectId: "project-1", name: "Мембрана", unit: "м2", requiredQty: 100, orderedQty: 100,
      deliveredQty: 40, consumedQty: 10, plannedUnitPrice: 500, actualUnitPrice: 0, supplier: "Поставщик", neededAt: "2026-09-20", status: "in_transit"
    } satisfies Material;
    const bytes = buildProcurementWorkbook("Троицк", [request], [material]);
    const workbook = XLSX.read(bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Сводка", "Заявки", "Позиции", "Склад"]);
    const lines = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Позиции"]);
    expect(lines[0]).toMatchObject({ "№ заявки": "SUP-001", Материал: "Мембрана", Принято: 40, Осталось: 60 });
    const stock = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Склад"]);
    expect(stock[0]).toMatchObject({ Материал: "Мембрана", "На складе": 30, "Стоимость остатка": 15_000 });
  });
});
