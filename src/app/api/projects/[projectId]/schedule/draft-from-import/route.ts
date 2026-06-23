import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { buildScheduleDraft, commitScheduleDraft, draftRequestSchema, loadPipelineData } from "@/lib/project-pipeline";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const body = draftRequestSchema.parse(await request.json().catch(() => ({})));
  const access = await requireProjectAccess(params.projectId, body.commit ? "edit" : "view");
  if ("response" in access) return access.response;

  if (!body.commit) {
    const data = await loadPipelineData(params.projectId);
    if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mode: "preview", draft: buildScheduleDraft(data) });
  }

  if (!body.confirmed) return NextResponse.json({ error: "Draft schedule creation requires explicit confirmation." }, { status: 409 });
  const result = await commitScheduleDraft(params.projectId, access.user.id);
  if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true, mode: "commit", ...result });
}
