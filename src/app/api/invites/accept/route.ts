import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { tokenHashMatches, tokenIsUsable } from "@/lib/auth/tokens";
import { validatePasswordCandidate } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  const requestId = getRequestId(request);

  try {
    const body = await request.json().catch(() => ({}));
    const token = String(body.token ?? "");
    const name = String(body.name ?? "").trim();
    const password = String(body.password ?? "");
    const passwordError = validatePasswordCandidate(password);
    if (!token || !name) return apiError(requestId, "VALIDATION_ERROR", "Token and name are required", 400);
    if (passwordError) return apiError(requestId, "WEAK_PASSWORD", passwordError, 400);

    const candidates = await prisma.userInvite.findMany({
      where: { acceptedAt: null, expiresAt: { gt: new Date() } },
      take: 25
    });
    const invite = candidates.find((candidate) => tokenHashMatches(token, candidate.tokenHash));
    if (!invite || !tokenIsUsable({ expiresAt: invite.expiresAt, usedAt: invite.acceptedAt })) {
      return apiError(requestId, "INVALID_TOKEN", "Invite token is invalid or expired", 400);
    }

    const accepted = await prisma.$transaction(async (tx) => {
      const user = await tx.user.upsert({
        where: { email: invite.email },
        update: { name, appRole: invite.role, isActive: true, passwordHash: await hashPassword(password) },
        create: { email: invite.email, name, appRole: invite.role, isActive: true, passwordHash: await hashPassword(password) }
      });
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
        update: {},
        create: { organizationId: invite.organizationId, userId: user.id, role: invite.role === "OWNER" ? "owner" : "project_manager" }
      });
      if (invite.projectId && invite.projectRole) {
        await tx.projectMember.upsert({
          where: { projectId_userId: { projectId: invite.projectId, userId: user.id } },
          update: { role: invite.projectRole },
          create: { projectId: invite.projectId, userId: user.id, role: invite.projectRole }
        });
      }
      await tx.userInvite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
      await writeAudit(tx, {
        organizationId: invite.organizationId,
        projectId: invite.projectId,
        actorId: user.id,
        actorName: user.name,
        actorEmail: user.email,
        entity: "user_invite",
        entityId: invite.id,
        action: "accept",
        summary: `Принято приглашение: ${user.email}`,
        after: { userId: user.id, email: user.email, projectRole: invite.projectRole }
      });
      return user;
    });

    return apiOk(requestId, { ok: true, user: { id: accepted.id, email: accepted.email, name: accepted.name } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "INVITE_ACCEPT_FAILED", "Invite accept failed", 500);
  }
}
