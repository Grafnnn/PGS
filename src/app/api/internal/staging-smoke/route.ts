import { NextRequest } from "next/server";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { isStagingSmokeRuntime, providedStagingSmokeSecret, stagingSmokeSecretsMatch } from "@/lib/smoke/guard";
import { runStagingSmokeBootstrap } from "@/lib/smoke/runtime";

function sanitizeError(error: unknown) {
  if (!(error instanceof Error)) return "Staging smoke failed.";
  return error.message.replace(/postgres(ql)?:\/\/\S+/g, "[REDACTED_DATABASE_URL]").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]").slice(0, 200);
}

function stagingSmokeBaseUrl(fallbackOrigin: string) {
  const explicitBaseUrl = process.env.STAGING_SMOKE_BASE_URL?.trim();
  if (explicitBaseUrl) return explicitBaseUrl.replace(/\/+$/, "");

  const port = process.env.PORT?.trim();
  if (port) return `http://127.0.0.1:${port}`;

  return fallbackOrigin;
}

export async function POST(request: NextRequest) {
  const requestId = getRequestId(request);

  if (!isStagingSmokeRuntime()) {
    return apiError(requestId, "NOT_FOUND", "Not found", 404);
  }

  const expectedSecret = process.env.STAGING_SMOKE_SECRET?.trim();
  if (!expectedSecret) {
    return apiError(requestId, "STAGING_SMOKE_SECRET_MISSING", "Staging smoke secret is not configured.", 403);
  }

  if (!stagingSmokeSecretsMatch(providedStagingSmokeSecret(request), expectedSecret)) {
    return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  }

  const body = (await request.json().catch(() => ({}))) as {
    includeLiveAi?: unknown;
    includeStorageSmoke?: unknown;
    includeEmailSmoke?: unknown;
    includeConnectorReadiness?: unknown;
    includeImportSmoke?: unknown;
    includePipelineSmoke?: unknown;
    includeProjectCreationDocumentsSmoke?: unknown;
    includeProjectControlsSmoke?: unknown;
  };

  try {
    const result = await runStagingSmokeBootstrap({
      baseUrl: stagingSmokeBaseUrl(request.nextUrl.origin),
      includeLiveAi: body.includeLiveAi === true,
      includeStorageSmoke: body.includeStorageSmoke === true,
      includeEmailSmoke: body.includeEmailSmoke === true,
      includeConnectorReadiness: body.includeConnectorReadiness === true,
      includeImportSmoke: body.includeImportSmoke === true,
      includePipelineSmoke: body.includePipelineSmoke === true,
      includeProjectCreationDocumentsSmoke: body.includeProjectCreationDocumentsSmoke === true,
      includeProjectControlsSmoke: body.includeProjectControlsSmoke === true,
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
