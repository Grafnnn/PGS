import { NextRequest, NextResponse } from "next/server";
import { buildAccountingExport } from "@/lib/accounting-bridge";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeMaterial, serializePayment, serializeProcurementRequest, serializeProject } from "@/lib/serializers";

export async function POST(_request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "sync_accounting"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    include: {
      costCodes: true,
      materials: true,
      procurementRequests: { include: { items: true } },
      payments: true,
      commitments: { include: { lines: true, changeOrders: true, paymentApplications: true }, orderBy: { sequence: "asc" } }
    }
  });
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const bundle = buildAccountingExport({
    project: serializeProject(project),
    costCodes: (project.costCodes ?? []).map((item) => ({ id: item.id, code: item.code, name: item.name })),
    materials: project.materials.map(serializeMaterial),
    procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
    payments: project.payments.map(serializePayment),
    commitments: project.commitments
  });

  await prisma.$transaction(async (tx) => {
    const run = await tx.accountingSyncRun.create({
      data: {
        organizationId: project.organizationId,
        projectId: params.projectId,
        sourceSystem: "universal_json",
        direction: "export",
        status: "exported",
        rowCount: bundle.commitments.length + bundle.receivables.length + bundle.payables.length,
        matchedCount: 0,
        unresolvedCount: bundle.commitments.flatMap((item) => item.lines).filter((item) => item.estimateStatus === "missing_price").length,
        summary: bundle.totals,
        createdBy: user?.authenticated ? user.id : null
      }
    });
    await writeAudit(tx, {
      organizationId: project.organizationId,
      projectId: params.projectId,
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "local-user",
      actorEmail: user?.email ?? null,
      entity: "accounting_sync",
      entityId: run.id,
      action: "use",
      summary: "Подготовлен экспортный пакет ERP / Бухгалтерия",
      after: { schema: bundle.schema, totals: bundle.totals }
    });
  });

  const safeCode = (project.code || project.id).replace(/[^a-zA-Z0-9_-]/g, "_");
  return new NextResponse(JSON.stringify(bundle, null, 2), {
    status: 200,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="pgs-accounting-${safeCode}.json"`,
      "cache-control": "no-store"
    }
  });
}
