import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { buildAccountingImportPreview, parseAccountingImportFile } from "@/lib/accounting-bridge";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializePayment } from "@/lib/serializers";

export const runtime = "nodejs";

const sourceSystemSchema = z.enum(["1c", "sbis", "kontur", "excel", "other"]);

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "sync_accounting"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data" }, { status: 400 });
  }
  const file = formData.get("file");
  const sourceSystemResult = sourceSystemSchema.safeParse(String(formData.get("sourceSystem") || "excel"));
  if (!(file instanceof File)) return NextResponse.json({ error: "File is required" }, { status: 400 });
  if (!sourceSystemResult.success) return NextResponse.json({ error: "Unsupported accounting source" }, { status: 400 });

  try {
    const [project, payments, links] = await Promise.all([
      prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } }),
      prisma.payment.findMany({ where: { projectId: params.projectId }, orderBy: { plannedAt: "asc" } }),
      prisma.accountingExternalLink.findMany({ where: { projectId: params.projectId, entityType: "payment" } })
    ]);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const parsed = parseAccountingImportFile(Buffer.from(await file.arrayBuffer()), file.name);
    const preview = buildAccountingImportPreview({
      sourceSystem: sourceSystemResult.data,
      fileName: file.name,
      checksum: parsed.checksum,
      rows: parsed.rows,
      warnings: parsed.warnings,
      payments: payments.map(serializePayment),
      links: links.map((link) => ({ externalSystem: link.externalSystem, externalId: link.externalId, entityId: link.entityId }))
    });

    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.accountingSyncRun.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sourceSystem: preview.sourceSystem,
          direction: "import",
          fileName: file.name.slice(0, 255),
          checksum: preview.checksum,
          status: "preview",
          rowCount: preview.summary.total,
          matchedCount: preview.summary.matched,
          unresolvedCount: preview.summary.ambiguous + preview.summary.unmatched + preview.summary.conflicts,
          summary: preview.summary,
          payload: preview as unknown as Prisma.InputJsonValue,
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
        entityId: created.id,
        action: "import_preview",
        summary: `Подготовлена сверка бухгалтерского файла: ${file.name.slice(0, 120)}`,
        after: preview.summary
      });
      return created;
    });

    return NextResponse.json({ runId: run.id, preview });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Accounting preview failed" }, { status: 400 });
  }
}
