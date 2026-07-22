import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { projectControlBaselineActionSchema } from "@/lib/project-controls";
import { projectControlBaselineInclude, serializeProjectControlBaseline } from "@/lib/project-controls-db";

type Params = { projectId: string; baselineId: string };

export async function PATCH(request: Request, { params }: { params: Params }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return apiError(requestId, "FORBIDDEN", "Only OWNER or ADMIN can manage a baseline", 403);
  try {
    const data = projectControlBaselineActionSchema.parse(await request.json().catch(() => ({})));
    const current = await prisma.projectControlBaseline.findFirst({
      where: { id: params.baselineId, projectId: params.projectId },
      include: projectControlBaselineInclude
    });
    if (!current) return apiError(requestId, "NOT_FOUND", "Baseline not found", 404);

    if (data.action === "delete") {
      if (current.status !== "draft") return apiError(requestId, "BASELINE_IN_USE", "Only a draft baseline can be deleted", 409);
      const periods = await prisma.projectControlPeriod.count({ where: { baselineId: current.id } });
      if (periods) return apiError(requestId, "BASELINE_IN_USE", "A baseline with reporting periods cannot be deleted", 409);
      await prisma.$transaction(async (tx) => {
        await tx.projectControlBaseline.delete({ where: { id: current.id } });
        await writeAudit(tx, {
          organizationId: current.organizationId,
          projectId: current.projectId,
          actorId: user?.authenticated ? user.id : null,
          actorName: user?.name ?? "local-user",
          actorEmail: user?.email ?? null,
          entity: "project_control_baseline",
          entityId: current.id,
          action: "delete",
          summary: `Удален draft baseline #${current.sequence}: ${current.name}`,
          before: { sequence: current.sequence, status: current.status, budgetAtCompletion: Number(current.budgetAtCompletion) }
        });
      });
      return apiOk(requestId, { ok: true });
    }

    if (current.status !== "draft") return apiError(requestId, "INVALID_TRANSITION", "Only a draft baseline can be activated", 409);
    if (Number(current.budgetAtCompletion) <= 0 || current.scheduleItemCount <= 0) return apiError(requestId, "BASELINE_NOT_READY", "An active baseline requires budget and schedule data", 409);
    const baseline = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.projectControlBaseline.updateMany({
        where: { id: current.id, status: "draft", updatedAt: current.updatedAt },
        data: { updatedAt: now }
      });
      if (claimed.count !== 1) throw new Error("Baseline action was already handled");
      await tx.projectControlBaseline.updateMany({
        where: { projectId: params.projectId, status: "active", id: { not: current.id } },
        data: { status: "superseded", supersededAt: now }
      });
      const updated = await tx.projectControlBaseline.update({
        where: { id: current.id },
        data: { status: "active", activatedAt: now },
        include: projectControlBaselineInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_control_baseline",
        entityId: current.id,
        action: "update",
        summary: `Активирован baseline #${current.sequence}: ${current.name}`,
        before: { status: current.status },
        after: { status: updated.status }
      });
      return updated;
    });
    return apiOk(requestId, { baseline: serializeProjectControlBaseline(baseline) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof Error && error.name === "ZodError") return apiError(requestId, "INVALID_REQUEST", "Invalid baseline action", 400);
    if (error instanceof Error && /already handled/.test(error.message)) return apiError(requestId, "CONFLICT", error.message, 409);
    return apiError(requestId, "BASELINE_ACTION_FAILED", "Baseline action failed", 500);
  }
}
