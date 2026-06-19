import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getEnv } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { verifyPassword } from "@/lib/auth/password";
import { createUserSession, SESSION_COOKIE, SESSION_TTL_DAYS, toAppRole } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const env = getEnv();
  const body = await request.json().catch(() => ({}));
  const email = String(body.email ?? "").trim().toLowerCase();
  const password = String(body.password ?? "");

  if (!email || !password) return NextResponse.json({ error: "Email and password are required" }, { status: 400 });

  try {
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user?.isActive || !(await verifyPassword(password, user.passwordHash))) {
      return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
    }

    const { token, expiresAt } = await createUserSession({
      userId: user.id,
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null
    });
    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const response = NextResponse.json({
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: toAppRole(user.appRole)
      }
    });

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
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Login failed" }, { status: 500 });
  }
}
