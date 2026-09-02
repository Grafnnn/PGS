import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { isLastActiveOwner } from "@/lib/admin/users";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserOrganizationContext } from "@/lib/project-data";

class AdminUserMutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await getUserOrganizationContext(currentUser);
  if (!context) return NextResponse.json({ error: "Organization membership is required" }, { status: 403 });
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "organizations" WHERE id = ${context.organizationId} FOR UPDATE`;
      const user = await tx.user.findFirst({
        where: { id: params.userId, memberships: { some: { organizationId: context.organizationId } } }
      });
      if (!user) throw new AdminUserMutationError(404, "User not found");
      const owners = await tx.user.findMany({
        where: { appRole: "OWNER", isActive: true, memberships: { some: { organizationId: context.organizationId } } },
        select: { id: true }
      });
      if (user.appRole === "OWNER" && isLastActiveOwner({ targetUserId: user.id, activeOwnerIds: owners.map((owner) => owner.id) })) {
        throw new AdminUserMutationError(400, "Cannot deactivate the last active OWNER");
      }
      const updated = await tx.user.update({
        where: { id: params.userId },
        data: { isActive: false, sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } } }
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
        before: { isActive: user.isActive },
        after: { isActive: false }
      });
    });
  } catch (error) {
    if (error instanceof AdminUserMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    throw error;
  }
  return NextResponse.json({ ok: true });
}
