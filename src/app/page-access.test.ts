import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { loadDashboardData, loadProjectBundleForPage, loadProjectsForPage } from "@/lib/project-page-data";

const navigation = vi.hoisted(() => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`REDIRECT:${path}`);
  }),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  })
}));

vi.mock("next/navigation", () => navigation);
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn() }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn() }));
vi.mock("@/lib/project-page-data", () => ({
  loadDashboardData: vi.fn(),
  loadProjectBundleForPage: vi.fn(),
  loadProjectsForPage: vi.fn()
}));
vi.mock("@/lib/project-data", () => ({
  listProjectsFromDb: vi.fn()
}));

describe("server-rendered page access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
  });

  it("redirects an anonymous dashboard request before loading portfolio data", async () => {
    const { default: DashboardPage } = await import("./dashboard/page");
    await expect(DashboardPage()).rejects.toThrow("REDIRECT:/login");
    expect(loadDashboardData).not.toHaveBeenCalled();
  });

  it("redirects an anonymous projects request before loading the registry", async () => {
    const { default: ProjectsPage } = await import("./projects/page");
    await expect(ProjectsPage()).rejects.toThrow("REDIRECT:/login");
    expect(loadProjectsForPage).not.toHaveBeenCalled();
  });

  it("hides a project page when the signed-in user has no project access", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "viewer-1", name: "Viewer", email: "viewer@example.test", role: "VIEWER", authenticated: true });
    vi.mocked(canProject).mockResolvedValue(false);
    const { default: ProjectPage } = await import("./projects/[id]/page");

    await expect(ProjectPage({ params: { id: "private-project" } })).rejects.toThrow("NOT_FOUND");
    expect(canProject).toHaveBeenCalledWith(expect.objectContaining({ id: "viewer-1" }), "private-project", "view");
    expect(loadProjectBundleForPage).not.toHaveBeenCalled();
  });
});
