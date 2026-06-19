import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { isLastActiveOwner, normalizeAdminRole, serializeAdminUser } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";
import { getDemoContext } from "@/lib/project-data";

async function auditOrganizationId() {
  const organization = await prisma.organization.findFirst({ select: { id: true } });
  if (organization) return organization.id;
  return (await getDemoContext()).organizationId;
}

async function activeOwnerIds() {
  const owners = await prisma.user.findMany({ where: { appRole: "OWNER", isActive: true }, select: { id: true } });
  return owners.map((owner) => owner.id);
}

function jsonError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  console.error(error);
  return NextResponse.json({ error: "Admin user update failed" }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const before = await prisma.user.findUniqueOrThrow({ where: { id: params.userId } });
    const nextRole = body.role === undefined ? before.appRole : normalizeAdminRole(body.role);
    const nextIsActive = body.isActive === undefined ? before.isActive : Boolean(body.isActive);

    if ((before.appRole === "OWNER" && nextRole !== "OWNER") || (before.isActive && !nextIsActive)) {
      if (isLastActiveOwner({ targetUserId: before.id, activeOwnerIds: await activeOwnerIds() })) {
        return NextResponse.json({ error: "Cannot deactivate or demote the last active OWNER" }, { status: 400 });
      }
    }

    const organizationId = await auditOrganizationId();
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: params.userId },
        data: {
          name: body.name === undefined ? undefined : String(body.name).trim(),
          appRole: nextRole,
          isActive: nextIsActive
        }
      });
      await writeAudit(tx, {
        organizationId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "user",
        entityId: user.id,
        action: "update",
        summary: `Обновлен пользователь: ${user.email}`,
        before: { id: before.id, email: before.email, role: before.appRole, isActive: before.isActive },
        after: { id: user.id, email: user.email, role: user.appRole, isActive: user.isActive }
      });
      return user;
    });

    return NextResponse.json({ item: serializeAdminUser(updated) });
  } catch (error) {
    return jsonError(error);
  }
}
