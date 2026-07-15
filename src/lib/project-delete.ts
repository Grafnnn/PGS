import type { Prisma, PrismaClient } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import type { AppUser } from "@/lib/auth/permissions";
import { prisma } from "@/lib/prisma";

type TxClient = Prisma.TransactionClient | PrismaClient;

export const projectDeleteRequestSchema = z
  .object({
    confirm: z.literal(true),
    projectName: z.string().trim().min(1).optional(),
    projectSlugOrName: z.string().trim().min(1).optional()
  })
  .refine((value) => Boolean(value.projectName ?? value.projectSlugOrName), {
    message: "Exact project name confirmation is required.",
    path: ["projectName"]
  });

export class ProjectDeleteError extends Error {
  constructor(
    public readonly status: number,
    message: string
  ) {
    super(message);
    this.name = "ProjectDeleteError";
  }
}

export type ProjectDeleteCounts = {
  projectMembers: number;
  userInvitesDetached: number;
  budgetSections: number;
  budgetItems: number;
  scheduleItems: number;
  workProgressEntries: number;
  materials: number;
  materialNeeds: number;
  procurementRequests: number;
  procurementRequestItems: number;
  supplierQuotes: number;
  payments: number;
  cashflowPeriods: number;
  documents: number;
  documentVersions: number;
  dailyReports: number;
  risks: number;
  aiMessages: number;
  importBatches: number;
  accountingSyncRuns: number;
  accountingExternalLinks: number;
  auditLogs: number;
};

export type ProjectDeleteResult = {
  ok: true;
  deletedProjectId: string;
  deletedProjectName: string;
  deletedCounts: ProjectDeleteCounts;
};

function auditActor(user: AppUser) {
  return {
    actorId: user.authenticated ? user.id : null,
    actorName: user.name,
    actorEmail: user.email
  };
}

async function countProjectOwnedData(client: TxClient, projectId: string): Promise<ProjectDeleteCounts> {
  const [
    projectMembers,
    userInvitesDetached,
    budgetSections,
    budgetItems,
    scheduleItems,
    workProgressEntries,
    materials,
    materialNeeds,
    procurementRequests,
    procurementRequestItems,
    supplierQuotes,
    payments,
    cashflowPeriods,
    documents,
    documentVersions,
    dailyReports,
    risks,
    aiMessages,
    importBatches,
    accountingSyncRuns,
    accountingExternalLinks,
    auditLogs
  ] = await Promise.all([
    client.projectMember.count({ where: { projectId } }),
    client.userInvite.count({ where: { projectId } }),
    client.budgetSection.count({ where: { projectId } }),
    client.budgetItem.count({ where: { projectId } }),
    client.scheduleItem.count({ where: { projectId } }),
    client.workProgressEntry.count({ where: { projectId } }),
    client.material.count({ where: { projectId } }),
    client.materialNeed.count({ where: { projectId } }),
    client.procurementRequest.count({ where: { projectId } }),
    client.procurementRequestItem.count({ where: { request: { projectId } } }),
    client.supplierQuote.count({ where: { projectId } }),
    client.payment.count({ where: { projectId } }),
    client.cashflowPeriod.count({ where: { projectId } }),
    client.document.count({ where: { projectId } }),
    client.documentVersion.count({ where: { document: { projectId } } }),
    client.dailyReport.count({ where: { projectId } }),
    client.risk.count({ where: { projectId } }),
    client.aiMessage.count({ where: { projectId } }),
    client.importBatch.count({ where: { projectId } }),
    client.accountingSyncRun.count({ where: { projectId } }),
    client.accountingExternalLink.count({ where: { projectId } }),
    client.auditLog.count({ where: { projectId } })
  ]);

  return {
    projectMembers,
    userInvitesDetached,
    budgetSections,
    budgetItems,
    scheduleItems,
    workProgressEntries,
    materials,
    materialNeeds,
    procurementRequests,
    procurementRequestItems,
    supplierQuotes,
    payments,
    cashflowPeriods,
    documents,
    documentVersions,
    dailyReports,
    risks,
    aiMessages,
    importBatches,
    accountingSyncRuns,
    accountingExternalLinks,
    auditLogs
  };
}

export async function deleteProjectWithConfirmation({
  projectId,
  actor,
  confirmation,
  client = prisma
}: {
  projectId: string;
  actor: AppUser;
  confirmation: unknown;
  client?: PrismaClient;
}): Promise<ProjectDeleteResult> {
  const parsed = projectDeleteRequestSchema.safeParse(confirmation);
  if (!parsed.success) {
    throw new ProjectDeleteError(400, "Exact project name confirmation is required.");
  }

  const expectedName = parsed.data.projectName ?? parsed.data.projectSlugOrName;

  return client.$transaction(async (tx) => {
    const project = await tx.project.findUnique({
      where: { id: projectId },
      select: {
        id: true,
        organizationId: true,
        name: true,
        customer: true,
        object: true,
        isSmokeProject: true
      }
    });
    if (!project) throw new ProjectDeleteError(404, "Project not found");
    if (project.name !== expectedName) throw new ProjectDeleteError(400, "Project name confirmation does not match.");

    const deletedCounts = await countProjectOwnedData(tx, projectId);
    await tx.project.delete({ where: { id: projectId } });
    await writeAudit(tx, {
      organizationId: project.organizationId,
      projectId: null,
      ...auditActor(actor),
      entity: "project",
      entityId: project.id,
      action: "delete",
      summary: `Удален проект: ${project.name}`,
      before: project,
      after: {
        deletedProjectId: project.id,
        deletedProjectName: project.name,
        deletedCounts
      }
    });

    return {
      ok: true,
      deletedProjectId: project.id,
      deletedProjectName: project.name,
      deletedCounts
    };
  });
}
