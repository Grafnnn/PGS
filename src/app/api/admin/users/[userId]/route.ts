import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { isLastActiveOwner, normalizeAdminRole, serializeAdminUser } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";
import { getUserOrganizationContext } from "@/lib/project-data";

class LastActiveOwnerError extends Error {}

function jsonError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }
  if (error instanceof LastActiveOwnerError) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
  console.error(error);
  return NextResponse.json({ error: "Admin user update failed" }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = await request.json().catch(() => ({}));
    const context = await getUserOrganizationContext(currentUser);
    if (!context) return NextResponse.json({ error: "Organization membership is required" }, { status: 403 });
    const organizationId = context.organizationId;
    const updated = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${organizationId} FOR UPDATE`;
      const before = await tx.user.findFirstOrThrow({
        where: { id: params.userId, memberships: { some: { organizationId } } }
      });
      const nextRole = body.role === undefined ? before.appRole : normalizeAdminRole(body.role);
      const nextIsActive = body.isActive === undefined ? before.isActive : Boolean(body.isActive);
      if ((before.appRole === "OWNER" && nextRole !== "OWNER") || (before.isActive && !nextIsActive)) {
        const owners = await tx.user.findMany({
          where: { appRole: "OWNER", isActive: true, memberships: { some: { organizationId } } },
          select: { id: true }
        });
        if (isLastActiveOwner({ targetUserId: before.id, activeOwnerIds: owners.map((owner) => owner.id) })) {
          throw new LastActiveOwnerError("Cannot deactivate or demote the last active OWNER");
        }
      }
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
