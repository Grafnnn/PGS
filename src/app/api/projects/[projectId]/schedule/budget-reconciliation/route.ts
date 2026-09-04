import { z } from "zod";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  buildScheduleBudgetReconciliation,
  resolveScheduleBudgetOverrides
} from "@/lib/schedule-budget-reconciliation";

export const runtime = "nodejs";

const requestSchema = z.object({
  confirm: z.literal(true),
  overrides: z.array(z.object({
    scheduleItemId: z.string().min(1),
    budgetItemId: z.string().min(1)
  })).max(500).default([])
});

const projectQuery = {
  budgetItems: {
    select: { id: true, section: true, code: true, name: true, unit: true, qty: true, plannedUnitPrice: true, kind: true }
  },
  scheduleItems: {
    where: { isCurrent: true },
    select: { id: true, budgetItemId: true, name: true, unit: true, plannedQty: true, dependency: true }
  }
} as const;

function reconciliationFor(project: {
  budgetItems: Array<{ id: string; section: string; code: string; name: string; unit: string; qty: unknown; plannedUnitPrice: unknown; kind: string }>;
  scheduleItems: Array<{ id: string; budgetItemId: string | null; name: string; unit: string | null; plannedQty: unknown; dependency: string | null }>;
}) {
  return buildScheduleBudgetReconciliation(
    project.scheduleItems.map((item) => ({
      id: item.id,
      budgetItemId: item.budgetItemId ?? undefined,
      name: item.name,
      unit: item.unit ?? undefined,
      plannedQty: Number(item.plannedQty),
      dependency: item.dependency ?? undefined
    })),
    project.budgetItems.map((item) => ({
      id: item.id,
      section: item.section,
      code: item.code,
      name: item.name,
      unit: item.unit,
      qty: Number(item.qty),
      plannedUnitPrice: Number(item.plannedUnitPrice),
      kind: item.kind as "work"
    }))
  );
}

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: projectQuery
  });
  if (!project) return apiError(requestId, "NOT_FOUND", "Project not found", 404);
  return apiOk(requestId, { reconciliation: reconciliationFor(project) });
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return apiError(requestId, "VALIDATION_ERROR", "Explicit confirmation and valid links are required", 400);

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${params.projectId} FOR UPDATE`;
      const project = await tx.project.findUnique({
        where: { id: params.projectId },
        select: { id: true, organizationId: true, ...projectQuery }
      });
      if (!project) return null;
      const reconciliation = reconciliationFor(project);
      const links = resolveScheduleBudgetOverrides(reconciliation, parsed.data.overrides);
      let unitBackfilled = 0;
      for (const link of links) {
        const schedule = project.scheduleItems.find((item) => item.id === link.scheduleItemId);
        const shouldBackfillUnit = !schedule?.unit?.trim() && Boolean(link.unit.trim());
        await tx.scheduleItem.update({
          where: { id: link.scheduleItemId },
          data: {
            budgetItemId: link.budgetItemId,
            ...(shouldBackfillUnit ? { unit: link.unit } : {})
          }
        });
        if (shouldBackfillUnit) unitBackfilled += 1;
      }
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.authenticated ? user.email : null,
        entity: "schedule_budget_reconciliation",
        entityId: project.id,
        action: "update",
        summary: `Связано строк графика со сметой: ${links.length}; восстановлено единиц: ${unitBackfilled}`,
        before: {
          linkedScheduleItems: reconciliation.summary.currentLinkedScheduleItems,
          coveragePercent: reconciliation.summary.currentCoveragePercent
        },
        after: {
          linkedScheduleItems: reconciliation.summary.currentLinkedScheduleItems + links.length,
          appliedLinks: links.length,
          unitBackfilled
        }
      });
      return { links, unitBackfilled, before: reconciliation.summary };
    });
    if (!result) return apiError(requestId, "NOT_FOUND", "Project not found", 404);
    return apiOk(requestId, { applied: { count: result.links.length, unitBackfilled: result.unitBackfilled }, links: result.links });
  } catch (error) {
    if (error instanceof Error && /Недопустимая связь|выбрана более одного раза|не найдена/.test(error.message)) {
      return apiError(requestId, "RECONCILIATION_CONFLICT", error.message, 409);
    }
    console.error(error);
    return apiError(requestId, "INTERNAL_ERROR", "Schedule reconciliation failed", 500);
  }
}
