import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { loadProjectBundleForPage } from "@/lib/project-page-data";

export const dynamic = "force-dynamic";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const { bundle } = await loadProjectBundleForPage(params.id);

  if (!bundle) {
    notFound();
  }

  return <ProjectWorkspace initialBundle={bundle} />;
}
