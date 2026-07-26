import { z } from "zod";

export const invoiceDirections = ["AP", "AR"] as const;
export const invoiceTypes = ["invoice", "credit_note"] as const;
export const invoiceStatuses = ["received", "approved", "disputed", "paid", "void"] as const;
export const invoiceMatchStatuses = ["unmatched", "matched", "variance", "blocked"] as const;

const optionalId = z.string().trim().max(160).optional().default("");

const invoiceFields = {
  number: z.string().trim().min(1).max(120),
  direction: z.enum(invoiceDirections),
  invoiceType: z.enum(invoiceTypes).default("invoice"),
  counterparty: z.string().trim().min(2).max(180),
  issueDate: z.string().datetime(),
  dueDate: z.string().datetime(),
  servicePeriodStart: z.string().datetime().optional().or(z.literal("")).default(""),
  servicePeriodEnd: z.string().datetime().optional().or(z.literal("")).default(""),
  grossAmount: z.coerce.number().min(0).max(1_000_000_000_000),
  taxAmount: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  currency: z.string().trim().min(3).max(8).default("RUB"),
  costCodeId: optionalId,
  commitmentId: optionalId,
  paymentApplicationId: optionalId,
  paymentId: optionalId,
  linkedDocumentId: optionalId,
  notes: z.string().trim().max(3000).optional().default("")
};

function validateInvoiceDatesAndAmounts(
  input: Partial<{
    issueDate: string;
    dueDate: string;
    servicePeriodStart: string;
    servicePeriodEnd: string;
    grossAmount: number;
    taxAmount: number;
  }>,
  context: z.RefinementCtx
) {
  if (input.dueDate && input.issueDate && new Date(input.dueDate) < new Date(input.issueDate)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["dueDate"], message: "Due date must not precede issue date" });
  }
  if (input.taxAmount !== undefined && input.grossAmount !== undefined && input.taxAmount > input.grossAmount) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["taxAmount"], message: "Tax must not exceed gross amount" });
  }
  if (input.servicePeriodStart && input.servicePeriodEnd && new Date(input.servicePeriodEnd) < new Date(input.servicePeriodStart)) {
    context.addIssue({ code: z.ZodIssueCode.custom, path: ["servicePeriodEnd"], message: "Service period end must not precede start" });
  }
}

export const invoiceCreateSchema = z.object(invoiceFields).strict().superRefine(validateInvoiceDatesAndAmounts);

export const invoiceUpdateSchema = z.object(invoiceFields).partial().extend({
  status: z.enum(invoiceStatuses).optional()
}).strict().superRefine(validateInvoiceDatesAndAmounts);

export const invoiceReconcileSchema = z.object({ confirmed: z.literal(true) }).strict();

export type InvoiceMatchInput = {
  direction: string;
  counterparty: string;
  grossAmount: number | string | { toString(): string };
  linkedDocumentId?: string | null;
  commitment?: {
    counterparty: string;
    status: string;
    lines: Array<{ scheduledValue: number | string | { toString(): string } }>;
  } | null;
  paymentApplication?: {
    status: string;
    netAmount: number | string | { toString(): string };
    commitmentId: string;
  } | null;
  payment?: {
    direction: string;
    status: string;
    amount: number | string | { toString(): string };
  } | null;
};

function amount(input: InvoiceMatchInput["grossAmount"] | null | undefined) {
  const parsed = Number(input ?? 0);
  return Number.isFinite(parsed) ? Math.round(parsed * 100) / 100 : 0;
}

function normalized(value: string) {
  return value.trim().toLocaleLowerCase("ru-RU").replace(/\s+/g, " ");
}

