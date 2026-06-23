import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { buildPipelineSnapshot } from "@/lib/project-pipeline";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const access = await requireProjectAccess(params.projectId, "view");
  if ("response" in access) return access.response;

  const snapshot = await buildPipelineSnapshot(params.projectId);
  if (!snapshot) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  return NextResponse.json({
    readiness: snapshot.readiness,
    calculatedRisks: snapshot.calculatedRisks,
    intelligence: snapshot.intelligence
  });
}
