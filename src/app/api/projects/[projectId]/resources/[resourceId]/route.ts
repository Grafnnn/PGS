import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeWorkforceResource, workforceResourceUpdateSchema } from "@/lib/workforce-capacity";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function scopedAssignment(projectId: string, resourceId: string) {
  return prisma.projectResourceAssignment.findUnique({
    where: { projectId_resourceId: { projectId, resourceId } },
    include: { resource: true, project: { select: { organizationId: true } } }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; resourceId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);

  try {
    const current = await scopedAssignment(params.projectId, params.resourceId);
    if (!current) return json({ error: "Resource assignment not found" }, 404);
    const data = workforceResourceUpdateSchema.parse(await request.json().catch(() => ({})));
    const startsAt = data.assignment?.startsAt ?? current.startsAt;
    const endsAt = data.assignment?.endsAt ?? current.endsAt;
    if (endsAt < startsAt) return json({ error: "Assignment end must be after start" }, 400);
    const before = serializeWorkforceResource(current.resource, current, [current]);

    const updated = await prisma.$transaction(async (tx) => {
      const resource = await tx.organizationResource.update({
        where: { id: params.resourceId },
        data: {
          kind: data.kind,
          name: data.name,
          profession: data.profession === undefined ? undefined : data.profession || null,
          employmentType: data.employmentType,
          headcount: data.headcount,
          capacityHoursPerMonth: data.capacityHoursPerMonth === undefined ? undefined : new Prisma.Decimal(data.capacityHoursPerMonth),
          productivityNorm: data.productivityNorm === undefined ? undefined : new Prisma.Decimal(data.productivityNorm),
          productivityUnit: data.productivityUnit === undefined ? undefined : data.productivityUnit || null,
          monthlyCost: data.monthlyCost === undefined ? undefined : new Prisma.Decimal(data.monthlyCost),
          grossMonthlySalary: data.grossMonthlySalary === undefined ? undefined : new Prisma.Decimal(data.grossMonthlySalary),
          hourlyCost: data.hourlyCost === undefined ? undefined : new Prisma.Decimal(data.hourlyCost),
          certifications: data.certifications,
          status: data.status,
          notes: data.notes === undefined ? undefined : data.notes || null
        }
      });
      const assignment = await tx.projectResourceAssignment.update({
        where: { projectId_resourceId: { projectId: params.projectId, resourceId: params.resourceId } },
        data: {
          startsAt: data.assignment?.startsAt,
          endsAt: data.assignment?.endsAt,
          allocationPercent: data.assignment?.allocationPercent,
          plannedHours: data.assignment?.plannedHours === undefined ? undefined : new Prisma.Decimal(data.assignment.plannedHours),
          plannedOutput: data.assignment?.plannedOutput === undefined ? undefined : new Prisma.Decimal(data.assignment.plannedOutput),
          status: data.assignment?.status,
          notes: data.assignment?.notes === undefined ? undefined : data.assignment.notes || null
        }
      });
      await writeAudit(tx, {
        organizationId: current.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_resource_assignment",
        entityId: assignment.id,
        action: "update",
        summary: `Обновлен ресурсный план: ${resource.name}`,
        before
      });
      return { resource, assignment };
    });
    const conflicts = await prisma.projectResourceAssignment.findMany({
      where: { organizationId: current.project.organizationId, resourceId: params.resourceId },
      select: { projectId: true, resourceId: true, startsAt: true, endsAt: true, allocationPercent: true }
    });
    const item = serializeWorkforceResource(updated.resource, updated.assignment, conflicts);
    return json({ item });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid workforce resource", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Workforce resource update failed" }, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { projectId: string; resourceId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);

  try {
    const current = await scopedAssignment(params.projectId, params.resourceId);
    if (!current) return json({ error: "Resource assignment not found" }, 404);
    await prisma.$transaction(async (tx) => {
      await tx.projectResourceAssignment.delete({
        where: { projectId_resourceId: { projectId: params.projectId, resourceId: params.resourceId } }
      });
      await writeAudit(tx, {
        organizationId: current.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_resource_assignment",
        entityId: current.id,
        action: "delete",
        summary: `Ресурс снят с проекта: ${current.resource.name}`,
        before: serializeWorkforceResource(current.resource, current, [current])
      });
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Workforce resource unassign failed" }, 500);
  }
}
