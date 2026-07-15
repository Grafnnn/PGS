import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  resolveTransmittalTransition,
  serializeTransmittal,
  transmittalUpdateSchema,
  TransmittalConflictError
} from "@/lib/document-transmittals";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; transmittalId: string } };
const includeRegister = { items: true, events: { orderBy: { createdAt: "asc" as const } } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = transmittalUpdateSchema.parse(await request.json().catch(() => ({})));
    if (!Object.keys(data).length) return NextResponse.json({ error: "Transmittal update is empty" }, { status: 409 });
    if (data.action) {
      const allowed = new Set(data.action === "review" ? ["action", "decision", "comment"] : data.action === "acknowledge" ? ["action", "comment"] : data.action === "reissue" ? ["action", "comment"] : ["action"]);
      if (Object.keys(data).some((key) => !allowed.has(key))) return NextResponse.json({ error: "Workflow action cannot modify transmittal fields" }, { status: 409 });
    } else if (data.decision !== undefined || data.comment !== undefined) {
      return NextResponse.json({ error: "Decision or comment requires a workflow action" }, { status: 409 });
    }

    const before = await prisma.projectDocumentTransmittal.findUnique({ where: { id: params.transmittalId }, include: includeRegister });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Document transmittal not found" }, { status: 404 });
    const nextStatus = resolveTransmittalTransition(before.status, data.action, data.decision);
    const nextRecipient = data.recipient === undefined ? before.recipient : data.recipient || null;
    const nextReviewer = data.reviewer === undefined ? before.reviewer : data.reviewer || null;
    const nextDueAt = data.dueAt === undefined ? before.dueAt : data.dueAt ? new Date(data.dueAt) : null;

    const documentIds = data.documentIds === undefined ? before.items.map((item) => item.documentId).filter((id): id is string => Boolean(id)) : [...new Set(data.documentIds)];
    const mustSnapshot = data.action === "issue" || data.action === "reissue";
    const documents = documentIds.length
      ? await prisma.document.findMany({
          where: { projectId: params.projectId, id: { in: documentIds } },
          select: { id: true, title: true, category: true, fileName: true, version: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true, fileName: true } } }
        })
      : [];
    if (documents.length !== documentIds.length) return NextResponse.json({ error: "One or more package documents were not found in this project" }, { status: 400 });
    if (mustSnapshot && (!nextRecipient || !nextReviewer || !nextDueAt || !documentIds.length)) {
      return NextResponse.json({ error: "Recipient, reviewer, due date and at least one document are required before issue" }, { status: 409 });
    }

    const now = new Date();
    const nextRevision = data.action === "reissue" ? before.revision + 1 : before.revision;
    const updated = await prisma.$transaction(async (tx) => {
      if (!data.action && data.documentIds !== undefined) {
        await tx.documentTransmittalItem.deleteMany({ where: { transmittalId: before.id } });
        if (documents.length) await tx.documentTransmittalItem.createMany({ data: documents.map((document) => ({
          transmittalId: before.id,
          documentId: document.id,
          documentVersion: document.version,
          titleSnapshot: document.title,
          fileNameSnapshot: document.fileName,
          categorySnapshot: document.category
        })) });
      }

      if (mustSnapshot) {
        for (const item of before.items) {
          if (!item.documentId) throw new TransmittalConflictError("Package contains a deleted document; update the draft before issue");
          const document = documents.find((entry) => entry.id === item.documentId);
          if (!document) throw new TransmittalConflictError("Package document is not available for issue");
          const version = document.versions[0];
          await tx.documentTransmittalItem.update({
            where: { id: item.id },
            data: {
              documentVersionId: version?.id ?? null,
              documentVersion: version?.versionNumber ?? document.version,
              titleSnapshot: document.title,
              fileNameSnapshot: version?.fileName ?? document.fileName,
              categorySnapshot: document.category
            }
          });
        }
      }

      if (data.action) {
        await tx.documentTransmittalEvent.create({ data: {
          transmittalId: before.id,
          revision: nextRevision,
          eventType: data.action === "review" ? "reviewed" : data.action,
          decision: data.action === "review" ? data.decision! : null,
          comment: data.comment || null,
          createdBy: user?.authenticated ? user.id : null,
          createdByName: user?.name ?? user?.email ?? "project-user"
        } });
      }

      const item = await tx.projectDocumentTransmittal.update({
        where: { id: before.id },
        data: {
          subject: data.subject,
          purpose: data.purpose === undefined ? undefined : data.purpose || null,
          recipient: data.recipient === undefined ? undefined : data.recipient || null,
          ccRecipients: data.ccRecipients === undefined ? undefined : data.ccRecipients || null,
          reviewer: data.reviewer === undefined ? undefined : data.reviewer || null,
          dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
          status: data.action ? nextStatus : undefined,
          revision: data.action === "reissue" ? nextRevision : undefined,
          issuedAt: mustSnapshot ? now : undefined,
          acknowledgedAt: data.action === "acknowledge" ? now : data.action === "reissue" ? null : undefined,
          reviewedAt: data.action === "review" ? now : data.action === "reissue" ? null : undefined,
          closedAt: data.action === "close" ? now : data.action === "reissue" ? null : undefined
        },
        include: includeRegister
      });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document_transmittal",
        entityId: item.id,
        action: "update",
        summary: `${data.action ?? "update"}: ${item.subject}, ${before.status} → ${item.status}`,
        before: serializeTransmittal(before),
        after: serializeTransmittal(item)
      });
      return item;
    });

    return NextResponse.json({ item: serializeTransmittal(updated) });
  } catch (error) {
    if (error instanceof TransmittalConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid document transmittal update" }, { status: 400 });
    return NextResponse.json({ error: "Document transmittal update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const before = await prisma.projectDocumentTransmittal.findUnique({ where: { id: params.transmittalId }, include: includeRegister });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Document transmittal not found" }, { status: 404 });
    if (before.status !== "draft") return NextResponse.json({ error: "Only draft transmittals can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectDocumentTransmittal.delete({ where: { id: before.id } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document_transmittal",
        entityId: before.id,
        action: "delete",
        summary: `Удален черновик TR-${String(before.sequence).padStart(3, "0")}: ${before.subject}`,
        before: serializeTransmittal(before)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Document transmittal delete failed" }, { status: 500 });
  }
}
