import { getProject3dModel } from "@/lib/project-3d-model";
import { projectModelResponse } from "@/lib/project-model-response";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { projectId: string } }): Promise<Response> {
  const access = await requireProjectAccess(params.projectId, "view");
  if ("response" in access && access.response) return access.response;

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true, name: true, code: true, object: true, address: true }
  });
  const model = project ? getProject3dModel(project) : null;
  if (!model) return new Response("3D model not found", { status: 404 });

  return projectModelResponse(request, model, "private");
}
