import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canUploadDocument } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDemoContext } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import { sanitizeFileName, makeStorageKey, saveDocumentFile, validateDocumentUpload } from "@/lib/storage/documents";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = getCurrentUser();
  if (!canUploadDocument(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  const category = String(formData.get("category") || "прочее");
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

  const safeName = sanitizeFileName(file.name);
  const validationError = validateDocumentUpload(safeName, file.type, file.size);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const { userId } = await getDemoContext();
    const storageKey = makeStorageKey(params.projectId, safeName);
    const bytes = Buffer.from(await file.arrayBuffer());
    await saveDocumentFile(storageKey, bytes);

    const document = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          category,
          title: safeName,
          filePath: storageKey,
          fileName: safeName,
          mimeType: file.type,
          sizeBytes: file.size,
          storageKey,
          author: user?.name ?? "local-user",
          createdBy: userId
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.id ?? userId,
        actorName: user?.name ?? "local-user",
        entity: "document",
        entityId: created.id,
        action: "create",
        summary: `Загружен документ: ${safeName}`,
        after: { id: created.id, fileName: safeName, mimeType: file.type, sizeBytes: file.size, category }
      });
      return created;
    });

    return NextResponse.json({ item: serializeDocument(document) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Document upload failed" }, { status: 500 });
  }
}
