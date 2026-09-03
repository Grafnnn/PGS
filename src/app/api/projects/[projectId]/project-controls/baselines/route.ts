import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildProjectControlBaselinePreview, projectControlBaselineRequestSchema } from "@/lib/project-controls";
import { projectControlBaselineInclude, serializeProjectControlBaseline } from "@/lib/project-controls-db";

const baselineProjectQuery = {
  include: {
    budgetItems: { orderBy: [{ section: "asc" as const }, { code: "asc" as const }] },
    scheduleItems: { where: { isCurrent: true }, orderBy: { startsAt: "asc" as const } }
  }
} satisfies Prisma.ProjectDefaultArgs;

type BaselineProject = Prisma.ProjectGetPayload<typeof baselineProjectQuery>;

class BaselineProjectNotFoundError extends Error {}
class BaselineNotReadyError extends Error {}

function buildBaselinePreview(project: BaselineProject) {
  return buildProjectControlBaselinePreview({
    project: { startsAt: project.startsAt.toISOString(), endsAt: project.endsAt.toISOString() },
    budgetItems: project.budgetItems.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      costCodeId: item.costCodeId,
      section: item.section,
      subsection: item.subsection ?? undefined,
      code: item.code,
      name: item.name,
      unit: item.unit,
      qty: Number(item.qty),
      plannedUnitPrice: Number(item.plannedUnitPrice),
      actualUnitPrice: Number(item.actualUnitPrice),
      forecastUnitPrice: Number(item.forecastUnitPrice),
      kind: item.kind,
      source: item.source,
      comment: item.comment ?? undefined
    })),
    scheduleItems: project.scheduleItems.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      budgetItemId: item.budgetItemId ?? undefined,
      costCodeId: item.costCodeId,
      name: item.name,
      owner: item.owner,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      plannedQty: Number(item.plannedQty),
      actualQty: Number(item.actualQty),
      status: item.status as "not_started" | "in_progress" | "done" | "delayed" | "stopped",
      dependency: item.dependency ?? undefined
    }))
  });
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  try {
    const data = projectControlBaselineRequestSchema.parse(await request.json().catch(() => ({})));
    if (data.activate && role !== "OWNER" && role !== "ADMIN") return apiError(requestId, "FORBIDDEN", "Only OWNER or ADMIN can activate a baseline", 403);
    if (data.mode === "preview") {
      const project = await prisma.project.findUnique({ where: { id: params.projectId }, ...baselineProjectQuery });
      if (!project) return apiError(requestId, "NOT_FOUND", "Project not found", 404);
      return apiOk(requestId, { preview: buildBaselinePreview(project) });
    }

    const baseline = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${params.projectId} FOR UPDATE`;
      const project = await tx.project.findUnique({ where: { id: params.projectId }, ...baselineProjectQuery });
      if (!project) throw new BaselineProjectNotFoundError("Project not found");
      const preview = buildBaselinePreview(project);
      if (!preview.summary.budgetAtCompletion) throw new BaselineNotReadyError("A baseline requires budget data");
      if (data.activate && !preview.summary.canActivate) throw new BaselineNotReadyError("An active baseline requires budget and schedule data");
      const latest = await tx.projectControlBaseline.findFirst({
        where: { projectId: params.projectId },
        orderBy: { sequence: "desc" },
        select: { sequence: true }
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const now = new Date();
      if (data.activate) {
        await tx.projectControlBaseline.updateMany({
          where: { projectId: params.projectId, status: "active" },
          data: { status: "superseded", supersededAt: now }
        });
      }
      const created = await tx.projectControlBaseline.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence,
          name: data.name,
          status: data.activate ? "active" : "draft",
          dataDate: new Date(data.dataDate),
          plannedStart: new Date(preview.summary.plannedStart),
          plannedFinish: new Date(preview.summary.plannedFinish),
          budgetAtCompletion: preview.summary.budgetAtCompletion,
          budgetItemCount: preview.summary.budgetItemCount,
          scheduleItemCount: preview.summary.scheduleItemCount,
          linkedBudgetValue: preview.summary.linkedBudgetValue,
          scheduleCoveragePercent: preview.summary.scheduleCoveragePercent,
          limitations: preview.limitations,
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null,
          activatedAt: data.activate ? now : null,
          lines: {
            create: preview.lines.map((line) => ({
              budgetItemId: line.budgetItemId,
              scheduleItemId: line.scheduleItemId,
              costCodeId: line.costCodeId,
              sequence: line.sequence,
              code: line.code,
              name: line.name,
              unit: line.unit,
              plannedQty: line.plannedQty,
              budget: line.budget,
              weight: line.weight,
              plannedStart: new Date(line.plannedStart),
              plannedFinish: new Date(line.plannedFinish),
              sourceQuality: line.sourceQuality
            }))
          }
        },
        include: projectControlBaselineInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_control_baseline",
        entityId: created.id,
        action: "create",
        summary: `Создан baseline #${sequence}${data.activate ? " и активирован" : ""}: ${data.name}`,
        after: { sequence, status: created.status, budgetAtCompletion: preview.summary.budgetAtCompletion, coverage: preview.summary.scheduleCoveragePercent }
      });
      return created;
    });
    return apiOk(requestId, { baseline: serializeProjectControlBaseline(baseline) }, 201);
  } catch (error) {
    if (error instanceof BaselineProjectNotFoundError) return apiError(requestId, "NOT_FOUND", error.message, 404);
    if (error instanceof BaselineNotReadyError) return apiError(requestId, "BASELINE_NOT_READY", error.message, 409);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(requestId, "BASELINE_CONFLICT", "Baseline sequence conflict; retry", 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof Error && error.name === "ZodError") return apiError(requestId, "INVALID_REQUEST", "Invalid baseline request", 400);
    return apiError(requestId, "BASELINE_CREATE_FAILED", "Project controls baseline failed", 500);
  }
}
