import { getPublicProject3dModel } from "@/lib/project-3d-model";
import { projectModelResponse } from "@/lib/project-model-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const model = getPublicProject3dModel(params.slug);
  if (!model) return new Response("3D model not found", { status: 404 });
  return projectModelResponse(request, model, "public");
}
