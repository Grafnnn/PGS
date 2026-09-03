import { createHash, randomBytes, timingSafeEqual } from "crypto";
import type { Prisma } from "@prisma/client";

export const INVITE_TOKEN_TTL_HOURS = 48;
export const RESET_TOKEN_TTL_HOURS = 2;

export function generateOneTimeToken() {
  return randomBytes(32).toString("base64url");
}

export function hashOneTimeToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

export function tokenExpiresAt(hours: number, now = new Date()) {
  return new Date(now.getTime() + hours * 60 * 60 * 1000);
}

export function tokenHashMatches(rawToken: string, storedHash: string) {
  const candidate = Buffer.from(hashOneTimeToken(rawToken), "hex");
  const stored = Buffer.from(storedHash, "hex");
  if (candidate.length !== stored.length) return false;
  return timingSafeEqual(candidate, stored);
}

export function tokenIsUsable(input: { expiresAt: Date; usedAt?: Date | null; now?: Date }) {
  const now = input.now ?? new Date();
  return !input.usedAt && input.expiresAt > now;
}

export async function lockInviteToken(db: Prisma.TransactionClient, tokenHash: string) {
  await db.$queryRaw`SELECT id FROM "user_invites" WHERE token_hash = ${tokenHash} FOR UPDATE`;
}

export async function lockPasswordResetToken(db: Prisma.TransactionClient, tokenHash: string) {
  await db.$queryRaw`SELECT id FROM "password_reset_tokens" WHERE token_hash = ${tokenHash} FOR UPDATE`;
}
