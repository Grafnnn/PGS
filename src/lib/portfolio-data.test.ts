import { describe, expect, it } from "vitest";
import { portfolioProjectScopeWhere } from "@/lib/portfolio-data";

describe("portfolioProjectScopeWhere", () => {
  const expectedScope = (userId: string) => ({
    OR: [
      { organization: { users: { some: { userId, role: { in: ["owner", "super_admin"] } } } } },
      { organization: { users: { some: { userId } } }, members: { some: { userId } } }
    ]
  });

  it("uses organization membership roles instead of a global owner flag", () => {
    expect(portfolioProjectScopeWhere({ id: "owner-1", name: "Owner", email: "owner@pgs.local", role: "OWNER", authenticated: true }))
      .toEqual(expectedScope("owner-1"));
  });

  it("requires explicit project membership when the target organization role is not privileged", () => {
    expect(portfolioProjectScopeWhere({ id: "manager-1", name: "Manager", email: "manager@pgs.local", role: "MANAGER", authenticated: true }))
      .toEqual(expectedScope("manager-1"));
  });

  it("keeps local fallback mode available", () => {
    expect(portfolioProjectScopeWhere({ id: "local", name: "Local", email: "local@pgs.local", role: "OWNER", authenticated: false })).toBeUndefined();
  });
});
