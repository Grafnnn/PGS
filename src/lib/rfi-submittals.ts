import { z } from "zod";

export const workflowPriorities = ["low", "medium", "high", "critical"] as const;
export const rfiStatuses = ["draft", "open", "answered", "closed"] as const;
export const submittalStatuses = ["draft", "submitted", "approved", "rejected", "revise_required", "closed"] as const;
export const submittalDecisions = ["approved", "rejected", "revise_required"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalDate = z.string().datetime().optional().nullable();

export const rfiCreateSchema = z.object({
  subject: z.string().trim().min(3).max(180),
  question: z.string().trim().min(5).max(5000),
  discipline: optionalText(120),
  location: optionalText(240),
  priority: z.enum(workflowPriorities).default("medium"),
  assignee: optionalText(160),
  dueAt: optionalDate,
  linkedDocumentId: optionalText(120)
});

export const rfiUpdateSchema = rfiCreateSchema.partial().extend({
  action: z.enum(["send", "answer", "close", "reopen"]).optional(),
  response: optionalText(5000)
});

export const submittalCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  category: z.string().trim().min(2).max(120),
  specSection: optionalText(120),
  reviewer: optionalText(160),
  dueAt: optionalDate,
  linkedDocumentId: optionalText(120)
});

export const submittalUpdateSchema = submittalCreateSchema.partial().extend({
  action: z.enum(["submit", "review", "resubmit", "close"]).optional(),
  decision: z.enum(submittalDecisions).optional(),
  comment: optionalText(3000)
});

export class WorkflowConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "WorkflowConflictError";
  }
}

export function resolveRfiTransition(status: string, action?: string, response?: string | null) {
  if (!action) {
    if (status !== "draft") throw new WorkflowConflictError("Only draft RFIs can be edited");
    return status;
  }
  if (action === "send" && status === "draft") return "open";
  if (action === "answer" && status === "open") {
    if (!response?.trim()) throw new WorkflowConflictError("RFI answer is required");
    return "answered";
  }
  if (action === "close" && status === "answered") return "closed";
  if (action === "reopen" && (status === "answered" || status === "closed")) return "open";
  throw new WorkflowConflictError(`RFI transition ${status} -> ${action} is not allowed`);
}

export function resolveSubmittalTransition(status: string, action?: string, decision?: string) {
  if (!action) {
    if (status !== "draft") throw new WorkflowConflictError("Only draft submittals can be edited");
    return status;
  }
  if (action === "submit" && status === "draft") return "submitted";
  if (action === "review" && status === "submitted") {
    if (!decision || !submittalDecisions.includes(decision as (typeof submittalDecisions)[number])) {
      throw new WorkflowConflictError("Submittal review decision is required");
    }
    return decision;
  }
  if (action === "resubmit" && status === "revise_required") return "submitted";
  if (action === "close" && (status === "approved" || status === "rejected")) return "closed";
  throw new WorkflowConflictError(`Submittal transition ${status} -> ${action} is not allowed`);
}

type RfiRecord = {
  id: string; projectId: string; sequence: number; subject: string; question: string; discipline: string | null; location: string | null;
  priority: string; status: string; assignee: string | null; dueAt: Date | null; sentAt: Date | null; answeredAt: Date | null;
  closedAt: Date | null; linkedDocumentId: string | null; linkedDocumentVersion: number | null; linkedDocumentVersionId: string | null; createdAt: Date; updatedAt: Date;
  responses?: Array<{ id: string; body: string; createdByName: string | null; createdAt: Date }>;
};

type SubmittalRecord = {
  id: string; projectId: string; sequence: number; title: string; category: string; specSection: string | null; revision: number;
  status: string; reviewer: string | null; dueAt: Date | null; submittedAt: Date | null; reviewedAt: Date | null; closedAt: Date | null;
  linkedDocumentId: string | null; linkedDocumentVersion: number | null; linkedDocumentVersionId: string | null; createdAt: Date; updatedAt: Date;
  reviews?: Array<{ id: string; revision: number; decision: string; comment: string | null; createdByName: string | null; createdAt: Date }>;
};

export function serializeRfi(item: RfiRecord) {
  return {
    id: item.id, projectId: item.projectId, number: `RFI-${String(item.sequence).padStart(3, "0")}`, sequence: item.sequence,
    subject: item.subject, question: item.question, discipline: item.discipline, location: item.location, priority: item.priority, status: item.status,
    assignee: item.assignee, dueAt: item.dueAt?.toISOString() ?? null, sentAt: item.sentAt?.toISOString() ?? null,
    answeredAt: item.answeredAt?.toISOString() ?? null, closedAt: item.closedAt?.toISOString() ?? null, linkedDocumentId: item.linkedDocumentId, linkedDocumentVersion: item.linkedDocumentVersion, linkedDocumentVersionId: item.linkedDocumentVersionId,
    responses: (item.responses ?? []).map((response) => ({ ...response, createdAt: response.createdAt.toISOString() })),
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString()
  };
}

export function serializeSubmittal(item: SubmittalRecord) {
  return {
    id: item.id, projectId: item.projectId, number: `SUB-${String(item.sequence).padStart(3, "0")}`, sequence: item.sequence,
    title: item.title, category: item.category, specSection: item.specSection, revision: item.revision, status: item.status,
    reviewer: item.reviewer, dueAt: item.dueAt?.toISOString() ?? null, submittedAt: item.submittedAt?.toISOString() ?? null,
    reviewedAt: item.reviewedAt?.toISOString() ?? null, closedAt: item.closedAt?.toISOString() ?? null, linkedDocumentId: item.linkedDocumentId, linkedDocumentVersion: item.linkedDocumentVersion, linkedDocumentVersionId: item.linkedDocumentVersionId,
    reviews: (item.reviews ?? []).map((review) => ({ ...review, createdAt: review.createdAt.toISOString() })),
    createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString()
  };
}

export function workflowSummary(rfis: Array<Pick<RfiRecord, "status" | "dueAt">>, submittals: Array<Pick<SubmittalRecord, "status" | "dueAt">>, now = new Date()) {
  const activeRfis = rfis.filter((item) => item.status === "open");
  const activeSubmittals = submittals.filter((item) => item.status === "submitted" || item.status === "revise_required");
  return {
    rfiTotal: rfis.length,
    rfiOpen: activeRfis.length,
    rfiOverdue: activeRfis.filter((item) => item.dueAt && item.dueAt < now).length,
    submittalTotal: submittals.length,
    submittalPending: activeSubmittals.length,
    submittalOverdue: activeSubmittals.filter((item) => item.dueAt && item.dueAt < now).length,
    revisionsRequired: submittals.filter((item) => item.status === "revise_required").length
  };
}
