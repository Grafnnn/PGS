import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { getDemoContext } from "@/lib/project-data";
import { fieldClientMutationIdSchema } from "@/lib/field-sync";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";
import { deleteDocumentFile, sanitizeFileName, makeStorageKey, saveDocumentFile, validateDocumentUpload, hasPreviewMetadata } from "@/lib/storage/documents";

export const runtime = "nodejs";

async function existingUpload(projectId: string, clientMutationId: string) {
  const receipt = await prisma.fieldSyncReceipt.findUnique({
    where: { projectId_clientMutationId: { projectId, clientMutationId } }
  });
  if (!receipt) return null;
  if (receipt.kind !== "photo_evidence") {
    return NextResponse.json({ error: "Mutation identifier is already used by another operation" }, { status: 409 });
  }
  const item = await prisma.document.findUnique({ where: { id: receipt.entityId } });
  if (!item) return NextResponse.json({ error: "Synced document is no longer available" }, { status: 409 });
  return NextResponse.json({ item: serializeDocument(item), duplicate: true, clientMutationId });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "upload_document"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const formData = await request.formData();
  const file = formData.get("file");
  const category = String(formData.get("category") || "прочее");
  const rawMutationId = String(formData.get("clientMutationId") || "").trim();
  const mutationIdResult = rawMutationId ? fieldClientMutationIdSchema.safeParse(rawMutationId) : null;
  if (mutationIdResult && !mutationIdResult.success) return NextResponse.json({ error: "Invalid client mutation identifier" }, { status: 400 });
  const clientMutationId = mutationIdResult?.success ? mutationIdResult.data : null;
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });

  const safeName = sanitizeFileName(file.name);
  const validationError = validateDocumentUpload(safeName, file.type, file.size);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  let orphanedStorageKey: string | null = null;
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (clientMutationId) {
      const previous = await existingUpload(params.projectId, clientMutationId);
      if (previous) return previous;
    }
    const { userId: demoUserId } = await getDemoContext();
    const userId = user?.authenticated ? user.id : demoUserId;
    const storageKey = makeStorageKey(params.projectId, safeName);
    orphanedStorageKey = storageKey;
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
      await tx.documentVersion.create({
        data: {
          documentId: created.id,
          versionNumber: 1,
          fileName: safeName,
          mimeType: file.type,
          sizeBytes: file.size,
          storageKey,
          uploadedById: user?.authenticated ? user.id : null,
          uploadedByName: user?.name ?? "local-user",
          previewAvailable: hasPreviewMetadata(file.type)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document",
        entityId: created.id,
        action: "create",
        summary: `Загружен документ: ${safeName}`,
        after: { id: created.id, fileName: safeName, mimeType: file.type, sizeBytes: file.size, category, source: clientMutationId ? "field_offline" : "document_upload" }
      });
      if (clientMutationId) {
        await tx.fieldSyncReceipt.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            clientMutationId,
            kind: "photo_evidence",
            entityId: created.id,
            createdBy: user?.authenticated ? user.id : null
          }
        });
      }
      return created;
    });

    orphanedStorageKey = null;
    return NextResponse.json({ item: serializeDocument(document), duplicate: false, clientMutationId }, { status: 201 });
  } catch (error) {
    if (orphanedStorageKey) await deleteDocumentFile(orphanedStorageKey).catch(() => undefined);
    if (clientMutationId && error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await existingUpload(params.projectId, clientMutationId);
      if (previous) return previous;
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Document upload failed" }, { status: 500 });
  }
}
