import type { Prisma } from "@prisma/client";
import { getEnvStatus } from "@/lib/env";
import { prisma } from "@/lib/prisma";
import type { AppUser } from "@/lib/auth/permissions";
import { organizationRoleCanManageUsers, organizationRoleToAppRole } from "@/lib/auth/organization-roles";

type DbClient = Prisma.TransactionClient | typeof prisma;

export class MultiOrganizationUserMutationError extends Error {
  constructor() {
    super("Global account credentials or status cannot be changed from one organization when the user belongs to multiple organizations");
  }
}

export async function getAdminOrganizationContext(user: AppUser | null) {
  if (!user) return null;
  if (!user.authenticated) {
    if (getEnvStatus().authRequired || (user.role !== "OWNER" && user.role !== "ADMIN")) return null;
    return { organizationId: "org-demo", userId: user.id, role: user.role };
  }

  const membership = await prisma.membership.findFirst({
    where: { userId: user.id, role: { in: ["owner", "super_admin"] } },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true, role: true }
  });
  if (!membership || !organizationRoleCanManageUsers(membership.role)) return null;
  return {
    organizationId: membership.organizationId,
    userId: user.id,
    role: organizationRoleToAppRole(membership.role)
  };
}

export async function assertSingleOrganizationUser(db: DbClient, userId: string) {
  const memberships = await db.membership.count({ where: { userId } });
  if (memberships > 1) throw new MultiOrganizationUserMutationError();
}

export async function lockOrganization(db: Prisma.TransactionClient, organizationId: string) {
  await db.$queryRaw`SELECT id FROM "organizations" WHERE id = ${organizationId} FOR UPDATE`;
}

export async function lockUser(db: Prisma.TransactionClient, userId: string) {
  await db.$queryRaw`SELECT id FROM "users" WHERE id = ${userId} FOR UPDATE`;
}

export async function lockProject(db: Prisma.TransactionClient, projectId: string) {
  await db.$queryRaw`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE`;
}
