import { createHash, timingSafeEqual } from "crypto";
import { NextRequest } from "next/server";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import type { AppUser } from "@/lib/auth/permissions";
import { deleteProjectWithConfirmation, ProjectDeleteError } from "@/lib/project-delete";

const DEMO_PROJECT_ID = "project-demo";
const DEMO_PROJECT_NAME = "Демо объект: строительство административного корпуса";

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

function stagingMaintenanceActor(): AppUser {
  return {
    id: "internal-staging-maintenance",
    name: "Internal Staging Maintenance",
    email: "internal-staging-maintenance@pgs.local",
    role: "OWNER",
    authenticated: false
  };
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

  const body = (await request.json().catch(() => ({}))) as {
    confirm?: unknown;
    projectId?: unknown;
    projectName?: unknown;
  };

  if (body.confirm !== true || body.projectId !== DEMO_PROJECT_ID || body.projectName !== DEMO_PROJECT_NAME) {
    return apiError(requestId, "INVALID_CONFIRMATION", "Exact demo project confirmation is required.", 400);
  }

  try {
    const result = await deleteProjectWithConfirmation({
      projectId: DEMO_PROJECT_ID,
      actor: stagingMaintenanceActor(),
      confirmation: {
        confirm: true,
        projectName: DEMO_PROJECT_NAME
      }
    });

    return apiOk(
      requestId,
      {
        ok: true,
        deletedProjectId: result.deletedProjectId,
        deletedProjectName: result.deletedProjectName,
        deletedCounts: result.deletedCounts,
        secretsPrinted: false
      },
      200
    );
  } catch (error) {
    if (error instanceof ProjectDeleteError) {
      return apiError(requestId, "PROJECT_DELETE_FAILED", error.message, error.status);
    }
    return apiError(requestId, "PROJECT_DELETE_FAILED", "Project delete failed.", 500);
  }
}

export async function GET(request: NextRequest) {
  return apiError(getRequestId(request), "NOT_FOUND", "Not found", 404);
}
