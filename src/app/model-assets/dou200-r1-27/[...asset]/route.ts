import { projectAtlasR25Response } from "@/lib/project-atlas-r25-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, { params }: { params: { asset: string[] } }) {
  return projectAtlasR25Response(request, params.asset, "dou200-r1-27");
}

export const HEAD = GET;
