import { PrismaClient } from "@prisma/client";
import { demoState } from "../src/lib/demo-data";

const prisma = new PrismaClient();

async function main() {
  const org = await prisma.organization.upsert({
    where: { id: "org-demo" },
    update: {},
    create: { id: "org-demo", name: "Демо Строй" }
  });

  const user = await prisma.user.upsert({
    where: { email: "demo@pgs.local" },
    update: {},
    create: {
      id: "user-demo",
      name: "Алексей Орлов",
      email: "demo@pgs.local",
      passwordHash: "$2a$10$local-demo-password-hash"
    }
  });

  await prisma.membership.upsert({
    where: { organizationId_userId: { organizationId: org.id, userId: user.id } },
    update: {},
    create: { organizationId: org.id, userId: user.id, role: "owner" }
  });

  const project = demoState.projects[0];
  await prisma.project.upsert({
    where: { id: project.id },
    update: {},
    create: {
      id: project.id,
      organizationId: org.id,
      name: project.name,
      customer: project.customer,
      object: project.object,
      address: project.address,
      contractAmount: project.contractAmount,
      vatMode: project.vatMode,
      startsAt: new Date(project.startsAt),
      endsAt: new Date(project.endsAt),
      manager: project.manager,
      status: project.status
    }
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: project.id, userId: user.id } },
    update: {},
    create: { projectId: project.id, userId: user.id, role: "owner" }
  });

  for (const item of demoState.budgetItems) {
    await prisma.budgetItem.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, organizationId: org.id, createdBy: user.id }
    });
  }

  for (const item of demoState.scheduleItems) {
    await prisma.scheduleItem.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        organizationId: org.id,
        startsAt: new Date(item.startsAt),
        endsAt: new Date(item.endsAt),
        createdBy: user.id
      }
    });
  }

  for (const item of demoState.materials) {
    await prisma.material.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, organizationId: org.id, neededAt: new Date(item.neededAt), createdBy: user.id }
    });
  }

  for (const item of demoState.payments) {
    await prisma.payment.upsert({
      where: { id: item.id },
      update: {},
      create: {
        ...item,
        organizationId: org.id,
        plannedAt: new Date(item.plannedAt),
        paidAt: item.paidAt ? new Date(item.paidAt) : null,
        createdBy: user.id
      }
    });
  }

  for (const item of demoState.dailyReports) {
    await prisma.dailyReport.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, organizationId: org.id, date: new Date(item.date), createdBy: user.id }
    });
  }

  for (const item of demoState.risks) {
    await prisma.risk.upsert({
      where: { id: item.id },
      update: {},
      create: { ...item, organizationId: org.id, dueAt: new Date(item.dueAt), createdBy: user.id }
    });
  }

  console.log("Seed complete: Демо Строй / demo@pgs.local");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
