import type { AppRole } from "./permissions";

export type OrganizationRole =
  | "super_admin"
  | "owner"
  | "project_manager"
  | "finance"
  | "technical_director"
  | "pto"
  | "procurement"
  | "site_engineer"
  | "subcontractor";

export function organizationRoleToAppRole(role: string | null | undefined): AppRole {
  switch (String(role ?? "").toLowerCase()) {
    case "owner":
      return "OWNER";
    case "super_admin":
      return "ADMIN";
    case "project_manager":
    case "finance":
    case "technical_director":
    case "pto":
    case "procurement":
    case "site_engineer":
      return "MANAGER";
    default:
      return "VIEWER";
  }
}

export function appRoleToOrganizationRole(role: AppRole): OrganizationRole {
  switch (role) {
    case "OWNER":
      return "owner";
    case "ADMIN":
      return "super_admin";
    case "MANAGER":
      return "project_manager";
    case "VIEWER":
      return "subcontractor";
  }
}

export function organizationRoleCanManageUsers(role: string | null | undefined) {
  const appRole = organizationRoleToAppRole(role);
  return appRole === "OWNER" || appRole === "ADMIN";
}
