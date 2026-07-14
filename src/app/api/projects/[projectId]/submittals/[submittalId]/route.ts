import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveSubmittalTransition, serializeSubmittal, submittalUpdateSchema, WorkflowConflictError } from "@/lib/rfi-submittals";

type Params = { params: { projectId: string; submittalId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = submittalUpdateSchema.parse(await request.json().catch(() => ({})));
    if (!Object.keys(data).length) return NextResponse.json({ error: "Submittal update is empty" }, { status: 409 });
    if (data.action) {
      const allowed = new Set(data.action === "review" ? ["action", "decision", "comment"] : ["action"]);
      if (Object.keys(data).some((key) => !allowed.has(key))) return NextResponse.json({ error: "Workflow action cannot modify submittal fields" }, { status: 409 });
    } else if (data.decision !== undefined || data.comment !== undefined) return NextResponse.json({ error: "Review decision requires the review action" }, { status: 409 });
    const before = await prisma.projectSubmittal.findUnique({ where: { id: params.submittalId }, include: { reviews: { orderBy: { createdAt: "asc" } } } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Submittal not found" }, { status: 404 });
    const nextStatus = resolveSubmittalTransition(before.status, data.action, data.decision);
    const nextDocumentId = data.linkedDocumentId === undefined ? before.linkedDocumentId : data.linkedDocumentId || null;
    const nextReviewer = data.reviewer === undefined ? before.reviewer : data.reviewer || null;
    const nextDueAt = data.dueAt === undefined ? before.dueAt : data.dueAt ? new Date(data.dueAt) : null;
    let linkedDocumentVersion: number | null = before.linkedDocumentVersion;
    let linkedDocumentVersionId: string | null = before.linkedDocumentVersionId;
    if (nextDocumentId) {
      const document = await prisma.document.findFirst({ where: { id: nextDocumentId, projectId: params.projectId }, select: { id: true, version: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true } } } });
      if (!document) return NextResponse.json({ error: "Linked document not found in this project" }, { status: 400 });
      if (data.action === "submit" || data.action === "resubmit") {
        linkedDocumentVersion = document.versions[0]?.versionNumber ?? document.version;
        linkedDocumentVersionId = document.versions[0]?.id ?? null;
      }
    }
    if ((data.action === "submit" || data.action === "resubmit") && (!nextDocumentId || !nextReviewer || !nextDueAt)) {
      return NextResponse.json({ error: "Document, reviewer and due date are required before submission" }, { status: 409 });
    }
    const now = new Date();
    const nextRevision = data.action === "resubmit" ? before.revision + 1 : before.revision;
    const item = await prisma.$transaction(async (tx) => {
      if (data.action === "review") await tx.submittalReview.create({ data: {
        submittalId: before.id, revision: before.revision, decision: data.decision!, comment: data.comment || null,
        createdBy: user?.authenticated ? user.id : null, createdByName: user?.name ?? user?.email ?? "project-user"
      } });
      const updated = await tx.projectSubmittal.update({ where: { id: before.id }, data: {
        title: data.title, category: data.category, specSection: data.specSection === undefined ? undefined : data.specSection || null,
        reviewer: data.reviewer === undefined ? undefined : data.reviewer || null, dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
        linkedDocumentId: data.linkedDocumentId === undefined ? undefined : data.linkedDocumentId || null,
        linkedDocumentVersion: data.action === "submit" || data.action === "resubmit" ? linkedDocumentVersion : data.linkedDocumentId !== undefined ? null : undefined,
        linkedDocumentVersionId: data.action === "submit" || data.action === "resubmit" ? linkedDocumentVersionId : data.linkedDocumentId !== undefined ? null : undefined,
        revision: data.action === "resubmit" ? nextRevision : undefined, status: data.action ? nextStatus : undefined,
        submittedAt: data.action === "submit" || data.action === "resubmit" ? now : undefined,
        reviewedAt: data.action === "review" ? now : data.action === "resubmit" ? null : undefined,
        closedAt: data.action === "close" ? now : undefined
      }, include: { reviews: { orderBy: { createdAt: "asc" } } } });
      await writeAudit(tx, { organizationId: before.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "project_submittal", entityId: updated.id,
        action: "update", summary: `${data.action ?? "update"}: ${updated.title}, ${before.status} → ${updated.status}`, before: serializeSubmittal(before), after: serializeSubmittal(updated) });
      return updated;
    });
    return NextResponse.json({ item: serializeSubmittal(item) });
  } catch (error) {
    if (error instanceof WorkflowConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid submittal update" }, { status: 400 });
    return NextResponse.json({ error: "Submittal update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const before = await prisma.projectSubmittal.findUnique({ where: { id: params.submittalId }, include: { reviews: true } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Submittal not found" }, { status: 404 });
    if (before.status !== "draft") return NextResponse.json({ error: "Only draft submittals can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectSubmittal.delete({ where: { id: before.id } });
      await writeAudit(tx, { organizationId: before.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "project_submittal", entityId: before.id,
        action: "delete", summary: `Удален SUB-${String(before.sequence).padStart(3, "0")}: ${before.title}`, before: serializeSubmittal(before) });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Submittal delete failed" }, { status: 500 });
  }
}
