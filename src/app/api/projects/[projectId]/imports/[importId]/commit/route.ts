import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError, z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildCommitPlan } from "@/lib/excel/import-parser";
import {
  claimImportBatch,
  ImportBatchNotFound,
  ImportCommitConflict,
  lockProjectForMutation,
  prepareBudgetReplacement,
  prepareScheduleRevision,
  relinkScheduleBudgetItems,
  resolveImportedScheduleBudgetLinks
} from "@/lib/excel/import-commit-integrity";
import { importModes, importPreviewSchema, type ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";
import { serializeBudgetItem, serializeMaterial, serializeScheduleItem } from "@/lib/serializers";
import { serializeLaborDemand } from "@/lib/workforce-capacity";

export const runtime = "nodejs";

const commitBodySchema = z.object({
  mode: z.enum(importModes).default("append"),
  replaceConfirmed: z.boolean().default(false)
});

export async function POST(request: NextRequest, { params }: { params: { projectId: string; importId: string } }) {
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

    const payload = commitBodySchema.parse(await request.json().catch(() => ({})));
    if (payload.mode !== "append" && !payload.replaceConfirmed) {
      return NextResponse.json({ error: "Replacement import requires explicit confirmation." }, { status: 409 });
    }

    const result = await prisma.$transaction(async (tx) => {
      await lockProjectForMutation(tx, project.id);
      const batch = await tx.importBatch.findFirst({
        where: { id: params.importId, projectId: project.id }
      });
      if (!batch) throw new ImportBatchNotFound("Import batch not found");
      if (batch.status === "committed") throw new ImportCommitConflict("Import batch already committed");
      if (batch.status !== "previewed") throw new ImportCommitConflict("Import batch is not commit-ready");
      await claimImportBatch(tx, {
        importBatchId: batch.id,
        projectId: project.id,
        expectedUpdatedAt: batch.updatedAt
      });

      const preview = importPreviewSchema.parse(batch.previewJson) as unknown as ImportPreview;
      const plan = buildCommitPlan(preview, payload.mode);
      let removedDraftRequests = 0;
      const replacesBudget = plan.mode === "replace_all" || plan.mode === "replace_budget" || plan.mode === "replace_budget_materials";
      const previousBudgetItems = await prepareBudgetReplacement(tx, { projectId: project.id, replace: replacesBudget });
      if (replacesBudget) {
        await tx.budgetItem.deleteMany({ where: { projectId: project.id } });
        await tx.budgetSection.deleteMany({ where: { projectId: project.id } });
      }
      if (plan.mode === "replace_all" || plan.mode === "replace_materials" || plan.mode === "replace_budget_materials") {
        const activeRequestCount = await tx.procurementRequest.count({
          where: {
            projectId: project.id,
            status: { in: ["submitted", "approved", "ordered", "expected", "partially_received"] }
          }
        });
        if (activeRequestCount > 0) {
          throw new Error("Нельзя сохранить замену материалов: сначала закройте или отмените активные заявки на снабжение.");
        }
        const removed = await tx.procurementRequest.deleteMany({ where: { projectId: project.id, status: "draft" } });
        removedDraftRequests = removed.count;
        await tx.material.deleteMany({ where: { projectId: project.id } });
      }
      const scheduleRevision = await prepareScheduleRevision(tx, {
        projectId: project.id,
        replace: plan.mode === "replace_all" || plan.mode === "replace_schedule"
      });
      if (plan.mode === "replace_all" || plan.mode === "replace_budget" || plan.mode === "replace_budget_materials") {
        await tx.projectLaborDemand.deleteMany({ where: { projectId: project.id, importBatchId: { not: null } } });
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
      const budgetRelink = await relinkScheduleBudgetItems(tx, {
        projectId: project.id,
        previous: previousBudgetItems,
        created: budgetItems
      });
      const availableBudgetItems = plan.scheduleItems.length
        ? await tx.budgetItem.findMany({
            where: { projectId: project.id },
            select: { id: true, section: true, code: true, name: true, unit: true, qty: true, plannedUnitPrice: true, kind: true }
          })
        : [];
      const importedScheduleLinks = resolveImportedScheduleBudgetLinks({
        scheduleItems: plan.scheduleItems,
        sourceBudgetItems: preview.budgetItems,
        availableBudgetItems
      });

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
              orderByAt: item.orderByAt,
              neededAt: item.neededAt,
              status: item.status,
              createdBy: user.id
            }
          })
        )
      );

      const scheduleItems = await Promise.all(
        plan.scheduleItems.map((item, index) =>
          tx.scheduleItem.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              budgetItemId: importedScheduleLinks.budgetItemIds[index],
              name: item.name,
              owner: item.owner,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              plannedQty: new Prisma.Decimal(item.plannedQty),
              actualQty: new Prisma.Decimal(item.actualQty),
              manualActualQty: new Prisma.Decimal(item.actualQty),
              reportActualQty: new Prisma.Decimal(0),
              unit: item.unit,
              progressMode: item.progressMode ?? "quantity",
              revision: scheduleRevision.revision,
              isCurrent: true,
              status: item.status,
              dependency: item.dependency,
              createdBy: user.id
            }
          })
        )
      );

      const budgetItemBySource = new Map(
        plan.budgetItems.map((source, index) => [`${source.code}\u0000${source.name}`, budgetItems[index]])
      );
      if (plan.laborDemands.length) {
        await tx.projectPayrollPolicy.upsert({
          where: { projectId: project.id },
          update: {},
          create: {
            organizationId: project.organizationId,
            projectId: project.id,
            createdBy: user.id
          }
        });
      }
      const laborDemands = await Promise.all(
        plan.laborDemands.map(async (item) => {
          const demand = await tx.projectLaborDemand.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              importBatchId: batch.id,
              category: item.category,
              profession: item.profession,
              function: item.function || null,
              grossMonthlySalary: new Prisma.Decimal(item.grossMonthlySalary),
              peakHeadcount: new Prisma.Decimal(item.peakHeadcount),
              personMonths: new Prisma.Decimal(item.personMonths),
              plannedHours: new Prisma.Decimal(item.plannedHours),
              productivityNorm: new Prisma.Decimal(item.productivityNorm),
              productivityUnit: item.productivityUnit || null,
              startsAt: new Date(item.startsAt),
              endsAt: new Date(item.endsAt),
              monthlyProfile: toJson(item.monthlyProfile),
              source: item.source,
              sourceSheet: item.sourceSheet,
              sourceRow: item.sourceRow,
              confidence: new Prisma.Decimal(item.confidence),
              notes: item.notes || null,
              createdBy: user.id
            }
          });
          const allocations = await Promise.all(item.allocations.map((allocation) => {
            const budgetItem = budgetItemBySource.get(`${allocation.budgetCode ?? ""}\u0000${allocation.budgetName}`);
            return tx.projectLaborAllocation.create({
              data: {
                organizationId: project.organizationId,
                projectId: project.id,
                laborDemandId: demand.id,
                budgetItemId: budgetItem?.id ?? null,
                workCode: allocation.budgetCode || null,
                workName: allocation.budgetName,
                sharePercent: new Prisma.Decimal(allocation.sharePercent),
                personMonths: new Prisma.Decimal(allocation.personMonths),
                plannedHours: new Prisma.Decimal(allocation.plannedHours),
                requiredHeadcount: new Prisma.Decimal(allocation.requiredHeadcount),
                confidence: new Prisma.Decimal(allocation.confidence),
                reason: allocation.reason
              }
            });
          }));
          return { ...demand, allocations };
        })
      );

      const commitResult = {
        mode: plan.mode,
        created: budgetItems.length + materials.length + scheduleItems.length + laborDemands.length,
        updated: 0,
        skipped: (preview.summary.skippedRows ?? 0) + preview.summary.unknownRows,
        errors: preview.summary.errors,
        warnings: preview.summary.warnings,
        budgetItems: budgetItems.length,
        materials: materials.length,
        scheduleItems: scheduleItems.length,
        scheduleRevision: scheduleRevision.revision,
        supersededScheduleItems: scheduleRevision.supersededCount,
        relinkedScheduleBudgetItems: budgetRelink.relinked,
        clearedScheduleBudgetItems: budgetRelink.cleared,
        linkedImportedScheduleItems: importedScheduleLinks.linked,
        unresolvedImportedScheduleItems: importedScheduleLinks.unresolved,
        removedDraftRequests,
        laborDemands: laborDemands.length,
        laborAllocations: laborDemands.reduce((sum, item) => sum + item.allocations.length, 0)
      };

      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: "committed",
          mode: plan.mode,
          summary: toJson({ ...preview.summary, commitResult }),
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
        summary: `Excel import saved: budget ${budgetItems.length}, materials ${materials.length}, schedule ${scheduleItems.length}, labor demands ${laborDemands.length}, mode ${plan.mode}`,
        after: {
          importBatchId: batch.id,
          mode: plan.mode,
          parserVersion: preview.parserVersion,
          summary: plan.summary,
          commitResult
        }
      });

      return {
        importBatchId: batch.id,
        budgetItems: budgetItems.map(serializeBudgetItem),
        materials: materials.map(serializeMaterial),
        scheduleItems: scheduleItems.map(serializeScheduleItem),
        laborDemands: laborDemands.map(serializeLaborDemand),
        commitResult
      };
    }, { maxWait: 10_000, timeout: 30_000 });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation error", issues: error.issues }, { status: 400 });
    }
    if (error instanceof ImportCommitConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof ImportBatchNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
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
