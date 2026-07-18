import { z } from "zod";

export const commitmentTypes = ["owner_contract", "subcontract", "purchase_order", "service_order"] as const;
export const commitmentStatuses = ["draft", "submitted", "revision_required", "approved", "active", "completed", "terminated", "rejected", "void"] as const;
export const commitmentActions = ["submit", "request_revision", "approve", "reject", "activate", "complete", "terminate", "void", "link_change_order", "unlink_change_order"] as const;
export const paymentApplicationStatuses = ["draft", "submitted", "approved", "rejected", "paid", "void"] as const;
export const paymentApplicationActions = ["submit", "approve", "reject", "mark_paid", "void"] as const;

export type CommitmentAction = (typeof commitmentActions)[number];
export type PaymentApplicationAction = (typeof paymentApplicationActions)[number];

export const commitmentLineSchema = z.object({
  budgetItemId: z.string().trim().max(160).optional().default(""),
  costCodeId: z.string().trim().max(160).optional().default(""),
  sourceProcurementRequestItemId: z.string().trim().max(160).optional().default(""),
  code: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().min(2).max(500),
  quantity: z.coerce.number().positive().max(1_000_000_000).default(1),
  unit: z.string().trim().min(1).max(40).default("компл."),
  unitPrice: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  scheduledValue: z.coerce.number().min(0).max(1_000_000_000_000).optional()
}).strict();

const editableCommitmentFields = {
  type: z.enum(commitmentTypes).default("subcontract"),
  title: z.string().trim().min(3).max(180),
  counterparty: z.string().trim().min(2).max(180),
  externalNumber: z.string().trim().max(120).optional().default(""),
  retentionPercent: z.coerce.number().min(0).max(100).default(0),
  paymentTerms: z.string().trim().max(2000).optional().default(""),
  startsAt: z.string().datetime().optional().or(z.literal("")).default(""),
  endsAt: z.string().datetime().optional().or(z.literal("")).default(""),
  sourceProcurementRequestId: z.string().trim().max(160).optional().default(""),
  linkedDocumentId: z.string().trim().max(160).optional().default(""),
  lines: z.array(commitmentLineSchema).min(1).max(100)
};

export const commitmentCreateSchema = z.object(editableCommitmentFields).strict().superRefine((value, ctx) => {
  if (value.startsAt && value.endsAt && new Date(value.startsAt) > new Date(value.endsAt)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End date must not precede start date" });
  }
});
export const commitmentUpdateSchema = z.object(editableCommitmentFields).partial().strict();

export const commitmentActionSchema = z.object({
  action: z.enum(commitmentActions),
  comment: z.string().trim().max(3000).optional().default(""),
  workflowTemplateId: z.string().trim().max(160).optional().default(""),
  changeOrderId: z.string().trim().max(160).optional().default("")
}).strict();

export const paymentApplicationLineSchema = z.object({
  commitmentLineId: z.string().trim().min(1).max(160),
  currentAmount: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  materialsStored: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  retentionAmount: z.coerce.number().min(0).max(1_000_000_000_000).optional()
}).strict();

export const paymentApplicationCreateSchema = z.object({
  periodStart: z.string().datetime(),
  periodEnd: z.string().datetime(),
  notes: z.string().trim().max(3000).optional().default(""),
  lines: z.array(paymentApplicationLineSchema).min(1).max(100)
}).strict().superRefine((value, ctx) => {
  if (new Date(value.periodStart) > new Date(value.periodEnd)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["periodEnd"], message: "Period end must not precede start" });
  }
});

export const paymentApplicationActionSchema = z.object({
  action: z.enum(paymentApplicationActions),
  comment: z.string().trim().max(3000).optional().default(""),
  paymentId: z.string().trim().max(160).optional().default("")
}).strict();

type Numeric = number | string | { toString(): string };

