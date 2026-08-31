import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildProjectExpensesWorkbook } from "@/lib/project-expense-export";
import { buildProjectExpenseSummary, projectExpenseInputSchema, serializeProjectExpense } from "@/lib/project-expenses";

const record = {
  id: "expense-1",
  sequence: 7,
  projectId: "project-1",
  expenseDate: new Date("2026-08-31T12:00:00.000Z"),
  merchant: "ООО Стройснаб",
  documentNumber: "ККТ-17",
  category: "materials",
  paymentMethod: "card",
  currency: "RUB",
  grossAmount: { toString: () => "1250.50" },
  taxAmount: { toString: () => "208.42" },
  source: "receipt",
  recognitionStatus: "recognized",
  recognitionConfidence: "high",
  notes: "Крепёж",
  createdAt: new Date("2026-08-31T13:00:00.000Z"),
  updatedAt: new Date("2026-08-31T13:00:00.000Z"),
  costCode: { id: "cc-1", code: "MAT-01", name: "Материалы" },
  receiptDocument: { id: "doc-1", title: "Чек", fileName: "receipt.pdf", mimeType: "application/pdf" },
  items: [{ id: "line-1", sequence: 1, name: "Саморезы", category: "materials", quantity: "5", unit: "уп", unitPrice: "250.10", amount: "1250.50", taxAmount: "208.42" }]
};

describe("project expense helpers", () => {
  it("validates manual and receipt expense data without allowing tax above total", () => {
    const valid = projectExpenseInputSchema.parse({
      expenseDate: "2026-08-31", merchant: "ООО Стройснаб", category: "materials", paymentMethod: "card", currency: "RUB",
      grossAmount: 1250.5, taxAmount: 208.42, source: "receipt", recognitionStatus: "recognized", recognitionConfidence: "high",
      items: [{ name: "Саморезы", category: "materials", quantity: 5, unit: "уп", unitPrice: 250.1, amount: 1250.5, taxAmount: 208.42 }]
    });
    expect(valid.items).toHaveLength(1);
    expect(projectExpenseInputSchema.safeParse({ ...valid, taxAmount: 1300 }).success).toBe(false);
  });

  it("serializes decimals and builds receipt coverage summary", () => {
    const serialized = serializeProjectExpense(record);
    const summary = buildProjectExpenseSummary([record]);
    expect(serialized.grossAmount).toBe(1250.5);
    expect(serialized.items[0].quantity).toBe(5);
    expect(summary).toMatchObject({ count: 1, grossAmount: 1250.5, taxAmount: 208.42, receipts: 1, withoutReceipt: 0 });
    expect(summary.byCategory.materials).toBe(1250.5);
  });

  it("exports itemized rows and a category summary to XLSX", () => {
    const bytes = buildProjectExpensesWorkbook([record], "Тестовый объект");
    const workbook = XLSX.read(bytes, { type: "buffer" });
    expect(workbook.SheetNames).toEqual(["Расходы постатейно", "Сводка"]);
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Расходы постатейно"]);
    expect(rows[0]).toMatchObject({ "№ расхода": 7, Статья: "Материалы", "Наименование позиции": "Саморезы", "Код затрат": "MAT-01", "Сумма позиции": 1250.5 });
  });
});
