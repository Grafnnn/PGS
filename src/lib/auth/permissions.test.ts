import { describe, expect, it } from "vitest";
import { canDeleteProject, canEditProject, canImportBudget, canUploadDocument, canViewAudit, canViewProject, localUser } from "./permissions";

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
    expect(canViewAudit(localUser("VIEWER"))).toBe(true);
    expect(canViewProject(null)).toBe(false);
  });
});
