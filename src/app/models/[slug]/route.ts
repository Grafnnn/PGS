import { getPublicProject3dModel } from "@/lib/project-3d-model";
import { projectModelResponse } from "@/lib/project-model-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function station(value: string | null): number {
  const text = value?.trim() ?? "";
  return /^\d+(?:[.,]\d{1,3})?$/.test(text) ? Number(text.replace(",", ".")) : NaN;
}

function appendFieldPilotParams(input: URLSearchParams, target: URLSearchParams) {
  if (input.get("field") === "1") {
    target.set("field", "1");
    if (input.get("xing") === "xing-v-st-200") target.set("xing", "xing-v-st-200");
    else {
      const pk = station(input.get("pk"));
      if (pk >= 0 && pk <= 45) target.set("pk", String(pk));
    }
  }
  const pk = station(input.get("pdFieldPk"));
  if (pk >= 0 && pk <= 45) {
    target.set("pdFieldPk", String(pk));
    if (input.get("pdFieldMeasure") === "invert" && input.get("pdFieldEdition") === "R1.2-field-1") {
      target.set("pdFieldMeasure", "invert");
      target.set("pdFieldEdition", "R1.2-field-1");
    }
  }
}

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  const model = getPublicProject3dModel(params.slug);
  if (!model) return new Response("3D model not found", { status: 404 });
  const response = await projectModelResponse(request, model, "public");
  const fieldPilot = params.slug === "goluboe-vodovod-field-pilot";
  if ((params.slug === "goluboe-vodovod" || fieldPilot) && response.status === 307) {
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
    if (input.searchParams.get("pdProfile") === "1") {
      target.searchParams.set("pdProfile", "1");
      const [from, to] = ["pdFrom", "pdTo"].map(name => station(input.searchParams.get(name)));
      if (Number.isFinite(from) && Number.isFinite(to) && from >= 0 && from < to && to <= 400) {
        target.searchParams.set("pdFrom", String(from));
        target.searchParams.set("pdTo", String(to));
      }
    }
    if (fieldPilot) appendFieldPilotParams(input.searchParams, target.searchParams);
    response.headers.set("location", target.pathname + target.search);
  }
  return response;
}
