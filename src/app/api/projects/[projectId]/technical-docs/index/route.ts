import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { GoogleDriveSyncError } from "@/lib/technical-documentation/google-drive";
import { getProjectKnowledgeStatus, indexGoogleDriveDocuments, indexPgsProjectDocuments } from "@/lib/technical-documentation/index";

export const runtime = "nodejs";

const requestSchema = z.object({
  source: z.enum(["pgs", "google_drive", "all"]).default("google_drive"),
  force: z.boolean().default(false)
});

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = requestSchema.safeParse(await request.json().catch(() => ({})));
  if (!parsed.success) return NextResponse.json({ error: "Invalid index request" }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  try {
    const pgs = parsed.data.source === "google_drive" ? null : await indexPgsProjectDocuments(params.projectId, parsed.data.force);
    const drive = parsed.data.source === "pgs" ? null : await indexGoogleDriveDocuments(params.projectId, parsed.data.force);
    await writeAudit(prisma, {
      organizationId: project.organizationId,
      projectId: params.projectId,
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "PGS user",
      actorEmail: user?.email ?? null,
      entity: "project_knowledge_index",
      entityId: params.projectId,
      action: "update",
      summary: `Обновлён индекс проектной документации: ${parsed.data.source}`,
      after: { source: parsed.data.source, pgs, drive }
    });
    return NextResponse.json({ ok: true, result: { pgs, drive }, status: await getProjectKnowledgeStatus(params.projectId) });
  } catch (error) {
    if (error instanceof GoogleDriveSyncError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof Error && error.message === "Google Drive folder is not configured") {
      return NextResponse.json({ error: "Сначала укажите папку Google Drive." }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось обновить индекс документации." }, { status: 500 });
  }
}
