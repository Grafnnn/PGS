import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  existingWorkforceResourceAssignmentSchema,
  serializeWorkforceResource,
  workforceResourceCreateSchema
} from "@/lib/workforce-capacity";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function actor(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return {
    actorId: user?.authenticated ? user.id : null,
    actorName: user?.name ?? "local-user",
    actorEmail: user?.email ?? null
  };
}

async function projectContext(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);
  const canEdit = await canProject(user, params.projectId, "edit");

  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const [assignments, allOrganizationAssignments, organizationResources] = await Promise.all([
      prisma.projectResourceAssignment.findMany({
        where: { projectId: params.projectId },
        include: { resource: true },
        orderBy: [{ status: "asc" }, { startsAt: "asc" }, { createdAt: "asc" }]
      }),
      prisma.projectResourceAssignment.findMany({
        where: { organizationId: project.organizationId },
        select: { projectId: true, resourceId: true, startsAt: true, endsAt: true, allocationPercent: true }
      }),
      canEdit
        ? prisma.organizationResource.findMany({
            where: { organizationId: project.organizationId, status: { not: "archived" } },
            select: { id: true, name: true, kind: true, profession: true, employmentType: true, status: true },
            orderBy: [{ kind: "asc" }, { name: "asc" }]
          })
        : Promise.resolve([])
    ]);
    const assignedIds = new Set(assignments.map((item) => item.resourceId));
    return json({
      items: assignments.map((item) => serializeWorkforceResource(item.resource, item, allOrganizationAssignments)),
      available: organizationResources.filter((item) => !assignedIds.has(item.id)),
      permissions: { edit: canEdit }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Workforce resources request failed" }, 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);

  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const body = await request.json().catch(() => ({}));
    const createdBy = user?.authenticated ? user.id : null;
    const auditActor = actor(user);

    if (typeof body === "object" && body && "resourceId" in body) {
      const data = existingWorkforceResourceAssignmentSchema.parse(body);
      const resource = await prisma.organizationResource.findFirst({
        where: { id: data.resourceId, organizationId: project.organizationId }
      });
      if (!resource) return json({ error: "Resource not found" }, 404);
      const assignment = await prisma.$transaction(async (tx) => {
        const created = await tx.projectResourceAssignment.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            resourceId: resource.id,
            startsAt: data.assignment.startsAt,
            endsAt: data.assignment.endsAt,
            allocationPercent: data.assignment.allocationPercent,
            plannedHours: new Prisma.Decimal(data.assignment.plannedHours),
            plannedOutput: new Prisma.Decimal(data.assignment.plannedOutput),
            status: data.assignment.status,
            notes: data.assignment.notes || null,
            createdBy
          }
        });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_resource_assignment",
          entityId: created.id,
          action: "create",
          summary: `Ресурс назначен на проект: ${resource.name}`
        });
        return created;
      });
      const conflicts = await prisma.projectResourceAssignment.findMany({
        where: { organizationId: project.organizationId, resourceId: resource.id },
        select: { projectId: true, resourceId: true, startsAt: true, endsAt: true, allocationPercent: true }
      });
      return json({ item: serializeWorkforceResource(resource, assignment, conflicts) }, 201);
    }

    const data = workforceResourceCreateSchema.parse(body);
    const result = await prisma.$transaction(async (tx) => {
      const resource = await tx.organizationResource.create({
        data: {
          organizationId: project.organizationId,
          kind: data.kind,
          name: data.name,
          profession: data.profession || null,
          employmentType: data.employmentType,
          headcount: data.headcount,
          capacityHoursPerMonth: new Prisma.Decimal(data.capacityHoursPerMonth),
          productivityNorm: new Prisma.Decimal(data.productivityNorm),
          productivityUnit: data.productivityUnit || null,
          monthlyCost: new Prisma.Decimal(data.monthlyCost),
          hourlyCost: new Prisma.Decimal(data.hourlyCost),
          certifications: data.certifications,
          status: data.status,
          notes: data.notes || null,
          createdBy
        }
      });
      const assignment = await tx.projectResourceAssignment.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          resourceId: resource.id,
          startsAt: data.assignment.startsAt,
          endsAt: data.assignment.endsAt,
          allocationPercent: data.assignment.allocationPercent,
          plannedHours: new Prisma.Decimal(data.assignment.plannedHours),
          plannedOutput: new Prisma.Decimal(data.assignment.plannedOutput),
          status: data.assignment.status,
          notes: data.assignment.notes || null,
          createdBy
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        ...auditActor,
        entity: "organization_resource",
        entityId: resource.id,
        action: "create",
        summary: `Добавлен ресурс: ${resource.name}`
      });
      return { resource, assignment };
    });

    return json({ item: serializeWorkforceResource(result.resource, result.assignment, [result.assignment]) }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid workforce resource", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return json({ error: "Resource is already assigned to this project" }, 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Workforce resource create failed" }, 500);
  }
}
