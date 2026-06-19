import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { demoState, getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb } from "@/lib/project-data";

export default async function ProjectPage({ params }: { params: { id: string } }) {
  const dbBundle = await getProjectBundleFromDb(params.id).catch(() => null);
  const fallbackBundle = demoState.projects.some((project) => project.id === params.id) ? getProjectBundle(params.id) : null;
  const bundle = dbBundle ?? fallbackBundle;

  if (!bundle) {
    notFound();
  }

  return <ProjectWorkspace initialBundle={bundle} />;
}
