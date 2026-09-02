import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getUserOrganizationContext } from "@/lib/project-data";

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const context = await getUserOrganizationContext(currentUser);
  if (!context) return NextResponse.json({ error: "Organization membership is required" }, { status: 403 });
  const target = await prisma.user.findFirst({
    where: { id: params.userId, memberships: { some: { organizationId: context.organizationId } } }
  });
  if (!target) return NextResponse.json({ error: "User not found" }, { status: 404 });
  await prisma.$transaction(async (tx) => {
    const updated = await tx.user.update({ where: { id: target.id }, data: { isActive: true } });
    await writeAudit(tx, {
      organizationId: context.organizationId,
      actorId: currentUser?.authenticated ? currentUser.id : null,
      actorName: currentUser?.name ?? "local-user",
      actorEmail: currentUser?.email ?? null,
      entity: "user",
      entityId: updated.id,
      action: "update",
      summary: `Активирован пользователь: ${updated.email}`,
      before: { isActive: target.isActive },
      after: { isActive: true }
    });
  });
  return NextResponse.json({ ok: true });
}
