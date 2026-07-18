import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { costCodeCoverage, costCodeCreateSchema, serializeCostCode } from "@/lib/cost-codes";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [codes, budgetItems, scheduleItems, materials, procurementItems, payments, changeOrderItems] = await Promise.all([
      prisma.projectCostCode.findMany({ where: { projectId: params.projectId }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.budgetItem.findMany({ where: { projectId: params.projectId }, select: { id: true, code: true, name: true, section: true, costCodeId: true } }),
      prisma.scheduleItem.findMany({ where: { projectId: params.projectId }, select: { id: true, name: true, budgetItemId: true, costCodeId: true } }),
      prisma.material.findMany({ where: { projectId: params.projectId }, select: { id: true, name: true, costCodeId: true } }),
      prisma.procurementRequestItem.findMany({ where: { request: { projectId: params.projectId } }, select: { id: true, name: true, costCodeId: true, request: { select: { title: true } } } }),
      prisma.payment.findMany({ where: { projectId: params.projectId }, select: { id: true, title: true, direction: true, costCodeId: true } }),
      prisma.projectChangeOrderItem.findMany({ where: { changeOrder: { projectId: params.projectId } }, select: { id: true, description: true, budgetItemId: true, costCodeId: true, changeOrder: { select: { number: true } } } })
    ]);
    return NextResponse.json({
      items: codes.map(serializeCostCode),
      coverage: costCodeCoverage({ codes, budgetItems, scheduleItems, materials, procurementItems, payments, changeOrderItems }),
      entities: {
        budget: budgetItems.map((item) => ({ id: item.id, label: `${item.code} · ${item.name}`, detail: item.section, costCodeId: item.costCodeId })),
        schedule: scheduleItems.map((item) => ({ id: item.id, label: item.name, detail: "График", costCodeId: item.costCodeId })),
        materials: materials.map((item) => ({ id: item.id, label: item.name, detail: "Материал", costCodeId: item.costCodeId })),
        procurement: procurementItems.map((item) => ({ id: item.id, label: item.name, detail: item.request.title, costCodeId: item.costCodeId })),
        payments: payments.map((item) => ({ id: item.id, label: item.title, detail: item.direction === "incoming" ? "Поступление" : "Расход", costCodeId: item.costCodeId })),
        changes: changeOrderItems.map((item) => ({ id: item.id, label: `${item.changeOrder.number} · ${item.description}`, detail: "Изменение", costCodeId: item.costCodeId }))
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Cost codes request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = costCodeCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const parent = data.parentId ? await prisma.projectCostCode.findFirst({ where: { id: data.parentId, projectId: params.projectId } }) : null;
    if (data.parentId && !parent) return NextResponse.json({ error: "Parent cost code not found" }, { status: 404 });
    if (parent && !data.code.startsWith(`${parent.code}.`)) return NextResponse.json({ error: "Child code must extend the parent code" }, { status: 409 });
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.projectCostCode.create({ data: {
        organizationId: project.organizationId, projectId: params.projectId, parentId: parent?.id ?? null,
        code: data.code, name: data.name, description: data.description || null, segment: data.segment,
        costType: data.costType, status: data.status, source: "manual", createdBy: user?.authenticated ? user.id : null
      } });
      await writeAudit(tx, {
        organizationId: project.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "cost_code", entityId: created.id,
        action: "create", summary: `Создан код затрат ${created.code}: ${created.name}`, after: serializeCostCode(created)
      });
      return created;
    });
    return NextResponse.json({ item: serializeCostCode(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Cost code already exists" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid cost code" }, { status: 400 });
    return NextResponse.json({ error: "Cost code create failed" }, { status: 500 });
  }
}
