import { z } from "zod";
import { customExpenseCategoryId, expenseCategories, expensePaymentMethods, isExpenseCategoryValue } from "@/lib/project-expense-config";

const moneySchema = z.number().finite().min(0).max(1_000_000_000_000);
const positiveMoneySchema = z.number().finite().positive().max(1_000_000_000_000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const projectExpenseItemInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  category: z.string().trim().min(1).max(220).refine(isExpenseCategoryValue),
  quantity: z.number().finite().min(0).max(1_000_000).default(1),
  unit: z.string().trim().min(1).max(40).default("шт"),
  unitPrice: moneySchema,
  amount: moneySchema,
  taxAmount: moneySchema.default(0)
}).superRefine((value, context) => {
  if (value.taxAmount > value.amount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["taxAmount"], message: "Line tax cannot exceed the line total" });
  }
});

export const projectExpenseInputSchema = z.object({
  expenseDate: dateSchema,
  merchant: z.string().trim().min(1).max(300),
  documentNumber: z.string().trim().max(120).nullable().optional(),
  category: z.string().trim().min(1).max(220).refine(isExpenseCategoryValue),
  paymentMethod: z.enum(expensePaymentMethods).default("unknown"),
  currency: z.literal("RUB").default("RUB"),
  grossAmount: positiveMoneySchema,
  taxAmount: moneySchema.default(0),
  costCodeId: z.string().trim().max(200).nullable().optional(),
  notes: z.string().trim().max(2_000).nullable().optional(),
  source: z.enum(["manual", "receipt"]).default("manual"),
  recognitionStatus: z.enum(["not_applicable", "recognized", "edited"]).default("not_applicable"),
  recognitionConfidence: z.enum(["low", "medium", "high"]).nullable().optional(),
  items: z.array(projectExpenseItemInputSchema).max(100).default([])
}).superRefine((value, context) => {
  if (value.taxAmount > value.grossAmount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["taxAmount"], message: "Tax cannot exceed the expense total" });
  }
  if (value.items.length) {
    const linesAmount = value.items.reduce((sum, item) => sum + item.amount, 0);
    if (Math.abs(linesAmount - value.grossAmount) > 0.01) {
      context.addIssue({ code: z.ZodIssueCode.custom, path: ["items"], message: "The sum of expense lines must equal the expense total" });
    }
  }
});

export type ProjectExpenseInput = z.infer<typeof projectExpenseInputSchema>;

type DecimalLike = number | string | { toString(): string };

export type ProjectExpenseRecord = {
  id: string;
  sequence: number;
  projectId: string;
  expenseDate: Date | string;
  merchant: string;
  documentNumber: string | null;
  category: string;
  paymentMethod: string;
  currency: string;
  grossAmount: DecimalLike;
  taxAmount: DecimalLike;
  source: string;
  recognitionStatus: string;
  recognitionConfidence: string | null;
  notes: string | null;
  createdAt: Date | string;
  updatedAt: Date | string;
  costCode?: { id: string; code: string; name: string } | null;
  receiptDocument?: { id: string; title: string; fileName: string | null; mimeType: string | null } | null;
  items?: Array<{
    id: string;
    sequence: number;
    name: string;
    category: string;
    quantity: DecimalLike;
    unit: string;
    unitPrice: DecimalLike;
    amount: DecimalLike;
    taxAmount: DecimalLike;
  }>;
};

function numberValue(value: DecimalLike) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

function isoValue(value: Date | string) {
  return value instanceof Date ? value.toISOString() : new Date(value).toISOString();
}

export function serializeProjectExpense(item: ProjectExpenseRecord) {
  return {
    ...item,
    expenseDate: isoValue(item.expenseDate),
    grossAmount: numberValue(item.grossAmount),
    taxAmount: numberValue(item.taxAmount),
    createdAt: isoValue(item.createdAt),
    updatedAt: isoValue(item.updatedAt),
    items: (item.items ?? []).map((line) => ({
      ...line,
      quantity: numberValue(line.quantity),
      unitPrice: numberValue(line.unitPrice),
      amount: numberValue(line.amount),
      taxAmount: numberValue(line.taxAmount)
    }))
  };
}

export type SerializedProjectExpense = ReturnType<typeof serializeProjectExpense>;

export type ProjectExpenseSummary = {
  count: number;
  grossAmount: number;
  taxAmount: number;
  receipts: number;
  withoutReceipt: number;
  excludedNonRub?: number;
  byCategory: Record<string, number>;
};

export function projectExpenseCustomCategoryIds(input: Pick<ProjectExpenseInput, "category" | "items">) {
  const values = [input.category, ...input.items.map((item) => item.category)];
  return [...new Set(values.map(customExpenseCategoryId).filter((id): id is string => Boolean(id)))];
}

export function buildProjectExpenseSummary(items: ProjectExpenseRecord[], additionalCategories: string[] = []): ProjectExpenseSummary {
  const byCategory: Record<string, number> = Object.fromEntries(expenseCategories.map((category) => [category, 0]));
  for (const category of additionalCategories) byCategory[category] ??= 0;
  const rubItems = items.filter((item) => String(item.currency || "RUB").toUpperCase() === "RUB");
  let grossAmount = 0;
  let taxAmount = 0;
  let receipts = 0;
  for (const item of rubItems) {
    const amount = numberValue(item.grossAmount);
    grossAmount += amount;
    taxAmount += numberValue(item.taxAmount);
    const lines = item.items ?? [];
    const linesAmount = lines.reduce((sum, line) => sum + numberValue(line.amount), 0);
    const useLines = lines.length > 0 && linesAmount > 0 && linesAmount <= amount + 0.01;
    if (useLines) {
      for (const line of lines) {
        byCategory[line.category] ??= 0;
        byCategory[line.category] += numberValue(line.amount);
      }
      const unallocated = Math.max(0, amount - linesAmount);
      if (unallocated > 0.01) {
        byCategory[item.category] ??= 0;
        byCategory[item.category] += unallocated;
      }
    } else {
      byCategory[item.category] ??= 0;
      byCategory[item.category] += amount;
    }
    if (item.receiptDocument) receipts += 1;
  }
  return {
    count: rubItems.length,
    grossAmount,
    taxAmount,
    receipts,
    withoutReceipt: rubItems.length - receipts,
    excludedNonRub: items.length - rubItems.length,
    byCategory
  };
}

export function buildExpenseAwareForecast(input: {
  contractAmount: number;
  budgetForecastCost: number;
  hasBudget: boolean;
  expenseSummary: Pick<ProjectExpenseSummary, "count" | "grossAmount"> | null;
  expenseDataAvailable: boolean;
}) {
  const actualExpenses = input.expenseDataAvailable ? Math.max(0, input.expenseSummary?.grossAmount ?? 0) : null;
  const forecastAvailable = input.hasBudget;
  const forecastCost = forecastAvailable
    ? Math.max(Math.max(0, input.budgetForecastCost), actualExpenses ?? 0)
    : null;
  const forecastProfit = forecastCost === null ? null : input.contractAmount - forecastCost;
  const forecastMarginPercent = forecastProfit !== null && input.contractAmount > 0
    ? forecastProfit / input.contractAmount * 100
    : null;

  return { actualExpenses, forecastAvailable, forecastCost, forecastProfit, forecastMarginPercent };
}
