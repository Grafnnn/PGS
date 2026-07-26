import { z } from "zod";

export const externalCollaborationEntityTypes = ["rfi", "submittal"] as const;
export const externalCollaborationStatuses = ["active", "responded", "revoked"] as const;

export type ExternalCollaborationEntityType = (typeof externalCollaborationEntityTypes)[number];
export type ExternalCollaborationStatus = (typeof externalCollaborationStatuses)[number];

export const externalCollaborationCreateSchema = z.object({
  entityType: z.enum(externalCollaborationEntityTypes),
  entityId: z.string().trim().min(1).max(160),
  recipientName: z.string().trim().max(160).optional().default(""),
  recipientEmail: z.string().trim().email().max(320),
  expiresInHours: z.coerce.number().int().min(1).max(24 * 30).default(72),
  responseLimit: z.literal(1).default(1)
}).strict();

export const externalCollaborationResponseSchema = z.union([
  z.object({
    response: z.string().trim().min(2).max(5000)
  }).strict(),
  z.object({
    decision: z.enum(["approved", "rejected", "revise_required"]),
    comment: z.string().trim().max(3000).optional().default("")
  }).strict()
]);

type ExternalCollaborationLinkRecord = {
  id: string;
  projectId: string;
  entityType: string;
  entityId: string;
  recipientName: string | null;
  recipientEmail: string;
  status: string;
  expiresAt: Date;
  responseLimit: number;
  responseCount: number;
  lastRespondedAt: Date | null;
  revokedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export function externalCollaborationLinkState(
  link: Pick<ExternalCollaborationLinkRecord, "status" | "expiresAt" | "responseLimit" | "responseCount">,
  now = new Date()
): ExternalCollaborationStatus | "expired" {
  if (link.status === "revoked") return "revoked";
  if (link.expiresAt <= now) return "expired";
  if (link.status === "responded" || link.responseCount >= link.responseLimit) return "responded";
  return "active";
}

export function externalCollaborationLinkIsUsable(
  link: Pick<ExternalCollaborationLinkRecord, "status" | "expiresAt" | "responseLimit" | "responseCount">,
  now = new Date()
) {
  return externalCollaborationLinkState(link, now) === "active";
}

export function serializeExternalCollaborationLink(link: ExternalCollaborationLinkRecord, now = new Date()) {
  return {
    id: link.id,
    projectId: link.projectId,
    entityType: link.entityType as ExternalCollaborationEntityType,
    entityId: link.entityId,
    recipientName: link.recipientName,
    recipientEmail: link.recipientEmail,
    status: externalCollaborationLinkState(link, now),
    expiresAt: link.expiresAt.toISOString(),
    responseLimit: link.responseLimit,
    responseCount: link.responseCount,
    lastRespondedAt: link.lastRespondedAt?.toISOString() ?? null,
    revokedAt: link.revokedAt?.toISOString() ?? null,
    createdAt: link.createdAt.toISOString(),
    updatedAt: link.updatedAt.toISOString()
  };
}

export function externalCollaborationActor(link: Pick<ExternalCollaborationLinkRecord, "recipientName" | "recipientEmail">) {
  return {
    name: link.recipientName?.trim() || "Внешний участник",
    email: link.recipientEmail
  };
}
