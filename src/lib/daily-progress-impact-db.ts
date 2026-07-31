import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import type { AppUser } from "@/lib/auth/permissions";
import { buildDailyProgressImpact, type DailyProgressImpactPreview } from "@/lib/daily-progress-impact";
import { prisma } from "@/lib/prisma";
import {
  serializeDailyReport,
  serializeMaterial,
  serializeScheduleItem
} from "@/lib/serializers";
import type { DailyReport, Material, ScheduleItem } from "@/lib/types";

export class DailyProgressImpactError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

export interface LoadedDailyProgressImpact {
  projectId: string;
  report: DailyReport;
  preview: DailyProgressImpactPreview;
}

export interface AppliedDailyProgressImpact extends LoadedDailyProgressImpact {
  alreadyApplied: boolean;
  scheduleItems: ScheduleItem[];
  materials: Material[];
  actionId: string | null;
}

function actor(user: AppUser) {
  return {
    actorId: user.authenticated ? user.id : null,
    actorName: user.name ?? "project-user",
    actorEmail: user.email ?? null
  };
}

async function loadWithClient(client: Prisma.TransactionClient | typeof prisma, reportId: string) {
  const report = await client.dailyReport.findUnique({ where: { id: reportId } });
  if (!report) return null;
  const [scheduleItems, materials] = await Promise.all([
    client.scheduleItem.findMany({ where: { projectId: report.projectId }, orderBy: { startsAt: "asc" } }),
    client.material.findMany({ where: { projectId: report.projectId }, orderBy: { neededAt: "asc" } })
  ]);
  const serializedReport = serializeDailyReport(report);
  const serializedSchedule = scheduleItems.map(serializeScheduleItem);
  const serializedMaterials = materials.map(serializeMaterial);
  return {
    projectId: report.projectId,
    organizationId: report.organizationId,
    dbReport: report,
    report: serializedReport,
    scheduleItems: serializedSchedule,
    materials: serializedMaterials,
    preview: buildDailyProgressImpact(serializedReport, serializedSchedule, serializedMaterials)
  };
}

export async function findDailyProgressProjectId(reportId: string) {
  return (await prisma.dailyReport.findUnique({ where: { id: reportId }, select: { projectId: true } }))?.projectId ?? null;
}

export async function loadDailyProgressImpact(reportId: string): Promise<LoadedDailyProgressImpact | null> {
  const loaded = await loadWithClient(prisma, reportId);
  if (!loaded) return null;
  return { projectId: loaded.projectId, report: loaded.report, preview: loaded.preview };
}

