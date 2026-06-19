import { describe, expect, it } from "vitest";
import { localUser } from "./permissions";
import { resolveEffectiveProjectRole, roleAllowsProjectAction } from "./project-permissions";

describe("project-level permissions", () => {
  it("lets global owner/admin win and maps project member roles", () => {
    expect(resolveEffectiveProjectRole(localUser("OWNER"), "VIEWER")).toBe("OWNER");
    expect(resolveEffectiveProjectRole({ ...localUser("MANAGER"), authenticated: true }, "VIEWER")).toBe("VIEWER");
    expect(resolveEffectiveProjectRole({ ...localUser("MANAGER"), authenticated: true }, "MANAGER")).toBe("MANAGER");
  });

  it("applies read/write/export permission matrix", () => {
    expect(roleAllowsProjectAction("VIEWER", "view")).toBe(true);
    expect(roleAllowsProjectAction("VIEWER", "export_project")).toBe(false);
    expect(roleAllowsProjectAction("MANAGER", "import")).toBe(true);
    expect(roleAllowsProjectAction("MANAGER", "delete_document")).toBe(false);
    expect(roleAllowsProjectAction("ADMIN", "manage_members")).toBe(true);
  });
});
