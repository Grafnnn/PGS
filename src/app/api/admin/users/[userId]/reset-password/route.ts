import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/admin/users";
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
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);
    const updated = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await lockUser(tx, params.userId);
      const membership = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: params.userId } },
        include: { user: true }
      });
      if (!membership) throw new AdminUserMutationError(404, "User not found");
      await assertSingleOrganizationUser(tx, params.userId);
      const user = await tx.user.update({
        where: { id: params.userId },
        data: {
          passwordHash,
          sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } }
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
        summary: `Выдан временный пароль: ${user.email}`,
        after: { id: user.id, email: user.email, passwordResetIssued: true }
      });
      return user;
    });
    return NextResponse.json({ userId: updated.id, temporaryPassword });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof MultiOrganizationUserMutationError) return NextResponse.json({ error: error.message }, { status: 409 });
    if (error instanceof AdminUserMutationError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Password reset failed" }, { status: 500 });
  }
}
