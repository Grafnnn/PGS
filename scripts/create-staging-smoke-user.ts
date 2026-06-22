import { PrismaClient } from "@prisma/client";
import { hashPassword } from "../src/lib/auth/password";
import { SMOKE_PROJECT_ID } from "../src/lib/smoke/cleanup";
import { buildSafeStagingSmokeUserReport, validateStagingSmokeUserConfig } from "../src/lib/smoke/user";

const prisma = new PrismaClient();

async function main() {
  const config = validateStagingSmokeUserConfig();
  const passwordHash = await hashPassword(config.password);

  const result = await prisma.$transaction(async (tx) => {
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

  console.log(JSON.stringify(result, null, 2));
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : "Staging smoke user setup failed.");
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
