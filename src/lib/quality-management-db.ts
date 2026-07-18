import { prisma } from "@/lib/prisma";

export const qualityInspectionInclude = {
  checks: { orderBy: { sequence: "asc" as const } },
  issues: {
    select: { id: true, number: true, title: true, status: true, severity: true, acceptanceBlocker: true },
    orderBy: { sequence: "asc" as const }
  },
  linkedScheduleItem: { select: { id: true, name: true, status: true } },
  costCode: { select: { id: true, code: true, name: true } },
  linkedDocument: { select: { id: true, title: true, fileName: true } }
};

export const qualityIssueInclude = {
  inspection: { select: { id: true, number: true, title: true, status: true } },
  inspectionCheck: { select: { id: true, sequence: true, title: true, result: true } },
  linkedScheduleItem: { select: { id: true, name: true, status: true } },
  costCode: { select: { id: true, code: true, name: true } },
  sourceDailyReport: { select: { id: true, date: true, author: true } },
  linkedDocument: { select: { id: true, title: true, fileName: true } },
  verificationWorkflowRun: { select: { id: true, title: true, status: true } },
  evidence: { orderBy: { createdAt: "asc" as const } },
  events: { orderBy: { createdAt: "desc" as const } }
};

export async function resolveQualityReferences(projectId: string, input: {
  linkedScheduleItemId?: string;
  costCodeId?: string;
  sourceDailyReportId?: string;
  linkedDocumentId?: string;
}) {
  const [scheduleItem, costCode, dailyReport, document] = await Promise.all([
    input.linkedScheduleItemId
      ? prisma.scheduleItem.findFirst({ where: { id: input.linkedScheduleItemId, projectId }, select: { id: true, costCodeId: true } })
      : null,
    input.costCodeId
      ? prisma.projectCostCode.findFirst({ where: { id: input.costCodeId, projectId, status: "active" }, select: { id: true } })
      : null,
    input.sourceDailyReportId
      ? prisma.dailyReport.findFirst({ where: { id: input.sourceDailyReportId, projectId }, select: { id: true } })
      : null,
    input.linkedDocumentId
      ? prisma.document.findFirst({
          where: { id: input.linkedDocumentId, projectId },
          include: { versions: { orderBy: { versionNumber: "desc" as const }, take: 1 } }
        })
      : null
  ]);

  if (input.linkedScheduleItemId && !scheduleItem) return { error: "Schedule item does not belong to project" };
  if (input.costCodeId && !costCode) return { error: "Active cost code does not belong to project" };
  if (input.sourceDailyReportId && !dailyReport) return { error: "Daily report does not belong to project" };
  if (input.linkedDocumentId && !document) return { error: "Document does not belong to project" };
  return { error: "", scheduleItem, costCode, dailyReport, document };
}
