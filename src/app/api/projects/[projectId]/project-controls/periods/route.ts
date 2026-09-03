import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { writeAudit } from "@/lib/audit";
import { prisma } from "@/lib/prisma";
import { buildProjectControlPeriodPreview, projectControlPeriodRequestSchema } from "@/lib/project-controls";
import {
  projectControlBaselineInclude,
  projectControlPeriodInclude,
  serializeProjectControlBaseline,
  serializeProjectControlPeriod
} from "@/lib/project-controls-db";

function periodLabel(dataDate: string) {
  return `Отчет на ${new Intl.DateTimeFormat("ru-RU", { timeZone: "UTC" }).format(new Date(dataDate))}`;
}

type StoredBaseline = ReturnType<typeof serializeProjectControlBaseline>;
type PeriodReadClient = Pick<Prisma.TransactionClient, "scheduleItem" | "workProgressEntry" | "payment">;

class PeriodRequestError extends Error {
  constructor(readonly code: string, message: string, readonly status: number) {
    super(message);
  }
}

function assertPublishableBaseline(baseline: StoredBaseline, cutOff: Date, publishing: boolean) {
  if (publishing && baseline.status !== "active") {
    throw new PeriodRequestError("BASELINE_NOT_ACTIVE", "Only the active baseline can publish a reporting period", 409);
  }
  if (cutOff < new Date(baseline.dataDate)) {
    throw new PeriodRequestError("INVALID_DATE", "Reporting date cannot precede the baseline data date", 409);
  }
}

