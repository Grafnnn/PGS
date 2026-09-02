import { demoState, getProjectBundle } from "@/lib/demo-data";
import { scheduleProgressPercent } from "@/lib/calculations";
import { getEnvStatus } from "@/lib/env";
import { getProjectBundleFromDb, listProjectsFromDb } from "@/lib/project-data";

type ProjectListItem = Awaited<ReturnType<typeof listProjectsFromDb>>[number];
type ProjectBundle = ReturnType<typeof getProjectBundle> | null;

export type ProjectPageDataSource = "db" | "demo-fallback";

function demoFallbackAllowed() {
  const status = getEnvStatus();
  return !status.production && !status.authRequired;
}

function demoProjectsWithProgress(): ProjectListItem[] {
  return demoState.projects.map((project) => ({
    ...project,
    progressPercent: scheduleProgressPercent(demoState.scheduleItems.filter((item) => item.projectId === project.id))
  }));
}

export async function loadProjectBundleForPage(
  projectId: string,
  loadFromDb: (id: string) => Promise<ProjectBundle> = getProjectBundleFromDb,
  allowDemoFallback: () => boolean = demoFallbackAllowed
): Promise<{ bundle: ProjectBundle; source: ProjectPageDataSource }> {
  try {
    return { bundle: await loadFromDb(projectId), source: "db" };
  } catch (error) {
    if (!allowDemoFallback()) throw error;
    const bundle = demoState.projects.some((project) => project.id === projectId) ? getProjectBundle(projectId) : null;
    return { bundle, source: "demo-fallback" };
  }
}

export async function loadProjectsForPage(
  loadFromDb: () => Promise<ProjectListItem[]> = listProjectsFromDb,
  allowDemoFallback: () => boolean = demoFallbackAllowed
): Promise<{ projects: ProjectListItem[]; source: ProjectPageDataSource }> {
  try {
    return { projects: await loadFromDb(), source: "db" };
  } catch (error) {
    if (!allowDemoFallback()) throw error;
    return { projects: demoProjectsWithProgress(), source: "demo-fallback" };
  }
}

export async function loadDashboardData({
  loadProjects = listProjectsFromDb,
  loadBundle = getProjectBundleFromDb,
  allowDemoFallback = demoFallbackAllowed
}: {
  loadProjects?: () => Promise<ProjectListItem[]>;
  loadBundle?: (id: string) => Promise<ProjectBundle>;
  allowDemoFallback?: () => boolean;
} = {}): Promise<{ projects: ProjectListItem[]; bundle: ProjectBundle; primaryProjectHref: string; source: ProjectPageDataSource }> {
  try {
    const projects = await loadProjects();
    const primaryProject = projects[0] ?? null;
    const bundle = primaryProject ? await loadBundle(primaryProject.id) : null;
    return {
      projects,
      bundle,
      primaryProjectHref: primaryProject ? `/projects/${primaryProject.id}` : "/projects",
      source: "db"
    };
  } catch (error) {
    if (!allowDemoFallback()) throw error;
    return {
      projects: demoProjectsWithProgress(),
      bundle: getProjectBundle("project-demo"),
      primaryProjectHref: "/projects/project-demo",
      source: "demo-fallback"
    };
  }
}
