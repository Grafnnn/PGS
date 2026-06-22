import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { runStagingSmokeBootstrap } from "@/lib/smoke/runtime";

function isStagingRuntime() {
  return process.env.APP_ENV === "staging";
}

function hashSecret(value: string) {
  return createHash("sha256").update(value).digest();
}

function secretsMatch(provided: string, expected: string) {
  return timingSafeEqual(hashSecret(provided), hashSecret(expected));
}

function providedSecret(request: NextRequest) {
  const headerSecret = request.headers.get("x-pgs-staging-smoke-secret")?.trim();
  if (headerSecret) return headerSecret;

  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization?.toLowerCase().startsWith("bearer ")) return "";
  return authorization.slice("bearer ".length).trim();
}

function sanitizeError(error: unknown) {
  if (!(error instanceof Error)) return "Staging smoke failed.";
  return error.message.replace(/postgres(ql)?:\/\/\S+/g, "[REDACTED_DATABASE_URL]").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]").slice(0, 200);
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isStagingRuntime()) {
    return apiError(requestId, "NOT_FOUND", "Not found", 404);
  }

  const expectedSecret = process.env.STAGING_SMOKE_SECRET?.trim();
  if (!expectedSecret) {
    return apiError(requestId, "STAGING_SMOKE_SECRET_MISSING", "Staging smoke secret is not configured.", 403);
  }

  if (!secretsMatch(providedSecret(request), expectedSecret)) {
    return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  }

  const body = (await request.json().catch(() => ({}))) as { includeLiveAi?: unknown };

  try {
    const result = await runStagingSmokeBootstrap({
      baseUrl: request.nextUrl.origin,
      includeLiveAi: body.includeLiveAi === true,
      requestId
    });

    return apiOk(requestId, result, result.ok ? 200 : 502);
  } catch (error) {
    return apiError(requestId, "STAGING_SMOKE_FAILED", sanitizeError(error), 500);
  }
}

export async function GET(request: NextRequest) {
  return apiError(getRequestId(request), "NOT_FOUND", "Not found", 404);
}
