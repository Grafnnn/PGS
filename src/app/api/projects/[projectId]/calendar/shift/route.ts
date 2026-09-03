import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildProjectCalendarShiftPreview, projectCalendarShiftRequestSchema } from "@/lib/project-calendar-shift";

const OPEN_REQUEST_STATUSES = ["draft", "submitted"];

const calendarProjectSelect = {
  id: true,
  organizationId: true,
  startsAt: true,
  endsAt: true,
  scheduleItems: { where: { isCurrent: true }, select: { startsAt: true, endsAt: true } },
  materials: { select: { neededAt: true, orderByAt: true } },
  materialNeeds: { select: { requiredAt: true } },
  procurementRequests: {
    where: { status: { in: OPEN_REQUEST_STATUSES } },
    select: { neededAt: true, expectedAt: true }
  }
} satisfies Prisma.ProjectSelect;

class CalendarShiftError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return apiError(requestId, "FORBIDDEN", "Only OWNER or ADMIN can shift the project calendar", 403);

  try {
    const data = projectCalendarShiftRequestSchema.parse(await request.json().catch(() => ({})));
    if (data.mode === "preview") {
      const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: calendarProjectSelect });
      if (!project) return apiError(requestId, "NOT_FOUND", "Project not found", 404);
      const preview = buildProjectCalendarShiftPreview({
        project,
        scheduleItems: project.scheduleItems,
        materials: project.materials,
        materialNeeds: project.materialNeeds,
        procurementRequests: project.procurementRequests,
        targetStart: data.targetStart
      });
      return apiOk(requestId, { preview });
    }
    if (!data.confirmed) return apiError(requestId, "CONFIRMATION_REQUIRED", "Calendar shift requires explicit confirmation", 409);

    const preview = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${params.projectId} FOR UPDATE`;
      const project = await tx.project.findUnique({ where: { id: params.projectId }, select: calendarProjectSelect });
      if (!project) throw new CalendarShiftError("NOT_FOUND", "Project not found", 404);
      const freshPreview = buildProjectCalendarShiftPreview({
        project,
        scheduleItems: project.scheduleItems,
        materials: project.materials,
        materialNeeds: project.materialNeeds,
        procurementRequests: project.procurementRequests,
        targetStart: data.targetStart
      });
      if (freshPreview.deltaDays === 0 && freshPreview.project.startsAt.before === freshPreview.project.startsAt.after) {
        throw new CalendarShiftError("CALENDAR_UNCHANGED", "Project calendar already starts on this date", 409);
      }
      await tx.project.update({
        where: { id: project.id },
        data: {
          startsAt: new Date(`${freshPreview.project.startsAt.after}T00:00:00.000Z`),
          endsAt: new Date(`${freshPreview.project.endsAt.after}T00:00:00.000Z`)
        }
      });
      if (freshPreview.deltaDays !== 0) {
        await tx.$executeRaw`
          UPDATE "schedule_items"
          SET "starts_at" = "starts_at" + (${freshPreview.deltaDays} * INTERVAL '1 day'),
              "ends_at" = "ends_at" + (${freshPreview.deltaDays} * INTERVAL '1 day'),
              "updated_at" = NOW()
          WHERE "project_id" = ${project.id}
            AND "is_current" = true
        `;
        await tx.$executeRaw`
          UPDATE "materials"
          SET "order_by_at" = CASE WHEN "order_by_at" IS NULL THEN NULL ELSE "order_by_at" + (${freshPreview.deltaDays} * INTERVAL '1 day') END,
              "needed_at" = "needed_at" + (${freshPreview.deltaDays} * INTERVAL '1 day'),
              "updated_at" = NOW()
          WHERE "project_id" = ${project.id}
        `;
        await tx.$executeRaw`
          UPDATE "material_needs"
          SET "required_at" = "required_at" + (${freshPreview.deltaDays} * INTERVAL '1 day'),
              "updated_at" = NOW()
          WHERE "project_id" = ${project.id}
        `;
        await tx.$executeRaw`
          UPDATE "procurement_requests"
          SET "needed_at" = "needed_at" + (${freshPreview.deltaDays} * INTERVAL '1 day'),
              "expected_at" = CASE WHEN "expected_at" IS NULL THEN NULL ELSE "expected_at" + (${freshPreview.deltaDays} * INTERVAL '1 day') END,
              "updated_at" = NOW()
          WHERE "project_id" = ${project.id}
            AND "status" IN ('draft', 'submitted')
        `;
      }
      await tx.projectControlBaseline.updateMany({
        where: { projectId: project.id, status: "active" },
        data: { status: "superseded", supersededAt: new Date() }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_calendar",
        entityId: project.id,
        action: "update",
        summary: `Календарь проекта перенесён на ${freshPreview.targetStart}: ${freshPreview.deltaDays > 0 ? "+" : ""}${freshPreview.deltaDays} дн.`,
        before: {
          projectStartsAt: freshPreview.project.startsAt.before,
          projectEndsAt: freshPreview.project.endsAt.before,
          scheduleStartsAt: freshPreview.schedule.first?.before,
          materialOrderByAt: freshPreview.materials.firstOrder?.before
        },
        after: {
          projectStartsAt: freshPreview.project.startsAt.after,
          projectEndsAt: freshPreview.project.endsAt.after,
          scheduleStartsAt: freshPreview.schedule.first?.after,
          materialOrderByAt: freshPreview.materials.firstOrder?.after,
          deltaDays: freshPreview.deltaDays,
          scheduleItems: freshPreview.schedule.count,
          materials: freshPreview.materials.count
        }
      });
      return freshPreview;
    }, { timeout: 30_000 });

    return apiOk(requestId, { shifted: true, preview });
  } catch (error) {
    if (error instanceof CalendarShiftError) return apiError(requestId, error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof Error && error.name === "ZodError") return apiError(requestId, "INVALID_REQUEST", "Invalid calendar shift request", 400);
    if (error instanceof Error && /calendar|date|ten years/i.test(error.message)) return apiError(requestId, "INVALID_DATE", error.message, 400);
    return apiError(requestId, "CALENDAR_SHIFT_FAILED", "Project calendar shift failed", 500);
  }
}
