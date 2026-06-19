import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { readDocumentFile } from "@/lib/storage/documents";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string; documentId: string; versionId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const version = await prisma.documentVersion.findFirst({
      where: { id: params.versionId, documentId: params.documentId, document: { projectId: params.projectId } }
    });
    if (!version) return NextResponse.json({ error: "Document version not found" }, { status: 404 });
    const fileName = encodeURIComponent(version.fileName);
    const bytes = await readDocumentFile(version.storageKey);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": version.mimeType ?? "application/octet-stream",
        "content-disposition": `attachment; filename="${fileName}"; filename*=UTF-8''${fileName}`
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    return NextResponse.json({ error: "File is missing from storage" }, { status: 404 });
  }
}
