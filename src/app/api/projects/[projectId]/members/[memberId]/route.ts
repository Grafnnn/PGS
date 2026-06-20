import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeAdminRole } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";

function serializeMember(member: { id: string; role: string; createdAt: Date; user: { id: string; email: string; name: string; appRole: string; isActive: boolean } }) {
  return {
    id: member.id,
    role: normalizeAdminRole(member.role),
    createdAt: member.createdAt.toISOString(),
    user: {
      id: member.user.id,
      email: member.user.email,
      name: member.user.name,
      role: normalizeAdminRole(member.user.appRole),
      isActive: member.user.isActive
    }
  };
}

async function wouldRemoveLastProjectOwner(projectId: string, memberId: string, nextRole?: string) {
  const member = await prisma.projectMember.findUnique({ where: { id: memberId }, select: { role: true, projectId: true } });
  if (!member || member.projectId !== projectId) return false;
  if (normalizeAdminRole(member.role) !== "OWNER") return false;
  if (nextRole && normalizeAdminRole(nextRole) === "OWNER") return false;
  const owners = await prisma.projectMember.count({ where: { projectId, role: "OWNER" } });
  return owners <= 1;
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; memberId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const role = normalizeAdminRole(body.role);
    const project = await prisma.project.findUniqueOrThrow({ where: { id: params.projectId }, select: { organizationId: true } });
    const before = await prisma.projectMember.findUnique({ where: { id: params.memberId }, include: { user: true } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Project member not found" }, { status: 404 });
    if (await wouldRemoveLastProjectOwner(params.projectId, params.memberId, role)) {
      return NextResponse.json({ error: "Cannot downgrade the last project OWNER" }, { status: 400 });
    }
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
        before: { userId: before.userId, email: before.user.email, role: before.role },
        after: { userId: updated.userId, email: updated.user.email, role }
      });
      return updated;
    });
    return NextResponse.json({ item: serializeMember(member) });
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
    const before = await prisma.projectMember.findUnique({ where: { id: params.memberId }, include: { user: true } });
    if (!before || before.projectId !== params.projectId) return NextResponse.json({ error: "Project member not found" }, { status: 404 });
    if (await wouldRemoveLastProjectOwner(params.projectId, params.memberId)) {
      return NextResponse.json({ error: "Cannot remove the last project OWNER" }, { status: 400 });
    }
    await prisma.$transaction(async (tx) => {
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
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "Project member not found" }, { status: 404 });
    }
    return NextResponse.json({ error: "Project member delete failed" }, { status: 500 });
  }
}
