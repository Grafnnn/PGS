import { createHash, timingSafeEqual } from "crypto";
import type { NextRequest } from "next/server";

export function isStagingSmokeRuntime() {
  return process.env.APP_ENV === "staging";
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest();
}

export function stagingSmokeSecretsMatch(provided: string, expected: string) {
  return timingSafeEqual(hashSecret(provided), hashSecret(expected));
}

export function providedStagingSmokeSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-pgs-staging-smoke-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice("bearer ".length).trim();
}
