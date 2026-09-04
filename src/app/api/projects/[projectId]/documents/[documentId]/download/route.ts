import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { readDocumentFile } from "@/lib/storage/documents";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { projectId: string; documentId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const document = await prisma.document.findFirst({
      where: { id: params.documentId, projectId: params.projectId }
    });
    if (!document?.storageKey) return NextResponse.json({ error: "Document not found" }, { status: 404 });

    const bytes = await readDocumentFile(document.storageKey);
    const fileName = encodeURIComponent(document.fileName ?? document.title);
    const inline = new URL(request.url).searchParams.get("inline") === "1" && Boolean(document.mimeType?.startsWith("image/"));
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "content-type": document.mimeType ?? "application/octet-stream",
        "content-length": String(bytes.byteLength),
        "content-disposition": `${inline ? "inline" : "attachment"}; filename="${fileName}"; filename*=UTF-8''${fileName}`,
        ...(inline ? { "cache-control": "private, max-age=300, must-revalidate", vary: "Cookie" } : {}),
        "x-content-type-options": "nosniff"
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "File is missing from configured storage" }, { status: 404 });
  }
}
