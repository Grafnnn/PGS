import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildCommitPlan } from "@/lib/excel/import-parser";
import { importCommitRequestSchema, importPreviewSchema, type ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";
import { serializeBudgetItem, serializeMaterial, serializeScheduleItem } from "@/lib/serializers";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const payload = importCommitRequestSchema.parse(await request.json().catch(() => ({})));
    if (payload.mode !== "append" && !payload.replaceConfirmed) {
      return NextResponse.json({ error: "Replacement import requires explicit confirmation." }, { status: 409 });
    }

    const batch = await prisma.importBatch.findFirst({
      where: {
        id: payload.importBatchId,
        projectId: project.id
      }
    });
    if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    if (batch.status === "committed") return NextResponse.json({ error: "Import batch already committed" }, { status: 409 });
    if (batch.status !== "previewed") return NextResponse.json({ error: "Import batch is not commit-ready" }, { status: 409 });

    const preview = importPreviewSchema.parse(batch.previewJson) as unknown as ImportPreview;
    const plan = buildCommitPlan(preview, payload.mode);

    const result = await prisma.$transaction(async (tx) => {
      if (plan.mode === "replace_all" || plan.mode === "replace_budget" || plan.mode === "replace_budget_materials") {
        await tx.budgetItem.deleteMany({ where: { projectId: project.id } });
        await tx.budgetSection.deleteMany({ where: { projectId: project.id } });
      }
      if (plan.mode === "replace_all" || plan.mode === "replace_materials" || plan.mode === "replace_budget_materials") {
        await tx.material.deleteMany({ where: { projectId: project.id } });
      }
      if (plan.mode === "replace_all" || plan.mode === "replace_schedule") {
        await tx.scheduleItem.deleteMany({ where: { projectId: project.id } });
      }

      const sectionNames = Array.from(new Set([...plan.sections.map((section) => section.name), ...plan.budgetItems.map((item) => item.section)]));
      for (const [index, name] of sectionNames.entries()) {
        await tx.budgetSection.upsert({
          where: { projectId_name: { projectId: project.id, name } },
          update: {},
          create: {
            organizationId: project.organizationId,
            projectId: project.id,
            name,
            sortOrder: index,
            createdBy: user.id
          }
        });
      }

      const budgetItems = await Promise.all(
        plan.budgetItems.map((item) =>
          tx.budgetItem.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              section: item.section,
              code: item.code || `${item.sheetName}:${item.rowNumber}`,
              name: item.name,
              unit: item.unit,
              qty: new Prisma.Decimal(item.qty),
              plannedUnitPrice: new Prisma.Decimal(item.plannedUnitPrice),
              actualUnitPrice: new Prisma.Decimal(item.actualUnitPrice),
              forecastUnitPrice: new Prisma.Decimal(item.forecastUnitPrice),
              kind: item.kind,
              source: item.source,
              comment: item.comment,
              createdBy: user.id
            }
          })
        )
      );

      const materials = await Promise.all(
        plan.materials.map((item) =>
          tx.material.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              name: item.name,
              unit: item.unit,
              requiredQty: new Prisma.Decimal(item.requiredQty),
              orderedQty: new Prisma.Decimal(item.orderedQty),
              deliveredQty: new Prisma.Decimal(item.deliveredQty),
              consumedQty: new Prisma.Decimal(item.consumedQty),
              plannedUnitPrice: new Prisma.Decimal(item.plannedUnitPrice),
              actualUnitPrice: new Prisma.Decimal(item.actualUnitPrice),
              supplier: item.supplier,
              neededAt: item.neededAt,
              status: item.status,
              createdBy: user.id
            }
          })
        )
      );

      const scheduleItems = await Promise.all(
        plan.scheduleItems.map((item) =>
          tx.scheduleItem.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              name: item.name,
              owner: item.owner,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              plannedQty: new Prisma.Decimal(item.plannedQty),
              actualQty: new Prisma.Decimal(item.actualQty),
              status: item.status,
              dependency: item.dependency,
              createdBy: user.id
            }
          })
        )
      );

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "committed",
          mode: plan.mode,
          summary: toJson({
            ...preview.summary,
            commitResult: {
              mode: plan.mode,
              created: budgetItems.length + materials.length + scheduleItems.length,
              updated: 0,
              skipped: (preview.summary.skippedRows ?? 0) + preview.summary.unknownRows,
              errors: preview.summary.errors,
              warnings: preview.summary.warnings,
              budgetItems: budgetItems.length,
              materials: materials.length,
              scheduleItems: scheduleItems.length
            }
          }),
          committedAt: new Date()
        }
      });

      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.authenticated ? user.email : null,
        entity: "excel_import",
        entityId: batch.id,
        action: "import_commit",
        summary: `Excel import saved: budget ${budgetItems.length}, materials ${materials.length}, schedule ${scheduleItems.length}, mode ${plan.mode}`,
        after: {
          importBatchId: batch.id,
          mode: plan.mode,
          parserVersion: preview.parserVersion,
          summary: plan.summary,
          budgetItems: budgetItems.length,
          materials: materials.length,
          scheduleItems: scheduleItems.length
        }
      });

      return {
        budgetItems: budgetItems.map(serializeBudgetItem),
        materials: materials.map(serializeMaterial),
        scheduleItems: scheduleItems.map(serializeScheduleItem)
      };
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ ok: true, importBatchId: batch.id, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation error", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.message.startsWith("Нельзя сохранить")) {
      return NextResponse.json({ error: error.message }, { status: 422 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import commit failed" }, { status: 500 });
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
