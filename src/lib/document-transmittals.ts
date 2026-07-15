import { z } from "zod";

export const transmittalStatuses = ["draft", "issued", "acknowledged", "approved", "revise_required", "closed"] as const;
export const transmittalDecisions = ["approved", "revise_required"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();
const optionalDate = z.string().datetime().optional().nullable();

export const transmittalCreateSchema = z.object({
  subject: z.string().trim().min(3).max(180),
  purpose: optionalText(1200),
  recipient: optionalText(240),
  ccRecipients: optionalText(600),
  reviewer: optionalText(240),
  dueAt: optionalDate,
  documentIds: z.array(z.string().trim().min(1).max(120)).max(50).default([])
});

export const transmittalUpdateSchema = transmittalCreateSchema.partial().extend({
  action: z.enum(["issue", "acknowledge", "review", "reissue", "close"]).optional(),
  decision: z.enum(transmittalDecisions).optional(),
  comment: optionalText(3000)
});

export class TransmittalConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TransmittalConflictError";
  }
}

export function resolveTransmittalTransition(status: string, action?: string, decision?: string) {
  if (!action) {
    if (status !== "draft" && status !== "revise_required") throw new TransmittalConflictError("Only draft or revision packages can be edited");
    return status;
  }
  if (action === "issue" && status === "draft") return "issued";
  if (action === "acknowledge" && status === "issued") return "acknowledged";
  if (action === "review" && (status === "issued" || status === "acknowledged")) {
    if (!decision || !transmittalDecisions.includes(decision as (typeof transmittalDecisions)[number])) {
      throw new TransmittalConflictError("Transmittal review decision is required");
    }
    return decision;
  }
  if (action === "reissue" && status === "revise_required") return "issued";
  if (action === "close" && status === "approved") return "closed";
  throw new TransmittalConflictError(`Transmittal transition ${status} -> ${action} is not allowed`);
}

type TransmittalRecord = {
  id: string;
  projectId: string;
  sequence: number;
  subject: string;
  purpose: string | null;
  recipient: string | null;
  ccRecipients: string | null;
  reviewer: string | null;
  dueAt: Date | null;
  status: string;
  revision: number;
  issuedAt: Date | null;
  acknowledgedAt: Date | null;
  reviewedAt: Date | null;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items?: Array<{
    id: string;
    documentId: string | null;
    documentVersionId: string | null;
    documentVersion: number | null;
    titleSnapshot: string;
    fileNameSnapshot: string | null;
    categorySnapshot: string | null;
  }>;
  events?: Array<{
    id: string;
    revision: number;
    eventType: string;
    decision: string | null;
    comment: string | null;
    createdByName: string | null;
    createdAt: Date;
  }>;
};

export function serializeTransmittal(item: TransmittalRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    number: `TR-${String(item.sequence).padStart(3, "0")}`,
    sequence: item.sequence,
    subject: item.subject,
    purpose: item.purpose,
    recipient: item.recipient,
    ccRecipients: item.ccRecipients,
    reviewer: item.reviewer,
    dueAt: item.dueAt?.toISOString() ?? null,
    status: item.status,
    revision: item.revision,
    issuedAt: item.issuedAt?.toISOString() ?? null,
    acknowledgedAt: item.acknowledgedAt?.toISOString() ?? null,
    reviewedAt: item.reviewedAt?.toISOString() ?? null,
    closedAt: item.closedAt?.toISOString() ?? null,
    items: (item.items ?? []).map((entry) => ({
      id: entry.id,
      documentId: entry.documentId,
      documentVersionId: entry.documentVersionId,
      documentVersion: entry.documentVersion,
      titleSnapshot: entry.titleSnapshot,
      fileNameSnapshot: entry.fileNameSnapshot,
      categorySnapshot: entry.categorySnapshot
    })),
    events: (item.events ?? []).map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

export function transmittalSummary(items: Array<Pick<TransmittalRecord, "status" | "dueAt">>, now = new Date()) {
  const active = items.filter((item) => item.status === "issued" || item.status === "acknowledged" || item.status === "revise_required");
  return {
    total: items.length,
    active: active.length,
    overdue: active.filter((item) => item.dueAt && item.dueAt < now).length,
    approved: items.filter((item) => item.status === "approved" || item.status === "closed").length,
    revisionsRequired: items.filter((item) => item.status === "revise_required").length
  };
}

export function buildTransmittalManifest(item: ReturnType<typeof serializeTransmittal>) {
  const lines = [
    `${item.number} · Rev ${item.revision}`,
    item.subject,
    `Статус: ${item.status}`,
    `Получатель: ${item.recipient || "не указан"}`,
    `Копия: ${item.ccRecipients || "-"}`,
    `Проверяющий: ${item.reviewer || "не указан"}`,
    `Срок решения: ${item.dueAt ? item.dueAt.slice(0, 10) : "не указан"}`,
    `Назначение: ${item.purpose || "-"}`,
    "",
    "Состав пакета:"
  ];
  item.items.forEach((entry, index) => lines.push(`${index + 1}. ${entry.titleSnapshot} · v${entry.documentVersion ?? "draft"}${entry.fileNameSnapshot ? ` · ${entry.fileNameSnapshot}` : ""}`));
  lines.push("", "История:");
  item.events.forEach((entry) => lines.push(`${entry.createdAt.slice(0, 10)} · Rev ${entry.revision} · ${entry.eventType}${entry.decision ? ` · ${entry.decision}` : ""}${entry.comment ? ` · ${entry.comment}` : ""}`));
  return lines.join("\n");
}
