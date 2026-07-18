import { z } from "zod";

export const qualityInspectionTypes = ["incoming", "work", "hold_point", "final"] as const;
export const qualityInspectionStatuses = ["planned", "in_progress", "passed", "failed", "closed", "void"] as const;
export const qualityInspectionActions = ["start", "complete", "close", "void"] as const;
export const qualityCheckResults = ["pending", "pass", "fail", "na"] as const;
export const qualityIssueTypes = ["observation", "punch", "ncr", "defect"] as const;
export const qualityIssueSeverities = ["low", "medium", "high", "critical"] as const;
export const qualityIssueStatuses = ["open", "in_progress", "ready_for_verification", "verified", "closed", "void"] as const;
export const qualityIssueActions = ["start", "submit_verification", "verify", "close", "reopen", "void"] as const;
export const qualityEvidencePhases = ["opening", "corrective", "closure"] as const;

export type QualityInspectionAction = (typeof qualityInspectionActions)[number];
export type QualityIssueAction = (typeof qualityIssueActions)[number];

export const qualityInspectionCheckSchema = z.object({
  title: z.string().trim().min(2).max(240),
  requirement: z.string().trim().max(2000).optional().default("")
}).strict();

const inspectionEditableFields = {
  type: z.enum(qualityInspectionTypes).default("work"),
  title: z.string().trim().min(3).max(180),
  location: z.string().trim().max(240).optional().default(""),
  inspector: z.string().trim().max(180).optional().default(""),
  responsibleParty: z.string().trim().max(180).optional().default(""),
  scheduledAt: z.string().datetime().optional().or(z.literal("")).default(""),
  linkedScheduleItemId: z.string().trim().max(160).optional().default(""),
  costCodeId: z.string().trim().max(160).optional().default(""),
  linkedDocumentId: z.string().trim().max(160).optional().default(""),
  checks: z.array(qualityInspectionCheckSchema).min(1).max(50)
};

export const qualityInspectionCreateSchema = z.object(inspectionEditableFields).strict();
export const qualityInspectionUpdateSchema = z.object(inspectionEditableFields).partial().strict();
export const qualityInspectionActionSchema = z.object({
  action: z.enum(qualityInspectionActions),
  comment: z.string().trim().max(3000).optional().default(""),
  checks: z.array(z.object({
    id: z.string().trim().min(1).max(160),
    result: z.enum(qualityCheckResults),
    comment: z.string().trim().max(2000).optional().default("")
  }).strict()).max(50).optional().default([])
}).strict();

const issueEditableFields = {
  type: z.enum(qualityIssueTypes).default("punch"),
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().min(3).max(5000),
  location: z.string().trim().max(240).optional().default(""),
  severity: z.enum(qualityIssueSeverities).default("medium"),
  responsibleParty: z.string().trim().max(180).optional().default(""),
  dueAt: z.string().datetime().optional().or(z.literal("")).default(""),
  rootCause: z.string().trim().max(3000).optional().default(""),
  correctiveAction: z.string().trim().max(5000).optional().default(""),
  acceptanceBlocker: z.coerce.boolean().default(false),
  costImpact: z.coerce.number().min(0).max(1_000_000_000_000).default(0),
  scheduleImpactDays: z.coerce.number().int().min(0).max(3650).default(0),
  linkedScheduleItemId: z.string().trim().max(160).optional().default(""),
  costCodeId: z.string().trim().max(160).optional().default(""),
  sourceDailyReportId: z.string().trim().max(160).optional().default(""),
  linkedDocumentId: z.string().trim().max(160).optional().default("")
};

export const qualityIssueCreateSchema = z.object(issueEditableFields).strict();
export const qualityIssueUpdateSchema = z.object(issueEditableFields).partial().strict();
export const qualityIssueActionSchema = z.object({
  action: z.enum(qualityIssueActions),
  comment: z.string().trim().max(3000).optional().default(""),
  rootCause: z.string().trim().max(3000).optional().default(""),
  correctiveAction: z.string().trim().max(5000).optional().default(""),
  workflowTemplateId: z.string().trim().max(160).optional().default("")
}).strict();

export const qualityEvidenceCreateSchema = z.object({
  documentId: z.string().trim().min(1).max(160),
  phase: z.enum(qualityEvidencePhases).default("opening"),
  note: z.string().trim().max(2000).optional().default("")
}).strict();

