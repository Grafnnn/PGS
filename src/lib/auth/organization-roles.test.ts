import { describe, expect, it } from "vitest";
import {
  appRoleToOrganizationRole,
  organizationRoleCanManageUsers,
  organizationRoleToAppRole
} from "./organization-roles";

describe("organization role mapping", () => {
  it("keeps organization authority explicit", () => {
    expect(organizationRoleToAppRole("owner")).toBe("OWNER");
    expect(organizationRoleToAppRole("super_admin")).toBe("ADMIN");
    expect(organizationRoleToAppRole("project_manager")).toBe("MANAGER");
    expect(organizationRoleToAppRole("finance")).toBe("MANAGER");
    expect(organizationRoleToAppRole("subcontractor")).toBe("VIEWER");
    expect(organizationRoleToAppRole("unknown")).toBe("VIEWER");
  });

  it("maps coarse application roles back to valid membership roles", () => {
    expect(appRoleToOrganizationRole("OWNER")).toBe("owner");
    expect(appRoleToOrganizationRole("ADMIN")).toBe("super_admin");
    expect(appRoleToOrganizationRole("MANAGER")).toBe("project_manager");
    expect(appRoleToOrganizationRole("VIEWER")).toBe("subcontractor");
  });

  it("restricts organization user administration to owner roles", () => {
    expect(organizationRoleCanManageUsers("owner")).toBe(true);
    expect(organizationRoleCanManageUsers("super_admin")).toBe(true);
    expect(organizationRoleCanManageUsers("project_manager")).toBe(false);
  });
});
