import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { appRoleToOrganizationRole, organizationRoleToAppRole } from "@/lib/auth/organization-roles";
import { normalizeAdminRole, serializeAdminUser } from "@/lib/admin/users";
import {
  getAdminOrganizationContext,
  lockOrganization,
  lockUser,
  MultiOrganizationUserMutationError
} from "@/lib/admin/user-scope";
import { prisma } from "@/lib/prisma";

class AdminUserMutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function jsonError(error: unknown) {
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return NextResponse.json({ error: "Database is not available" }, { status: 503 });
  }
  if (error instanceof MultiOrganizationUserMutationError) {
    return NextResponse.json({ error: error.message }, { status: 409 });
  }
  if (error instanceof AdminUserMutationError) {
    return NextResponse.json({ error: error.message }, { status: error.status });
  }
  console.error(error);
  return NextResponse.json({ error: "Admin user update failed" }, { status: 500 });
}

export async function PATCH(request: NextRequest, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();

  try {
    const context = await getAdminOrganizationContext(currentUser);
    if (!context) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const body = await request.json().catch(() => ({}));
    const requestedName = body.name === undefined ? undefined : String(body.name).trim();
    if (requestedName === "") return NextResponse.json({ error: "Name is required" }, { status: 400 });

    const result = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await lockUser(tx, params.userId);
      const membership = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: params.userId } },
        include: { user: true }
      });
      if (!membership) throw new AdminUserMutationError(404, "User not found");

      const beforeRole = organizationRoleToAppRole(membership.role);
      const nextRole = body.role === undefined ? beforeRole : normalizeAdminRole(body.role);
      const nextIsActive = body.isActive === undefined ? membership.user.isActive : Boolean(body.isActive);
      const globalProfileChanges =
        (requestedName !== undefined && requestedName !== membership.user.name) ||
        nextIsActive !== membership.user.isActive;
      const membershipCount = await tx.membership.count({ where: { userId: params.userId } });
      if (membershipCount > 1 && globalProfileChanges) throw new MultiOrganizationUserMutationError();

      if ((beforeRole === "OWNER" && nextRole !== "OWNER") || (membership.user.isActive && !nextIsActive)) {
        const activeOwners = await tx.membership.findMany({
          where: { organizationId: context.organizationId, role: "owner", user: { isActive: true } },
          select: { userId: true }
        });
        if (beforeRole === "OWNER" && activeOwners.length === 1 && activeOwners[0]?.userId === params.userId) {
          throw new AdminUserMutationError(400, "Cannot deactivate or demote the last active OWNER");
        }
      }

      if (body.role !== undefined) {
        await tx.membership.update({
          where: { organizationId_userId: { organizationId: context.organizationId, userId: params.userId } },
          data: { role: appRoleToOrganizationRole(nextRole) }
        });
      }
      const user = await tx.user.update({
        where: { id: params.userId },
        data: {
          name: requestedName,
          isActive: nextIsActive,
          appRole: membershipCount === 1 && body.role !== undefined ? nextRole : undefined,
          sessions: membership.user.isActive && !nextIsActive
            ? { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } }
            : undefined
        }
      });
      await writeAudit(tx, {
        organizationId: context.organizationId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "user",
        entityId: user.id,
        action: "update",
        summary: `Обновлен пользователь: ${user.email}`,
        before: { id: user.id, email: user.email, role: beforeRole, isActive: membership.user.isActive },
        after: { id: user.id, email: user.email, role: nextRole, isActive: user.isActive }
      });
      return { user, role: nextRole };
    });

    return NextResponse.json({ item: serializeAdminUser(result.user, result.role) });
  } catch (error) {
    return jsonError(error);
  }
}
