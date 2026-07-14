import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { resolveRfiTransition, rfiUpdateSchema, serializeRfi, WorkflowConflictError } from "@/lib/rfi-submittals";

type Params = { params: { projectId: string; rfiId: string } };

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = rfiUpdateSchema.parse(await request.json().catch(() => ({})));
    if (!Object.keys(data).length) return NextResponse.json({ error: "RFI update is empty" }, { status: 409 });
    if (data.action) {
      const allowed = new Set(data.action === "answer" ? ["action", "response"] : ["action"]);
      if (Object.keys(data).some((key) => !allowed.has(key))) return NextResponse.json({ error: "Workflow action cannot modify RFI fields" }, { status: 409 });
    } else if (data.response !== undefined) return NextResponse.json({ error: "RFI response requires the answer action" }, { status: 409 });
    const before = await prisma.projectRfi.findUnique({ where: { id: params.rfiId }, include: { responses: { orderBy: { createdAt: "asc" } } } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    const nextStatus = resolveRfiTransition(before.status, data.action, data.response);
    const nextDocumentId = data.linkedDocumentId === undefined ? before.linkedDocumentId : data.linkedDocumentId || null;
    const nextAssignee = data.assignee === undefined ? before.assignee : data.assignee || null;
    const nextDueAt = data.dueAt === undefined ? before.dueAt : data.dueAt ? new Date(data.dueAt) : null;
    if (data.action === "send" && (!nextAssignee || !nextDueAt)) return NextResponse.json({ error: "Assignee and due date are required before sending an RFI" }, { status: 409 });
    let linkedDocumentVersion: number | null = before.linkedDocumentVersion;
    let linkedDocumentVersionId: string | null = before.linkedDocumentVersionId;
    if (nextDocumentId) {
      const document = await prisma.document.findFirst({ where: { id: nextDocumentId, projectId: params.projectId }, select: { id: true, version: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, versionNumber: true } } } });
      if (!document) return NextResponse.json({ error: "Linked document not found in this project" }, { status: 400 });
      if (data.action === "send") {
        linkedDocumentVersion = document.versions[0]?.versionNumber ?? document.version;
        linkedDocumentVersionId = document.versions[0]?.id ?? null;
      }
    }
    const now = new Date();
    const item = await prisma.$transaction(async (tx) => {
      if (data.action === "answer") await tx.rfiResponse.create({ data: { rfiId: before.id, body: data.response!.trim(), createdBy: user?.authenticated ? user.id : null, createdByName: user?.name ?? user?.email ?? "project-user" } });
      const updated = await tx.projectRfi.update({ where: { id: before.id }, data: {
        subject: data.subject, question: data.question, discipline: data.discipline === undefined ? undefined : data.discipline || null,
        location: data.location === undefined ? undefined : data.location || null, priority: data.priority,
        assignee: data.assignee === undefined ? undefined : data.assignee || null, dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
        linkedDocumentId: data.linkedDocumentId === undefined ? undefined : data.linkedDocumentId || null,
        linkedDocumentVersion: data.action === "send" ? linkedDocumentVersion : data.linkedDocumentId !== undefined ? null : undefined,
        linkedDocumentVersionId: data.action === "send" ? linkedDocumentVersionId : data.linkedDocumentId !== undefined ? null : undefined,
        status: data.action ? nextStatus : undefined, sentAt: data.action === "send" ? now : undefined,
        answeredAt: data.action === "answer" ? now : data.action === "reopen" ? null : undefined,
        closedAt: data.action === "close" ? now : data.action === "reopen" ? null : undefined
      }, include: { responses: { orderBy: { createdAt: "asc" } } } });
      await writeAudit(tx, { organizationId: before.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "project_rfi", entityId: updated.id,
        action: "update", summary: `${data.action ?? "update"}: ${updated.subject}, ${before.status} → ${updated.status}`, before: serializeRfi(before), after: serializeRfi(updated) });
      return updated;
    });
    return NextResponse.json({ item: serializeRfi(item) });
  } catch (error) {
    if (error instanceof WorkflowConflictError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid RFI update" }, { status: 400 });
    return NextResponse.json({ error: "RFI update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const before = await prisma.projectRfi.findUnique({ where: { id: params.rfiId }, include: { responses: true } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "RFI not found" }, { status: 404 });
    if (before.status !== "draft") return NextResponse.json({ error: "Only draft RFIs can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectRfi.delete({ where: { id: before.id } });
      await writeAudit(tx, { organizationId: before.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "project_rfi", entityId: before.id,
        action: "delete", summary: `Удален RFI-${String(before.sequence).padStart(3, "0")}: ${before.subject}`, before: serializeRfi(before) });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "RFI delete failed" }, { status: 500 });
  }
}
