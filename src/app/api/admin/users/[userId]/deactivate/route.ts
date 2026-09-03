import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { organizationRoleToAppRole } from "@/lib/auth/organization-roles";
import {
  assertSingleOrganizationUser,
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

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  try {
    const context = await getAdminOrganizationContext(currentUser);
    if (!context) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await lockUser(tx, params.userId);
      const membership = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: params.userId } },
        include: { user: true }
      });
      if (!membership) throw new AdminUserMutationError(404, "User not found");
      await assertSingleOrganizationUser(tx, params.userId);

      if (organizationRoleToAppRole(membership.role) === "OWNER" && membership.user.isActive) {
        const activeOwners = await tx.membership.findMany({
          where: { organizationId: context.organizationId, role: "owner", user: { isActive: true } },
          select: { userId: true }
        });
        if (activeOwners.length === 1 && activeOwners[0]?.userId === params.userId) {
          throw new AdminUserMutationError(400, "Cannot deactivate the last active OWNER");
        }
      }

      const updated = await tx.user.update({
        where: { id: params.userId },
        data: {
          isActive: false,
          sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } }
        }
      });
      await writeAudit(tx, {
        organizationId: context.organizationId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "user",
        entityId: updated.id,
        action: "update",
        summary: `Деактивирован пользователь: ${updated.email}`,
        before: { isActive: membership.user.isActive },
        after: { isActive: false }
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof MultiOrganizationUserMutationError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AdminUserMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "User deactivation failed" }, { status: 500 });
  }
}
