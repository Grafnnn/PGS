import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  executiveReportCreateSchema,
  executiveReportSourceSnapshot,
  serializeExecutiveReport
} from "@/lib/executive-reports";
import { prisma } from "@/lib/prisma";
import { getProjectBundleFromDb } from "@/lib/project-data";
import { buildPipelineSnapshot } from "@/lib/project-pipeline";
import { buildRiskExecutiveIntelligence } from "@/lib/risk-executive-intelligence";
import { serializeDocument } from "@/lib/serializers";

type Params = { params: { projectId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const items = await prisma.executiveReport.findMany({
      where: { projectId: params.projectId },
      orderBy: { version: "desc" }
    });
    return NextResponse.json({ items: items.map(serializeExecutiveReport) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Executive reports request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = executiveReportCreateSchema.parse(await request.json().catch(() => ({})));
    const [bundle, pipeline, documentRecords] = await Promise.all([
      getProjectBundleFromDb(params.projectId),
      buildPipelineSnapshot(params.projectId),
      prisma.document.findMany({ where: { projectId: params.projectId }, orderBy: { createdAt: "desc" } })
    ]);
    if (!bundle) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const documents = documentRecords.map(serializeDocument);

    const content = buildRiskExecutiveIntelligence({
      ...bundle,
      documents,
      readiness: pipeline?.readiness ?? null,
      documentChecklist: pipeline?.documentChecklist ?? [],
      intelligence: pipeline?.intelligence ?? null,
      importHistory: []
    }).executiveReport;
    const reportDate = data.reportDate ? new Date(`${data.reportDate}T12:00:00.000Z`) : new Date();
    const snapshot = executiveReportSourceSnapshot({ ...bundle, documents, readinessScore: pipeline?.readiness.score ?? null });

    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.executiveReport.aggregate({ where: { projectId: params.projectId }, _max: { version: true } });
      const created = await tx.executiveReport.create({
        data: {
          organizationId: bundle.project.organizationId,
          projectId: params.projectId,
          version: (latest._max.version ?? 0) + 1,
          title: data.title ?? `Еженедельный отчет · ${bundle.project.name}`,
          reportDate,
          content: content as unknown as Prisma.InputJsonValue,
          sourceSnapshot: snapshot as Prisma.InputJsonValue,
          createdBy: user?.authenticated ? user.id : null
        }
      });
      await writeAudit(tx, {
        organizationId: bundle.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "executive_report",
        entityId: created.id,
        action: "create",
        summary: `Сформирован управленческий отчет v${created.version}: ${created.title}`,
        after: serializeExecutiveReport(created)
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ item: serializeExecutiveReport(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid executive report request" }, { status: 400 });
    return NextResponse.json({ error: "Executive report generation failed" }, { status: 500 });
  }
}
