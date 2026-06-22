import { demoState, getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import type { ProjectIntelligenceContext } from "./types";

export async function collectProjectIntelligenceContext(projectId: string): Promise<ProjectIntelligenceContext | null> {
  const dbBundle = await getProjectBundleFromDb(projectId).catch(() => null);
  if (dbBundle) {
    const documents = await prisma.document
      .findMany({ where: { projectId }, orderBy: { uploadedAt: "desc" } })
      .then((items) => items.map(serializeDocument))
      .catch(() => []);
    return { ...dbBundle, documents };
  }

  if (demoState.projects.some((project) => project.id === projectId)) {
    return {
      ...getProjectBundle(projectId),
      documents: []
    };
  }

  return null;
}
