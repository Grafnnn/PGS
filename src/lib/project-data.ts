import { prisma } from "./prisma";
import type { AppUser } from "./auth/permissions";
import {
  serializeBudgetItem,
  serializeDailyReport,
  serializeMaterial,
  serializePayment,
  serializeProcurementRequest,
  serializeProject,
  serializeRisk,
  serializeScheduleItem
} from "./serializers";

export async function listProjectsFromDb(user?: AppUser | null) {
  const projects = await prisma.project.findMany({
    where:
      user?.authenticated && user.role !== "OWNER" && user.role !== "ADMIN"
        ? { members: { some: { userId: user.id } } }
        : undefined,
    orderBy: { createdAt: "asc" }
  });

  return projects.map(serializeProject);
}

export async function getProjectBundleFromDb(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      budgetItems: { orderBy: [{ section: "asc" }, { code: "asc" }] },
      scheduleItems: { orderBy: { startsAt: "asc" } },
      materials: { orderBy: { neededAt: "asc" } },
      procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
      payments: { orderBy: { plannedAt: "asc" } },
      dailyReports: { orderBy: { date: "desc" } },
      risks: { orderBy: { dueAt: "asc" } }
    }
  });

  if (!project) return null;

  return {
    project: serializeProject(project),
    budgetItems: project.budgetItems.map(serializeBudgetItem),
    scheduleItems: project.scheduleItems.map(serializeScheduleItem),
    materials: project.materials.map(serializeMaterial),
    procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
    payments: project.payments.map(serializePayment),
    dailyReports: project.dailyReports.map(serializeDailyReport),
    risks: project.risks.map(serializeRisk),
    aiMessages: []
  };
}

export async function getDemoContext() {
  const organization = await prisma.organization.findUnique({ where: { id: "org-demo" } });
  const user = await prisma.user.findUnique({ where: { email: "demo@pgs.local" } });
  return {
    organizationId: organization?.id ?? "org-demo",
    userId: user?.id ?? "user-demo"
  };
}
