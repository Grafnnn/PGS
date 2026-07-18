import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { changeOrderActionSchema, changeOrderAmounts, changeOrderUpdateSchema, resolveChangeOrderTransition, serializeChangeOrder } from "@/lib/change-order-management";
import { prisma } from "@/lib/prisma";
import { dueDateFrom } from "@/lib/project-workflows";

type Params = { projectId: string; changeOrderId: string };
const include = {
  items: { orderBy: { sequence: "asc" as const } },
  linkedDocument: { select: { title: true, fileName: true } },
  approvalWorkflowRun: { select: { id: true, title: true, status: true } }
};

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await prisma.projectChangeOrder.findFirst({ where: { id: params.changeOrderId, projectId: params.projectId }, include });
    if (!current) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    if ("action" in raw) return applyAction(raw, current, role, user);

    if (!["draft", "open", "revision_required"].includes(current.status)) return NextResponse.json({ error: "Only draft, open or revision-required change orders can be edited" }, { status: 409 });
    const data = changeOrderUpdateSchema.parse(raw);
    const linkedDocument = data.linkedDocumentId !== undefined && data.linkedDocumentId
      ? await prisma.document.findFirst({ where: { id: data.linkedDocumentId, projectId: params.projectId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } })
      : null;
    if (data.linkedDocumentId && !linkedDocument) return NextResponse.json({ error: "Linked document not found" }, { status: 404 });
    const nextLines = data.items ?? current.items;
    const budgetIds = [...new Set(nextLines.map((line) => line.budgetItemId).filter(Boolean))] as string[];
    const budgetCostCodeById = new Map<string, string | null>();
    if (budgetIds.length) {
      const valid = await prisma.budgetItem.findMany({ where: { projectId: params.projectId, id: { in: budgetIds } }, select: { id: true, costCodeId: true } });
      if (valid.length !== budgetIds.length) return NextResponse.json({ error: "Budget item does not belong to project" }, { status: 409 });
      valid.forEach((item) => budgetCostCodeById.set(item.id, item.costCodeId));
    }
    const totals = changeOrderAmounts(nextLines);
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectChangeOrder.update({
        where: { id: current.id },
        data: {
          kind: data.kind, scope: data.scope, title: data.title, description: data.description === undefined ? undefined : data.description || null,
          reason: data.reason === undefined ? undefined : data.reason || null, sourceType: data.sourceType === undefined ? undefined : data.sourceType || null,
          sourceRef: data.sourceRef === undefined ? undefined : data.sourceRef || null, counterparty: data.counterparty === undefined ? undefined : data.counterparty || null,
          scheduleImpactDays: data.scheduleImpactDays, dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
          linkedDocumentId: data.linkedDocumentId === undefined ? undefined : linkedDocument?.id ?? null,
          linkedDocumentVersion: data.linkedDocumentId === undefined ? undefined : linkedDocument?.version ?? null,
          linkedDocumentVersionId: data.linkedDocumentId === undefined ? undefined : linkedDocument?.versions[0]?.id ?? null,
          estimatedAmount: totals.estimated, proposedAmount: totals.proposed, submittedAmount: totals.submitted,
          items: data.items ? { deleteMany: {}, create: data.items.map((line, index) => ({
            sequence: index + 1, budgetItemId: line.budgetItemId || null,
            costCodeId: line.budgetItemId ? budgetCostCodeById.get(line.budgetItemId) ?? null : null,
            code: line.code || null, description: line.description, quantity: line.quantity, unit: line.unit,
            estimatedUnitPrice: line.estimatedUnitPrice, proposedUnitPrice: line.proposedUnitPrice, submittedUnitPrice: line.submittedUnitPrice
          })) } : undefined
        },
        include
      });
      await writeAudit(tx, { organizationId: current.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "change_order", entityId: current.id, action: "update", summary: `Обновлено изменение ${current.number}: ${item.title}`, before: serializeChangeOrder(current), after: serializeChangeOrder(item) });
      return item;
    });
    return NextResponse.json({ item: serializeChangeOrder(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid change order update" }, { status: 400 });
    return NextResponse.json({ error: "Change order update failed" }, { status: 500 });
  }
}

async function applyAction(raw: Record<string, unknown>, current: any, role: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  try {
    const data = changeOrderActionSchema.parse(raw);
    const isAdmin = role === "OWNER" || role === "ADMIN";
    if (["request_revision", "approve", "reject", "execute", "void"].includes(data.action) && !isAdmin) return NextResponse.json({ error: "Owner or administrator decision is required" }, { status: 403 });
    if (["request_revision", "reject", "void"].includes(data.action) && !data.comment) return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });
    if (data.action === "request_revision" && current.approvalWorkflowRunId) return NextResponse.json({ error: "Use the linked approval workflow to request revision" }, { status: 409 });
    if (data.action === "reject" && current.approvalWorkflowRun && current.approvalWorkflowRun.status !== "rejected") return NextResponse.json({ error: "Linked approval workflow is not rejected" }, { status: 409 });
    const nextStatus = resolveChangeOrderTransition(current.status, data.action);
    const totals = changeOrderAmounts(current.items);
    if (data.action === "submit" && (!current.items.length || totals.submitted <= 0)) return NextResponse.json({ error: "At least one priced cost item is required before submission" }, { status: 409 });
    if (data.action === "submit" && !current.linkedDocumentId && !current.reason) return NextResponse.json({ error: "Evidence document or reason is required before submission" }, { status: 409 });
    if (data.action === "submit" && current.approvalWorkflowRunId) return NextResponse.json({ error: "Approval workflow is already linked" }, { status: 409 });
    if (data.action === "approve" && current.approvalWorkflowRun && current.approvalWorkflowRun.status !== "approved") return NextResponse.json({ error: "Linked approval workflow is not approved" }, { status: 409 });
    const template = data.action === "submit" && data.workflowTemplateId
      ? await prisma.projectWorkflowTemplate.findFirst({ where: { id: data.workflowTemplateId, projectId: current.projectId, status: "active" }, include: { steps: { orderBy: { sequence: "asc" } } } })
      : null;
    if (data.workflowTemplateId && !template) return NextResponse.json({ error: "Active workflow template not found" }, { status: 404 });
    if (template && !template.steps.length) return NextResponse.json({ error: "Workflow template has no steps" }, { status: 409 });
    const now = new Date();
    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.projectChangeOrder.updateMany({ where: { id: current.id, status: current.status, updatedAt: current.updatedAt }, data: { updatedAt: now } });
      if (claim.count !== 1) throw new Error("Change order action was already handled");
      let workflowRunId: string | null | undefined;
      if (template) {
        const run = await tx.projectWorkflowRun.create({
          data: {
            organizationId: current.organizationId, projectId: current.projectId, templateId: template.id,
            title: `${current.number}: ${current.title}`, description: current.description, sourceModule: "change_orders", targetTab: "Бюджет / ВОР",
            referenceType: "change_order", referenceId: current.id, startedBy: user?.authenticated ? user.id : null,
            steps: { create: template.steps.map((step: any, index: number) => ({ templateStepId: step.id, sequence: step.sequence, name: step.name, description: step.description, stepType: step.stepType, assigneeRole: step.assigneeRole, dueDays: step.dueDays, status: index === 0 ? "active" : "pending", dueAt: index === 0 ? dueDateFrom(now, step.dueDays) : null })) }
          }
        });
        workflowRunId = run.id;
      }
      if (data.action === "approve") await Promise.all(current.items.map((line: any) => tx.projectChangeOrderItem.update({ where: { id: line.id }, data: { approvedUnitPrice: line.submittedUnitPrice } })));
      if (data.action === "execute") await Promise.all(current.items.map((line: any) => tx.projectChangeOrderItem.update({ where: { id: line.id }, data: { committedUnitPrice: line.approvedUnitPrice } })));
      const item = await tx.projectChangeOrder.update({
        where: { id: current.id },
        data: {
          status: nextStatus, decisionComment: data.comment || (data.action === "open" ? null : undefined), approvalWorkflowRunId: workflowRunId,
          submittedAt: data.action === "submit" ? now : undefined, approvedAt: data.action === "approve" ? now : undefined,
          executedAt: data.action === "execute" ? now : undefined, rejectedAt: data.action === "reject" ? now : undefined, voidedAt: data.action === "void" ? now : undefined,
          approvedAmount: data.action === "approve" ? totals.submitted : undefined, committedAmount: data.action === "execute" ? Number(current.approvedAmount) : undefined
        }, include
      });
      await writeAudit(tx, { organizationId: current.organizationId, projectId: current.projectId, actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "change_order", entityId: current.id, action: data.action === "approve" ? "accept" : "update", summary: `${current.number}: ${data.action}${data.comment ? ` — ${data.comment}` : ""}`, before: serializeChangeOrder(current), after: serializeChangeOrder(item) });
      return item;
    });
    return NextResponse.json({ item: serializeChangeOrder(updated) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid change order action" }, { status: 400 });
    if (error instanceof Error && /Change order action|Action /.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectChangeOrder.findFirst({ where: { id: params.changeOrderId, projectId: params.projectId }, include });
    if (!current) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    if (current.status !== "draft" || current.approvalWorkflowRunId) return NextResponse.json({ error: "Only an unsubmitted draft can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectChangeOrder.delete({ where: { id: current.id } });
      await writeAudit(tx, { organizationId: current.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "change_order", entityId: current.id, action: "delete", summary: `Удален черновик ${current.number}: ${current.title}`, before: serializeChangeOrder(current) });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Change order delete failed" }, { status: 500 });
  }
}
