import { prisma } from "@/lib/prisma";
import { getEnvStatus } from "@/lib/env";
import type { AppRole, AppUser } from "./permissions";
import { toAppRole } from "./session";

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

export function resolveEffectiveProjectRole(user: AppUser | null, memberRole?: string | null): AppRole | null {
  if (!user) return null;
  if (user.role === "OWNER" || user.role === "ADMIN") return user.role;
  if (!user.authenticated) return user.role;
  if (memberRole) return toAppRole(memberRole);
  if (!getEnvStatus().authRequired) return user.role;
  return null;
}

export async function getEffectiveProjectRole(user: AppUser | null, projectId: string): Promise<AppRole | null> {
  if (!user) return null;
  if (user.role === "OWNER" || user.role === "ADMIN" || !user.authenticated) return resolveEffectiveProjectRole(user);
  const member = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId, userId: user.id } },
    select: { role: true }
  });
  return resolveEffectiveProjectRole(user, member?.role);
}

export async function canProject(user: AppUser | null, projectId: string, action: ProjectAction) {
  const role = await getEffectiveProjectRole(user, projectId);
  return roleAllowsProjectAction(role, action);
}
