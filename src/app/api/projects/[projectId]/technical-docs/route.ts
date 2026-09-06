import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { getProjectKnowledgeStatus } from "@/lib/technical-documentation/index";
import { parseGoogleDriveFolderId } from "@/lib/technical-documentation/google-drive";

const sourceSchema = z.object({
  folderUrl: z.string().trim().max(1_000),
  folderName: z.string().trim().max(160).optional()
});

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const status = await getProjectKnowledgeStatus(params.projectId);
  if (!status) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  return NextResponse.json({ ...status, canEdit: await canProject(user, params.projectId, "edit") });
}
export async function PUT(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const parsed = sourceSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid Google Drive folder" }, { status: 400 });
  const folderId = parsed.data.folderUrl ? parseGoogleDriveFolderId(parsed.data.folderUrl) : null;
  if (parsed.data.folderUrl && !folderId) return NextResponse.json({ error: "Не удалось определить ID папки Google Drive." }, { status: 400 });
  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
  const config = await prisma.projectKnowledgeConfig.upsert({
    where: { projectId: params.projectId },
    create: {
      organizationId: project.organizationId,
      projectId: params.projectId,
      driveFolderId: folderId,
      driveFolderUrl: parsed.data.folderUrl || null,
      driveFolderName: parsed.data.folderName || null,
      driveSyncStatus: folderId ? "pending" : "not_configured",
      createdBy: user?.authenticated ? user.id : null
    },
    update: {
      driveFolderId: folderId,
      driveFolderUrl: parsed.data.folderUrl || null,
      driveFolderName: parsed.data.folderName || null,
      driveSyncStatus: folderId ? "pending" : "not_configured",
      driveSyncError: null
    }
  });
  await writeAudit(prisma, {
    organizationId: project.organizationId,
    projectId: params.projectId,
    actorId: user?.authenticated ? user.id : null,
    actorName: user?.name ?? "PGS user",
    actorEmail: user?.email ?? null,
    entity: "project_knowledge_config",
    entityId: config.id,
    action: folderId ? "update" : "delete",
    summary: folderId ? "Настроена read-only папка Google Drive для техпомощника" : "Папка Google Drive отключена от техпомощника",
    after: { configured: Boolean(folderId), folderName: parsed.data.folderName || null }
  });
  return NextResponse.json({ ok: true, status: await getProjectKnowledgeStatus(params.projectId) });
}
