import { notFound } from "next/navigation";
import { ProjectWorkspace } from "@/components/project-workspace";
import { demoState, getProjectBundle } from "@/lib/demo-data";

export default function ProjectPage({ params }: { params: { id: string } }) {
  if (!demoState.projects.some((project) => project.id === params.id)) {
    notFound();
  }

  return <ProjectWorkspace initialBundle={getProjectBundle(params.id)} />;
}
