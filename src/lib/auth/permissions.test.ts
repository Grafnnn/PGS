import { describe, expect, it } from "vitest";
import {
  canDeleteDocument,
  canDeleteProject,
  canEditProject,
  canImportBudget,
  canManageUsers,
  canUploadDocument,
  canViewAudit,
  canViewProject,
  localUser
} from "./permissions";

describe("permissions matrix", () => {
  it("allows owner/admin manager writes and viewer read only", () => {
    expect(canEditProject(localUser("OWNER"))).toBe(true);
    expect(canEditProject(localUser("ADMIN"))).toBe(true);
    expect(canEditProject(localUser("MANAGER"))).toBe(true);
    expect(canEditProject(localUser("VIEWER"))).toBe(false);
    expect(canDeleteProject(localUser("MANAGER"))).toBe(false);
    expect(canDeleteProject(localUser("ADMIN"))).toBe(true);
    expect(canImportBudget(localUser("VIEWER"))).toBe(false);
    expect(canUploadDocument(localUser("MANAGER"))).toBe(true);
    expect(canUploadDocument(localUser("VIEWER"))).toBe(false);
    expect(canDeleteDocument(localUser("MANAGER"))).toBe(false);
    expect(canDeleteDocument(localUser("ADMIN"))).toBe(true);
    expect(canManageUsers(localUser("MANAGER"))).toBe(false);
    expect(canManageUsers(localUser("OWNER"))).toBe(true);
    expect(canViewAudit(localUser("VIEWER"))).toBe(true);
    expect(canViewProject(null)).toBe(false);
  });
});
