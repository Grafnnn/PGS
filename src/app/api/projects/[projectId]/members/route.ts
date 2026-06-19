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

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const members = await prisma.projectMember.findMany({
    where: { projectId: params.projectId },
    include: { user: true },
    orderBy: { createdAt: "asc" }
  });
  return NextResponse.json({ items: members.map(serializeMember) });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const currentUser = await getCurrentUser();
  if (!(await canProject(currentUser, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const email = String(body.email ?? "").trim().toLowerCase();
    const role = normalizeAdminRole(body.role);
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });

    const member = await prisma.$transaction(async (tx) => {
      const created = await tx.projectMember.upsert({
        where: { projectId_userId: { projectId: params.projectId, userId: user.id } },
        update: { role },
        create: { projectId: params.projectId, userId: user.id, role },
        include: { user: true }
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

    return NextResponse.json({ item: serializeMember(member) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project member update failed" }, { status: 500 });
  }
}
