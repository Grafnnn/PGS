import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { validatePasswordCandidate } from "@/lib/admin/users";
import { hashPassword } from "@/lib/auth/password";
import { hashOneTimeToken, lockPasswordResetToken, tokenIsUsable } from "@/lib/auth/tokens";
import { lockUser } from "@/lib/admin/user-scope";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

class ResetTokenError extends Error {}

export async function POST(request: Request) {
  const requestId = getRequestId(request);
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const token = String(body.token ?? "");
  const password = String(body.password ?? "");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimit = checkRateLimit({
    key: `reset:${ipAddress}`,
    limit: env.RESET_RATE_LIMIT_MAX,
    windowMs: env.RESET_RATE_LIMIT_WINDOW_MS
  });
  if (!rateLimit.allowed) return apiError(requestId, "RATE_LIMITED", `Too many reset attempts. Retry after ${rateLimit.retryAfterSeconds} seconds.`, 429);

  const passwordError = validatePasswordCandidate(password);
  if (!token || passwordError) return apiError(requestId, "INVALID_RESET_REQUEST", passwordError ?? "Reset token is required", 400);

  try {
    const tokenHash = hashOneTimeToken(token);
    const passwordHash = await hashPassword(password);
    await prisma.$transaction(async (tx) => {
      await lockPasswordResetToken(tx, tokenHash);
      const reset = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: { memberships: { select: { organizationId: true } } }
          }
        }
      });
      if (!reset || !tokenIsUsable({ expiresAt: reset.expiresAt, usedAt: reset.usedAt })) throw new ResetTokenError();

      await lockUser(tx, reset.userId);
      const now = new Date();
      await tx.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash,
          sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: now } } }
        }
      });
      await tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: now } });
      for (const membership of reset.user.memberships) {
        await writeAudit(tx, {
          organizationId: membership.organizationId,
          actorId: reset.userId,
          actorName: reset.user.name,
          actorEmail: reset.user.email,
          entity: "password_reset_token",
          entityId: reset.id,
          action: "use",
          summary: `Пароль изменен по reset-token: ${reset.user.email}`,
          after: { userId: reset.userId, email: reset.user.email }
        });
      }
    });

    return apiOk(requestId, { ok: true });
  } catch (error) {
    if (error instanceof ResetTokenError) return apiError(requestId, "INVALID_TOKEN", "Reset token is invalid or expired", 400);
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "PASSWORD_RESET_FAILED", "Password reset failed", 500);
  }
}
