import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { costCodeUpdateSchema, serializeCostCode } from "@/lib/cost-codes";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; costCodeId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectCostCode.findFirst({ where: { id: params.costCodeId, projectId: params.projectId } });
    if (!current) return NextResponse.json({ error: "Cost code not found" }, { status: 404 });
    const data = costCodeUpdateSchema.parse(await request.json().catch(() => ({})));
    const parent = data.parentId ? await prisma.projectCostCode.findFirst({ where: { id: data.parentId, projectId: params.projectId } }) : null;
    if (data.parentId && !parent) return NextResponse.json({ error: "Parent cost code not found" }, { status: 404 });
    if (parent?.id === current.id) return NextResponse.json({ error: "Cost code cannot be its own parent" }, { status: 409 });
    const nextCode = data.code ?? current.code;
    if (parent && !nextCode.startsWith(`${parent.code}.`)) return NextResponse.json({ error: "Child code must extend the parent code" }, { status: 409 });
    if (data.parentId) {
      let cursor = parent;
      while (cursor?.parentId) {
        if (cursor.parentId === current.id) return NextResponse.json({ error: "Cost code hierarchy cycle" }, { status: 409 });
        cursor = await prisma.projectCostCode.findUnique({ where: { id: cursor.parentId } });
      }
    }
    const childCount = await prisma.projectCostCode.count({ where: { parentId: current.id } });
    if (data.code && data.code !== current.code && childCount) return NextResponse.json({ error: "Rename child codes before changing a parent code" }, { status: 409 });
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectCostCode.update({ where: { id: current.id }, data: {
        parentId: data.parentId === undefined ? undefined : data.parentId,
        code: data.code, name: data.name, description: data.description === undefined ? undefined : data.description || null,
        segment: data.segment, costType: data.costType, status: data.status
      } });
      await writeAudit(tx, {
        organizationId: current.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "cost_code", entityId: current.id,
        action: "update", summary: `Обновлен код затрат ${item.code}: ${item.name}`, before: serializeCostCode(current), after: serializeCostCode(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeCostCode(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Cost code already exists" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid cost code update" }, { status: 400 });
    return NextResponse.json({ error: "Cost code update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectCostCode.findFirst({ where: { id: params.costCodeId, projectId: params.projectId } });
    if (!current) return NextResponse.json({ error: "Cost code not found" }, { status: 404 });
    const [children, budget, schedule, materials, procurement, payments, changes, commitments] = await Promise.all([
      prisma.projectCostCode.count({ where: { parentId: current.id } }),
      prisma.budgetItem.count({ where: { costCodeId: current.id } }),
      prisma.scheduleItem.count({ where: { costCodeId: current.id } }),
      prisma.material.count({ where: { costCodeId: current.id } }),
      prisma.procurementRequestItem.count({ where: { costCodeId: current.id } }),
      prisma.payment.count({ where: { costCodeId: current.id } }),
      prisma.projectChangeOrderItem.count({ where: { costCodeId: current.id } }),
      prisma.projectCommitmentLine.count({ where: { costCodeId: current.id } })
    ]);
    if (children || budget || schedule || materials || procurement || payments || changes || commitments) return NextResponse.json({ error: "Deactivate or unlink the cost code before deletion" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectCostCode.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "cost_code", entityId: current.id,
        action: "delete", summary: `Удален код затрат ${current.code}: ${current.name}`, before: serializeCostCode(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Cost code delete failed" }, { status: 500 });
  }
}