export function buildInvoiceReconciliation(input: InvoiceMatchInput) {
  const invoiceAmount = amount(input.grossAmount);
  const sourceAmount = input.paymentApplication
    ? amount(input.paymentApplication.netAmount)
    : input.commitment
      ? amount(input.commitment.lines.reduce((sum, line) => sum + amount(line.scheduledValue), 0))
      : null;
  const paymentAmount = input.payment ? amount(input.payment.amount) : null;
  const amountVariance = sourceAmount === null ? null : Math.round((invoiceAmount - sourceAmount) * 100) / 100;
  const paymentVariance = paymentAmount === null ? null : Math.round((invoiceAmount - paymentAmount) * 100) / 100;
  const expectedPaymentDirection = input.direction === "AP" ? "outgoing" : "incoming";

  const checks = [
    {
      key: "document",
      label: "Первичный документ",
      status: input.linkedDocumentId ? "pass" as const : "blocked" as const,
      detail: input.linkedDocumentId ? "Документ привязан." : "Привяжите счёт или акт из вкладки «Документы»."
    },
    {
      key: "source",
      label: input.direction === "AP" ? "Обязательство / КС" : "КС / основание реализации",
      status: sourceAmount === null ? "blocked" as const : Math.abs(amountVariance ?? 0) <= 1 ? "pass" as const : "variance" as const,
      detail: sourceAmount === null
        ? "Не выбрано основание для сверки."
        : `Основание ${sourceAmount.toLocaleString("ru-RU")} ₽; отклонение ${amountVariance?.toLocaleString("ru-RU")} ₽.`
    },
    {
      key: "counterparty",
      label: "Контрагент",
      status: !input.commitment
        ? "info" as const
        : normalized(input.commitment.counterparty) === normalized(input.counterparty)
          ? "pass" as const
          : "variance" as const,
      detail: !input.commitment
        ? "Сравнение контрагента доступно после привязки обязательства."
        : normalized(input.commitment.counterparty) === normalized(input.counterparty)
          ? "Контрагент совпадает."
          : `В обязательстве указан «${input.commitment.counterparty}».`
    },
    {
      key: "payment",
      label: "Платёж",
      status: !input.payment
        ? "info" as const
        : input.payment.direction !== expectedPaymentDirection || Math.abs(paymentVariance ?? 0) > 1
          ? "variance" as const
          : input.payment.status === "paid"
            ? "pass" as const
            : "info" as const,
      detail: !input.payment
        ? "Платёж не привязан; проводка автоматически не создаётся."
        : input.payment.direction !== expectedPaymentDirection
          ? "Направление платежа не соответствует AP/AR."
          : `Платёж ${paymentAmount?.toLocaleString("ru-RU")} ₽, статус ${input.payment.status}.`
    }
  ];

  const matchStatus = checks.some((check) => check.status === "blocked")
    ? "blocked"
    : checks.some((check) => check.status === "variance")
      ? "variance"
      : "matched";

  return {
    matchStatus,
    amountVariance,
    paymentVariance,
    sourceAmount,
    paymentAmount,
    checks
  };
}

type InvoiceRecord = {
  id: string;
  projectId: string;
  sequence: number;
  number: string;
  direction: string;
  invoiceType: string;
  counterparty: string;
  issueDate: Date;
  dueDate: Date;
  servicePeriodStart: Date | null;
  servicePeriodEnd: Date | null;
  grossAmount: InvoiceMatchInput["grossAmount"];
  taxAmount: InvoiceMatchInput["grossAmount"];
  currency: string;
  status: string;
  matchStatus: string;
  matchSnapshot: unknown;
  notes: string | null;
  approvedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  costCodeId: string | null;
  commitmentId: string | null;
  paymentApplicationId: string | null;
  paymentId: string | null;
  linkedDocumentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  costCode?: { code: string; name: string } | null;
  commitment?: { number: string; title: string; counterparty: string } | null;
  paymentApplication?: { number: string; status: string } | null;
  payment?: { title: string; status: string } | null;
  linkedDocument?: { title: string; fileName: string | null } | null;
};

export function serializeProjectInvoice(item: InvoiceRecord) {
  return {
    ...item,
    grossAmount: amount(item.grossAmount),
    taxAmount: amount(item.taxAmount),
    issueDate: item.issueDate.toISOString(),
    dueDate: item.dueDate.toISOString(),
    servicePeriodStart: item.servicePeriodStart?.toISOString() ?? null,
    servicePeriodEnd: item.servicePeriodEnd?.toISOString() ?? null,
    approvedAt: item.approvedAt?.toISOString() ?? null,
    paidAt: item.paidAt?.toISOString() ?? null,
    voidedAt: item.voidedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}
