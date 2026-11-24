import { projectAtlasR25Response } from "@/lib/project-atlas-r25-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: { asset: string[] } }) {
  return projectAtlasR25Response(request, params.asset, "goluboe-vodovod-r1-17-2");
}

export const HEAD = GET;
