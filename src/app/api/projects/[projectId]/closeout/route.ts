import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject, getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  buildCloseoutBootstrapChecklist,
  canTransitionCloseoutPackage,
  canTransitionWarranty,
  closeoutMutationSchema
} from "@/lib/project-closeout";
import { loadProjectCloseout } from "@/lib/project-closeout-db";
import { prisma } from "@/lib/prisma";

function dateValue(value: string | null | undefined) {
  return value ? new Date(value) : null;
}

function actor(user: Awaited<ReturnType<typeof getCurrentUser>>) {
  return {
    actorId: user?.authenticated ? user.id : null,
    actorName: user?.name ?? "local-user",
    actorEmail: user?.email ?? null
  };
}

async function responsePayload(projectId: string) {
  const payload = await loadProjectCloseout(projectId);
  return payload
    ? NextResponse.json(payload)
    : NextResponse.json({ error: "Project not found" }, { status: 404 });
}

async function projectContext(projectId: string) {
  return prisma.project.findUnique({
    where: { id: projectId },
    select: {
      id: true,
      organizationId: true,
      status: true,
      endsAt: true,
      documents: { select: { id: true, title: true, category: true, fileName: true } },
      qualityIssues: {
        where: { acceptanceBlocker: true, status: { notIn: ["closed", "voided"] } },
        select: { id: true }
      }
    }
  });
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    return await responsePayload(params.projectId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "Closeout request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = closeoutMutationSchema.parse(await request.json().catch(() => ({})));
    const project = await projectContext(params.projectId);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const role = await getEffectiveProjectRole(user, params.projectId);
    const canApprove = role === "OWNER" || role === "ADMIN";
    const auditActor = actor(user);

    if (data.action === "bootstrap") {
      const existing = await prisma.projectCloseoutPackage.count({ where: { projectId: params.projectId } });
      if (!existing) {
        const checklist = buildCloseoutBootstrapChecklist(project.documents, project.qualityIssues.length);
        await prisma.$transaction(async (tx) => {
          const created = await tx.projectCloseoutPackage.create({
            data: {
              organizationId: project.organizationId,
              projectId: params.projectId,
              sequence: 1,
              number: "CLS-001",
              title: "Итоговая сдача проекта",
              scope: "Финальный комплект по договору, выполненным работам, качеству, КС и передаче заказчику.",
              status: "in_progress",
              responsibleParty: user?.name ?? null,
              dueAt: project.endsAt,
              createdBy: user?.authenticated ? user.id : null,
              checklistItems: { create: checklist }
            }
          });
          const warranty = await tx.projectWarrantyObligation.create({
            data: {
              organizationId: project.organizationId,
              projectId: params.projectId,
              packageId: created.id,
              sequence: 1,
              number: "WAR-001",
              title: "Гарантийные обязательства по договору",
              category: "workmanship",
              status: "draft",
              responsibleParty: user?.name ?? null,
              notes: "Срок, удержание и условия должны быть подтверждены по договору; автоматические значения не подставлены.",
              createdBy: user?.authenticated ? user.id : null
            }
          });
          await writeAudit(tx, {
            organizationId: project.organizationId,
            projectId: params.projectId,
            ...auditActor,
            entity: "project_closeout",
            entityId: created.id,
            action: "create",
            summary: "Сформирован стартовый контур сдачи и гарантии",
            after: { packageId: created.id, warrantyId: warranty.id, checklistItems: checklist.length }
          });
        });
      }
      return responsePayload(params.projectId);
    }

    if (data.action === "create_package") {
      const checklist = buildCloseoutBootstrapChecklist(project.documents, project.qualityIssues.length);
      await prisma.$transaction(async (tx) => {
        const latest = await tx.projectCloseoutPackage.findFirst({
          where: { projectId: params.projectId },
          orderBy: { sequence: "desc" },
          select: { sequence: true }
        });
        const sequence = (latest?.sequence ?? 0) + 1;
        const created = await tx.projectCloseoutPackage.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            sequence,
            number: `CLS-${String(sequence).padStart(3, "0")}`,
            title: data.title,
            scope: data.scope ?? null,
            status: "draft",
            responsibleParty: data.responsibleParty ?? null,
            dueAt: dateValue(data.dueAt),
            notes: data.notes ?? null,
            createdBy: user?.authenticated ? user.id : null,
            checklistItems: { create: checklist }
          }
        });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_closeout_package",
          entityId: created.id,
          action: "create",
          summary: `Создан пакет сдачи ${created.number}: ${created.title}`,
          after: created
        });
      });
      return responsePayload(params.projectId);
    }

    if (data.action === "update_package") {
      const current = await prisma.projectCloseoutPackage.findFirst({
        where: { id: data.id, projectId: params.projectId },
        include: { checklistItems: true }
      });
      if (!current) return NextResponse.json({ error: "Closeout package not found" }, { status: 404 });
      if (data.status && !canTransitionCloseoutPackage(current.status, data.status)) {
        return NextResponse.json({ error: `Invalid closeout transition: ${current.status} -> ${data.status}` }, { status: 409 });
      }
      if (data.status && ["accepted", "rejected", "closed"].includes(data.status) && !canApprove) {
        return NextResponse.json({ error: "Owner or admin approval is required" }, { status: 403 });
      }
      if (data.transmittalId) {
        const transmittal = await prisma.projectDocumentTransmittal.findFirst({
          where: { id: data.transmittalId, projectId: params.projectId },
          select: { id: true }
        });
        if (!transmittal) return NextResponse.json({ error: "Transmittal does not belong to this project" }, { status: 409 });
      }
      if (data.status === "submitted" || data.status === "accepted" || data.status === "closed") {
        const payload = await loadProjectCloseout(params.projectId);
        const effectivePackage = payload?.packages.find((item) => item.id === current.id);
        const remainingItemCount = effectivePackage?.checklistItems.filter((item) =>
          item.required && item.status !== "completed" && item.status !== "not_applicable"
        ).length ?? current.checklistItems.length;
        if (remainingItemCount || project.qualityIssues.length) {
          return NextResponse.json({
            error: "Closeout package still has required blockers",
            blockers: remainingItemCount + project.qualityIssues.length
          }, { status: 409 });
        }
      }
      const update: Prisma.ProjectCloseoutPackageUpdateInput = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.scope !== undefined) update.scope = data.scope;
      if (data.responsibleParty !== undefined) update.responsibleParty = data.responsibleParty;
      if (data.dueAt !== undefined) update.dueAt = dateValue(data.dueAt);
      if (data.handoverAt !== undefined) update.handoverAt = dateValue(data.handoverAt);
      if (data.transmittalId !== undefined) {
        update.transmittal = data.transmittalId ? { connect: { id: data.transmittalId } } : { disconnect: true };
      }
      if (data.decisionComment !== undefined) update.decisionComment = data.decisionComment;
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.status !== undefined) {
        update.status = data.status;
        if (data.status === "submitted") update.submittedAt = new Date();
        if (data.status === "accepted") update.acceptedAt = new Date();
        if (data.status === "closed") update.closedAt = new Date();
        if (data.status === "in_progress") {
          update.submittedAt = null;
          update.acceptedAt = null;
          update.closedAt = null;
        }
      }
      await prisma.$transaction(async (tx) => {
        const updated = await tx.projectCloseoutPackage.update({ where: { id: current.id }, data: update });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_closeout_package",
          entityId: current.id,
          action: data.status === "accepted" ? "accept" : "update",
          summary: `Обновлен пакет сдачи ${current.number}${data.status ? `: ${data.status}` : ""}`,
          before: current,
          after: updated
        });
      });
      return responsePayload(params.projectId);
    }

    if (data.action === "update_checklist_item") {
      const current = await prisma.projectCloseoutChecklistItem.findFirst({
        where: { id: data.id, package: { projectId: params.projectId } },
        include: {
          package: {
            select: {
              id: true,
              number: true,
              transmittalId: true,
              handoverAt: true,
              transmittal: { select: { status: true } }
            }
          }
        }
      });
      if (!current) return NextResponse.json({ error: "Checklist item not found" }, { status: 404 });
      const documentId = data.documentId === undefined ? current.documentId : data.documentId;
      if (documentId) {
        const document = await prisma.document.findFirst({ where: { id: documentId, projectId: params.projectId }, select: { id: true } });
        if (!document) return NextResponse.json({ error: "Document does not belong to this project" }, { status: 409 });
      }
      if (data.status === "completed" && current.sourceType === "document_requirement" && !documentId) {
        return NextResponse.json({ error: "A project document is required to complete this item" }, { status: 409 });
      }
      if (data.status === "completed" && current.sourceType === "quality_gate" && project.qualityIssues.length) {
        return NextResponse.json({ error: "Open acceptance-blocking quality issues must be closed first" }, { status: 409 });
      }
      if (
        data.status === "completed"
        && current.sourceType === "transmittal_gate"
        && (
          !current.package.transmittalId
          || !current.package.handoverAt
          || !current.package.transmittal
          || !["issued", "acknowledged", "approved", "closed"].includes(current.package.transmittal.status)
        )
      ) {
        return NextResponse.json({
          error: "An issued project transmittal and handover date are required to complete this item"
        }, { status: 409 });
      }
      if (data.status === "completed" && current.sourceType === "warranty_gate") {
        const warrantyCandidates = await prisma.projectWarrantyObligation.findMany({
          where: {
            projectId: params.projectId,
            OR: [{ packageId: current.package.id }, { packageId: null }],
            startsAt: { not: null },
            endsAt: { not: null }
          },
          select: { sourceDocumentId: true, terms: true }
        });
        if (!warrantyCandidates.some((item) => item.sourceDocumentId || item.terms?.trim())) {
          return NextResponse.json({
            error: "Confirmed warranty dates and contractual evidence are required to complete this item"
          }, { status: 409 });
        }
      }
      await prisma.$transaction(async (tx) => {
        const updated = await tx.projectCloseoutChecklistItem.update({
          where: { id: current.id },
          data: {
            status: data.status,
            documentId,
            notes: data.notes === undefined ? current.notes : data.notes,
            confirmedBy: data.status === "completed" || data.status === "not_applicable" ? user?.name ?? "local-user" : null,
            confirmedAt: data.status === "completed" || data.status === "not_applicable" ? new Date() : null
          }
        });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_closeout_checklist_item",
          entityId: current.id,
          action: "update",
          summary: `Checklist ${current.package.number}: ${current.title} -> ${data.status}`,
          before: current,
          after: updated
        });
      });
      return responsePayload(params.projectId);
    }

    if (data.action === "create_warranty") {
      if (data.startsAt && data.endsAt && new Date(data.endsAt) <= new Date(data.startsAt)) {
        return NextResponse.json({ error: "Warranty end date must be after start date" }, { status: 409 });
      }
      if (data.packageId) {
        const closeoutPackage = await prisma.projectCloseoutPackage.findFirst({
          where: { id: data.packageId, projectId: params.projectId },
          select: { id: true }
        });
        if (!closeoutPackage) return NextResponse.json({ error: "Closeout package does not belong to this project" }, { status: 409 });
      }
      if (data.sourceDocumentId) {
        const sourceDocument = await prisma.document.findFirst({
          where: { id: data.sourceDocumentId, projectId: params.projectId },
          select: { id: true }
        });
        if (!sourceDocument) return NextResponse.json({ error: "Source document does not belong to this project" }, { status: 409 });
      }
      await prisma.$transaction(async (tx) => {
        const latest = await tx.projectWarrantyObligation.findFirst({
          where: { projectId: params.projectId },
          orderBy: { sequence: "desc" },
          select: { sequence: true }
        });
        const sequence = (latest?.sequence ?? 0) + 1;
        const created = await tx.projectWarrantyObligation.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            packageId: data.packageId ?? null,
            sequence,
            number: `WAR-${String(sequence).padStart(3, "0")}`,
            title: data.title,
            category: data.category,
            status: "draft",
            counterparty: data.counterparty ?? null,
            responsibleParty: data.responsibleParty ?? null,
            startsAt: dateValue(data.startsAt),
            endsAt: dateValue(data.endsAt),
            noticeDays: data.noticeDays,
            retentionAmount: data.retentionAmount,
            retentionReleaseAt: dateValue(data.retentionReleaseAt),
            terms: data.terms ?? null,
            notes: data.notes ?? null,
            sourceDocumentId: data.sourceDocumentId ?? null,
            createdBy: user?.authenticated ? user.id : null
          }
        });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_warranty_obligation",
          entityId: created.id,
          action: "create",
          summary: `Создано гарантийное обязательство ${created.number}: ${created.title}`,
          after: created
        });
      });
      return responsePayload(params.projectId);
    }

    if (data.action === "update_warranty") {
      const current = await prisma.projectWarrantyObligation.findFirst({
        where: { id: data.id, projectId: params.projectId }
      });
      if (!current) return NextResponse.json({ error: "Warranty obligation not found" }, { status: 404 });
      if (data.status && !canTransitionWarranty(current.status, data.status)) {
        return NextResponse.json({ error: `Invalid warranty transition: ${current.status} -> ${data.status}` }, { status: 409 });
      }
      if (data.status === "closed" && !canApprove) {
        return NextResponse.json({ error: "Owner or admin approval is required to close a warranty" }, { status: 403 });
      }
      if (data.sourceDocumentId) {
        const sourceDocument = await prisma.document.findFirst({
          where: { id: data.sourceDocumentId, projectId: params.projectId },
          select: { id: true }
        });
        if (!sourceDocument) return NextResponse.json({ error: "Source document does not belong to this project" }, { status: 409 });
      }
      const startsAt = data.startsAt === undefined ? current.startsAt : dateValue(data.startsAt);
      const endsAt = data.endsAt === undefined ? current.endsAt : dateValue(data.endsAt);
      if (startsAt && endsAt && endsAt <= startsAt) {
        return NextResponse.json({ error: "Warranty end date must be after start date" }, { status: 409 });
      }
      const update: Prisma.ProjectWarrantyObligationUpdateInput = {};
      if (data.title !== undefined) update.title = data.title;
      if (data.category !== undefined) update.category = data.category;
      if (data.status !== undefined) {
        update.status = data.status;
        update.closedAt = data.status === "closed" ? new Date() : null;
      }
      if (data.counterparty !== undefined) update.counterparty = data.counterparty;
      if (data.responsibleParty !== undefined) update.responsibleParty = data.responsibleParty;
      if (data.startsAt !== undefined) update.startsAt = dateValue(data.startsAt);
      if (data.endsAt !== undefined) update.endsAt = dateValue(data.endsAt);
      if (data.noticeDays !== undefined) update.noticeDays = data.noticeDays;
      if (data.retentionAmount !== undefined) update.retentionAmount = data.retentionAmount;
      if (data.retentionReleaseAt !== undefined) update.retentionReleaseAt = dateValue(data.retentionReleaseAt);
      if (data.terms !== undefined) update.terms = data.terms;
      if (data.notes !== undefined) update.notes = data.notes;
      if (data.sourceDocumentId !== undefined) {
        update.sourceDocument = data.sourceDocumentId ? { connect: { id: data.sourceDocumentId } } : { disconnect: true };
      }
      await prisma.$transaction(async (tx) => {
        const updated = await tx.projectWarrantyObligation.update({ where: { id: current.id }, data: update });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...auditActor,
          entity: "project_warranty_obligation",
          entityId: current.id,
          action: "update",
          summary: `Обновлено гарантийное обязательство ${current.number}${data.status ? `: ${data.status}` : ""}`,
          before: current,
          after: updated
        });
      });
      return responsePayload(params.projectId);
    }

    if (!canApprove) return NextResponse.json({ error: "Owner or admin approval is required" }, { status: 403 });
    const payload = await loadProjectCloseout(params.projectId);
    if (!payload) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!payload.summary.canCompleteProject) {
      return NextResponse.json({ error: "Project closeout gates are not complete", summary: payload.summary }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      const updated = await tx.project.update({ where: { id: params.projectId }, data: { status: "completed" } });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        ...auditActor,
        entity: "project",
        entityId: params.projectId,
        action: "accept",
        summary: "Проект переведен в статус completed после закрытия всех closeout gates",
        before: { status: project.status },
        after: { status: updated.status }
      });
    });
    return responsePayload(params.projectId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Closeout sequence conflict; retry" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid closeout request" }, { status: 400 });
    }
    return NextResponse.json({ error: "Closeout update failed" }, { status: 500 });
  }
}
