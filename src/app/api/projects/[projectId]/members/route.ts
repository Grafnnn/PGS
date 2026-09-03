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

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const members = await prisma.projectMember.findMany({
      where: { projectId: params.projectId },
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
      },
      orderBy: { createdAt: "asc" }
    });
    return NextResponse.json({ items: members.map((member) => serializeMember(member as MemberRecord)) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project members request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = normalizeAdminRole(body.role);
    if (!email || !email.includes("@")) return NextResponse.json({ error: "Valid email is required" }, { status: 400 });

    const member = await prisma.$transaction(async (tx) => {
      await lockProject(tx, params.projectId);
      if (!(await canProjectWithClient(tx, currentUser, params.projectId, "manage_members"))) {
        throw new ProjectMemberError(403, "Forbidden");
      }
      const project = await tx.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
      if (!project) throw new ProjectMemberError(404, "Project not found");
      const user = await tx.user.findFirst({
        where: {
          email,
          memberships: { some: { organizationId: project.organizationId } }
        },
        include: {
          memberships: {
            where: { organizationId: project.organizationId },
            select: { role: true },
            take: 1
          }
        }
      });
      if (!user) throw new ProjectMemberError(404, "User is not a member of the project organization");

      const created = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: params.projectId, userId: user.id } },
        update: { role },
        create: { projectId: params.projectId, userId: user.id, role },
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
        entityId: created.id,
        action: "update",
        summary: `Назначен участник проекта: ${user.email} (${role})`,
        after: { userId: user.id, email: user.email, role }
      });
      return created;
    });

    return NextResponse.json({ item: serializeMember(member as MemberRecord) }, { status: 201 });
  } catch (error) {
    if (error instanceof ProjectMemberError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project member update failed" }, { status: 500 });
  }
}
