import { projectAtlasR25Response } from "@/lib/project-atlas-r25-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request, { params }: { params: { asset: string[] } }) {
  return projectAtlasR25Response(request, params.asset, "v8-ui1");
}
export const HEAD = GET;
