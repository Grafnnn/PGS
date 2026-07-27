import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { laborDemandUpdateSchema, serializeLaborDemand } from "@/lib/workforce-capacity";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function scopedDemand(projectId: string, demandId: string) {
  return prisma.projectLaborDemand.findFirst({
    where: { id: demandId, projectId },
    include: {
      allocations: { orderBy: [{ sharePercent: "desc" }, { workName: "asc" }] },
      project: { select: { organizationId: true } }
    }
  });
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; demandId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const current = await scopedDemand(params.projectId, params.demandId);
    if (!current) return json({ error: "Labor demand not found" }, 404);
    if (current.importBatchId) {
      return json({ error: "Imported labor demand must be replaced through Excel import" }, 409);
    }
    const data = laborDemandUpdateSchema.parse(await request.json().catch(() => ({})));
    const startsAt = data.startsAt ?? current.startsAt;
    const endsAt = data.endsAt ?? current.endsAt;
    if (endsAt < startsAt) return json({ error: "Demand end must be after start" }, 400);
    const before = serializeLaborDemand(current);
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectLaborDemand.update({
        where: { id: current.id },
        data: {
          category: data.category,
          profession: data.profession,
          function: data.function === undefined ? undefined : data.function || null,
          grossMonthlySalary: data.grossMonthlySalary === undefined ? undefined : new Prisma.Decimal(data.grossMonthlySalary),
          peakHeadcount: data.peakHeadcount === undefined ? undefined : new Prisma.Decimal(data.peakHeadcount),
          personMonths: data.personMonths === undefined ? undefined : new Prisma.Decimal(data.personMonths),
          plannedHours: data.plannedHours === undefined ? undefined : new Prisma.Decimal(data.plannedHours),
          productivityNorm: data.productivityNorm === undefined ? undefined : new Prisma.Decimal(data.productivityNorm),
          productivityUnit: data.productivityUnit === undefined ? undefined : data.productivityUnit || null,
          startsAt: data.startsAt,
          endsAt: data.endsAt,
          monthlyProfile: data.monthlyProfile === undefined ? undefined : data.monthlyProfile as Prisma.InputJsonValue,
          source: data.source,
          confidence: data.confidence === undefined ? undefined : new Prisma.Decimal(data.confidence),
          notes: data.notes === undefined ? undefined : data.notes || null
        },
        include: { allocations: { orderBy: [{ sharePercent: "desc" }, { workName: "asc" }] } }
      });
      await writeAudit(tx, {
        organizationId: current.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_labor_demand",
        entityId: item.id,
        action: "update",
        summary: `Обновлена потребность в ресурсе: ${item.profession}`,
        before,
        after: serializeLaborDemand(item)
      });
      return item;
    });
    return json({ item: serializeLaborDemand(updated) });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid labor demand", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Labor demand update failed" }, 500);
  }
}

export async function DELETE(_request: Request, { params }: { params: { projectId: string; demandId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const current = await scopedDemand(params.projectId, params.demandId);
    if (!current) return json({ error: "Labor demand not found" }, 404);
    if (current.importBatchId) {
      return json({ error: "Imported labor demand must be replaced through Excel import" }, 409);
    }
    await prisma.$transaction(async (tx) => {
      await tx.projectLaborDemand.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_labor_demand",
        entityId: current.id,
        action: "delete",
        summary: `Удалена потребность в ресурсе: ${current.profession}`,
        before: serializeLaborDemand(current)
      });
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Labor demand delete failed" }, 500);
  }
}
