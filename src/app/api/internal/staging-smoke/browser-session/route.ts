import { NextRequest, NextResponse } from "next/server";
import { apiError, getRequestId } from "@/lib/api/errors";
import { SESSION_COOKIE } from "@/lib/auth/session";
import { closeStagingBrowserSmokeSession, createStagingBrowserSmokeSession, STAGING_BROWSER_SESSION_MINUTES } from "@/lib/smoke/browser-session";
import { isStagingSmokeRuntime, providedStagingSmokeSecret, stagingSmokeSecretsMatch } from "@/lib/smoke/guard";

function guard(request: NextRequest, requestId: string) {
  if (!isStagingSmokeRuntime()) return apiError(requestId, "NOT_FOUND", "Not found", 404);
  const expected = process.env.STAGING_SMOKE_SECRET?.trim();
  if (!expected) return apiError(requestId, "STAGING_SMOKE_SECRET_MISSING", "Staging smoke secret is not configured.", 403);
  if (!stagingSmokeSecretsMatch(providedStagingSmokeSecret(request), expected)) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  return null;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);
  const rejected = guard(request, requestId);
  if (rejected) return rejected;

  try {
    const session = await createStagingBrowserSmokeSession({
      userAgent: request.headers.get("user-agent"),
      ipAddress: request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    });
    const response = NextResponse.json(session.report, { headers: { "x-request-id": requestId } });
    response.cookies.set(SESSION_COOKIE, session.token, {
      httpOnly: true,
      sameSite: "lax",
      secure: true,
      path: "/",
      expires: session.expiresAt,
      maxAge: STAGING_BROWSER_SESSION_MINUTES * 60
    });
    response.cookies.set("pgs_role", "", { expires: new Date(0), path: "/" });
    return response;
  } catch {
    return apiError(requestId, "BROWSER_SMOKE_SESSION_FAILED", "Could not create staging browser smoke session.", 500);
  }
}

export async function DELETE(request: NextRequest) {
  const requestId = getRequestId(request);
  const rejected = guard(request, requestId);
  if (rejected) return rejected;

  try {
    const report = await closeStagingBrowserSmokeSession(request.cookies.get(SESSION_COOKIE)?.value);
    const response = NextResponse.json(report, { headers: { "x-request-id": requestId } });
    response.cookies.set(SESSION_COOKIE, "", { expires: new Date(0), path: "/" });
    response.cookies.set("pgs_role", "", { expires: new Date(0), path: "/" });
    return response;
  } catch {
    return apiError(requestId, "BROWSER_SMOKE_SESSION_CLEANUP_FAILED", "Could not close staging browser smoke session.", 500);
  }
}

export async function GET(request: NextRequest) {
  return apiError(getRequestId(request), "NOT_FOUND", "Not found", 404);
}
