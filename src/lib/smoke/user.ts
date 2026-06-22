import { PrismaClient } from "@prisma/client";
import { validatePasswordCandidate } from "@/lib/admin/users";
import { hashPassword } from "@/lib/auth/password";
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

export type StagingSmokeUserReport = ReturnType<typeof buildSafeStagingSmokeUserReport>;

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

export async function createOrRotateStagingSmokeUser(db: PrismaClient, env: Record<string, string | undefined> = process.env) {
  const config = validateStagingSmokeUserConfig(env);
  const passwordHash = await hashPassword(config.password);

  return await db.$transaction(async (tx) => {
    const organization = await tx.organization.findUnique({ where: { id: "org-demo" }, select: { id: true } });
    if (!organization) throw new Error("Refusing smoke user setup because org-demo is missing. Run staging seed first.");

    const projects = await tx.project.findMany({
      where: { id: { in: config.projectIds } },
      select: { id: true, isSmokeProject: true }
    });
    const projectById = new Map(projects.map((project) => [project.id, project]));
    const smokeProject = projectById.get(SMOKE_PROJECT_ID);
    if (!smokeProject?.isSmokeProject) {
      throw new Error(`Refusing smoke user setup because ${SMOKE_PROJECT_ID} is missing or isSmokeProject=false.`);
    }
    const missingProjectId = config.projectIds.find((projectId) => !projectById.has(projectId));
    if (missingProjectId) throw new Error(`Refusing smoke user setup because ${missingProjectId} is missing.`);

    const existingUser = await tx.user.findUnique({ where: { email: config.email }, select: { id: true } });
    const user = await tx.user.upsert({
      where: { email: config.email },
      update: {
        name: config.name,
        passwordHash,
        appRole: "VIEWER",
        isActive: true
      },
      create: {
        name: config.name,
        email: config.email,
        passwordHash,
        appRole: "VIEWER",
        isActive: true
      }
    });

    await tx.membership.upsert({
      where: { organizationId_userId: { organizationId: organization.id, userId: user.id } },
      update: { role: "project_manager" },
      create: { organizationId: organization.id, userId: user.id, role: "project_manager" }
    });

    const projectMemberships = [];
    for (const projectId of config.projectIds) {
      const existing = await tx.projectMember.findUnique({
        where: { projectId_userId: { projectId, userId: user.id } },
        select: { id: true }
      });
      await tx.projectMember.upsert({
        where: { projectId_userId: { projectId, userId: user.id } },
        update: { role: "VIEWER" },
        create: { projectId, userId: user.id, role: "VIEWER" }
      });
      projectMemberships.push({ projectId, action: existing ? ("kept" as const) : ("created" as const), role: "VIEWER" as const });
    }

    const revokedSessions = await tx.session.updateMany({
      where: { userId: user.id, revokedAt: null },
      data: { revokedAt: new Date() }
    });

    await tx.passwordResetToken.deleteMany({ where: { userId: user.id, usedAt: null } });

    return buildSafeStagingSmokeUserReport({
      userAction: existingUser ? "updated" : "created",
      projectMemberships,
      revokedSessions: revokedSessions.count
    });
  });
}
