import { describe, expect, it } from "vitest";
import { localUser } from "./permissions";
import { resolveEffectiveProjectRole, roleAllowsProjectAction } from "./project-permissions";

describe("project-level permissions", () => {
  it("uses local roles only in local mode and scopes authenticated authority to the target organization", () => {
    expect(resolveEffectiveProjectRole(localUser("OWNER"), "VIEWER")).toBe("OWNER");
    expect(resolveEffectiveProjectRole({ ...localUser("OWNER"), authenticated: true }, "VIEWER", "project_manager")).toBe("VIEWER");
    expect(resolveEffectiveProjectRole({ ...localUser("VIEWER"), authenticated: true }, "VIEWER", "owner")).toBe("OWNER");
    expect(resolveEffectiveProjectRole({ ...localUser("MANAGER"), authenticated: true }, "VIEWER")).toBe("VIEWER");
    expect(resolveEffectiveProjectRole({ ...localUser("MANAGER"), authenticated: true }, "MANAGER")).toBe("MANAGER");
  });

  it("applies read/write/export permission matrix", () => {
    expect(roleAllowsProjectAction("VIEWER", "view")).toBe(true);
    expect(roleAllowsProjectAction("VIEWER", "export_project")).toBe(false);
    expect(roleAllowsProjectAction("MANAGER", "import")).toBe(true);
    expect(roleAllowsProjectAction("MANAGER", "sync_accounting")).toBe(true);
    expect(roleAllowsProjectAction("VIEWER", "sync_accounting")).toBe(false);
    expect(roleAllowsProjectAction("MANAGER", "delete_document")).toBe(false);
    expect(roleAllowsProjectAction("ADMIN", "manage_members")).toBe(true);
  });
});
