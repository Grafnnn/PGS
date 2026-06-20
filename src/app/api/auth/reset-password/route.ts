import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { writeAudit } from "@/lib/audit";
import { validatePasswordCandidate } from "@/lib/admin/users";
import { hashPassword } from "@/lib/auth/password";
import { tokenHashMatches, tokenIsUsable } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

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
    const candidates = await prisma.passwordResetToken.findMany({
      where: { usedAt: null, expiresAt: { gt: new Date() } },
      include: { user: true },
      take: 50
    });
    const reset = candidates.find((candidate) => tokenHashMatches(token, candidate.tokenHash));
    if (!reset || !tokenIsUsable({ expiresAt: reset.expiresAt, usedAt: reset.usedAt })) {
      return apiError(requestId, "INVALID_TOKEN", "Reset token is invalid or expired", 400);
    }
    const organization = await prisma.organization.findFirst({ select: { id: true } });

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: reset.userId },
        data: {
          passwordHash: await hashPassword(password),
          sessions: { updateMany: { where: { revokedAt: null }, data: { revokedAt: new Date() } } }
        }
      });
      await tx.passwordResetToken.update({ where: { id: reset.id }, data: { usedAt: new Date() } });
      if (organization) {
        await writeAudit(tx, {
          organizationId: organization.id,
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
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available", 503);
    console.error(error);
    return apiError(requestId, "PASSWORD_RESET_FAILED", "Password reset failed", 500);
  }
}
