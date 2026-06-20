import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { apiError, getRequestId } from "@/lib/api/errors";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession, SESSION_COOKIE, SESSION_TTL_DAYS, toAppRole } from "@/lib/auth/session";
import { checkRateLimit } from "@/lib/rate-limit";

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");
  const ipAddress = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
  const rateLimit = checkRateLimit({
    key: `login:${ipAddress}:${email}`,
    limit: env.LOGIN_RATE_LIMIT_MAX,
    windowMs: env.LOGIN_RATE_LIMIT_WINDOW_MS
  });
  if (!rateLimit.allowed) {
    return apiError(requestId, "RATE_LIMITED", `Too many login attempts. Retry after ${rateLimit.retryAfterSeconds} seconds.`, 429);
  }

  if (!email || !password) return apiError(requestId, "VALIDATION_ERROR", "Email and password are required", 400);

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return apiError(requestId, "INVALID_CREDENTIALS", "Invalid credentials", 401);
    }

    const { token, expiresAt } = await createUserSession({
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      ipAddress
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: toAppRole(user.appRole)
      }
    }, { headers: { "x-request-id": requestId } });

    response.cookies.set(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      secure: env.NODE_ENV === "production",
      expires: expiresAt,
      maxAge: SESSION_TTL_DAYS * 24 * 60 * 60
    });
    response.cookies.set("pgs_role", "", { expires: new Date(0), path: "/" });

    return response;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return apiError(requestId, "DATABASE_UNAVAILABLE", "Database is not available. Start PostgreSQL and run prisma migrate/seed.", 503);
    }
    console.error(error);
    return apiError(requestId, "LOGIN_FAILED", "Login failed", 500);
  }
}
