import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { costCodeAssignmentSchema } from "@/lib/cost-codes";
import { prisma } from "@/lib/prisma";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = costCodeAssignmentSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const costCode = data.costCodeId ? await prisma.projectCostCode.findFirst({ where: { id: data.costCodeId, projectId: params.projectId, status: "active" } }) : null;
    if (data.costCodeId && !costCode) return NextResponse.json({ error: "Active project cost code not found" }, { status: 404 });

    const result = await prisma.$transaction(async (tx) => {
      let before: { costCodeId: string | null; label: string } | null = null;
      if (data.entityType === "budget_item") {
        const item = await tx.budgetItem.findFirst({ where: { id: data.entityId, projectId: params.projectId }, select: { costCodeId: true, name: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.name }; await tx.budgetItem.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else if (data.entityType === "schedule_item") {
        const item = await tx.scheduleItem.findFirst({ where: { id: data.entityId, projectId: params.projectId }, select: { costCodeId: true, name: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.name }; await tx.scheduleItem.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else if (data.entityType === "material") {
        const item = await tx.material.findFirst({ where: { id: data.entityId, projectId: params.projectId }, select: { costCodeId: true, name: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.name }; await tx.material.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else if (data.entityType === "procurement_item") {
        const item = await tx.procurementRequestItem.findFirst({ where: { id: data.entityId, request: { projectId: params.projectId } }, select: { costCodeId: true, name: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.name }; await tx.procurementRequestItem.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else if (data.entityType === "payment") {
        const item = await tx.payment.findFirst({ where: { id: data.entityId, projectId: params.projectId }, select: { costCodeId: true, title: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.title }; await tx.payment.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else if (data.entityType === "change_order_item") {
        const item = await tx.projectChangeOrderItem.findFirst({ where: { id: data.entityId, changeOrder: { projectId: params.projectId } }, select: { costCodeId: true, description: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.description }; await tx.projectChangeOrderItem.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      } else {
        const item = await tx.projectCommitmentLine.findFirst({ where: { id: data.entityId, commitment: { projectId: params.projectId } }, select: { costCodeId: true, description: true } });
        if (item) { before = { costCodeId: item.costCodeId, label: item.description }; await tx.projectCommitmentLine.update({ where: { id: data.entityId }, data: { costCodeId: costCode?.id ?? null } }); }
      }
      if (!before) throw new Error("Assignable entity not found");
      await writeAudit(tx, {
        organizationId: project.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "cost_code_assignment", entityId: data.entityId,
        action: "update", summary: `${before.label}: ${costCode ? `назначен ${costCode.code}` : "код затрат снят"}`,
        before: { entityType: data.entityType, costCodeId: before.costCodeId }, after: { entityType: data.entityType, costCodeId: costCode?.id ?? null }
      });
      return { entityType: data.entityType, entityId: data.entityId, costCodeId: costCode?.id ?? null };
    });
    return NextResponse.json({ assignment: result });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid cost code assignment" }, { status: 400 });
    if (error instanceof Error && error.message === "Assignable entity not found") return NextResponse.json({ error: error.message }, { status: 404 });
    return NextResponse.json({ error: "Cost code assignment failed" }, { status: 500 });
  }
}
