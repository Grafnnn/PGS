import { z } from "zod";

export const changeOrderKinds = ["potential", "request", "owner", "subcontract", "directive"] as const;
export const changeOrderScopes = ["in_scope", "budget_only", "out_of_scope", "contingency"] as const;
export const changeOrderStatuses = ["draft", "open", "submitted", "revision_required", "approved", "executed", "rejected", "void"] as const;
export const changeOrderActions = ["open", "submit", "request_revision", "approve", "reject", "execute", "void"] as const;

export type ChangeOrderStatus = (typeof changeOrderStatuses)[number];
export type ChangeOrderAction = (typeof changeOrderActions)[number];

export const changeOrderItemSchema = z.object({
  budgetItemId: z.string().trim().max(160).optional().default(""),
  code: z.string().trim().max(80).optional().default(""),
  description: z.string().trim().min(2).max(500),
  quantity: z.coerce.number().positive().max(1_000_000_000).default(1),
  unit: z.string().trim().min(1).max(40).default("компл."),
  estimatedUnitPrice: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  proposedUnitPrice: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  submittedUnitPrice: z.coerce.number().min(0).max(1_000_000_000_000).default(0)
}).strict();

const editableFields = {
  kind: z.enum(changeOrderKinds).default("potential"),
  scope: z.enum(changeOrderScopes).default("out_of_scope"),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(4000).optional().default(""),
  reason: z.string().trim().max(2000).optional().default(""),
  sourceType: z.string().trim().max(80).optional().default("manual"),
  sourceRef: z.string().trim().max(160).optional().default(""),
  counterparty: z.string().trim().max(180).optional().default(""),
  scheduleImpactDays: z.coerce.number().int().min(0).max(3650).default(0),
  linkedDocumentId: z.string().trim().max(160).optional().default(""),
  dueAt: z.string().datetime().optional().or(z.literal("")).default(""),
  items: z.array(changeOrderItemSchema).max(50).default([])
};

export const changeOrderCreateSchema = z.object(editableFields).strict();
export const changeOrderUpdateSchema = changeOrderCreateSchema.partial().strict();

export const changeOrderActionSchema = z.object({
  action: z.enum(changeOrderActions),
  comment: z.string().trim().max(3000).optional().default(""),
  workflowTemplateId: z.string().trim().max(160).optional().default("")
}).strict();

export type ChangeOrderItemInput = z.infer<typeof changeOrderItemSchema>;

export function changeOrderAmounts(items: Array<{
  quantity: number | string | { toString(): string };
  estimatedUnitPrice: number | string | { toString(): string };
  proposedUnitPrice: number | string | { toString(): string };
  submittedUnitPrice: number | string | { toString(): string };
  approvedUnitPrice?: number | string | { toString(): string };
  committedUnitPrice?: number | string | { toString(): string };
}>) {
  const sum = (key: "estimatedUnitPrice" | "proposedUnitPrice" | "submittedUnitPrice" | "approvedUnitPrice" | "committedUnitPrice") => Math.round(items.reduce((total, item) => total + Number(item.quantity) * Number(item[key] ?? 0), 0) * 100) / 100;
  return { estimated: sum("estimatedUnitPrice"), proposed: sum("proposedUnitPrice"), submitted: sum("submittedUnitPrice"), approved: sum("approvedUnitPrice"), committed: sum("committedUnitPrice") };
}

export function resolveChangeOrderTransition(status: string, action: ChangeOrderAction) {
  const allowed: Record<ChangeOrderAction, string[]> = {
    open: ["draft", "revision_required"],
    submit: ["open"],
    request_revision: ["submitted"],
    approve: ["submitted"],
    reject: ["submitted"],
    execute: ["approved"],
    void: ["draft", "open", "revision_required", "submitted", "approved", "rejected"]
  };
  if (!allowed[action].includes(status)) throw new Error(`Action ${action} is not allowed from ${status}`);
  return ({ open: "open", submit: "submitted", request_revision: "revision_required", approve: "approved", reject: "rejected", execute: "executed", void: "void" } as const)[action];
}

type ChangeOrderRecord = {
  id: string; projectId: string; commitmentId?: string | null; sequence: number; number: string; kind: string; scope: string; title: string;
  description: string | null; reason: string | null; sourceType: string | null; sourceRef: string | null; counterparty: string | null;
  status: string; currency: string; scheduleImpactDays: number; estimatedAmount: unknown; proposedAmount: unknown; submittedAmount: unknown; approvedAmount: unknown; committedAmount: unknown;
  linkedDocumentId: string | null; linkedDocumentVersion: number | null; linkedDocumentVersionId: string | null; approvalWorkflowRunId: string | null; decisionComment: string | null;
  dueAt: Date | null; submittedAt: Date | null; approvedAt: Date | null; executedAt: Date | null; rejectedAt: Date | null; voidedAt: Date | null; createdAt: Date; updatedAt: Date;
  linkedDocument?: { title: string; fileName: string | null } | null;
  approvalWorkflowRun?: { id: string; title: string; status: string } | null;
  items: Array<{ id: string; budgetItemId: string | null; costCodeId: string | null; sequence: number; code: string | null; description: string; quantity: unknown; unit: string; estimatedUnitPrice: unknown; proposedUnitPrice: unknown; submittedUnitPrice: unknown; approvedUnitPrice: unknown; committedUnitPrice: unknown }>;
};

export function serializeChangeOrder(item: ChangeOrderRecord) {
  return {
    ...item,
    estimatedAmount: Number(item.estimatedAmount), proposedAmount: Number(item.proposedAmount), submittedAmount: Number(item.submittedAmount), approvedAmount: Number(item.approvedAmount), committedAmount: Number(item.committedAmount),
    dueAt: item.dueAt?.toISOString() ?? null, submittedAt: item.submittedAt?.toISOString() ?? null, approvedAt: item.approvedAt?.toISOString() ?? null, executedAt: item.executedAt?.toISOString() ?? null, rejectedAt: item.rejectedAt?.toISOString() ?? null, voidedAt: item.voidedAt?.toISOString() ?? null,
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString(),
    items: item.items.map((line) => ({ ...line, quantity: Number(line.quantity), estimatedUnitPrice: Number(line.estimatedUnitPrice), proposedUnitPrice: Number(line.proposedUnitPrice), submittedUnitPrice: Number(line.submittedUnitPrice), approvedUnitPrice: Number(line.approvedUnitPrice), committedUnitPrice: Number(line.committedUnitPrice) }))
  };
}

export function changeOrderSummary(items: Array<{ status: string; submittedAmount: unknown; approvedAmount: unknown; committedAmount: unknown; dueAt: Date | null }>, now = new Date()) {
  const activeStatuses = new Set(["draft", "open", "submitted", "revision_required", "approved"]);
  return {
    total: items.length,
    active: items.filter((item) => activeStatuses.has(item.status)).length,
    submitted: items.filter((item) => item.status === "submitted").reduce((sum, item) => sum + Number(item.submittedAmount), 0),
    approved: items.filter((item) => item.status === "approved" || item.status === "executed").reduce((sum, item) => sum + Number(item.approvedAmount), 0),
    committed: items.filter((item) => item.status === "executed").reduce((sum, item) => sum + Number(item.committedAmount), 0),
    overdue: items.filter((item) => activeStatuses.has(item.status) && item.dueAt && item.dueAt < now).length
  };
}
