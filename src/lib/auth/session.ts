import { cookies } from "next/headers";
import { createHash, randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import { localUser, type AppRole, type AppUser } from "./permissions";

export const SESSION_COOKIE = "pgs_session";
export const SESSION_TTL_DAYS = 30;

const roleMap: Record<string, AppRole> = {
  owner: "OWNER",
  admin: "ADMIN",
  manager: "MANAGER",
  viewer: "VIEWER"
};

export function generateSessionToken() {
  return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function sessionExpiresAt(now = new Date()) {
  return new Date(now.getTime() + SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
}

export function toAppRole(value: string | null | undefined): AppRole {
  const normalized = String(value ?? "VIEWER").toUpperCase();
  if (normalized === "OWNER" || normalized === "ADMIN" || normalized === "MANAGER" || normalized === "VIEWER") return normalized;
  return "VIEWER";
}

export async function createUserSession(input: {
  userId: string;
  userAgent?: string | null;
  ipAddress?: string | null;
}) {
  const token = generateSessionToken();
  const expiresAt = sessionExpiresAt();
  await prisma.session.create({
    data: {
      userId: input.userId,
      tokenHash: hashSessionToken(token),
      expiresAt,
      userAgent: input.userAgent,
      ipAddress: input.ipAddress
    }
  });
  return { token, expiresAt };
}

export async function revokeCurrentSession(token: string | undefined) {
  if (!token) return;
  await prisma.session.updateMany({
    where: { tokenHash: hashSessionToken(token), revokedAt: null },
    data: { revokedAt: new Date() }
  });
}

export async function getCurrentUser(): Promise<AppUser | null> {
  const status = getEnvStatus();
  const sessionToken = cookies().get(SESSION_COOKIE)?.value;
  if (sessionToken) {
    try {
      const session = await prisma.session.findUnique({
        where: { tokenHash: hashSessionToken(sessionToken) },
        include: { user: true }
      });

      if (session && !session.revokedAt && session.expiresAt > new Date() && session.user.isActive) {
        return {
          id: session.user.id,
          name: session.user.name,
          email: session.user.email,
          role: toAppRole(session.user.appRole),
          authenticated: true
        };
      }
    } catch (error) {
      if (status.authRequired || !(error instanceof Prisma.PrismaClientInitializationError)) throw error;
    }
  }

  const roleCookie = status.production ? undefined : cookies().get("pgs_role")?.value;
  const role = roleCookie ? roleMap[roleCookie] : undefined;

  if (role && !status.authRequired) return localUser(role);
  if (!status.authRequired) return localUser("OWNER");
  return null;
}
