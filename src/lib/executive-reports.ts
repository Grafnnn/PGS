import { z } from "zod";
import type { ExecutiveWeeklyReport } from "@/lib/risk-executive-intelligence";

export const executiveReportStatuses = ["draft", "published", "archived"] as const;

export const executiveReportCreateSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  reportDate: z.string().date().optional()
});

export const executiveReportUpdateSchema = z.object({
  title: z.string().trim().min(3).max(180).optional(),
  status: z.enum(executiveReportStatuses).optional(),
  publishConfirmed: z.boolean().optional()
}).refine((value) => value.title !== undefined || value.status !== undefined, {
  message: "Report title or status is required"
});

export function canTransitionExecutiveReport(from: string, to: string) {
  if (from === to) return true;
  if (from === "draft") return to === "published";
  if (from === "published") return to === "archived";
  return false;
}

export type ExecutiveReportContent = ExecutiveWeeklyReport;

type ExecutiveReportRecord = {
  id: string;
  projectId: string;
  version: number;
  title: string;
  reportDate: Date;
  status: string;
  content: unknown;
  sourceSnapshot: unknown;
  createdBy: string | null;
  publishedAt: Date | null;
  publishedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeExecutiveReport(item: ExecutiveReportRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    version: item.version,
    title: item.title,
    reportDate: item.reportDate.toISOString().slice(0, 10),
    status: item.status as (typeof executiveReportStatuses)[number],
    content: item.content as ExecutiveReportContent,
    sourceSnapshot: item.sourceSnapshot,
    createdBy: item.createdBy,
    publishedAt: item.publishedAt?.toISOString() ?? null,
    publishedBy: item.publishedBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

export type SerializedExecutiveReport = ReturnType<typeof serializeExecutiveReport>;

export function executiveReportSourceSnapshot(input: {
  budgetItems: unknown[];
  scheduleItems: unknown[];
  materials: unknown[];
  procurementRequests: unknown[];
  payments: unknown[];
  dailyReports: unknown[];
  risks: unknown[];
  documents?: unknown[];
  readinessScore?: number | null;
}) {
  return {
    budgetItems: input.budgetItems.length,
    scheduleItems: input.scheduleItems.length,
    materials: input.materials.length,
    procurementRequests: input.procurementRequests.length,
    payments: input.payments.length,
    dailyReports: input.dailyReports.length,
    risks: input.risks.length,
    documents: input.documents?.length ?? 0,
    readinessScore: input.readinessScore ?? null,
    capturedAt: new Date().toISOString()
  };
}
