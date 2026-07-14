import { notFound, redirect } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { loadProjectBundleForPage } from "@/lib/project-page-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams?: { created?: string } }) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!(await canProject(user, params.id, "view"))) notFound();

  const { bundle } = await loadProjectBundleForPage(params.id);

  if (!bundle) {
    notFound();
  }

  return <ProjectWorkspace createdFromOnboarding={searchParams?.created === "1"} initialBundle={bundle} />;
}
