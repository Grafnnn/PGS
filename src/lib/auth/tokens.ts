import { createHash, randomBytes, timingSafeEqual } from "crypto";

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
