import { projectAtlasAssetResponse } from "@/lib/project-atlas-response";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET(request: Request, { params }: { params: { asset: string[] } }) {
  return projectAtlasAssetResponse(request, params.asset);
}
