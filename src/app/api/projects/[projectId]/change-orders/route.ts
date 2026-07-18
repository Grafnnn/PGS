import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { changeOrderAmounts, changeOrderCreateSchema, changeOrderSummary, serializeChangeOrder } from "@/lib/change-order-management";
import { prisma } from "@/lib/prisma";

const include = {
  items: { orderBy: { sequence: "asc" as const } },
  linkedDocument: { select: { title: true, fileName: true } },
  approvalWorkflowRun: { select: { id: true, title: true, status: true } }
};

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const items = await prisma.projectChangeOrder.findMany({ where: { projectId: params.projectId }, include, orderBy: [{ status: "asc" }, { updatedAt: "desc" }] });
    return NextResponse.json({ items: items.map(serializeChangeOrder), summary: changeOrderSummary(items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Change orders request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = changeOrderCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const linkedDocument = data.linkedDocumentId ? await prisma.document.findFirst({ where: { id: data.linkedDocumentId, projectId: params.projectId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } }) : null;
    if (data.linkedDocumentId && !linkedDocument) return NextResponse.json({ error: "Linked document not found" }, { status: 404 });
    const budgetIds = [...new Set(data.items.map((item) => item.budgetItemId).filter(Boolean))];
    const budgetCostCodeById = new Map<string, string | null>();
    if (budgetIds.length) {
      const validBudgetItems = await prisma.budgetItem.findMany({ where: { projectId: params.projectId, id: { in: budgetIds } }, select: { id: true, costCodeId: true } });
      if (validBudgetItems.length !== budgetIds.length) return NextResponse.json({ error: "Budget item does not belong to project" }, { status: 409 });
      validBudgetItems.forEach((item) => budgetCostCodeById.set(item.id, item.costCodeId));
    }
    const totals = changeOrderAmounts(data.items);
    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectChangeOrder.findFirst({ where: { projectId: params.projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const sequence = (latest?.sequence ?? 0) + 1;
      const created = await tx.projectChangeOrder.create({
        data: {
          organizationId: project.organizationId, projectId: params.projectId, sequence, number: `CHG-${String(sequence).padStart(3, "0")}`,
          kind: data.kind, scope: data.scope, title: data.title, description: data.description || null, reason: data.reason || null,
          sourceType: data.sourceType || null, sourceRef: data.sourceRef || null, counterparty: data.counterparty || null,
          scheduleImpactDays: data.scheduleImpactDays, linkedDocumentId: linkedDocument?.id ?? null, linkedDocumentVersion: linkedDocument?.version ?? null,
          linkedDocumentVersionId: linkedDocument?.versions[0]?.id ?? null, dueAt: data.dueAt ? new Date(data.dueAt) : null,
          estimatedAmount: totals.estimated, proposedAmount: totals.proposed, submittedAmount: totals.submitted,
          createdBy: user?.authenticated ? user.id : null,
          items: { create: data.items.map((line, index) => ({
            sequence: index + 1, budgetItemId: line.budgetItemId || null,
            costCodeId: line.budgetItemId ? budgetCostCodeById.get(line.budgetItemId) ?? null : null,
            code: line.code || null, description: line.description, quantity: line.quantity, unit: line.unit,
            estimatedUnitPrice: line.estimatedUnitPrice, proposedUnitPrice: line.proposedUnitPrice, submittedUnitPrice: line.submittedUnitPrice
          })) }
        },
        include
      });
      await writeAudit(tx, { organizationId: project.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "change_order", entityId: created.id, action: "create", summary: `Создано изменение ${created.number}: ${created.title}`, after: serializeChangeOrder(created) });
      return created;
    });
    return NextResponse.json({ item: serializeChangeOrder(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Change order sequence conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid change order" }, { status: 400 });
    return NextResponse.json({ error: "Change order create failed" }, { status: 500 });
  }
}
