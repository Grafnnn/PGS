import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { hasPreviewMetadata, makeStorageKey, sanitizeFileName, saveDocumentFile, validateDocumentUpload } from "@/lib/storage/documents";

export const runtime = "nodejs";

function serializeVersion(version: {
  id: string;
  versionNumber: number;
  fileName: string;
  mimeType: string | null;
  sizeBytes: number;
  storageKey: string;
  uploadedByName: string | null;
  previewAvailable: boolean;
  createdAt: Date;
}) {
  return {
    id: version.id,
    versionNumber: version.versionNumber,
    fileName: version.fileName,
    mimeType: version.mimeType,
    sizeBytes: version.sizeBytes,
    storageKey: version.storageKey,
    uploadedByName: version.uploadedByName,
    previewAvailable: version.previewAvailable,
    createdAt: version.createdAt.toISOString()
  };
}

export async function GET(_request: Request, { params }: { params: { projectId: string; documentId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const document = await prisma.document.findFirst({
    where: { id: params.documentId, projectId: params.projectId },
    include: { versions: { orderBy: { versionNumber: "desc" } } }
  });
  if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
  return NextResponse.json({ items: document.versions.map(serializeVersion) });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; documentId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "upload_document"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
  const safeName = sanitizeFileName(file.name);
  const validationError = validateDocumentUpload(safeName, file.type, file.size);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const document = await prisma.document.findFirst({ where: { id: params.documentId, projectId: params.projectId } });
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });
    const storageKey = makeStorageKey(params.projectId, safeName);
    await saveDocumentFile(storageKey, Buffer.from(await file.arrayBuffer()));
    const version = await prisma.$transaction(async (tx) => {
      const last = await tx.documentVersion.findFirst({ where: { documentId: params.documentId }, orderBy: { versionNumber: "desc" } });
      const versionNumber = (last?.versionNumber ?? document.version ?? 0) + 1;
      const created = await tx.documentVersion.create({
        data: {
          documentId: params.documentId,
          versionNumber,
          fileName: safeName,
          mimeType: file.type,
          sizeBytes: file.size,
          storageKey,
          uploadedById: user?.authenticated ? user.id : null,
          uploadedByName: user?.name ?? "local-user",
          previewAvailable: hasPreviewMetadata(file.type)
        }
      });
      await tx.document.update({
        where: { id: params.documentId },
        data: {
          fileName: safeName,
          title: safeName,
          filePath: storageKey,
          storageKey,
          mimeType: file.type,
          sizeBytes: file.size,
          version: versionNumber,
          author: user?.name ?? document.author
        }
      });
      await writeAudit(tx, {
        organizationId: document.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document_version",
        entityId: created.id,
        action: "create",
        summary: `Загружена версия документа v${versionNumber}: ${safeName}`,
        after: { documentId: params.documentId, versionNumber, fileName: safeName, sizeBytes: file.size }
      });
      return created;
    });
    return NextResponse.json({ item: serializeVersion(version) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Document version upload failed" }, { status: 500 });
  }
}
