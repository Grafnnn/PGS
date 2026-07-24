import { PrismaClient } from "@prisma/client";
import { demoState } from "../src/lib/demo-data";
import { hashPassword } from "../src/lib/auth/password";
import { ensureBootstrapAdmin } from "../src/lib/auth/bootstrap-admin";
import { getEnv } from "../src/lib/env";

const prisma = new PrismaClient();

async function main() {
  const env = getEnv();
  const production = env.NODE_ENV === "production";
  const org = await prisma.organization.upsert({
    where: { id: "org-demo" },
    update: {},
    create: { id: "org-demo", name: "Демо Строй" }
  });

  const firstAdminEmail = env.FIRST_ADMIN_EMAIL ?? (production ? undefined : "admin@pgs.local");
  const firstAdminPassword = env.FIRST_ADMIN_PASSWORD ?? (production ? undefined : "pgs-admin-local");
  const firstAdminName = env.FIRST_ADMIN_NAME ?? "PGS Admin";
  let seedUser: { id: string } | null = null;
  if (firstAdminEmail) {
    const { user: firstAdmin } = await ensureBootstrapAdmin(
      {
        findByEmail: (email) => prisma.user.findUnique({ where: { email }, select: { id: true } }),
        create: (data) => prisma.user.create({ data, select: { id: true } })
      },
      { email: firstAdminEmail, name: firstAdminName, password: firstAdminPassword },
      hashPassword
    );
    seedUser = firstAdmin;
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: firstAdmin.id } },
      update: { role: "owner" },
      create: { organizationId: org.id, userId: firstAdmin.id, role: "owner" }
    });
  }

  if (!production) {
    const demoUser = await prisma.user.upsert({
      where: { email: "demo@pgs.local" },
      update: {
        passwordHash: await hashPassword(env.DEMO_ADMIN_PASSWORD),
        appRole: "OWNER",
        isActive: true
      },
      create: {
        id: "user-demo",
        name: "Алексей Орлов",
        email: "demo@pgs.local",
        passwordHash: await hashPassword(env.DEMO_ADMIN_PASSWORD),
        appRole: "OWNER",
        isActive: true
      }
    });

    seedUser = demoUser;
    await prisma.membership.upsert({
      where: { organizationId_userId: { organizationId: org.id, userId: demoUser.id } },
      update: {},
      create: { organizationId: org.id, userId: demoUser.id, role: "owner" }
    });
  }

  if (!seedUser) {
    throw new Error("FIRST_ADMIN_EMAIL is required when running prisma seed in production.");
  }

  const user = seedUser;
  const seedDemoProject = env.APP_ENV !== "staging" || env.SEED_DEMO_PROJECT === "true";

  const project = demoState.projects[0];
  if (seedDemoProject) {
    await prisma.project.upsert({
      where: { id: project.id },
      update: {
        name: project.name,
        customer: project.customer,
        object: project.object,
        address: project.address,
        contractAmount: project.contractAmount,
        vatMode: project.vatMode,
        startsAt: new Date(project.startsAt),
        endsAt: new Date(project.endsAt),
        manager: project.manager,
        status: project.status,
        isSmokeProject: false
      },
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
        status: project.status,
        isSmokeProject: false
      }
    });

    await prisma.projectMember.upsert({
      where: { projectId_userId: { projectId: project.id, userId: user.id } },
      update: { role: "OWNER" },
      create: { projectId: project.id, userId: user.id, role: "OWNER" }
    });
  }

  const smokeProject = await prisma.project.upsert({
    where: { id: "project-smoke" },
    update: {
      name: "SMOKE: staging verification project",
      customer: "Демо Строй",
      object: "Smoke объект для проверки staging",
      address: "Не использовать для реальных данных",
      contractAmount: 1000000,
      vatMode: "vat",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      manager: "PGS Smoke",
      status: "planning",
      isSmokeProject: true
    },
    create: {
      id: "project-smoke",
      organizationId: org.id,
      name: "SMOKE: staging verification project",
      customer: "Демо Строй",
      object: "Smoke объект для проверки staging",
      address: "Не использовать для реальных данных",
      contractAmount: 1000000,
      vatMode: "vat",
      startsAt: new Date(),
      endsAt: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      manager: "PGS Smoke",
      status: "planning",
      isSmokeProject: true
    }
  });

  await prisma.projectMember.upsert({
    where: { projectId_userId: { projectId: smokeProject.id, userId: user.id } },
    update: { role: "OWNER" },
    create: { projectId: smokeProject.id, userId: user.id, role: "OWNER" }
  });

  if (seedDemoProject) {
    const sections = Array.from(new Set(demoState.budgetItems.map((item) => item.section)));
    for (const [index, name] of sections.entries()) {
      await prisma.budgetSection.upsert({
        where: { projectId_name: { projectId: project.id, name } },
        update: {},
        create: {
          organizationId: org.id,
          projectId: project.id,
          name,
          sortOrder: index,
          createdBy: user.id
        }
      });
    }

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

    await prisma.procurementRequest.deleteMany({ where: { projectId: project.id } });
    for (const item of demoState.procurementRequests) {
      await prisma.procurementRequest.create({
        data: {
          id: item.id,
          organizationId: org.id,
          projectId: project.id,
          title: item.title,
          initiator: item.initiator,
          neededAt: new Date(item.neededAt),
          priority: item.priority,
          status: item.status,
          createdBy: user.id,
          items: {
            create: item.items.map((requestItem) => ({
              materialId: requestItem.materialId,
              name: requestItem.name,
              qty: requestItem.qty,
              unit: requestItem.unit,
              comment: requestItem.comment
            }))
          }
        }
      });
    }

    const supplier = await prisma.supplier.upsert({
      where: { id: "supplier-betontorg" },
      update: {},
      create: {
        id: "supplier-betontorg",
        organizationId: org.id,
        name: "БетонТорг",
        phone: "+7 495 000-00-00",
        email: "sales@betontorg.local"
      }
    });

    await prisma.supplierQuote.upsert({
      where: { id: "quote-concrete-1" },
      update: {},
      create: {
        id: "quote-concrete-1",
        organizationId: org.id,
        projectId: project.id,
        supplierId: supplier.id,
        material: "Бетон В25",
        price: 6550,
        deliveryDays: 2,
        paymentTerms: "50% аванс, 50% по факту",
        vatIncluded: true,
        comment: "Демо КП для сравнения поставщиков"
      }
    });

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

    await prisma.document.upsert({
      where: { id: "doc-contract-demo" },
      update: {},
      create: {
        id: "doc-contract-demo",
        organizationId: org.id,
        projectId: project.id,
        category: "договор",
        title: "Договор подряда - демо",
        filePath: "uploads/demo-contract.pdf",
        fileName: "demo-contract.pdf",
        mimeType: "application/pdf",
        sizeBytes: 0,
        storageKey: "demo/demo-contract.pdf",
        version: 1,
        author: "Алексей Орлов",
        comment: "Метаданные документа для MVP; файл можно подключить на следующем этапе.",
        createdBy: user.id
      }
    });

    for (const item of demoState.risks) {
      await prisma.risk.upsert({
        where: { id: item.id },
        update: {},
        create: { ...item, organizationId: org.id, dueAt: new Date(item.dueAt), createdBy: user.id }
      });
    }
  }

  console.log(seedDemoProject ? "Seed complete: Демо Строй / demo project" : "Seed complete: Демо Строй / smoke project");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
