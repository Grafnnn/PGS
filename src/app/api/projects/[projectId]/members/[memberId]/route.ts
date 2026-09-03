import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject, canProjectWithClient } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { organizationRoleToAppRole } from "@/lib/auth/organization-roles";
import { normalizeAdminRole } from "@/lib/admin/users";
import { lockProject } from "@/lib/admin/user-scope";
import { prisma } from "@/lib/prisma";

type MemberRecord = {
  id: string;
  userId: string;
  projectId: string;
  role: string;
  createdAt: Date;
  user: {
    id: string;
    email: string;
    name: string;
    isActive: boolean;
    memberships: Array<{ role: string }>;
  };
};

class ProjectMemberError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function serializeMember(member: MemberRecord) {
  return {
    id: member.id,
    role: normalizeAdminRole(member.role),
    createdAt: member.createdAt.toISOString(),
    user: {
      id: member.user.id,
      email: member.user.email,
      name: member.user.name,
      role: organizationRoleToAppRole(member.user.memberships[0]?.role),
      isActive: member.user.isActive
    }
  };
}

function isLastProjectOwner(members: Array<{ id: string; role: string }>, memberId: string, nextRole?: string) {
  const target = members.find((member) => member.id === memberId);
  if (!target || normalizeAdminRole(target.role) !== "OWNER") return false;
  if (nextRole && normalizeAdminRole(nextRole) === "OWNER") return false;
  return members.filter((member) => normalizeAdminRole(member.role) === "OWNER").length <= 1;
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; memberId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const role = normalizeAdminRole(body.role);
    const member = await prisma.$transaction(async (tx) => {
      await lockProject(tx, params.projectId);
      if (!(await canProjectWithClient(tx, currentUser, params.projectId, "manage_members"))) {
        throw new ProjectMemberError(403, "Forbidden");
      }
      const project = await tx.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
      if (!project) throw new ProjectMemberError(404, "Project not found");
      const before = await tx.projectMember.findFirst({
        where: { id: params.memberId, projectId: params.projectId },
        include: {
          user: {
            include: {
              memberships: {
                where: { organizationId: project.organizationId },
                select: { role: true },
                take: 1
              }
            }
          }
        }
      });
      if (!before) throw new ProjectMemberError(404, "Project member not found");
      const projectMembers = await tx.projectMember.findMany({
        where: { projectId: params.projectId },
        select: { id: true, role: true }
      });
      if (isLastProjectOwner(projectMembers, params.memberId, role)) {
        throw new ProjectMemberError(400, "Cannot downgrade the last project OWNER");
      }

      const updated = await tx.projectMember.update({
        where: { id: params.memberId },
        data: { role },
        include: {
          user: {
            include: {
              memberships: {
                where: { organizationId: project.organizationId },
                select: { role: true },
                take: 1
              }
            }
          }
        }
      });
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
    return NextResponse.json({ item: serializeMember(member as MemberRecord) });
  } catch (error) {
    if (error instanceof ProjectMemberError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project member update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: Request, { params }: { params: { projectId: string; memberId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    await prisma.$transaction(async (tx) => {
      await lockProject(tx, params.projectId);
      if (!(await canProjectWithClient(tx, currentUser, params.projectId, "manage_members"))) {
        throw new ProjectMemberError(403, "Forbidden");
      }
      const project = await tx.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
      if (!project) throw new ProjectMemberError(404, "Project not found");
      const before = await tx.projectMember.findFirst({
        where: { id: params.memberId, projectId: params.projectId },
        include: { user: true }
      });
      if (!before) throw new ProjectMemberError(404, "Project member not found");
      const projectMembers = await tx.projectMember.findMany({
        where: { projectId: params.projectId },
        select: { id: true, role: true }
      });
      if (isLastProjectOwner(projectMembers, params.memberId)) {
        throw new ProjectMemberError(400, "Cannot remove the last project OWNER");
      }

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
    if (error instanceof ProjectMemberError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project member delete failed" }, { status: 500 });
  }
}
