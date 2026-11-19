import { getPublicProject3dModel } from "@/lib/project-3d-model";
import { projectModelResponse } from "@/lib/project-model-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const model = getPublicProject3dModel(params.slug);
  if (!model) return new Response("3D model not found", { status: 404 });
  const response = await projectModelResponse(request, model, "public");
  if (params.slug === "goluboe-vodovod" && response.status === 307) {
    const input = new URL(request.url);
    const target = new URL(response.headers.get("location")!, input.origin);
    const excavation = input.searchParams.get("pdExc");
    if (excavation && ["kv1", "up1", "vzu"].includes(excavation)) {
      target.searchParams.set("pdExc", excavation);
      if (input.searchParams.get("pdCard") === "1") target.searchParams.set("pdCard", "1");
    }
    if (input.searchParams.get("pdPlan") === "1") target.searchParams.set("pdPlan", "1");
    const locate = input.searchParams.get("pdLocate");
    if (locate && ["kv1", "up1", "vzu"].includes(locate)) target.searchParams.set("pdLocate", locate);
    if (locate === "up1" && input.searchParams.get("pdSoil") === "1") target.searchParams.set("pdSoil", "1");
    response.headers.set("location", target.pathname + target.search);
  }
  return response;
}
