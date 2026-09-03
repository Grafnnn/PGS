import { prisma } from "./prisma";
import type { AppUser } from "./auth/permissions";
import type { Project } from "./types";
import { scheduleProgressPercent } from "./calculations";
import { visibleProjectWhere } from "./project-data-scope";
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

export async function listProjectsFromDb(user?: AppUser | null): Promise<Project[]> {
  const projects = await prisma.project.findMany({
    where: visibleProjectWhere(user),
    include: {
      scheduleItems: {
        where: { isCurrent: true },
        select: { plannedQty: true, actualQty: true, status: true }
      }
    },
    orderBy: { createdAt: "asc" }
  });

  return projects.map((project) => ({
    ...serializeProject(project),
    progressPercent: scheduleProgressPercent(project.scheduleItems.map((item) => ({
      plannedQty: item.plannedQty.toNumber(),
      actualQty: item.actualQty.toNumber(),
      status: item.status
    })))
  }));
}

export async function getUserOrganizationContext(user: AppUser | null | undefined) {
  if (!user?.authenticated) {
    const context = await getDemoContext();
    const organization = await prisma.organization.findUnique({ where: { id: context.organizationId }, select: { id: true, name: true } });
    return { organizationId: context.organizationId, organizationName: organization?.name ?? "Локальная организация", userId: context.userId };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id },
    orderBy: { createdAt: "asc" },
    include: { organization: { select: { id: true, name: true } } }
  });
  if (!membership) return null;
  return {
    organizationId: membership.organizationId,
    organizationName: membership.organization.name,
    userId: user.id
  };
}

export async function getProjectBundleFromDb(projectId: string) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      budgetItems: { orderBy: [{ section: "asc" }, { code: "asc" }] },
      scheduleItems: { where: { isCurrent: true }, orderBy: { startsAt: "asc" } },
      materials: { orderBy: { neededAt: "asc" } },
      procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
      payments: { orderBy: { plannedAt: "asc" } },
      dailyReports: {
        include: {
          evidenceDocuments: { orderBy: { uploadedAt: "asc" } },
          progressEntries: { orderBy: { createdAt: "asc" } }
        },
        orderBy: { date: "desc" }
      },
      risks: { orderBy: { dueAt: "asc" } }
    }
  });

  if (!project) return null;

  const currentScheduleIds = new Set(project.scheduleItems.map((item) => item.id));
  return {
    project: serializeProject(project),
    budgetItems: project.budgetItems.map(serializeBudgetItem),
    scheduleItems: project.scheduleItems.map(serializeScheduleItem),
    materials: project.materials.map(serializeMaterial),
    procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
    payments: project.payments.map(serializePayment),
    dailyReports: project.dailyReports.map((item) => serializeDailyReport(item, currentScheduleIds)),
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
