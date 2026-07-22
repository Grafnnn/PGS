import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { projectControlPeriodActionSchema } from "@/lib/project-controls";
import { projectControlPeriodInclude, serializeProjectControlPeriod } from "@/lib/project-controls-db";

type Params = { projectId: string; periodId: string };

export async function PATCH(request: Request, { params }: { params: Params }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return apiError(requestId, "FORBIDDEN", "Only OWNER or ADMIN can lock or void a period", 403);
  try {
    const data = projectControlPeriodActionSchema.parse(await request.json().catch(() => ({})));
    const current = await prisma.projectControlPeriod.findFirst({
      where: { id: params.periodId, projectId: params.projectId },
      include: projectControlPeriodInclude
    });
    if (!current) return apiError(requestId, "NOT_FOUND", "Reporting period not found", 404);
    if (current.status !== "published") return apiError(requestId, "INVALID_TRANSITION", "Only a published period can be locked or voided", 409);
    const nextStatus = data.action === "lock" ? "locked" : "void";
    const period = await prisma.$transaction(async (tx) => {
      const now = new Date();
      const claimed = await tx.projectControlPeriod.updateMany({
        where: { id: current.id, status: "published", updatedAt: current.updatedAt },
        data: { updatedAt: now }
      });
      if (claimed.count !== 1) throw new Error("Reporting period action was already handled");
      const updated = await tx.projectControlPeriod.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          lockedAt: data.action === "lock" ? now : null,
          voidedAt: data.action === "void" ? now : null
        },
        include: projectControlPeriodInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_control_period",
        entityId: current.id,
        action: "update",
        summary: `${data.action === "lock" ? "Заблокирован" : "Аннулирован"} отчетный период #${current.sequence}: ${current.label}`,
        before: { status: current.status },
        after: { status: nextStatus }
      });
      return updated;
    });
    return apiOk(requestId, { period: serializeProjectControlPeriod(period) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof Error && error.name === "ZodError") return apiError(requestId, "INVALID_REQUEST", "Invalid reporting period action", 400);
    if (error instanceof Error && /already handled/.test(error.message)) return apiError(requestId, "CONFLICT", error.message, 409);
    return apiError(requestId, "PERIOD_ACTION_FAILED", "Reporting period action failed", 500);
  }
}
