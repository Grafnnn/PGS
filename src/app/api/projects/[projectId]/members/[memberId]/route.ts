import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeAdminRole } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; memberId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const role = normalizeAdminRole(body.role);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: params.projectId }, select: { organizationId: true } });
    const member = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectMember.update({ where: { id: params.memberId }, data: { role }, include: { user: true } });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "project_member",
        entityId: updated.id,
        action: "update",
        summary: `Изменена роль участника проекта: ${updated.user.email} (${role})`,
        after: { userId: updated.userId, email: updated.user.email, role }
      });
      return updated;
    });
    return NextResponse.json({ item: { id: member.id, role: normalizeAdminRole(member.role), user: { id: member.user.id, email: member.user.email, name: member.user.name } } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Project member update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { projectId: string; memberId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const project = await prisma.project.findUniqueOrThrow({ where: { id: params.projectId }, select: { organizationId: true } });
    await prisma.$transaction(async (tx) => {
      const before = await tx.projectMember.findUniqueOrThrow({ where: { id: params.memberId }, include: { user: true } });
      await tx.projectMember.delete({ where: { id: params.memberId } });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "project_member",
        entityId: before.id,
        action: "delete",
        summary: `Удален участник проекта: ${before.user.email}`,
        before: { userId: before.userId, email: before.user.email, role: before.role }
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "Project member delete failed" }, { status: 500 });
  }
}
