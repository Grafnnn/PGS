import { NextResponse } from "next/server";
import { isLastActiveOwner } from "@/lib/admin/users";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function POST(_request: Request, { params }: { params: { userId: string } }) {
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const user = await prisma.user.findUnique({ where: { id: params.userId } });
  if (!user) return NextResponse.json({ error: "User not found" }, { status: 404 });
  const owners = await prisma.user.findMany({ where: { appRole: "OWNER", isActive: true }, select: { id: true } });
  if (user.appRole === "OWNER" && isLastActiveOwner({ targetUserId: user.id, activeOwnerIds: owners.map((owner) => owner.id) })) {
    return NextResponse.json({ error: "Cannot deactivate the last active OWNER" }, { status: 400 });
  }
  await prisma.user.update({ where: { id: params.userId }, data: { isActive: false, sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } } } });
  return NextResponse.json({ ok: true });
}