async function loadPeriodPreview(client: PeriodReadClient, projectId: string, baseline: StoredBaseline, cutOff: Date) {
  const scheduleItemIds = [...new Set(baseline.lines.flatMap((line) => line.scheduleItemId ? [line.scheduleItemId] : []))];
  const [scheduleItems, progressEntries, payments] = await Promise.all([
    scheduleItemIds.length
      ? client.scheduleItem.findMany({ where: { projectId, id: { in: scheduleItemIds } }, orderBy: { startsAt: "asc" } })
      : Promise.resolve([]),
    scheduleItemIds.length
      ? client.workProgressEntry.findMany({ where: { projectId, scheduleItemId: { in: scheduleItemIds }, date: { lte: cutOff } }, orderBy: { date: "asc" } })
      : Promise.resolve([]),
    client.payment.findMany({ where: { projectId }, orderBy: { plannedAt: "asc" } })
  ]);

  return buildProjectControlPeriodPreview({
    baseline: {
      budgetAtCompletion: baseline.budgetAtCompletion,
      plannedStart: baseline.plannedStart,
      plannedFinish: baseline.plannedFinish,
      scheduleCoveragePercent: baseline.scheduleCoveragePercent,
      limitations: baseline.limitations
    },
    lines: baseline.lines,
    scheduleItems: scheduleItems.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      budgetItemId: item.budgetItemId ?? undefined,
      costCodeId: item.costCodeId,
      name: item.name,
      owner: item.owner,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt.toISOString(),
      plannedQty: Number(item.plannedQty),
      actualQty: Number(item.actualQty),
      status: item.status as "not_started" | "in_progress" | "done" | "delayed" | "stopped",
      dependency: item.dependency ?? undefined
    })),
    progressEntries: progressEntries.map((item) => ({
      scheduleItemId: item.scheduleItemId,
      date: item.date,
      qty: Number(item.qty),
      status: item.status
    })),
    payments: payments.map((item) => ({
      id: item.id,
      projectId: item.projectId,
      costCodeId: item.costCodeId,
      title: item.title,
      counterparty: item.counterparty,
      direction: item.direction as "incoming" | "outgoing",
      plannedAt: item.plannedAt.toISOString(),
      paidAt: item.paidAt?.toISOString(),
      amount: Number(item.amount),
      status: item.status as "planned" | "approved" | "paid" | "overdue",
      category: item.category as "customer" | "supplier" | "subcontractor" | "payroll" | "tax" | "overhead" | "loan"
    })),
    dataDate: cutOff
  });
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  try {
    const data = projectControlPeriodRequestSchema.parse(await request.json().catch(() => ({})));
    const cutOff = new Date(data.dataDate);
    if (Number.isNaN(cutOff.getTime())) return apiError(requestId, "INVALID_DATE", "Invalid reporting date", 400);
    if (data.mode === "preview") {
      const baseline = await prisma.projectControlBaseline.findFirst({
        where: { id: data.baselineId, projectId: params.projectId },
        include: projectControlBaselineInclude
      });
      if (!baseline) return apiError(requestId, "NOT_FOUND", "Baseline not found", 404);
      const stored = serializeProjectControlBaseline(baseline);
      assertPublishableBaseline(stored, cutOff, false);
      return apiOk(requestId, { preview: await loadPeriodPreview(prisma, params.projectId, stored, cutOff) });
    }

    const period = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${params.projectId} FOR UPDATE`;
      const baseline = await tx.projectControlBaseline.findFirst({
        where: { id: data.baselineId, projectId: params.projectId },
        include: projectControlBaselineInclude
      });
      if (!baseline) throw new PeriodRequestError("NOT_FOUND", "Baseline not found", 404);
      const stored = serializeProjectControlBaseline(baseline);
      assertPublishableBaseline(stored, cutOff, true);
      const preview = await loadPeriodPreview(tx, params.projectId, stored, cutOff);
      const latest = await tx.projectControlPeriod.findFirst({
        where: { projectId: params.projectId },
        orderBy: { sequence: "desc" },
        select: { sequence: true }
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const summary = preview.summary;
      const created = await tx.projectControlPeriod.create({
        data: {
          organizationId: baseline.organizationId,
          projectId: params.projectId,
          baselineId: baseline.id,
          sequence,
          label: data.label || periodLabel(data.dataDate),
          dataDate: cutOff,
          status: "published",
          budgetAtCompletion: summary.budgetAtCompletion,
          plannedValue: summary.plannedValue,
          earnedValue: summary.earnedValue,
          actualCost: summary.actualCost,
          costVariance: summary.costVariance,
          scheduleVariance: summary.scheduleVariance,
          costPerformanceIndex: summary.costPerformanceIndex,
          schedulePerformanceIndex: summary.schedulePerformanceIndex,
          estimateAtCompletion: summary.estimateAtCompletion,
          estimateToComplete: summary.estimateToComplete,
          varianceAtCompletion: summary.varianceAtCompletion,
          toCompletePerformanceIndex: summary.toCompletePerformanceIndex,
          plannedProgressPercent: summary.plannedProgressPercent,
          earnedProgressPercent: summary.earnedProgressPercent,
          forecastFinish: summary.forecastFinish ? new Date(summary.forecastFinish) : null,
          scheduleVarianceDays: summary.scheduleVarianceDays,
          actualCostSource: summary.actualCostSource,
          actualCostAllocated: summary.actualCostAllocated,
          actualCostCoveragePercent: summary.actualCostCoveragePercent,
          coverage: preview.coverage,
          limitations: preview.limitations,
          createdBy: user?.authenticated ? user.id : null,
          lines: {
            create: preview.lines.map((line) => ({
              baselineLineId: line.baselineLineId,
              sequence: line.sequence,
              code: line.code,
              name: line.name,
              plannedValue: line.plannedValue,
              earnedValue: line.earnedValue,
              actualCost: line.actualCost,
              costVariance: line.costVariance,
              scheduleVariance: line.scheduleVariance,
              plannedProgress: line.plannedProgress,
              earnedProgress: line.earnedProgress,
              actualCostAllocated: line.actualCostAllocated,
              status: line.status
            }))
          }
        },
        include: projectControlPeriodInclude
      });
      await writeAudit(tx, {
        organizationId: baseline.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_control_period",
        entityId: created.id,
        action: "create",
        summary: `Опубликован отчетный период #${sequence}: ${created.label}`,
        after: {
          baselineId: baseline.id,
          dataDate: summary.dataDate,
          BAC: summary.budgetAtCompletion,
          PV: summary.plannedValue,
          EV: summary.earnedValue,
          AC: summary.actualCost,
          CPI: summary.costPerformanceIndex,
          SPI: summary.schedulePerformanceIndex
        }
      });
      return created;
    });
    return apiOk(requestId, { period: serializeProjectControlPeriod(period) }, 201);
  } catch (error) {
    if (error instanceof PeriodRequestError) return apiError(requestId, error.code, error.message, error.status);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return apiError(requestId, "PERIOD_CONFLICT", "A reporting period already exists for this baseline and date", 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    if (error instanceof Error && error.name === "ZodError") return apiError(requestId, "INVALID_REQUEST", "Invalid reporting period request", 400);
    return apiError(requestId, "PERIOD_CREATE_FAILED", "Reporting period failed", 500);
  }
}
