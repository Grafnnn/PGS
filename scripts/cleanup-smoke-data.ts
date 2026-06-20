import { PrismaClient } from "@prisma/client";
import { assertSmokeCleanupConfirm, SMOKE_EMAIL_FRAGMENT, SMOKE_PREFIX, SMOKE_PROJECT_ID } from "../src/lib/smoke/cleanup";

const prisma = new PrismaClient();

async function main() {
  assertSmokeCleanupConfirm(process.env.SMOKE_CLEANUP_CONFIRM);

  const project = await prisma.project.findUnique({ where: { id: SMOKE_PROJECT_ID }, select: { id: true, isSmokeProject: true } });
  if (!project?.isSmokeProject) {
    throw new Error(`Refusing cleanup because ${SMOKE_PROJECT_ID} is missing or isSmokeProject=false.`);
  }

  const startsWithSmoke = { startsWith: SMOKE_PREFIX };
  const containsSmokeEmail = { contains: SMOKE_EMAIL_FRAGMENT, mode: "insensitive" as const };
  const smokeUsers = await prisma.user.findMany({ where: { email: containsSmokeEmail }, select: { id: true } });
  const smokeUserIds = smokeUsers.map((user) => user.id);

  const results = {
    documents: await prisma.document.deleteMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [{ title: startsWithSmoke }, { fileName: startsWithSmoke }, { storageKey: startsWithSmoke }]
      }
    }),
    budgetItems: await prisma.budgetItem.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ code: startsWithSmoke }, { name: startsWithSmoke }, { source: startsWithSmoke }] }
    }),
    scheduleItems: await prisma.scheduleItem.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ name: startsWithSmoke }, { owner: startsWithSmoke }] }
    }),
    materials: await prisma.material.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ name: startsWithSmoke }, { supplier: startsWithSmoke }] }
    }),
    procurementRequests: await prisma.procurementRequest.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ title: startsWithSmoke }, { initiator: startsWithSmoke }] }
    }),
    payments: await prisma.payment.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ title: startsWithSmoke }, { counterparty: startsWithSmoke }] }
    }),
    dailyReports: await prisma.dailyReport.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ author: startsWithSmoke }, { completedWorks: startsWithSmoke }] }
    }),
    risks: await prisma.risk.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, OR: [{ title: startsWithSmoke }, { owner: startsWithSmoke }] }
    }),
    invites: await prisma.userInvite.deleteMany({ where: { email: containsSmokeEmail } }),
    resetTokens: await prisma.passwordResetToken.deleteMany({ where: { user: { email: containsSmokeEmail } } }),
    smokeProjectMembers: await prisma.projectMember.deleteMany({ where: { userId: { in: smokeUserIds } } }),
    smokeMemberships: await prisma.membership.deleteMany({ where: { userId: { in: smokeUserIds } } }),
    smokeUsers: await prisma.user.deleteMany({ where: { id: { in: smokeUserIds } } })
  };

  console.log(JSON.stringify({ ok: true, projectId: SMOKE_PROJECT_ID, deleted: results }, null, 2));
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
