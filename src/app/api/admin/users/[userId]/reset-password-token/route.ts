import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { generateOneTimeToken, hashOneTimeToken, RESET_TOKEN_TTL_HOURS, tokenExpiresAt } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { buildResetPasswordEmail, getEmailProvider } from "@/lib/email";
import { prisma } from "@/lib/prisma";
import {
  assertSingleOrganizationUser,
  getAdminOrganizationContext,
  lockOrganization,
  lockUser,
  MultiOrganizationUserMutationError
} from "@/lib/admin/user-scope";

class AdminUserMutationError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const requestId = getRequestId(request);
  const currentUser = await getCurrentUser();

  try {
    const env = getEnv();
    const context = await getAdminOrganizationContext(currentUser);
    if (!context) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);

    const rawToken = generateOneTimeToken();
    const expiresAt = tokenExpiresAt(RESET_TOKEN_TTL_HOURS);
    const result = await prisma.$transaction(async (tx) => {
      await lockOrganization(tx, context.organizationId);
      await lockUser(tx, params.userId);
      const membership = await tx.membership.findUnique({
        where: { organizationId_userId: { organizationId: context.organizationId, userId: params.userId } },
        include: { user: true }
      });
      if (!membership) throw new AdminUserMutationError(404, "User not found");
      await assertSingleOrganizationUser(tx, params.userId);
      const created = await tx.passwordResetToken.create({
        data: { userId: membership.user.id, tokenHash: hashOneTimeToken(rawToken), expiresAt }
      });
      await writeAudit(tx, {
        organizationId: context.organizationId,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "password_reset_token",
        entityId: created.id,
        action: "create",
        summary: `Создан reset-token: ${membership.user.email}`,
        after: { userId: membership.user.id, email: membership.user.email, expiresAt: expiresAt.toISOString() }
      });
      return { reset: created, user: membership.user };
    });

    const resetUrl = new URL(`/reset-password?token=${rawToken}`, env.APP_URL).toString();
    const delivery = await getEmailProvider().send(buildResetPasswordEmail({ to: result.user.email, resetUrl }));
    const devPreview = env.NODE_ENV === "production" ? null : { resetUrl, token: rawToken };
    return apiOk(requestId, { item: { id: result.reset.id, userId: result.user.id, expiresAt: result.reset.expiresAt.toISOString() }, delivery, devPreview }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof MultiOrganizationUserMutationError) return apiError(requestId, "MULTI_ORGANIZATION_USER", error.message, 409);
    if (error instanceof AdminUserMutationError) return apiError(requestId, "USER_NOT_FOUND", error.message, error.status);
    console.error(error);
    return apiError(requestId, "RESET_TOKEN_CREATE_FAILED", "Reset token creation failed", 500);
  }
}
