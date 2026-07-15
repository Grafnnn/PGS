import { z } from "zod";

export const fieldClientMutationIdSchema = z.string().trim().min(8).max(120).regex(/^[A-Za-z0-9_-]+$/);

const dailyReportPayloadSchema = z.object({
  date: z.coerce.date(),
  author: z.string().trim().min(2).max(160),
  weather: z.string().trim().max(160).default("Не указано"),
  workers: z.coerce.number().int().nonnegative().max(100000).default(0),
  engineers: z.coerce.number().int().nonnegative().max(10000).default(0),
  equipment: z.string().trim().max(2000).default(""),
  completedWorks: z.string().trim().max(12000).default(""),
  materialsReceived: z.string().trim().max(6000).default(""),
  materialsConsumed: z.string().trim().max(6000).default(""),
  downtime: z.string().trim().max(6000).default(""),
  issues: z.string().trim().max(6000).default("")
}).strict();

const fieldIssuePayloadSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(2000).default(""),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignee: z.string().trim().max(160).default(""),
  dueAt: z.string().datetime().nullable().default(null)
}).strict();

export const fieldSyncRequestSchema = z.discriminatedUnion("kind", [
  z.object({
    clientMutationId: fieldClientMutationIdSchema,
    kind: z.literal("daily_report"),
    capturedAt: z.string().datetime(),
    payload: dailyReportPayloadSchema
  }).strict(),
  z.object({
    clientMutationId: fieldClientMutationIdSchema,
    kind: z.literal("field_issue"),
    capturedAt: z.string().datetime(),
    payload: fieldIssuePayloadSchema
  }).strict()
]);

export type FieldSyncRequest = z.infer<typeof fieldSyncRequestSchema>;

export function fieldSyncKindLabel(kind: "daily_report" | "field_issue" | "photo_evidence") {
  if (kind === "daily_report") return "Рапорт";
  if (kind === "field_issue") return "Замечание";
  return "Фото / документ";
}
