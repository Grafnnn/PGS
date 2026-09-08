import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { loadDashboardData, loadProjectBundleForPage, loadProjectsForPage } from "@/lib/project-page-data";
import { loadPortfolioProjectsForPage } from "@/lib/portfolio-data";
import type { Project } from "@/lib/types";

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
vi.mock("@/lib/portfolio-data", () => ({
  loadPortfolioProjectsForPage: vi.fn()
}));
vi.mock("@/components/charts/interactive-chart", () => ({ InteractiveChart: () => null }));

const dashboardProjects: Project[] = [
  { id: "project-first", name: "Первый объект" },
  { id: "project-roof", name: "Кровля" }
].map((project): Project => ({
  ...project,
  organizationId: "org-1",
  customer: "Заказчик",
  object: "Объект",
  address: "Адрес",
  contractAmount: 10_000,
  vatMode: "vat",
  startsAt: "2026-07-01",
  endsAt: "2026-12-01",
  manager: "Руководитель",
  status: "active"
}));

describe("server-rendered page access", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getCurrentUser).mockResolvedValue(null);
  });

  it("redirects an anonymous dashboard request before loading portfolio data", async () => {
    const { default: DashboardPage } = await import("./dashboard/page");
    await expect(DashboardPage({})).rejects.toThrow("REDIRECT:/login");
    expect(loadDashboardData).not.toHaveBeenCalled();
  });

  it("opens the submitted accessible project instead of the first project before loading portfolio data", async () => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "viewer-1", name: "Viewer", email: "viewer@example.test", role: "VIEWER", authenticated: true });
    vi.mocked(loadDashboardData).mockResolvedValue({ projects: dashboardProjects, bundle: null, primaryProjectHref: "/projects/project-first", source: "db" });
    const { default: DashboardPage } = await import("./dashboard/page");

    await expect(DashboardPage({ searchParams: { project: "project-roof", open: "1" } })).rejects.toThrow("REDIRECT:/projects/project-roof");
    expect(navigation.redirect).toHaveBeenCalledWith("/projects/project-roof");
    expect(loadPortfolioProjectsForPage).not.toHaveBeenCalled();
  });

  it.each(["private-project", undefined])("returns to the registry instead of opening a fallback project for unavailable selection %s", async (project) => {
    vi.mocked(getCurrentUser).mockResolvedValue({ id: "viewer-1", name: "Viewer", email: "viewer@example.test", role: "VIEWER", authenticated: true });
    vi.mocked(loadDashboardData).mockResolvedValue({ projects: dashboardProjects, bundle: null, primaryProjectHref: "/projects/project-first", source: "db" });
    const { default: DashboardPage } = await import("./dashboard/page");

    await expect(DashboardPage({ searchParams: { project, open: "1" } })).rejects.toThrow("REDIRECT:/projects");
    expect(navigation.redirect).toHaveBeenCalledWith("/projects");
    expect(loadPortfolioProjectsForPage).not.toHaveBeenCalled();
  });

  it("keeps ordinary dashboard selection and offers a native form plus a direct project-name link", async () => {
    const user = { id: "viewer-1", name: "Viewer", email: "viewer@example.test", role: "VIEWER" as const, authenticated: true };
    vi.mocked(getCurrentUser).mockResolvedValue(user);
    vi.mocked(loadDashboardData).mockResolvedValue({ projects: dashboardProjects, bundle: null, primaryProjectHref: "/projects/project-first", source: "db" });
    vi.mocked(loadPortfolioProjectsForPage).mockResolvedValue([]);
    const { default: DashboardPage } = await import("./dashboard/page");

    const html = renderToStaticMarkup(await DashboardPage({ searchParams: { project: "project-roof" } }));
    const form = html.match(/<form[^>]*class="dashboard-project-switcher-form"[\s\S]*?<\/form>/)?.[0] ?? "";
    expect(navigation.redirect).not.toHaveBeenCalled();
    expect(loadPortfolioProjectsForPage).toHaveBeenCalledWith(user);
    expect(form).toContain('action="/dashboard"');
    expect(form).toContain('method="get"');
    expect(form).toMatch(/<input[^>]*name="open"[^>]*value="1"/);
    expect(form).toContain('<option value="project-roof" selected="">Кровля</option>');
    expect(form).toContain("Открыть выбранный проект");
    expect(html).toMatch(/<a[^>]*href="\/projects\/project-roof"[^>]*>Кровля<\/a>/);
  });

  it("redirects an anonymous projects request before loading the registry", async () => {
    const { default: ProjectsPage } = await import("./projects/page");
    await expect(ProjectsPage()).rejects.toThrow("REDIRECT:/login");
    expect(loadProjectsForPage).not.toHaveBeenCalled();
  });

  it("redirects an anonymous portfolio request before loading cross-project data", async () => {
    const { default: PortfolioPage } = await import("./portfolio/page");
    await expect(PortfolioPage()).rejects.toThrow("REDIRECT:/login");
    expect(loadPortfolioProjectsForPage).not.toHaveBeenCalled();
  });

  it("redirects an anonymous inbox request before rendering the client workspace", async () => {
    const { default: InboxPage } = await import("./inbox/page");
    await expect(InboxPage()).rejects.toThrow("REDIRECT:/login");
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