function amount(value: Numeric | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function rounded(value: number) {
  return Math.round(value * 100) / 100;
}

export function normalizeCommitmentLine(line: z.infer<typeof commitmentLineSchema>) {
  const scheduledValue = line.scheduledValue === undefined ? line.quantity * line.unitPrice : line.scheduledValue;
  return { ...line, scheduledValue: rounded(scheduledValue) };
}

export function commitmentOriginalAmount(lines: Array<{ scheduledValue: Numeric }>) {
  return rounded(lines.reduce((total, line) => total + amount(line.scheduledValue), 0));
}

export function approvedChangeAmount(changeOrders: Array<{ status: string; approvedAmount: Numeric; committedAmount: Numeric }>) {
  return rounded(changeOrders
    .filter((item) => item.status === "approved" || item.status === "executed")
    .reduce((total, item) => total + amount(item.status === "executed" ? item.committedAmount || item.approvedAmount : item.approvedAmount), 0));
}

export function paymentApplicationAmounts(lines: Array<{
  currentAmount: Numeric;
  materialsStored: Numeric;
  retentionAmount: Numeric;
}>) {
  const current = rounded(lines.reduce((total, line) => total + amount(line.currentAmount), 0));
  const materialsStored = rounded(lines.reduce((total, line) => total + amount(line.materialsStored), 0));
  const retention = rounded(lines.reduce((total, line) => total + amount(line.retentionAmount), 0));
  return { current, materialsStored, gross: rounded(current + materialsStored), retention, net: rounded(current + materialsStored - retention) };
}

export function resolveCommitmentTransition(status: string, action: CommitmentAction) {
  if (action === "link_change_order" || action === "unlink_change_order") return status;
  const allowed: Record<CommitmentAction, string[]> = {
    submit: ["draft", "revision_required"],
    request_revision: ["submitted"],
    approve: ["submitted"],
    reject: ["submitted"],
    activate: ["approved"],
    complete: ["active"],
    terminate: ["approved", "active"],
    void: ["draft", "revision_required", "submitted", "approved", "rejected"],
    link_change_order: commitmentStatuses.slice(),
    unlink_change_order: commitmentStatuses.slice()
  };
  if (!allowed[action].includes(status)) throw new Error(`Action ${action} is not allowed from ${status}`);
  return ({ submit: "submitted", request_revision: "revision_required", approve: "approved", reject: "rejected", activate: "active", complete: "completed", terminate: "terminated", void: "void" } as const)[action];
}

export function resolvePaymentApplicationTransition(status: string, action: PaymentApplicationAction) {
  const allowed: Record<PaymentApplicationAction, string[]> = {
    submit: ["draft"],
    approve: ["submitted"],
    reject: ["submitted"],
    mark_paid: ["approved"],
    void: ["draft", "submitted", "approved", "rejected"]
  };
  if (!allowed[action].includes(status)) throw new Error(`Action ${action} is not allowed from ${status}`);
  return ({ submit: "submitted", approve: "approved", reject: "rejected", mark_paid: "paid", void: "void" } as const)[action];
}

type CommitmentRecord = {
  id: string;
  organizationId: string;
  projectId: string;
  sequence: number;
  number: string;
  type: string;
  title: string;
  counterparty: string;
  externalNumber: string | null;
  status: string;
  currency: string;
  retentionPercent: Numeric;
  paymentTerms: string | null;
  startsAt: Date | null;
  endsAt: Date | null;
  sourceProcurementRequestId: string | null;
  linkedDocumentId: string | null;
  linkedDocumentVersion: number | null;
  linkedDocumentVersionId: string | null;
  approvalWorkflowRunId: string | null;
  decisionComment: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  activatedAt: Date | null;
  completedAt: Date | null;
  terminatedAt: Date | null;
  rejectedAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  linkedDocument?: { title: string; fileName: string | null } | null;
  sourceProcurementRequest?: { id: string; title: string } | null;
  approvalWorkflowRun?: { id: string; title: string; status: string } | null;
  lines: Array<{
    id: string;
    budgetItemId: string | null;
    costCodeId: string | null;
    sourceProcurementRequestItemId: string | null;
    sequence: number;
    code: string | null;
    description: string;
    quantity: Numeric;
    unit: string;
    unitPrice: Numeric;
    scheduledValue: Numeric;
    costCode?: { code: string; name: string } | null;
  }>;
  changeOrders: Array<{ id: string; number: string; title: string; status: string; approvedAmount: Numeric; committedAmount: Numeric }>;
  paymentApplications: Array<PaymentApplicationRecord>;
};

type PaymentApplicationRecord = {
  id: string;
  projectId: string;
  commitmentId: string;
  paymentId: string | null;
  sequence: number;
  number: string;
  periodStart: Date;
  periodEnd: Date;
  status: string;
  currentAmount: Numeric;
  materialsStored: Numeric;
  retentionAmount: Numeric;
  netAmount: Numeric;
  notes: string | null;
  decisionComment: string | null;
  submittedAt: Date | null;
  approvedAt: Date | null;
  rejectedAt: Date | null;
  paidAt: Date | null;
  voidedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  payment?: { id: string; title: string; status: string; amount: Numeric; direction: string } | null;
  lines: Array<{
    id: string;
    commitmentLineId: string;
    previousAmount: Numeric;
    currentAmount: Numeric;
    materialsStored: Numeric;
    retentionAmount: Numeric;
  }>;
};

export function serializePaymentApplication(item: PaymentApplicationRecord) {
  return {
    ...item,
    currentAmount: amount(item.currentAmount),
    materialsStored: amount(item.materialsStored),
    retentionAmount: amount(item.retentionAmount),
    netAmount: amount(item.netAmount),
    periodStart: item.periodStart.toISOString(),
    periodEnd: item.periodEnd.toISOString(),
    submittedAt: item.submittedAt?.toISOString() ?? null,
    approvedAt: item.approvedAt?.toISOString() ?? null,
    rejectedAt: item.rejectedAt?.toISOString() ?? null,
    paidAt: item.paidAt?.toISOString() ?? null,
    voidedAt: item.voidedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    payment: item.payment ? { ...item.payment, amount: amount(item.payment.amount) } : null,
    lines: item.lines.map((line) => ({
      ...line,
      previousAmount: amount(line.previousAmount),
      currentAmount: amount(line.currentAmount),
      materialsStored: amount(line.materialsStored),
      retentionAmount: amount(line.retentionAmount)
    }))
  };
}

export function serializeCommitment(item: CommitmentRecord) {
  const originalAmount = commitmentOriginalAmount(item.lines);
  const changesAmount = approvedChangeAmount(item.changeOrders);
  const revisedAmount = rounded(originalAmount + changesAmount);
  const approvedApplications = item.paymentApplications.filter((application) => application.status === "approved" || application.status === "paid");
  const approvedGross = rounded(approvedApplications.reduce((total, application) => total + amount(application.currentAmount) + amount(application.materialsStored), 0));
  const paid = rounded(item.paymentApplications.filter((application) => application.status === "paid").reduce((total, application) => total + amount(application.netAmount), 0));
  const retentionHeld = rounded(approvedApplications.reduce((total, application) => total + amount(application.retentionAmount), 0));
  return {
    ...item,
    retentionPercent: amount(item.retentionPercent),
    startsAt: item.startsAt?.toISOString() ?? null,
    endsAt: item.endsAt?.toISOString() ?? null,
    submittedAt: item.submittedAt?.toISOString() ?? null,
    approvedAt: item.approvedAt?.toISOString() ?? null,
    activatedAt: item.activatedAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    terminatedAt: item.terminatedAt?.toISOString() ?? null,
    rejectedAt: item.rejectedAt?.toISOString() ?? null,
    voidedAt: item.voidedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    lines: item.lines.map((line) => ({ ...line, quantity: amount(line.quantity), unitPrice: amount(line.unitPrice), scheduledValue: amount(line.scheduledValue) })),
    paymentApplications: item.paymentApplications.map(serializePaymentApplication),
    values: {
      original: originalAmount,
      approvedChanges: changesAmount,
      revised: revisedAmount,
      approvedApplications: approvedGross,
      paid,
      retentionHeld,
      remaining: rounded(Math.max(0, revisedAmount - approvedGross))
    }
  };
}

export function commitmentSummary(items: CommitmentRecord[]) {
  const serialized = items.map(serializeCommitment);
  const liveStatuses = new Set(["approved", "active", "completed"]);
  return {
    total: items.length,
    active: items.filter((item) => item.status === "active").length,
    awaitingApproval: items.filter((item) => item.status === "submitted").length,
    revisedValue: rounded(serialized.filter((item) => liveStatuses.has(item.status)).reduce((total, item) => total + item.values.revised, 0)),
    approvedApplications: rounded(serialized.reduce((total, item) => total + item.values.approvedApplications, 0)),
    paid: rounded(serialized.reduce((total, item) => total + item.values.paid, 0)),
    retentionHeld: rounded(serialized.reduce((total, item) => total + item.values.retentionHeld, 0)),
    remaining: rounded(serialized.filter((item) => liveStatuses.has(item.status)).reduce((total, item) => total + item.values.remaining, 0))
  };
}

export function expectedPaymentDirection(type: string) {
  return type === "owner_contract" ? "incoming" : "outgoing";
}

export function validatePaymentApplicationLines(
  commitment: {
    retentionPercent: unknown;
    lines: Array<{ id: string; scheduledValue: unknown }>;
    paymentApplications: Array<{ status: string; lines: Array<{ commitmentLineId: string; currentAmount: unknown; materialsStored: unknown }> }>;
  },
  input: Array<{ commitmentLineId: string; currentAmount: number; materialsStored: number; retentionAmount?: number }>
) {
  const lineById = new Map(commitment.lines.map((line) => [line.id, line]));
  const priorByLine = new Map<string, number>();
  commitment.paymentApplications
    .filter((application) => application.status === "approved" || application.status === "paid")
    .flatMap((application) => application.lines)
    .forEach((line) => priorByLine.set(line.commitmentLineId, (priorByLine.get(line.commitmentLineId) ?? 0) + Number(line.currentAmount) + Number(line.materialsStored)));
  const seen = new Set<string>();
  const lines = [];
  for (const item of input) {
    const line = lineById.get(item.commitmentLineId);
    if (!line) return { error: "Commitment line does not belong to commitment", lines: [] };
    if (seen.has(item.commitmentLineId)) return { error: "Payment application contains duplicate SOV lines", lines: [] };
    seen.add(item.commitmentLineId);
    const previousAmount = rounded(priorByLine.get(item.commitmentLineId) ?? 0);
    const gross = item.currentAmount + item.materialsStored;
    if (previousAmount + gross > Number(line.scheduledValue) + 0.01) return { error: "Application exceeds a SOV line; update the commitment schedule of values first", lines: [] };
    const retentionAmount = item.retentionAmount ?? rounded(gross * Number(commitment.retentionPercent) / 100);
    if (retentionAmount > gross) return { error: "Retention cannot exceed the application line", lines: [] };
    lines.push({ commitmentLineId: item.commitmentLineId, previousAmount, currentAmount: item.currentAmount, materialsStored: item.materialsStored, retentionAmount });
  }
  return { error: "", lines };
}
