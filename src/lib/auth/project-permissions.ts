import { prisma } from "@/lib/prisma";
import { getEnvStatus } from "@/lib/env";
import type { AppRole, AppUser } from "./permissions";
import { toAppRole } from "./session";
import { organizationRoleToAppRole } from "./organization-roles";
import type { Prisma } from "@prisma/client";

type DbClient = Prisma.TransactionClient | typeof prisma;

export type ProjectAction =
  | "view"
  | "edit"
  | "delete"
  | "import"
  | "upload_document"
  | "delete_document"
  | "view_audit"
  | "export_project"
  | "export_audit"
  | "sync_accounting"
  | "manage_members";

const actionRoles: Record<ProjectAction, AppRole[]> = {
  view: ["OWNER", "ADMIN", "MANAGER", "VIEWER"],
  edit: ["OWNER", "ADMIN", "MANAGER"],
  delete: ["OWNER", "ADMIN"],
  import: ["OWNER", "ADMIN", "MANAGER"],
  upload_document: ["OWNER", "ADMIN", "MANAGER"],
  delete_document: ["OWNER", "ADMIN"],
  view_audit: ["OWNER", "ADMIN", "MANAGER", "VIEWER"],
  export_project: ["OWNER", "ADMIN", "MANAGER"],
  export_audit: ["OWNER", "ADMIN", "MANAGER"],
  sync_accounting: ["OWNER", "ADMIN", "MANAGER"],
  manage_members: ["OWNER", "ADMIN"]
};

export function roleAllowsProjectAction(role: AppRole | null, action: ProjectAction) {
  return Boolean(role && actionRoles[action].includes(role));
}

export function resolveEffectiveProjectRole(
  user: AppUser | null,
  memberRole?: string | null,
  organizationRole?: string | null
): AppRole | null {
  if (!user) return null;
  if (!user.authenticated) return user.role;
  const scopedOrganizationRole = organizationRoleToAppRole(organizationRole);
  if (scopedOrganizationRole === "OWNER" || scopedOrganizationRole === "ADMIN") return scopedOrganizationRole;
  if (memberRole) return toAppRole(memberRole);
  if (!getEnvStatus().authRequired) return user.role;
  return null;
}

export async function getEffectiveProjectRoleWithClient(db: DbClient, user: AppUser | null, projectId: string): Promise<AppRole | null> {
  if (!user) return null;
  if (!user.authenticated) return resolveEffectiveProjectRole(user);
  const project = await db.project.findUnique({
    where: { id: projectId },
    select: { organizationId: true }
  });
  if (!project) return null;
  const membership = await db.membership.findUnique({
    where: { organizationId_userId: { organizationId: project.organizationId, userId: user.id } },
    select: { role: true }
  });
  if (!membership) return null;
  const organizationRole = organizationRoleToAppRole(membership.role);
  if (organizationRole === "OWNER" || organizationRole === "ADMIN") return organizationRole;
  const member = await db.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true }
  });
  return member ? toAppRole(member.role) : null;
}

export async function getEffectiveProjectRole(user: AppUser | null, projectId: string): Promise<AppRole | null> {
  return getEffectiveProjectRoleWithClient(prisma, user, projectId);
}

export async function canProjectWithClient(db: DbClient, user: AppUser | null, projectId: string, action: ProjectAction) {
  const role = await getEffectiveProjectRoleWithClient(db, user, projectId);
  return roleAllowsProjectAction(role, action);
}

export async function canProject(user: AppUser | null, projectId: string, action: ProjectAction) {
  return canProjectWithClient(prisma, user, projectId, action);
}
