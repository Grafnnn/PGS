import { Prisma } from "@prisma/client";
import {
  buildAiControlAgentPreview,
  type AiControlPreview,
  withAiControlPreviewId
} from "@/lib/ai-control-agent";
import { writeAudit } from "@/lib/audit";
import type { AppUser } from "@/lib/auth/permissions";
import { getProjectBundleFromDb } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeProjectAction } from "@/lib/project-actions";
import { buildWorkforceCapacitySummary, serializeWorkforceResource } from "@/lib/workforce-capacity";

export class AiControlAgentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export async function loadAiControlAgentPreview(projectId: string, generatedAt = new Date()): Promise<AiControlPreview | null> {
  const bundle = await getProjectBundleFromDb(projectId);
  if (!bundle) return null;
  const [documentCount, actionItems, assignments, organizationAssignments] = await Promise.all([
    prisma.document.count({ where: { projectId } }),
    prisma.projectActionItem.findMany({
      where: { projectId },
      select: { title: true, sourceModule: true, status: true }
    }),
    prisma.projectResourceAssignment.findMany({
      where: { projectId },
      include: { resource: true }
    }),
    prisma.projectResourceAssignment.findMany({
      where: { organizationId: bundle.project.organizationId },
      select: { projectId: true, resourceId: true, startsAt: true, endsAt: true, allocationPercent: true }
    })
  ]);
  const workforceItems = assignments.map((item) => serializeWorkforceResource(item.resource, item, organizationAssignments));
  const workforce = buildWorkforceCapacitySummary(workforceItems);
  return withAiControlPreviewId(buildAiControlAgentPreview({
    project: bundle.project,
    budgetItems: bundle.budgetItems,
    scheduleItems: bundle.scheduleItems,
    materials: bundle.materials,
    payments: bundle.payments,
    dailyReports: bundle.dailyReports,
    risks: bundle.risks,
    actionItems: actionItems as Parameters<typeof buildAiControlAgentPreview>[0]["actionItems"],
    documentCount,
    workforce
  }, generatedAt));
}

export async function commitAiControlAgentActions(input: {
  projectId: string;
  previewId: string;
  generatedAt: string;
  selectedProposalIds: string[];
  user: AppUser;
}) {
  const generatedAt = new Date(input.generatedAt);
  const now = new Date();
  if (Number.isNaN(generatedAt.getTime()) || now.getTime() - generatedAt.getTime() > 30 * 60_000 || generatedAt.getTime() - now.getTime() > 60_000) {
    throw new AiControlAgentError("Preview expired. Build a fresh plan before confirming.", 409);
  }
  const preview = await loadAiControlAgentPreview(input.projectId, generatedAt);
  if (!preview) throw new AiControlAgentError("Project not found", 404);
  if (preview.previewId !== input.previewId) throw new AiControlAgentError("Project data changed. Build a fresh plan before confirming.", 409);
  const selected = preview.proposals.filter((item) => input.selectedProposalIds.includes(item.id));
  if (!selected.length) throw new AiControlAgentError("Select at least one proposed action", 400);
  if (selected.length !== new Set(input.selectedProposalIds).size) throw new AiControlAgentError("One or more proposals are no longer available", 409);

  const project = await prisma.project.findUnique({ where: { id: input.projectId }, select: { organizationId: true } });
  if (!project) throw new AiControlAgentError("Project not found", 404);

  const result = await prisma.$transaction(async (tx) => {
    const created = [];
    const skipped: string[] = [];
    for (const proposal of selected) {
      const duplicate = await tx.projectActionItem.findFirst({
        where: {
          projectId: input.projectId,
          title: proposal.title,
          sourceModule: "AI Control Agent",
          status: { not: "done" }
        },
        select: { id: true }
      });
      if (duplicate) {
        skipped.push(proposal.id);
        continue;
      }
      const item = await tx.projectActionItem.create({
        data: {
          organizationId: project.organizationId,
          projectId: input.projectId,
          createdBy: input.user.authenticated ? input.user.id : null,
          title: proposal.title,
          description: `${proposal.description}\n\nОснование: ${proposal.evidence}`,
          sourceModule: "AI Control Agent",
          targetTab: proposal.targetTab,
          priority: proposal.priority,
          assignee: proposal.assignee,
          dueAt: new Date(proposal.dueAt),
          requiresApproval: proposal.requiresApproval
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: input.projectId,
        actorId: input.user.authenticated ? input.user.id : null,
        actorName: input.user.name,
        actorEmail: input.user.email,
        entity: "project_action",
        entityId: item.id,
        action: "create",
        summary: `AI Control Agent: создано подтверждённое действие «${item.title}»`,
        after: {
          item: serializeProjectAction(item),
          controlAgent: {
            previewId: input.previewId,
            proposalId: proposal.id,
            policy: "project_actions_only"
          }
        }
      });
      created.push(serializeProjectAction(item));
    }
    return { created, skipped };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

  return {
    ok: true,
    created: result.created,
    skippedProposalIds: result.skipped,
    mutationPolicy: preview.mutationPolicy
  };
}
