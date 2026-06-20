export type AppRole = "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";

export interface AppUser {
  id: string;
  name: string;
  email: string;
  role: AppRole;
  authenticated: boolean;
}

const writeRoles: AppRole[] = ["OWNER", "ADMIN", "MANAGER"];
const deleteRoles: AppRole[] = ["OWNER", "ADMIN"];
const documentDeleteRoles: AppRole[] = ["OWNER", "ADMIN"];

export function localUser(role: AppRole = "OWNER"): AppUser {
  return {
    id: "local-user",
    name: "Local User",
    email: "local@pgs.dev",
    role,
    authenticated: false
  };
}

export function canViewProject(user: AppUser | null) {
  return Boolean(user);
}

export function canEditProject(user: AppUser | null) {
  return Boolean(user && writeRoles.includes(user.role));
}

export function canDeleteProject(user: AppUser | null) {
  return Boolean(user && deleteRoles.includes(user.role));
}

export function canImportBudget(user: AppUser | null) {
  return canEditProject(user);
}

export function canUploadDocument(user: AppUser | null) {
  return canEditProject(user);
}

export function canDeleteDocument(user: AppUser | null) {
  return Boolean(user && documentDeleteRoles.includes(user.role));
}

export function canViewAudit(user: AppUser | null) {
  return Boolean(user && ["OWNER", "ADMIN", "MANAGER", "VIEWER"].includes(user.role));
}

export function canManageUsers(user: AppUser | null) {
  return Boolean(user && ["OWNER", "ADMIN"].includes(user.role));
}
