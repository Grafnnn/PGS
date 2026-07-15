import type { Prisma } from "@prisma/client";
import type { AppUser } from "@/lib/auth/permissions";
import { demoState } from "@/lib/demo-data";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { PortfolioProjectSource } from "@/lib/portfolio-control";

export function portfolioProjectScopeWhere(user: AppUser): Prisma.ProjectWhereInput | undefined {
  if (!user.authenticated) return undefined;
  if (user.role === "OWNER" || user.role === "ADMIN") {
    return { organization: { users: { some: { userId: user.id } } } };
  }
  return { members: { some: { userId: user.id } } };
}

export async function loadPortfolioProjects(user: AppUser): Promise<PortfolioProjectSource[]> {
  const projects = await prisma.project.findMany({
    where: portfolioProjectScopeWhere(user),
    orderBy: [{ status: "asc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      code: true,
      customer: true,
      manager: true,
      status: true,
      contractAmount: true,
      startsAt: true,
      endsAt: true,
      budgetItems: { select: { qty: true, plannedUnitPrice: true, forecastUnitPrice: true } },
      scheduleItems: { select: { name: true, plannedQty: true, actualQty: true, status: true, endsAt: true } },
      materials: { select: { requiredQty: true, orderedQty: true, deliveredQty: true, status: true, neededAt: true } },
      payments: { select: { direction: true, amount: true, status: true, plannedAt: true, paidAt: true } },
      risks: { select: { priority: true, status: true, dueAt: true } },
      actionItems: { select: { priority: true, status: true, dueAt: true, assignee: true } }
    }
  });

  return projects.map((project) => ({
    ...project,
    status: String(project.status),
    contractAmount: Number(project.contractAmount),
    startsAt: project.startsAt.toISOString(),
    endsAt: project.endsAt.toISOString(),
    budgetItems: project.budgetItems.map((item) => ({
      qty: Number(item.qty),
      plannedUnitPrice: Number(item.plannedUnitPrice),
      forecastUnitPrice: Number(item.forecastUnitPrice)
    })),
    scheduleItems: project.scheduleItems.map((item) => ({
      ...item,
      plannedQty: Number(item.plannedQty),
      actualQty: Number(item.actualQty),
      endsAt: item.endsAt.toISOString()
    })),
    materials: project.materials.map((item) => ({
      ...item,
      requiredQty: Number(item.requiredQty),
      orderedQty: Number(item.orderedQty),
      deliveredQty: Number(item.deliveredQty),
      neededAt: item.neededAt.toISOString()
    })),
    payments: project.payments.map((item) => ({
      ...item,
      amount: Number(item.amount),
      plannedAt: item.plannedAt.toISOString(),
      paidAt: item.paidAt?.toISOString() ?? null
    })),
    risks: project.risks.map((item) => ({ ...item, priority: String(item.priority), dueAt: item.dueAt.toISOString() })),
    actionItems: project.actionItems.map((item) => ({ ...item, dueAt: item.dueAt?.toISOString() ?? null }))
  }));
}

export async function loadPortfolioProjectsForPage(user: AppUser): Promise<PortfolioProjectSource[]> {
  try {
    return await loadPortfolioProjects(user);
  } catch (error) {
    if (getEnvStatus().authRequired) throw error;
    return demoState.projects.map((project) => ({
      id: project.id,
      name: project.name,
      code: project.code,
      customer: project.customer,
      manager: project.manager,
      status: project.status,
      contractAmount: project.contractAmount,
      startsAt: project.startsAt,
      endsAt: project.endsAt,
      budgetItems: demoState.budgetItems.filter((item) => item.projectId === project.id).map((item) => ({ qty: item.qty, plannedUnitPrice: item.plannedUnitPrice, forecastUnitPrice: item.forecastUnitPrice })),
      scheduleItems: demoState.scheduleItems.filter((item) => item.projectId === project.id).map((item) => ({ name: item.name, plannedQty: item.plannedQty, actualQty: item.actualQty, status: item.status, endsAt: item.endsAt })),
      materials: demoState.materials.filter((item) => item.projectId === project.id).map((item) => ({ requiredQty: item.requiredQty, orderedQty: item.orderedQty, deliveredQty: item.deliveredQty, status: item.status, neededAt: item.neededAt })),
      payments: demoState.payments.filter((item) => item.projectId === project.id).map((item) => ({ direction: item.direction, amount: item.amount, status: item.status, plannedAt: item.plannedAt, paidAt: item.paidAt })),
      risks: demoState.risks.filter((item) => item.projectId === project.id).map((item) => ({ priority: item.priority, status: item.status, dueAt: item.dueAt })),
      actionItems: []
    }));
  }
}
