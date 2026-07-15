import { describe, expect, it } from "vitest";
import { portfolioProjectScopeWhere } from "@/lib/portfolio-data";

describe("portfolioProjectScopeWhere", () => {
  it("limits owners and admins to organizations where they are members", () => {
    expect(portfolioProjectScopeWhere({ id: "owner-1", name: "Owner", email: "owner@pgs.local", role: "OWNER", authenticated: true }))
      .toEqual({ organization: { users: { some: { userId: "owner-1" } } } });
  });

  it("limits managers and viewers to explicit project membership", () => {
    expect(portfolioProjectScopeWhere({ id: "manager-1", name: "Manager", email: "manager@pgs.local", role: "MANAGER", authenticated: true }))
      .toEqual({ members: { some: { userId: "manager-1" } } });
  });

  it("keeps local fallback mode available", () => {
    expect(portfolioProjectScopeWhere({ id: "local", name: "Local", email: "local@pgs.local", role: "OWNER", authenticated: false })).toBeUndefined();
  });
});
