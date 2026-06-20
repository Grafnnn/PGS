import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { hashPassword } from "@/lib/auth/password";
import { generateTemporaryPassword } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";
import { getDemoContext } from "@/lib/project-data";

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const organization = await prisma.organization.findFirst({ select: { id: true } });
    const organizationId = organization?.id ?? (await getDemoContext()).organizationId;
    const temporaryPassword = generateTemporaryPassword();
    const updated = await prisma.$transaction(async (tx) => {
      const user = await tx.user.update({
        where: { id: params.userId },
        data: { passwordHash: await hashPassword(temporaryPassword), sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } } }
      });
      await writeAudit(tx, {
        organizationId,
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
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
      return NextResponse.json({ error: "User not found" }, { status: 404 });
    }
    console.error(error);
    return NextResponse.json({ error: "Password reset failed" }, { status: 500 });
  }
}
