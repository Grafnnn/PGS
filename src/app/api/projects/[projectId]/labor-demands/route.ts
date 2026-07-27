import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { laborDemandCreateSchema, serializeLaborDemand } from "@/lib/workforce-capacity";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function projectContext(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const items = await prisma.projectLaborDemand.findMany({
      where: { projectId: params.projectId },
      include: { allocations: { orderBy: [{ sharePercent: "desc" }, { workName: "asc" }] } },
      orderBy: [{ category: "asc" }, { startsAt: "asc" }, { profession: "asc" }]
    });
    return json({ items: items.map(serializeLaborDemand), permissions: { edit: await canProject(user, params.projectId, "edit") } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Labor demand request failed" }, 500);
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const data = laborDemandCreateSchema.parse(await request.json().catch(() => ({})));
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.projectLaborDemand.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          category: data.category,
          profession: data.profession,
          function: data.function || null,
          grossMonthlySalary: new Prisma.Decimal(data.grossMonthlySalary),
          peakHeadcount: new Prisma.Decimal(data.peakHeadcount),
          personMonths: new Prisma.Decimal(data.personMonths),
          plannedHours: new Prisma.Decimal(data.plannedHours),
          productivityNorm: new Prisma.Decimal(data.productivityNorm),
          productivityUnit: data.productivityUnit || null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          monthlyProfile: data.monthlyProfile as Prisma.InputJsonValue,
          source: data.source,
          confidence: new Prisma.Decimal(data.confidence),
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null
        },
        include: { allocations: true }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_labor_demand",
        entityId: created.id,
        action: "create",
        summary: `Добавлена потребность в ресурсе: ${created.profession}`,
        after: serializeLaborDemand(created)
      });
      return created;
    });
    return json({ item: serializeLaborDemand(item) }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid labor demand", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Labor demand create failed" }, 500);
  }
}
