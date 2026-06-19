import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canDeleteDocument } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { deleteDocumentFile } from "@/lib/storage/documents";

export async function DELETE(_request: Request, { params }: { params: { projectId: string; documentId: string } }) {
  const user = await getCurrentUser();
  if (!canDeleteDocument(user)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const document = await prisma.document.findFirst({ where: { id: params.documentId, projectId: params.projectId } });
    if (!document) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    await prisma.$transaction(async (tx) => {
      await tx.document.delete({ where: { id: params.documentId } });
      await writeAudit(tx, {
        organizationId: document.organizationId,
        projectId: document.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document",
        entityId: document.id,
        action: "delete",
        summary: `Удален документ: ${document.fileName ?? document.title}`,
        before: { id: document.id, fileName: document.fileName, storageKey: document.storageKey }
      });
    });

    if (document.storageKey) await deleteDocumentFile(document.storageKey);

    return NextResponse.json({ ok: true, deletedId: params.documentId });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Document delete failed" }, { status: 500 });
  }
}
