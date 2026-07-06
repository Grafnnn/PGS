import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { loadProjectBundleForPage } from "@/lib/project-page-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params, searchParams }: { params: { id: string }; searchParams?: { created?: string } }) {
  const { bundle } = await loadProjectBundleForPage(params.id);

  if (!bundle) {
    notFound();
  }

  return <ProjectWorkspace createdFromOnboarding={searchParams?.created === "1"} initialBundle={bundle} />;
}
