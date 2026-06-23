import { NextResponse } from "next/server";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { buildCashflowDraft, commitCashflowDraft, draftRequestSchema, loadPipelineData } from "@/lib/project-pipeline";

export const runtime = "nodejs";

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const body = draftRequestSchema.parse(await request.json().catch(() => ({})));
  const access = await requireProjectAccess(params.projectId, body.commit ? "edit" : "view");
  if ("response" in access) return access.response;

  if (!body.commit) {
    const data = await loadPipelineData(params.projectId);
    if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mode: "preview", draft: buildCashflowDraft(data) });
  }

  if (!body.confirmed) return NextResponse.json({ error: "Draft cashflow creation requires explicit confirmation." }, { status: 409 });
  const result = await commitCashflowDraft(params.projectId);
  if (!result) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ok: true, mode: "commit", ...result });
}
