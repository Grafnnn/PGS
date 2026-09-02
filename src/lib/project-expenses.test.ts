import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { buildProjectExpensesWorkbook } from "@/lib/project-expense-export";
import { buildProjectExpenseSummary, projectExpenseCustomCategoryIds, projectExpenseInputSchema, serializeProjectExpense } from "@/lib/project-expenses";

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
    expect(projectExpenseInputSchema.safeParse({ ...valid, grossAmount: 0 }).success).toBe(false);
    expect(projectExpenseInputSchema.safeParse({ ...valid, grossAmount: 1300 }).success).toBe(false);
    expect(projectExpenseInputSchema.safeParse({ ...valid, items: [{ ...valid.items[0], taxAmount: 1300 }] }).success).toBe(false);
    expect(projectExpenseInputSchema.safeParse({ ...valid, category: "custom:category-1" }).success).toBe(true);
    expect(projectExpenseInputSchema.safeParse({ ...valid, category: "invented-category" }).success).toBe(false);
  });

  it("extracts unique custom categories and includes them in the summary", () => {
    const parsed = projectExpenseInputSchema.parse({
      expenseDate: "2026-08-31", merchant: "Аренда", category: "custom:category-1", grossAmount: 700,
      items: [{ name: "Бытовка", category: "custom:category-1", quantity: 1, unit: "мес", unitPrice: 700, amount: 700 }]
    });
    expect(projectExpenseCustomCategoryIds(parsed)).toEqual(["category-1"]);
    const customRecord = { ...record, category: "custom:category-1", grossAmount: 700 };
    expect(buildProjectExpenseSummary([customRecord], ["custom:category-1"]).byCategory["custom:category-1"]).toBe(700);
  });

  it("allocates a detailed expense across line categories without exceeding the total", () => {
    const detailed = {
      ...record,
      grossAmount: 1000,
      items: [
        { ...record.items[0], id: "line-1", category: "materials", amount: 600 },
        { ...record.items[0], id: "line-2", category: "custom:delivery", amount: 300 }
      ]
    };
    const summary = buildProjectExpenseSummary([detailed], ["custom:delivery"]);
    expect(summary.byCategory.materials).toBe(700);
    expect(summary.byCategory["custom:delivery"]).toBe(300);
    expect(Object.values(summary.byCategory).reduce((sum, value) => sum + value, 0)).toBe(1000);
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

  it("uses a custom category label in the itemized Excel export", () => {
    const customRecord = { ...record, category: "custom:category-1", items: [{ ...record.items[0], category: "custom:category-1" }] };
    const bytes = buildProjectExpensesWorkbook([customRecord], "Тестовый объект", { "custom:category-1": "Аренда бытовки" });
    const workbook = XLSX.read(bytes, { type: "buffer" });
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(workbook.Sheets["Расходы постатейно"]);
    expect(rows[0]).toMatchObject({ Статья: "Аренда бытовки" });
  });
});
