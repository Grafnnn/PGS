import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { commitmentActionSchema, commitmentOriginalAmount, commitmentUpdateSchema, normalizeCommitmentLine, resolveCommitmentTransition, serializeCommitment } from "@/lib/contract-commitments";
import { commitmentInclude, resolveCommitmentLineReferences } from "@/lib/contract-commitments-db";
import { prisma } from "@/lib/prisma";
import { dueDateFrom } from "@/lib/project-workflows";

type Params = { projectId: string; commitmentId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await prisma.projectCommitment.findFirst({ where: { id: params.commitmentId, projectId: params.projectId }, include: commitmentInclude });
    if (!current) return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    if ("action" in raw) return applyAction(raw, current, role, user);
    if (!["draft", "revision_required"].includes(current.status)) return NextResponse.json({ error: "Only draft or revision-required commitments can be edited" }, { status: 409 });
    if (current.paymentApplications.length) return NextResponse.json({ error: "Commitment with payment applications cannot be edited" }, { status: 409 });

    const data = commitmentUpdateSchema.parse(raw);
    if (data.startsAt && data.endsAt && new Date(data.startsAt) > new Date(data.endsAt)) return NextResponse.json({ error: "End date must not precede start date" }, { status: 400 });
    const sourceRequest = data.sourceProcurementRequestId
      ? await prisma.procurementRequest.findFirst({ where: { id: data.sourceProcurementRequestId, projectId: params.projectId } })
      : null;
    if (data.sourceProcurementRequestId && !sourceRequest) return NextResponse.json({ error: "Procurement request not found" }, { status: 404 });
    const linkedDocument = data.linkedDocumentId
      ? await prisma.document.findFirst({ where: { id: data.linkedDocumentId, projectId: params.projectId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } })
      : null;
    if (data.linkedDocumentId && !linkedDocument) return NextResponse.json({ error: "Linked document not found" }, { status: 404 });
    const references = data.lines ? await resolveCommitmentLineReferences(params.projectId, data.lines) : null;
    if (references?.error) return NextResponse.json({ error: references.error }, { status: 409 });
    const lines = data.lines?.map(normalizeCommitmentLine);

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectCommitment.update({
        where: { id: current.id },
        data: {
          type: data.type,
          title: data.title,
          counterparty: data.counterparty,
          externalNumber: data.externalNumber === undefined ? undefined : data.externalNumber || null,
          retentionPercent: data.retentionPercent,
          paymentTerms: data.paymentTerms === undefined ? undefined : data.paymentTerms || null,
          startsAt: data.startsAt === undefined ? undefined : data.startsAt ? new Date(data.startsAt) : null,
          endsAt: data.endsAt === undefined ? undefined : data.endsAt ? new Date(data.endsAt) : null,
          sourceProcurementRequestId: data.sourceProcurementRequestId === undefined ? undefined : sourceRequest?.id ?? null,
          linkedDocumentId: data.linkedDocumentId === undefined ? undefined : linkedDocument?.id ?? null,
          linkedDocumentVersion: data.linkedDocumentId === undefined ? undefined : linkedDocument?.version ?? null,
          linkedDocumentVersionId: data.linkedDocumentId === undefined ? undefined : linkedDocument?.versions[0]?.id ?? null,
          lines: lines ? {
            deleteMany: {},
            create: lines.map((line, index) => ({
              sequence: index + 1,
              budgetItemId: line.budgetItemId || null,
              costCodeId: line.costCodeId || references?.budgetCostCodes.get(line.budgetItemId) || references?.procurementCostCodes.get(line.sourceProcurementRequestItemId) || null,
              sourceProcurementRequestItemId: line.sourceProcurementRequestItemId || null,
              code: line.code || null,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              scheduledValue: line.scheduledValue
            }))
          } : undefined
        },
        include: commitmentInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "commitment",
        entityId: current.id,
        action: "update",
        summary: `Обновлено обязательство ${current.number}: ${item.title}`,
        before: serializeCommitment(current),
        after: serializeCommitment(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeCommitment(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid commitment update" }, { status: 400 });
    return NextResponse.json({ error: "Commitment update failed" }, { status: 500 });
  }
}

async function applyAction(raw: Record<string, unknown>, current: any, role: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  const data = commitmentActionSchema.parse(raw);
  const isAdmin = role === "OWNER" || role === "ADMIN";
  if (["request_revision", "approve", "reject", "activate", "complete", "terminate", "void", "link_change_order", "unlink_change_order"].includes(data.action) && !isAdmin) {
    return NextResponse.json({ error: "Owner or administrator decision is required" }, { status: 403 });
  }
  if (["request_revision", "reject", "terminate", "void"].includes(data.action) && !data.comment) return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });

  if (data.action === "link_change_order" || data.action === "unlink_change_order") {
    if (!data.changeOrderId) return NextResponse.json({ error: "Change order is required" }, { status: 400 });
    const changeOrder = await prisma.projectChangeOrder.findFirst({ where: { id: data.changeOrderId, projectId: current.projectId } });
    if (!changeOrder) return NextResponse.json({ error: "Change order not found" }, { status: 404 });
    if (data.action === "link_change_order" && !["approved", "active", "completed"].includes(current.status)) return NextResponse.json({ error: "Approve the commitment before linking a change order" }, { status: 409 });
    if (data.action === "link_change_order" && !["approved", "executed"].includes(changeOrder.status)) return NextResponse.json({ error: "Only approved or executed change orders can be linked" }, { status: 409 });
    if (data.action === "link_change_order" && changeOrder.commitmentId && changeOrder.commitmentId !== current.id) return NextResponse.json({ error: "Change order is already linked to another commitment" }, { status: 409 });
    if (data.action === "unlink_change_order" && changeOrder.commitmentId !== current.id) return NextResponse.json({ error: "Change order is not linked to this commitment" }, { status: 409 });
    const updated = await prisma.$transaction(async (tx) => {
      await tx.projectChangeOrder.update({ where: { id: changeOrder.id }, data: { commitmentId: data.action === "link_change_order" ? current.id : null } });
      const item = await tx.projectCommitment.findUniqueOrThrow({ where: { id: current.id }, include: commitmentInclude });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "commitment",
        entityId: current.id,
        action: "update",
        summary: `${current.number}: ${data.action === "link_change_order" ? "привязано" : "отвязано"} изменение ${changeOrder.number}`,
        before: serializeCommitment(current),
        after: serializeCommitment(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeCommitment(updated) });
  }

  if (data.action === "request_revision" && current.approvalWorkflowRunId) return NextResponse.json({ error: "Use the linked approval workflow to request revision" }, { status: 409 });
  if (data.action === "reject" && current.approvalWorkflowRun && current.approvalWorkflowRun.status !== "rejected") return NextResponse.json({ error: "Linked approval workflow is not rejected" }, { status: 409 });
  if (data.action === "approve" && current.approvalWorkflowRun && current.approvalWorkflowRun.status !== "approved") return NextResponse.json({ error: "Linked approval workflow is not approved" }, { status: 409 });
  if (data.action === "submit" && current.approvalWorkflowRunId) return NextResponse.json({ error: "Approval workflow is already linked" }, { status: 409 });
  const nextStatus = resolveCommitmentTransition(current.status, data.action);
  const originalAmount = commitmentOriginalAmount(current.lines);
  if (data.action === "submit" && (!current.lines.length || originalAmount <= 0)) return NextResponse.json({ error: "At least one priced SOV line is required before submission" }, { status: 409 });
  if (data.action === "submit" && !current.counterparty) return NextResponse.json({ error: "Counterparty is required before submission" }, { status: 409 });
  if (data.action === "submit" && !current.linkedDocumentId && !current.externalNumber && !current.paymentTerms) return NextResponse.json({ error: "Contract document, external number or payment terms are required before submission" }, { status: 409 });
  if (data.action === "complete" && current.paymentApplications.some((application: any) => application.status === "draft" || application.status === "submitted")) return NextResponse.json({ error: "Resolve open payment applications before completion" }, { status: 409 });

  const template = data.action === "submit" && data.workflowTemplateId
    ? await prisma.projectWorkflowTemplate.findFirst({ where: { id: data.workflowTemplateId, projectId: current.projectId, status: "active" }, include: { steps: { orderBy: { sequence: "asc" } } } })
    : null;
  if (data.workflowTemplateId && !template) return NextResponse.json({ error: "Active workflow template not found" }, { status: 404 });
  if (template && !template.steps.length) return NextResponse.json({ error: "Workflow template has no steps" }, { status: 409 });

  const now = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const claim = await tx.projectCommitment.updateMany({ where: { id: current.id, status: current.status, updatedAt: current.updatedAt }, data: { updatedAt: now } });
    if (claim.count !== 1) throw new Error("Commitment action was already handled");
    let workflowRunId: string | null | undefined;
    if (template) {
      const run = await tx.projectWorkflowRun.create({
        data: {
          organizationId: current.organizationId,
          projectId: current.projectId,
          templateId: template.id,
          title: `${current.number}: ${current.title}`,
          description: `${current.counterparty} · ${originalAmount.toLocaleString("ru-RU")} ₽`,
          sourceModule: "commitments",
          targetTab: "Договор / Тендер",
          referenceType: "commitment",
          referenceId: current.id,
          startedBy: user?.authenticated ? user.id : null,
          steps: {
            create: template.steps.map((step: any, index: number) => ({
              templateStepId: step.id,
              sequence: step.sequence,
              name: step.name,
              description: step.description,
              stepType: step.stepType,
              assigneeRole: step.assigneeRole,
              dueDays: step.dueDays,
              status: index === 0 ? "active" : "pending",
              dueAt: index === 0 ? dueDateFrom(now, step.dueDays) : null
            }))
          }
        }
      });
      workflowRunId = run.id;
    }
    const item = await tx.projectCommitment.update({
      where: { id: current.id },
      data: {
        status: nextStatus,
        decisionComment: data.comment || undefined,
        approvalWorkflowRunId: workflowRunId,
        submittedAt: data.action === "submit" ? now : undefined,
        approvedAt: data.action === "approve" ? now : undefined,
        activatedAt: data.action === "activate" ? now : undefined,
        completedAt: data.action === "complete" ? now : undefined,
        terminatedAt: data.action === "terminate" ? now : undefined,
        rejectedAt: data.action === "reject" ? now : undefined,
        voidedAt: data.action === "void" ? now : undefined
      },
      include: commitmentInclude
    });
    await writeAudit(tx, {
      organizationId: current.organizationId,
      projectId: current.projectId,
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "local-user",
      actorEmail: user?.email ?? null,
      entity: "commitment",
      entityId: current.id,
      action: data.action === "approve" ? "accept" : "update",
      summary: `${current.number}: ${data.action}${data.comment ? ` — ${data.comment}` : ""}`,
      before: serializeCommitment(current),
      after: serializeCommitment(item)
    });
    return item;
  });
  return NextResponse.json({ item: serializeCommitment(updated) });
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectCommitment.findFirst({ where: { id: params.commitmentId, projectId: params.projectId }, include: commitmentInclude });
    if (!current) return NextResponse.json({ error: "Commitment not found" }, { status: 404 });
    if (current.status !== "draft" || current.approvalWorkflowRunId || current.paymentApplications.length || current.changeOrders.length) {
      return NextResponse.json({ error: "Only an unsubmitted, unused draft can be deleted" }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.projectCommitment.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "commitment",
        entityId: current.id,
        action: "delete",
        summary: `Удален черновик ${current.number}: ${current.title}`,
        before: serializeCommitment(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Commitment delete failed" }, { status: 500 });
  }
}
