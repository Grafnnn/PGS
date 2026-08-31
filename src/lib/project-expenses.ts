import { z } from "zod";
import { expenseCategories, expensePaymentMethods, type ExpenseCategory } from "@/lib/project-expense-config";

const moneySchema = z.number().finite().min(0).max(1_000_000_000_000);
const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export const projectExpenseItemInputSchema = z.object({
  name: z.string().trim().min(1).max(300),
  category: z.enum(expenseCategories),
  quantity: z.number().finite().min(0).max(1_000_000).default(1),
  unit: z.string().trim().min(1).max(40).default("шт"),
  unitPrice: moneySchema,
  amount: moneySchema,
  taxAmount: moneySchema.default(0)
});

export const projectExpenseInputSchema = z.object({
  expenseDate: dateSchema,
  merchant: z.string().trim().min(1).max(300),
  documentNumber: z.string().trim().max(120).nullable().optional(),
  category: z.enum(expenseCategories),
  paymentMethod: z.enum(expensePaymentMethods).default("unknown"),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("RUB"),
  grossAmount: moneySchema,
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

export function buildProjectExpenseSummary(items: ProjectExpenseRecord[]) {
  const byCategory = Object.fromEntries(expenseCategories.map((category) => [category, 0])) as Record<ExpenseCategory, number>;
  let grossAmount = 0;
  let taxAmount = 0;
  let receipts = 0;
  for (const item of items) {
    const amount = numberValue(item.grossAmount);
    grossAmount += amount;
    taxAmount += numberValue(item.taxAmount);
    if (expenseCategories.includes(item.category as ExpenseCategory)) byCategory[item.category as ExpenseCategory] += amount;
    if (item.receiptDocument) receipts += 1;
  }
  return { count: items.length, grossAmount, taxAmount, receipts, withoutReceipt: items.length - receipts, byCategory };
}
