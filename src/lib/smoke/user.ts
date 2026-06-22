import { validatePasswordCandidate } from "@/lib/admin/users";
import { isSmokeEmail, SMOKE_PROJECT_ID } from "./cleanup";

export const CREATE_STAGING_SMOKE_USER_CONFIRM = SMOKE_PROJECT_ID;
export const DEMO_PROJECT_ID = "project-demo";

export interface StagingSmokeUserConfig {
  email: string;
  password: string;
  name: string;
  projectIds: string[];
}

export interface StagingSmokeUserReportInput {
  userAction: "created" | "updated";
  projectMemberships: Array<{ projectId: string; action: "created" | "kept"; role: "VIEWER" }>;
  revokedSessions: number;
}

function requireEnv(env: Record<string, string | undefined>, key: string) {
  const value = env[key]?.trim();
  if (!value) throw new Error(`${key} is required.`);
  return value;
}

export function validateStagingSmokeUserConfig(env: Record<string, string | undefined> = process.env): StagingSmokeUserConfig {
  if (env.CREATE_STAGING_SMOKE_USER_CONFIRM !== CREATE_STAGING_SMOKE_USER_CONFIRM) {
    throw new Error(`Refusing smoke user setup. Set CREATE_STAGING_SMOKE_USER_CONFIRM=${CREATE_STAGING_SMOKE_USER_CONFIRM}.`);
  }
  if (env.APP_ENV !== "staging") {
    throw new Error("Refusing smoke user setup outside APP_ENV=staging.");
  }
  if (env.NODE_ENV !== "production") {
    throw new Error("Refusing smoke user setup outside NODE_ENV=production.");
  }
  requireEnv(env, "DATABASE_URL");

  const email = requireEnv(env, "SMOKE_EMAIL").toLowerCase();
  if (!isSmokeEmail(email) || !email.endsWith("@pgs.local")) {
    throw new Error("SMOKE_EMAIL must be a synthetic smoke+...@pgs.local address.");
  }

  const password = requireEnv(env, "SMOKE_PASSWORD");
  const passwordError = validatePasswordCandidate(password);
  if (passwordError) throw new Error(passwordError);

  const includeDemoProject = env.SMOKE_INCLUDE_PROJECT_DEMO !== "false";
  return {
    email,
    password,
    name: env.SMOKE_NAME?.trim() || "PGS Staging Smoke User",
    projectIds: includeDemoProject ? [SMOKE_PROJECT_ID, DEMO_PROJECT_ID] : [SMOKE_PROJECT_ID]
  };
}

export function buildSafeStagingSmokeUserReport(input: StagingSmokeUserReportInput) {
  return {
    ok: true,
    smokeEmailConfigured: true,
    user: input.userAction,
    appRole: "VIEWER",
    organizationMembership: "project_manager",
    projectMemberships: input.projectMemberships,
    revokedSessions: input.revokedSessions,
    secretsPrinted: false
  };
}
