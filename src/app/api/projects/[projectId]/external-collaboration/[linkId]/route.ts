import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { serializeExternalCollaborationLink } from "@/lib/external-collaboration";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; linkId: string } };

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const before = await prisma.externalCollaborationLink.findFirst({
      where: { id: params.linkId, projectId: params.projectId }
    });
    if (!before) return NextResponse.json({ error: "External collaboration link not found" }, { status: 404 });
    if (before.status === "revoked") return NextResponse.json({ item: serializeExternalCollaborationLink(before) });
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.externalCollaborationLink.update({
        where: { id: before.id },
        data: { status: "revoked", revokedAt: new Date() }
      });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "external_collaboration_link",
        entityId: before.id,
        action: "update",
        summary: "Внешняя ссылка отозвана",
        before: serializeExternalCollaborationLink(before),
        after: serializeExternalCollaborationLink(updated)
      });
      return updated;
    });
    return NextResponse.json({ item: serializeExternalCollaborationLink(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "External collaboration link revoke failed" }, { status: 500 });
  }
}
