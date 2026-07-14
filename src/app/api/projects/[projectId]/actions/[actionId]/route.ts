import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { projectActionUpdateSchema, serializeProjectAction } from "@/lib/project-actions";

type RouteParams = { params: { projectId: string; actionId: string } };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = projectActionUpdateSchema.parse(await request.json().catch(() => ({})));
    const before = await prisma.projectActionItem.findUnique({ where: { id: params.actionId } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Project action not found" }, { status: 404 });
    const nextRequiresApproval = data.requiresApproval ?? before.requiresApproval;
    const nextStatus = data.approve === true ? "done" : data.status ?? before.status;
    if (data.approve === true && user?.role !== "OWNER" && user?.role !== "ADMIN") {
      return NextResponse.json({ error: "Owner or administrator approval is required" }, { status: 403 });
    }
    if (data.approve === true && !nextRequiresApproval) {
      return NextResponse.json({ error: "This action does not require approval" }, { status: 409 });
    }
    if (nextStatus === "done" && nextRequiresApproval && !before.approvedAt && data.approve !== true) {
      return NextResponse.json({ error: "Approval is required before completion" }, { status: 409 });
    }

    const now = new Date();
    const reopensApprovedAction = Boolean(data.status && data.status !== "done" && before.approvedAt);
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectActionItem.update({
        where: { id: params.actionId },
        data: {
          title: data.title,
          description: data.description === undefined ? undefined : data.description || null,
          sourceModule: data.sourceModule,
          targetTab: data.targetTab === undefined ? undefined : data.targetTab || null,
          priority: data.priority,
          status: data.approve === true || data.status ? nextStatus : undefined,
          assignee: data.assignee === undefined ? undefined : data.assignee || null,
          dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
          requiresApproval: data.requiresApproval,
          completedAt: data.approve === true || data.status ? (nextStatus === "done" ? now : null) : undefined,
          approvedAt: data.approve === true ? now : data.requiresApproval === false || reopensApprovedAction ? null : undefined,
          approvedBy: data.approve === true ? user?.name ?? user?.email ?? "project-user" : data.requiresApproval === false || reopensApprovedAction ? null : undefined
        }
      });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_action",
        entityId: updated.id,
        action: data.approve === true ? "accept" : "update",
        summary: data.approve === true ? `Согласовано действие: ${updated.title}` : `Обновлено действие: ${updated.title}`,
        before: serializeProjectAction(before),
        after: serializeProjectAction(updated)
      });
      return updated;
    });

    return NextResponse.json({ item: serializeProjectAction(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid project action" }, { status: 400 });
    return NextResponse.json({ error: "Project action update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const before = await prisma.projectActionItem.findUnique({ where: { id: params.actionId } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Project action not found" }, { status: 404 });
    await prisma.$transaction(async (tx) => {
      await tx.projectActionItem.delete({ where: { id: params.actionId } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_action",
        entityId: before.id,
        action: "delete",
        summary: `Удалено действие: ${before.title}`,
        before: serializeProjectAction(before)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Project action delete failed" }, { status: 500 });
  }
}
