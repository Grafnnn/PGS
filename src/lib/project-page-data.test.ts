import { describe, expect, it } from "vitest";
import { loadDashboardData, loadProjectBundleForPage, loadProjectsForPage } from "@/lib/project-page-data";
import type { Project } from "@/lib/types";

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
    const result = await loadDashboardData({
      loadProjects: async () => [],
      loadBundle: async () => bundle()
    });

    expect(result.source).toBe("db");
    expect(result.projects).toEqual([]);
    expect(result.bundle).toBeNull();
    expect(result.primaryProjectHref).toBe("/projects");
  });
});
