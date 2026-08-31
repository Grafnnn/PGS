import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: { projectId: string; requestId: string } }
) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "import"))) return json({ error: "Forbidden" }, 403);

  try {
    const item = await prisma.workforceAdmissionRequest.findFirst({
      where: { id: params.requestId, projectId: params.projectId },
      select: { id: true, organizationId: true, projectId: true, requestNumber: true, status: true }
    });
    if (!item) return json({ error: "Workforce admission request not found" }, 404);
    if (item.status !== "draft") return json({ error: "Only draft requests can be deleted" }, 409);

    await prisma.$transaction(async (tx) => {
      await tx.workforceAdmissionRequest.delete({ where: { id: item.id } });
      await writeAudit(tx, {
        organizationId: item.organizationId,
        projectId: item.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "PGS user",
        actorEmail: user?.email ?? null,
        entity: "workforce_admission_request",
        entityId: item.id,
        action: "delete",
        summary: `Удалён черновик заявки ${item.requestNumber}`,
        before: { requestNumber: item.requestNumber, status: item.status }
      });
    });
    return json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Workforce admission request delete failed" }, 500);
  }
}
