import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildAccountingExport, buildAccountingImportPreview, parseAccountingImportFile } from "./accounting-bridge";
import type { Material, Payment, ProcurementRequest, Project } from "./types";

const payments: Payment[] = [
  { id: "pay-1", projectId: "p1", title: "Оплата бетона", counterparty: "ООО Бетон", direction: "outgoing", plannedAt: "2026-07-10", amount: 120000, status: "approved", category: "supplier" },
  { id: "pay-2", projectId: "p1", title: "Аванс заказчика", counterparty: "АО Заказчик", direction: "incoming", plannedAt: "2026-07-15", amount: 500000, status: "planned", category: "customer" }
];

describe("accounting bridge", () => {
  it("parses an Excel statement and matches a safe payment deterministically", () => {
    const sheet = XLSX.utils.json_to_sheet([{ "Номер документа": "1C-77", Дата: "11.07.2026", Контрагент: "ООО Бетон", Операция: "Списание", Сумма: "120 000,00", Статус: "Проведен", Назначение: "Оплата бетона" }]);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, sheet, "Платежи");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
    const parsed = parseAccountingImportFile(buffer, "statement.xlsx");
    const preview = buildAccountingImportPreview({ sourceSystem: "1c", fileName: "statement.xlsx", checksum: parsed.checksum, rows: parsed.rows, payments });

    expect(preview.summary).toMatchObject({ total: 1, matched: 1, safeToApply: 1 });
    expect(preview.matches[0]).toMatchObject({ paymentId: "pay-1", status: "matched", action: "mark_paid" });
  });

  it("does not silently choose between ambiguous payments", () => {
    const row = { rowNumber: 2, date: "2026-07-10", counterparty: "", direction: "outgoing" as const, amount: 120000, status: "paid" as const, purpose: "", currency: "RUB" };
    const duplicate = { ...payments[0], id: "pay-3" };
    const preview = buildAccountingImportPreview({ sourceSystem: "excel", fileName: "rows.json", checksum: "x", rows: [row], payments: [payments[0], duplicate] });
    expect(preview.matches[0].status).toBe("ambiguous");
    expect(preview.summary.safeToApply).toBe(0);
  });

  it("reads UTF-8 Russian CSV exports", () => {
    const buffer = Buffer.from("Номер документа;Дата;Контрагент;Операция;Сумма;Статус\n1C-88;15.07.2026;АО Заказчик;Поступление;500000;Проведен", "utf8");
    const parsed = parseAccountingImportFile(buffer, "statement.csv");
    expect(parsed.rows[0]).toMatchObject({ externalId: "1C-88", direction: "incoming", amount: 500000, counterparty: "АО Заказчик" });
  });

  it("does not apply two imported rows to the same PGS payment", () => {
    const rows = ["A", "B"].map((externalId, index) => ({ rowNumber: index + 2, externalId, date: "2026-07-10", counterparty: "ООО Бетон", direction: "outgoing" as const, amount: 120000, status: "paid" as const, purpose: "Оплата бетона", currency: "RUB" }));
    const preview = buildAccountingImportPreview({ sourceSystem: "1c", fileName: "rows.json", checksum: "x", rows, payments });
    expect(preview.summary).toMatchObject({ matched: 0, ambiguous: 2, safeToApply: 0 });
    expect(preview.matches.every((match) => match.action === "none")).toBe(true);
  });

  it("builds a stable export without inventing missing procurement prices", () => {
    const project = { id: "p1", organizationId: "o1", name: "Объект", customer: "Заказчик", object: "Корпус", address: "Адрес", contractAmount: 1000000, vatMode: "vat", startsAt: "2026-01-01", endsAt: "2026-12-31", manager: "РП", status: "active" } satisfies Project;
    const materials = [{ id: "m1", projectId: "p1", name: "Бетон", unit: "м3", requiredQty: 10, orderedQty: 0, deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 7000, actualUnitPrice: 0, supplier: "", neededAt: "2026-07-10", status: "required" }] satisfies Material[];
    const requests = [{ id: "r1", projectId: "p1", title: "Бетон", initiator: "ПТО", neededAt: "2026-07-10", priority: "high", status: "approved", items: [{ materialId: "m1", name: "Бетон", qty: 10, unit: "м3" }, { materialId: "", name: "Неизвестная позиция", qty: 2, unit: "шт" }] }] satisfies ProcurementRequest[];
    const result = buildAccountingExport({ project, materials, procurementRequests: requests, payments, generatedAt: "2026-07-15T00:00:00.000Z" });

    expect(result.totals.commitments).toBe(70000);
    expect(result.commitments[0].lines[1]).toMatchObject({ unitPrice: 0, amount: 0, estimateStatus: "missing_price" });
    expect(result.generatedAt).toBe("2026-07-15T00:00:00.000Z");
  });

  it("uses the approved commitment register instead of procurement estimates when available", () => {
    const project = { id: "p1", organizationId: "o1", name: "Объект", customer: "Заказчик", object: "Корпус", address: "Адрес", contractAmount: 1_000_000, vatMode: "vat", startsAt: "2026-01-01", endsAt: "2026-12-31", manager: "РП", status: "active" } satisfies Project;
    const result = buildAccountingExport({
      project,
      materials: [],
      procurementRequests: [],
      payments,
      commitments: [{
        id: "com-1", number: "COM-001", type: "subcontract", title: "Монолит", counterparty: "ООО Монолит", status: "active", currency: "RUB", retentionPercent: 5,
        lines: [{ id: "line-1", costCodeId: "cc-1", code: "01.01", description: "Работы", quantity: 1, unit: "компл.", unitPrice: 100_000, scheduledValue: 100_000 }],
        changeOrders: [{ status: "approved", approvedAmount: 20_000, committedAmount: 0 }],
        paymentApplications: [{ status: "approved", currentAmount: 30_000, materialsStored: 0, retentionAmount: 1_500, netAmount: 28_500 }]
      }],
      costCodes: [{ id: "cc-1", code: "01.01", name: "Монолит" }]
    });
    expect(result.totals.commitments).toBe(120_000);
    expect(result.commitments[0]).toMatchObject({ source: "commitment_register", approvedApplications: 30_000, retentionHeld: 1_500 });
    expect(result.commitments[0].lines[0]).toMatchObject({ estimateStatus: "contracted", costCode: { code: "01.01" } });
  });
});
