import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadDashboardData, loadProjectBundleForPage, loadProjectsForPage } from "@/lib/project-page-data";
import type { Project } from "@/lib/types";

const mocks = vi.hoisted(() => ({
  listProjectsFromDb: vi.fn(),
  getProjectBundleFromDb: vi.fn(),
  getEnvStatus: vi.fn()
}));

vi.mock("@/lib/project-data", () => ({
  listProjectsFromDb: mocks.listProjectsFromDb,
  getProjectBundleFromDb: mocks.getProjectBundleFromDb
}));

vi.mock("@/lib/env", () => ({ getEnvStatus: mocks.getEnvStatus }));

const project = {
  id: "project-live",
  organizationId: "org-demo",
  name: "Live project",
  customer: "Customer",
  object: "Object",
  address: "Address",
  contractAmount: 10_000,
  vatMode: "vat",
  startsAt: "2026-07-01",
  endsAt: "2026-08-01",
  manager: "Manager",
  status: "active"
} satisfies Project;

function bundle(id = "project-live") {
  return {
    project: { ...project, id },
    budgetItems: [],
    scheduleItems: [],
    materials: [],
    procurementRequests: [],
    payments: [],
    dailyReports: [],
    risks: [],
    aiMessages: []
  };
}

describe("project page data fallback", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.getEnvStatus.mockReturnValue({ production: false, authRequired: false });
    mocks.listProjectsFromDb.mockResolvedValue([project]);
    mocks.getProjectBundleFromDb.mockResolvedValue(bundle());
  });

  it("does not resurrect demo project when DB is available and returns null", async () => {
    const result = await loadProjectBundleForPage("project-demo", async () => null);

    expect(result.source).toBe("db");
    expect(result.bundle).toBeNull();
  });

  it("uses static demo fallback only when DB lookup throws", async () => {
    const result = await loadProjectBundleForPage("project-demo", async () => {
      throw new Error("DATABASE_URL missing");
    });

    expect(result.source).toBe("demo-fallback");
    expect(result.bundle?.project.id).toBe("project-demo");
  });

  it("surfaces DB failures instead of showing demo data when authenticated mode forbids fallback", async () => {
    await expect(loadProjectBundleForPage("project-demo", async () => {
      throw new Error("database unavailable");
    }, () => false)).rejects.toThrow("database unavailable");

    await expect(loadProjectsForPage(async () => {
      throw new Error("database unavailable");
    }, () => false)).rejects.toThrow("database unavailable");
  });

  it("does not replace an empty DB project list with demo projects", async () => {
    const result = await loadProjectsForPage(async () => []);

    expect(result.source).toBe("db");
    expect(result.projects).toEqual([]);
  });

  it("points dashboard to the first real DB project when project-demo is gone", async () => {
    const result = await loadDashboardData({
      loadProjects: async () => [project],
      loadBundle: async (id) => bundle(id)
    });

    expect(result.source).toBe("db");
    expect(result.primaryProjectHref).toBe("/projects/project-live");
    expect(result.bundle?.project.id).toBe("project-live");
  });

  it("renders dashboard empty state instead of demo data when DB has no projects", async () => {
    const loadBundle = vi.fn(async () => bundle());
    const result = await loadDashboardData({
      loadProjects: async () => [],
      loadBundle
    });

    expect(result.source).toBe("db");
    expect(result.projects).toEqual([]);
    expect(result.bundle).toBeNull();
    expect(result.primaryProjectHref).toBe("/projects");
    expect(loadBundle).not.toHaveBeenCalled();
  });

  it("loads dashboard summaries without fetching an unused project bundle by default", async () => {
    const result = await loadDashboardData();

    expect(result).toEqual({
      projects: [project],
      bundle: null,
      primaryProjectHref: "/projects/project-live",
      source: "db"
    });
    expect(mocks.listProjectsFromDb).toHaveBeenCalledTimes(1);
    expect(mocks.getProjectBundleFromDb).not.toHaveBeenCalled();
  });

  it("does not let an unused bundle failure replace scoped dashboard projects with demo data", async () => {
    mocks.getProjectBundleFromDb.mockRejectedValue(new Error("bundle unavailable"));
    const loadProjects = vi.fn(async () => [project]);

    const result = await loadDashboardData({ loadProjects });

    expect(result.projects).toEqual([project]);
    expect(result.source).toBe("db");
    expect(result.bundle).toBeNull();
    expect(loadProjects).toHaveBeenCalledTimes(1);
    expect(mocks.listProjectsFromDb).not.toHaveBeenCalled();
    expect(mocks.getProjectBundleFromDb).not.toHaveBeenCalled();
  });

  it("loads exactly the first scoped project's bundle when explicitly requested", async () => {
    const loadBundle = vi.fn(async (id: string) => bundle(id));

    const result = await loadDashboardData({
      loadProjects: async () => [project, { ...project, id: "project-second" }],
      loadBundle
    });

    expect(loadBundle).toHaveBeenCalledTimes(1);
    expect(loadBundle).toHaveBeenCalledWith("project-live");
    expect(result.bundle?.project.id).toBe("project-live");
    expect(result.source).toBe("db");
  });

  it("does not replace a missing explicitly requested bundle with demo data", async () => {
    const result = await loadDashboardData({ loadBundle: async () => null });

    expect(result.bundle).toBeNull();
    expect(result.projects).toEqual([project]);
    expect(result.primaryProjectHref).toBe("/projects/project-live");
    expect(result.source).toBe("db");
  });

  it.each([
    { production: true, authRequired: false },
    { production: false, authRequired: true }
  ])("surfaces summary failures when fallback is forbidden: %j", async (status) => {
    mocks.getEnvStatus.mockReturnValue(status);
    mocks.listProjectsFromDb.mockRejectedValue(new Error("projects unavailable"));

    await expect(loadDashboardData()).rejects.toThrow("projects unavailable");
    expect(mocks.getProjectBundleFromDb).not.toHaveBeenCalled();
  });

  it("keeps local summary fallback free of unused bundles", async () => {
    mocks.listProjectsFromDb.mockRejectedValue(new Error("projects unavailable"));

    const result = await loadDashboardData();

    expect(result.source).toBe("demo-fallback");
    expect(result.projects.length).toBeGreaterThan(0);
    expect(result.primaryProjectHref).toBe("/projects/project-demo");
    expect(result.bundle).toBeNull();
    expect(mocks.getProjectBundleFromDb).not.toHaveBeenCalled();
  });

  it("preserves fallback policy for explicitly requested bundle failures", async () => {
    const loadBundle = vi.fn(async () => { throw new Error("bundle unavailable"); });

    await expect(loadDashboardData({ loadBundle, allowDemoFallback: () => false }))
      .rejects.toThrow("bundle unavailable");

    const result = await loadDashboardData({ loadBundle, allowDemoFallback: () => true });

    expect(result.source).toBe("demo-fallback");
    expect(result.bundle?.project.id).toBe("project-demo");
  });
});
