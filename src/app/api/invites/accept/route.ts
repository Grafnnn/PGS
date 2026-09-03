import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { hashPassword } from "@/lib/auth/password";
import { appRoleToOrganizationRole } from "@/lib/auth/organization-roles";
import { hashOneTimeToken, lockInviteToken, tokenIsUsable } from "@/lib/auth/tokens";
import { validatePasswordCandidate, normalizeAdminRole } from "@/lib/admin/users";
import { prisma } from "@/lib/prisma";

class InviteAcceptError extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) {
    super(message);
  }
}

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

    const tokenHash = hashOneTimeToken(token);
    const passwordHash = await hashPassword(password);
    const accepted = await prisma.$transaction(async (tx) => {
      await lockInviteToken(tx, tokenHash);
      const invite = await tx.userInvite.findUnique({ where: { tokenHash } });
      if (!invite || !tokenIsUsable({ expiresAt: invite.expiresAt, usedAt: invite.acceptedAt })) {
        throw new InviteAcceptError("INVALID_TOKEN", 400, "Invite token is invalid or expired");
      }
      if (invite.projectId) {
        const project = await tx.project.findFirst({
          where: { id: invite.projectId, organizationId: invite.organizationId },
          select: { id: true }
        });
        if (!project) throw new InviteAcceptError("INVALID_INVITE_SCOPE", 409, "Invite project does not belong to the invite organization");
      }

      const existingUser = await tx.user.findUnique({ where: { email: invite.email } });
      const inviteRole = normalizeAdminRole(invite.role);
      const user = existingUser ?? await tx.user.create({
        data: {
          email: invite.email,
          name,
          appRole: inviteRole,
          isActive: true,
          passwordHash
        }
      });
      await tx.membership.upsert({
        where: { organizationId_userId: { organizationId: invite.organizationId, userId: user.id } },
        update: {},
        create: {
          organizationId: invite.organizationId,
          userId: user.id,
          role: appRoleToOrganizationRole(inviteRole)
        }
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
        after: { userId: user.id, email: user.email, projectRole: invite.projectRole, existingAccount: Boolean(existingUser) }
      });
      return { user, existingAccount: Boolean(existingUser) };
    });

    return apiOk(requestId, {
      ok: true,
      existingAccount: accepted.existingAccount,
      user: { id: accepted.user.id, email: accepted.user.email, name: accepted.user.name }
    });
  } catch (error) {
    if (error instanceof InviteAcceptError) return apiError(requestId, error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "INVITE_ACCEPT_FAILED", "Invite accept failed", 500);
  }
}
