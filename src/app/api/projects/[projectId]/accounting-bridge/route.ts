import { NextRequest, NextResponse } from "next/server";
import { buildAccountingExport } from "@/lib/accounting-bridge";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeMaterial, serializePayment, serializeProcurementRequest, serializeProject } from "@/lib/serializers";

function serializeRun(run: {
  id: string;
  sourceSystem: string;
  direction: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  matchedCount: number;
  unresolvedCount: number;
  summary: unknown;
  appliedAt: Date | null;
  createdAt: Date;
}) {
  return {
    id: run.id,
    sourceSystem: run.sourceSystem,
    direction: run.direction,
    fileName: run.fileName,
    status: run.status,
    rowCount: run.rowCount,
    matchedCount: run.matchedCount,
    unresolvedCount: run.unresolvedCount,
    summary: run.summary,
    appliedAt: run.appliedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString()
  };
}

export async function GET(_request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const [project, runs] = await Promise.all([
    prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        materials: { orderBy: { neededAt: "asc" } },
        procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
        payments: { orderBy: { plannedAt: "asc" } }
      }
    }),
    prisma.accountingSyncRun.findMany({ where: { projectId: params.projectId }, orderBy: { createdAt: "desc" }, take: 20 })
  ]);
  if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  const exportBundle = buildAccountingExport({
    project: serializeProject(project),
    materials: project.materials.map(serializeMaterial),
    procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
    payments: project.payments.map(serializePayment)
  });
  const canSync = await canProject(user, params.projectId, "sync_accounting");
  const missingData = [
    !project.code ? "Код проекта" : null,
    !project.customer ? "Заказчик" : null,
    !project.payments.length ? "Платежи" : null,
    !project.procurementRequests.length ? "Обязательства по закупкам" : null
  ].filter(Boolean);

  return NextResponse.json({
    capabilities: { view: true, export: canSync, import: canSync, apply: canSync },
    summary: {
      contractAmount: exportBundle.totals.contractAmount,
      commitmentsAmount: exportBundle.totals.commitments,
      receivablesAmount: exportBundle.totals.receivables,
      payablesAmount: exportBundle.totals.payables,
      paymentCount: project.payments.length,
      commitmentCount: project.procurementRequests.length,
      missingData
    },
    runs: runs.map(serializeRun)
  });
}
