import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import {
  getEffectiveProjectRole,
  getEffectiveProjectRoleWithClient,
  roleAllowsProjectAction
} from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { lockProject } from "@/lib/admin/user-scope";
import { prisma } from "@/lib/prisma";
import { projectActionUpdateSchema, serializeProjectAction } from "@/lib/project-actions";

type RouteParams = { params: { projectId: string; actionId: string } };

class ProjectActionError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const user = await getCurrentUser();
  const preliminaryRole = await getEffectiveProjectRole(user, params.projectId);
  if (!roleAllowsProjectAction(preliminaryRole, "edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = projectActionUpdateSchema.parse(await request.json().catch(() => ({})));
    const item = await prisma.$transaction(async (tx) => {
      await lockProject(tx, params.projectId);
      const effectiveRole = await getEffectiveProjectRoleWithClient(tx, user, params.projectId);
      if (!roleAllowsProjectAction(effectiveRole, "edit")) throw new ProjectActionError(403, "Forbidden");

      const before = await tx.projectActionItem.findFirst({
        where: { id: params.actionId, projectId: params.projectId }
      });
      if (!before) throw new ProjectActionError(404, "Project action not found");

      const nextRequiresApproval = data.requiresApproval ?? before.requiresApproval;
      const nextStatus = data.approve === true ? "done" : data.status ?? before.status;
      if (data.approve === true && effectiveRole !== "OWNER" && effectiveRole !== "ADMIN") {
        throw new ProjectActionError(403, "Owner or administrator approval is required");
      }
      if (data.approve === true && !nextRequiresApproval) {
        throw new ProjectActionError(409, "This action does not require approval");
      }
      if (data.approve === true && before.approvedAt) {
        throw new ProjectActionError(409, "This action is already approved");
      }
      if (nextStatus === "done" && nextRequiresApproval && !before.approvedAt && data.approve !== true) {
        throw new ProjectActionError(409, "Approval is required before completion");
      }
      if (before.status === "done" && !before.requiresApproval && data.requiresApproval === true && data.status === undefined) {
        throw new ProjectActionError(409, "Reopen the action before requiring approval");
      }

      const now = new Date();
      const reopensApprovedAction = Boolean(data.status && data.status !== "done" && before.approvedAt);
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
    if (error instanceof ProjectActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid project action" }, { status: 400 });
    console.error(error);
    return NextResponse.json({ error: "Project action update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  const user = await getCurrentUser();
  const preliminaryRole = await getEffectiveProjectRole(user, params.projectId);
  if (!roleAllowsProjectAction(preliminaryRole, "edit")) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.$transaction(async (tx) => {
      await lockProject(tx, params.projectId);
      const effectiveRole = await getEffectiveProjectRoleWithClient(tx, user, params.projectId);
      if (!roleAllowsProjectAction(effectiveRole, "edit")) throw new ProjectActionError(403, "Forbidden");
      const before = await tx.projectActionItem.findFirst({
        where: { id: params.actionId, projectId: params.projectId }
      });
      if (!before) throw new ProjectActionError(404, "Project action not found");
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
    if (error instanceof ProjectActionError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    console.error(error);
    return NextResponse.json({ error: "Project action delete failed" }, { status: 500 });
  }
}
