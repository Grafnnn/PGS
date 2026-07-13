import { randomBytes } from "crypto";
import { generateSessionToken, hashSessionToken, revokeCurrentSession } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { CREATE_STAGING_SMOKE_USER_CONFIRM, createOrRotateStagingSmokeUser } from "./user";

export const STAGING_BROWSER_SMOKE_EMAIL = "smoke+staging-runtime@pgs.local";
export const STAGING_BROWSER_SESSION_MINUTES = 20;

function generateSmokePassword() {
  return `${randomBytes(27).toString("base64url")}A1!`;
}

export async function createStagingBrowserSmokeSession(input: { userAgent?: string | null; ipAddress?: string | null }) {
  const smokeUser = await createOrRotateStagingSmokeUser(prisma, {
    ...process.env,
    APP_ENV: "staging",
    NODE_ENV: "production",
    CREATE_STAGING_SMOKE_USER_CONFIRM,
    SMOKE_EMAIL: STAGING_BROWSER_SMOKE_EMAIL,
    SMOKE_PASSWORD: generateSmokePassword()
  });
  const user = await prisma.user.findUnique({ where: { email: STAGING_BROWSER_SMOKE_EMAIL }, select: { id: true } });
  if (!user) throw new Error("Staging browser smoke user was not created.");

  const expiresAt = new Date(Date.now() + STAGING_BROWSER_SESSION_MINUTES * 60 * 1000);
  const token = generateSessionToken();
  await prisma.$transaction([
    prisma.session.create({
      data: {
        userId: user.id,
        tokenHash: hashSessionToken(token),
        expiresAt,
        userAgent: input.userAgent,
        ipAddress: input.ipAddress
      }
    }),
    prisma.user.update({ where: { id: user.id }, data: { appRole: "ADMIN" } })
  ]);

  return {
    token,
    expiresAt,
    report: {
      ok: true,
      smokeUser,
      role: "temporary-admin",
      expiresInMinutes: STAGING_BROWSER_SESSION_MINUTES,
      secretsPrinted: false as const
    }
  };
}

export async function closeStagingBrowserSmokeSession(token?: string) {
  await revokeCurrentSession(token);
  const user = await prisma.user.findUnique({ where: { email: STAGING_BROWSER_SMOKE_EMAIL }, select: { id: true } });
  if (user) {
    await prisma.$transaction([
      prisma.user.update({ where: { id: user.id }, data: { appRole: "VIEWER" } }),
      prisma.session.updateMany({ where: { userId: user.id, revokedAt: null }, data: { revokedAt: new Date() } })
    ]);
  }
  return { ok: true, roleRestored: true, sessionsRevoked: true, secretsPrinted: false as const };
}
