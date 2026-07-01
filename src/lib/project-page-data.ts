import { demoState, getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb, listProjectsFromDb } from "@/lib/project-data";

type ProjectListItem = Awaited<ReturnType<typeof listProjectsFromDb>>[number];
type ProjectBundle = ReturnType<typeof getProjectBundle> | null;

export type ProjectPageDataSource = "db" | "demo-fallback";

export async function loadProjectBundleForPage(
  projectId: string,
  loadFromDb: (id: string) => Promise<ProjectBundle> = getProjectBundleFromDb
): Promise<{ bundle: ProjectBundle; source: ProjectPageDataSource }> {
  try {
    return { bundle: await loadFromDb(projectId), source: "db" };
  } catch {
    const bundle = demoState.projects.some((project) => project.id === projectId) ? getProjectBundle(projectId) : null;
    return { bundle, source: "demo-fallback" };
  }
}

export async function loadProjectsForPage(
  loadFromDb: () => Promise<ProjectListItem[]> = listProjectsFromDb
): Promise<{ projects: ProjectListItem[]; source: ProjectPageDataSource }> {
  try {
    return { projects: await loadFromDb(), source: "db" };
  } catch {
    return { projects: demoState.projects, source: "demo-fallback" };
  }
}

export async function loadDashboardData({
  loadProjects = listProjectsFromDb,
  loadBundle = getProjectBundleFromDb
}: {
  loadProjects?: () => Promise<ProjectListItem[]>;
  loadBundle?: (id: string) => Promise<ProjectBundle>;
} = {}): Promise<{ projects: ProjectListItem[]; bundle: ProjectBundle; primaryProjectHref: string; source: ProjectPageDataSource }> {
  try {
    const projects = await loadProjects();
    const primaryProject = projects.find((project) => project.id === "project-demo") ?? projects[0] ?? null;
    const bundle = primaryProject ? await loadBundle(primaryProject.id) : null;
    return {
      projects,
      bundle,
      primaryProjectHref: primaryProject ? `/projects/${primaryProject.id}` : "/projects",
      source: "db"
    };
  } catch {
    return {
      projects: demoState.projects,
      bundle: getProjectBundle("project-demo"),
      primaryProjectHref: "/projects/project-demo",
      source: "demo-fallback"
    };
  }
}
