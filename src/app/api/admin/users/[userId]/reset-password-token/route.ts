import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { canManageUsers } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { generateOneTimeToken, hashOneTimeToken, RESET_TOKEN_TTL_HOURS, tokenExpiresAt } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { buildResetPasswordEmail, getEmailProvider } from "@/lib/email";
import { prisma } from "@/lib/prisma";

export async function POST(request: Request, { params }: { params: { userId: string } }) {
  const requestId = getRequestId(request);
  const currentUser = await getCurrentUser();
  if (!canManageUsers(currentUser)) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);

  try {
    const env = getEnv();
    const organization = await prisma.organization.findFirst({ select: { id: true } });
    if (!organization) return apiError(requestId, "ORGANIZATION_NOT_FOUND", "Organization not found", 404);
    const user = await prisma.user.findUnique({ where: { id: params.userId } });
    if (!user) return apiError(requestId, "USER_NOT_FOUND", "User not found", 404);

    const rawToken = generateOneTimeToken();
    const expiresAt = tokenExpiresAt(RESET_TOKEN_TTL_HOURS);
    const reset = await prisma.$transaction(async (tx) => {
      const created = await tx.passwordResetToken.create({
        data: { userId: user.id, tokenHash: hashOneTimeToken(rawToken), expiresAt }
      });
      await writeAudit(tx, {
        organizationId: organization.id,
        actorId: currentUser?.authenticated ? currentUser.id : null,
        actorName: currentUser?.name ?? "local-user",
        actorEmail: currentUser?.email ?? null,
        entity: "password_reset_token",
        entityId: created.id,
        action: "create",
        summary: `Создан reset-token: ${user.email}`,
        after: { userId: user.id, email: user.email, expiresAt: expiresAt.toISOString() }
      });
      return created;
    });

    const resetUrl = new URL(`/reset-password?token=${rawToken}`, env.APP_URL).toString();
    const delivery = await getEmailProvider().send(buildResetPasswordEmail({ to: user.email, resetUrl }));
    const devPreview = env.NODE_ENV === "production" ? null : { resetUrl, token: rawToken };
    return apiOk(requestId, { item: { id: reset.id, userId: user.id, expiresAt: reset.expiresAt.toISOString() }, delivery, devPreview }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "RESET_TOKEN_CREATE_FAILED", "Reset token creation failed", 500);
  }
}
