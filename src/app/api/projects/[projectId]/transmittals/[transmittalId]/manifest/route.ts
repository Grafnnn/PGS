import { NextResponse } from "next/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildTransmittalManifest, serializeTransmittal } from "@/lib/document-transmittals";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; transmittalId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const item = await prisma.projectDocumentTransmittal.findUnique({
    where: { id: params.transmittalId },
    include: { items: true, events: { orderBy: { createdAt: "asc" } } }
  });
  if (!item || item.projectId !== params.projectId) return NextResponse.json({ error: "Document transmittal not found" }, { status: 404 });
  const manifest = buildTransmittalManifest(serializeTransmittal(item));
  return new NextResponse(manifest, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Content-Disposition": `attachment; filename="${`TR-${String(item.sequence).padStart(3, "0")}`}-rev-${item.revision}.txt"`
    }
  });
}