export async function applyDailyProgressImpact(reportId: string, user: AppUser): Promise<AppliedDailyProgressImpact> {
  return prisma.$transaction(async (tx) => {
    const loaded = await loadWithClient(tx, reportId);
    if (!loaded) throw new DailyProgressImpactError("Daily report not found", 404);
    if (loaded.dbReport.status !== "approved") {
      throw new DailyProgressImpactError("Only an approved daily report can update project facts", 409);
    }
    if (loaded.dbReport.impactStatus === "not_applicable") {
      throw new DailyProgressImpactError("Legacy approved reports are read-only and cannot be applied retroactively", 409);
    }
    if (loaded.dbReport.impactStatus === "applied") {
      return {
        projectId: loaded.projectId,
        report: loaded.report,
        preview: loaded.preview,
        alreadyApplied: true,
        scheduleItems: [],
        materials: [],
        actionId: loaded.report.impactSummary?.actionId ?? null
      };
    }
    if (loaded.preview.blockers.length) {
      throw new DailyProgressImpactError(loaded.preview.blockers[0], 409);
    }

    const claimed = await tx.dailyReport.updateMany({
      where: { id: reportId, impactStatus: "pending" },
      data: { impactStatus: "applying" }
    });
    if (!claimed.count) {
      const current = await tx.dailyReport.findUnique({ where: { id: reportId } });
      if (current?.impactStatus === "applied") {
        const currentReport = serializeDailyReport(current);
        return {
          projectId: loaded.projectId,
          report: currentReport,
          preview: { ...loaded.preview, status: "applied" },
          alreadyApplied: true,
          scheduleItems: [],
          materials: [],
          actionId: currentReport.impactSummary?.actionId ?? null
        };
      }
      throw new DailyProgressImpactError("Daily report impact is being processed", 409);
    }

    if (loaded.preview.progressEntries.length) {
      await tx.workProgressEntry.createMany({
        data: loaded.preview.progressEntries.map((entry) => ({
          organizationId: loaded.organizationId,
          projectId: loaded.projectId,
          scheduleItemId: entry.scheduleItemId,
          sourceDailyReportId: reportId,
          sourceOutputIndex: entry.outputIndex,
          date: loaded.dbReport.date,
          qty: new Prisma.Decimal(entry.quantity),
          performer: `${entry.profession} · ${loaded.dbReport.author}`,
          comment: `${entry.workName} · ${entry.laborHours.toLocaleString("ru-RU")} чел.-ч`,
          status: "approved",
          createdBy: user.authenticated ? user.id : null
        }))
      });
    }

    const changedScheduleIds: string[] = [];
    for (const update of loaded.preview.scheduleUpdates) {
      await tx.scheduleItem.update({
        where: { id: update.scheduleItemId },
        data: {
          actualQty: { increment: new Prisma.Decimal(update.quantity) },
          status: update.nextStatus
        }
      });
      changedScheduleIds.push(update.scheduleItemId);
    }

    const changedMaterialIds: string[] = [];
    for (const update of loaded.preview.materialUpdates) {
      await tx.material.update({
        where: { id: update.materialId },
        data: {
          deliveredQty: { increment: new Prisma.Decimal(update.receivedQty) },
          consumedQty: { increment: new Prisma.Decimal(update.consumedQty) },
          status: update.nextStatus
        }
      });
      changedMaterialIds.push(update.materialId);
    }

    const createdAction = loaded.preview.riskAction
      ? await tx.projectActionItem.create({
          data: {
            organizationId: loaded.organizationId,
            projectId: loaded.projectId,
            createdBy: user.authenticated ? user.id : null,
            title: loaded.preview.riskAction.title,
            description: loaded.preview.riskAction.description,
            sourceModule: "daily-progress",
            targetTab: "Риски",
            priority: loaded.preview.riskAction.priority,
            assignee: loaded.dbReport.author,
            requiresApproval: false
          }
        })
      : null;

    const summary = { ...loaded.preview.summary, actionId: createdAction?.id ?? null };
    const updatedReport = await tx.dailyReport.update({
      where: { id: reportId },
      data: {
        impactStatus: "applied",
        impactAppliedAt: new Date(),
        impactAppliedBy: user.authenticated ? user.id : null,
        impactSummary: summary as unknown as Prisma.InputJsonValue
      }
    });

    await writeAudit(tx, {
      organizationId: loaded.organizationId,
      projectId: loaded.projectId,
      ...actor(user),
      entity: "daily_report_impact",
      entityId: reportId,
      action: "accept",
      summary: `Применён утверждённый факт рапорта: ${loaded.report.date}`,
      before: {
        impactStatus: loaded.report.impactStatus ?? "pending",
        scheduleItems: loaded.preview.scheduleUpdates.map((item) => ({
          id: item.scheduleItemId,
          actualQty: item.beforeActualQty,
          status: item.beforeStatus
        })),
        materials: loaded.preview.materialUpdates.map((item) => ({
          id: item.materialId,
          deliveredQty: item.beforeDeliveredQty,
          consumedQty: item.beforeConsumedQty,
          status: item.beforeStatus
        }))
      },
      after: {
        impactStatus: "applied",
        summary
      }
    });

    const [changedSchedule, changedMaterials] = await Promise.all([
      changedScheduleIds.length
        ? tx.scheduleItem.findMany({ where: { id: { in: changedScheduleIds } }, orderBy: { startsAt: "asc" } })
        : [],
      changedMaterialIds.length
        ? tx.material.findMany({ where: { id: { in: changedMaterialIds } }, orderBy: { neededAt: "asc" } })
        : []
    ]);
    const report = serializeDailyReport(updatedReport);

    return {
      projectId: loaded.projectId,
      report,
      preview: { ...loaded.preview, status: "applied", summary },
      alreadyApplied: false,
      scheduleItems: changedSchedule.map(serializeScheduleItem),
      materials: changedMaterials.map(serializeMaterial),
      actionId: createdAction?.id ?? null
    };
  });
}