export function qualityIssuePrefix(type: string) {
  return type === "ncr" ? "NCR" : type === "punch" ? "PCH" : type === "defect" ? "DEF" : "OBS";
}

export function resolveInspectionTransition(status: string, action: QualityInspectionAction, failedChecks = 0) {
  const allowed: Record<QualityInspectionAction, string[]> = {
    start: ["planned"],
    complete: ["in_progress"],
    close: ["passed", "failed"],
    void: ["planned", "in_progress", "passed", "failed"]
  };
  if (!allowed[action].includes(status)) throw new Error(`Action ${action} is not allowed from ${status}`);
  if (action === "complete") return failedChecks ? "failed" : "passed";
  return ({ start: "in_progress", close: "closed", void: "void" } as const)[action];
}

export function resolveQualityIssueTransition(status: string, action: QualityIssueAction) {
  const allowed: Record<QualityIssueAction, string[]> = {
    start: ["open"],
    submit_verification: ["open", "in_progress"],
    verify: ["ready_for_verification"],
    close: ["verified"],
    reopen: ["verified", "closed"],
    void: ["open", "in_progress", "ready_for_verification", "verified"]
  };
  if (!allowed[action].includes(status)) throw new Error(`Action ${action} is not allowed from ${status}`);
  return ({
    start: "in_progress",
    submit_verification: "ready_for_verification",
    verify: "verified",
    close: "closed",
    reopen: "in_progress",
    void: "void"
  } as const)[action];
}

type Numeric = number | string | { toString(): string };

function amount(value: Numeric | null | undefined) {
  const parsed = Number(value ?? 0);
  return Number.isFinite(parsed) ? parsed : 0;
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

export function qualityManagementSummary(
  inspections: Array<{ status: string; scheduledAt: Date | null }>,
  issues: Array<{ status: string; severity: string; acceptanceBlocker: boolean; dueAt: Date | null; costImpact: Numeric; scheduleImpactDays: number }>,
  now = new Date()
) {
  const activeIssue = (item: { status: string }) => !["closed", "void"].includes(item.status);
  return {
    inspections: inspections.length,
    inspectionsDue: inspections.filter((item) => ["planned", "in_progress"].includes(item.status) && item.scheduledAt && item.scheduledAt < now).length,
    failedInspections: inspections.filter((item) => item.status === "failed").length,
    openIssues: issues.filter(activeIssue).length,
    criticalIssues: issues.filter((item) => activeIssue(item) && item.severity === "critical").length,
    overdueIssues: issues.filter((item) => activeIssue(item) && item.dueAt && item.dueAt < now).length,
    acceptanceBlockers: issues.filter((item) => activeIssue(item) && item.acceptanceBlocker).length,
    costExposure: issues.filter(activeIssue).reduce((total, item) => total + amount(item.costImpact), 0),
    scheduleExposureDays: issues.filter(activeIssue).reduce((total, item) => total + item.scheduleImpactDays, 0)
  };
}

export function serializeQualityInspection(item: any) {
  return {
    ...item,
    scheduledAt: iso(item.scheduledAt),
    startedAt: iso(item.startedAt),
    completedAt: iso(item.completedAt),
    closedAt: iso(item.closedAt),
    voidedAt: iso(item.voidedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    issues: (item.issues ?? []).map((issue: any) => ({
      id: issue.id,
      number: issue.number,
      title: issue.title,
      status: issue.status,
      severity: issue.severity,
      acceptanceBlocker: issue.acceptanceBlocker
    }))
  };
}

export function serializeQualityIssue(item: any) {
  return {
    ...item,
    costImpact: amount(item.costImpact),
    dueAt: iso(item.dueAt),
    openedAt: item.openedAt.toISOString(),
    startedAt: iso(item.startedAt),
    submittedAt: iso(item.submittedAt),
    verifiedAt: iso(item.verifiedAt),
    closedAt: iso(item.closedAt),
    voidedAt: iso(item.voidedAt),
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString(),
    evidence: (item.evidence ?? []).map((evidence: any) => ({
      ...evidence,
      createdAt: evidence.createdAt.toISOString()
    })),
    events: (item.events ?? []).map((event: any) => ({
      ...event,
      createdAt: event.createdAt.toISOString()
    }))
  };
}
