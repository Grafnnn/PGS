import * as XLSX from "xlsx";
import {
  expenseCategories,
  expenseCategoryLabels,
  expensePaymentMethodLabels,
  type ExpenseCategory,
  type ExpensePaymentMethod
} from "@/lib/project-expense-config";
import {
  buildProjectExpenseSummary,
  type ProjectExpenseRecord
} from "@/lib/project-expenses";

function numberValue(value: number | string | { toString(): string }) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function categoryLabel(value: string) {
  return expenseCategoryLabels[value as ExpenseCategory] ?? value;
}

function paymentMethodLabel(value: string) {
  return expensePaymentMethodLabels[value as ExpensePaymentMethod] ?? value;
}

export function buildProjectExpensesWorkbook(items: ProjectExpenseRecord[], projectName: string) {
  const detailRows = items.flatMap((expense) => {
    const lines = expense.items?.length ? expense.items : [null];
    return lines.map((line) => ({
      "№ расхода": expense.sequence,
      Дата: new Date(expense.expenseDate).toLocaleDateString("ru-RU"),
      Статья: categoryLabel(line?.category ?? expense.category),
      "Код затрат": expense.costCode?.code ?? "",
      "Наименование позиции": line?.name ?? expense.merchant,
      Количество: line ? numberValue(line.quantity) : 1,
      Ед: line?.unit ?? "расход",
      "Цена за единицу": line ? numberValue(line.unitPrice) : numberValue(expense.grossAmount),
      "Сумма позиции": line ? numberValue(line.amount) : numberValue(expense.grossAmount),
      "НДС позиции": line ? numberValue(line.taxAmount) : numberValue(expense.taxAmount),
      Поставщик: expense.merchant,
      "№ документа": expense.documentNumber ?? "",
      "Способ оплаты": paymentMethodLabel(expense.paymentMethod),
      "Общая сумма расхода": numberValue(expense.grossAmount),
      "НДС расхода": numberValue(expense.taxAmount),
      Валюта: expense.currency,
      Источник: expense.source === "receipt" ? "Чек" : "Вручную",
      "Файл чека": expense.receiptDocument?.fileName ?? "",
      Примечание: expense.notes ?? ""
    }));
  });
  const summary = buildProjectExpenseSummary(items);
  const summaryRows = [
    { Показатель: "Проект", Значение: projectName },
    { Показатель: "Всего расходов", Значение: summary.grossAmount },
    { Показатель: "В том числе НДС", Значение: summary.taxAmount },
    { Показатель: "Записей", Значение: summary.count },
    { Показатель: "С чеками", Значение: summary.receipts },
    { Показатель: "Без чеков", Значение: summary.withoutReceipt },
    ...expenseCategories.map((category) => ({ Показатель: expenseCategoryLabels[category], Значение: summary.byCategory[category] }))
  ];

  const workbook = XLSX.utils.book_new();
  const detailsSheet = XLSX.utils.json_to_sheet(detailRows.length ? detailRows : [{ "№ расхода": "", Дата: "", Статья: "", "Наименование позиции": "", "Сумма позиции": "" }]);
  detailsSheet["!cols"] = [8, 12, 22, 14, 34, 12, 10, 17, 17, 15, 24, 16, 20, 20, 16, 10, 12, 24, 30].map((wch) => ({ wch }));
  const summarySheet = XLSX.utils.json_to_sheet(summaryRows);
  summarySheet["!cols"] = [{ wch: 30 }, { wch: 28 }];
  XLSX.utils.book_append_sheet(workbook, detailsSheet, "Расходы постатейно");
  XLSX.utils.book_append_sheet(workbook, summarySheet, "Сводка");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
