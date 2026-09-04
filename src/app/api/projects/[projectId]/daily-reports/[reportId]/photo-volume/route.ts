import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeDailyReportWorkOutputUnit, parseDailyReportWorkOutputs } from "@/lib/daily-report-work-outputs";
import { parseDailyReportWorkScopes } from "@/lib/daily-report-work-scopes";
import { PhotoAnalysisProviderError } from "@/lib/photo-analysis-provider";
import {
  estimatePhotoVolumes,
  photoVolumeRequestSchema,
  type PhotoVolumeWorkContext
} from "@/lib/photo-volume-estimation";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { readDocumentFile } from "@/lib/storage/documents";

export const runtime = "nodejs";

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_BYTES = 20 * 1024 * 1024;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function decimal(value: unknown) {
  const result = Number(value);
  return Number.isFinite(result) ? result : 0;
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; reportId: string } }) {
  const user = await getCurrentUser();
  if (!user || !(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  const rateLimit = checkRateLimit({ key: `ai-photo-volume:${user.id}:${params.projectId}`, limit: 12, windowMs: 5 * 60_000 });
  if (!rateLimit.allowed) {
    return new NextResponse(JSON.stringify({ error: "Слишком много AI-запросов по фото. Повторите позже." }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }

  const report = await prisma.dailyReport.findFirst({
    where: { id: params.reportId, projectId: params.projectId },
    select: { id: true, organizationId: true, projectId: true, status: true, workScopes: true, workOutputs: true }
  });
  if (!report) return json({ error: "Daily report not found in project" }, 404);
  if (report.status !== "draft") return json({ error: "AI volume estimation is available only for a draft daily report" }, 409);

  const parsed = photoVolumeRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid photo volume request", issues: parsed.error.issues }, 400);

  const documentIds = [...new Set(parsed.data.documentIds)];
  const scheduleItemIds = [...new Set(parsed.data.scheduleItemIds)];
  const scopedScheduleIds = new Set([
    ...parseDailyReportWorkScopes(report.workScopes).flatMap((scope) => scope.scheduleItemId ? [scope.scheduleItemId] : []),
    ...parseDailyReportWorkOutputs(report.workOutputs).flatMap((output) => output.scheduleItemId ? [output.scheduleItemId] : [])
  ]);
  if (scheduleItemIds.some((id) => !scopedScheduleIds.has(id))) {
    return json({ error: "Save the selected report works before estimating quantities" }, 409);
  }

  const [documents, scheduleItems] = await Promise.all([
    prisma.document.findMany({
      where: { id: { in: documentIds }, projectId: params.projectId, dailyReportId: params.reportId },
      select: { id: true, mimeType: true, sizeBytes: true, storageKey: true }
    }),
    prisma.scheduleItem.findMany({
      where: { id: { in: scheduleItemIds }, projectId: params.projectId, isCurrent: true },
      select: { id: true, budgetItemId: true, name: true, unit: true, plannedQty: true, actualQty: true, progressMode: true }
    })
  ]);

  if (documents.length !== documentIds.length) return json({ error: "One or more photos are not attached to this daily report" }, 404);
  if (documents.some((item) => !item.mimeType || !IMAGE_TYPES.has(item.mimeType))) return json({ error: "Only JPEG, PNG and WebP evidence can be analyzed" }, 400);
  if (documents.some((item) => item.sizeBytes === null || !item.storageKey)) return json({ error: "Photo storage metadata is incomplete" }, 400);
  if (documents.some((item) => (item.sizeBytes ?? 0) > MAX_IMAGE_BYTES)) return json({ error: "Each photo must be 8 MB or less" }, 400);
  if (documents.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0) > MAX_TOTAL_BYTES) return json({ error: "Selected photos exceed the 20 MB analysis limit" }, 400);
  if (scheduleItems.length !== scheduleItemIds.length) return json({ error: "One or more report works are not in the current project schedule" }, 404);
  if (scheduleItems.some((item) => item.progressMode === "milestone")) return json({ error: "Photo quantity estimation supports measurable schedule works only" }, 400);

  const budgetItemIds = [...new Set(scheduleItems.flatMap((item) => item.budgetItemId ? [item.budgetItemId] : []))];
  const budgetItems = budgetItemIds.length
    ? await prisma.budgetItem.findMany({ where: { id: { in: budgetItemIds }, projectId: params.projectId }, select: { id: true, unit: true } })
    : [];
  const budgetUnits = new Map(budgetItems.map((item) => [item.id, item.unit]));
  const scheduleById = new Map(scheduleItems.map((item) => [item.id, item]));
  const works: PhotoVolumeWorkContext[] = scheduleItemIds.map((id) => {
    const item = scheduleById.get(id)!;
    const plannedQuantity = decimal(item.plannedQty);
    const completedQuantity = decimal(item.actualQty);
    const unit = normalizeDailyReportWorkOutputUnit(item.unit || (item.budgetItemId ? budgetUnits.get(item.budgetItemId) : "") || "ед.");
    return {
      scheduleItemId: item.id,
      workName: item.name,
      unit,
      plannedQuantity,
      completedQuantity,
      remainingQuantity: Math.max(0, plannedQuantity - completedQuantity)
    };
  });

  try {
    const photos = await Promise.all(documents.map(async (item) => ({
      mimeType: item.mimeType as "image/jpeg" | "image/png" | "image/webp",
      bytes: await readDocumentFile(item.storageKey as string)
    })));
    const result = await estimatePhotoVolumes({ works, photos });
    await writeAudit(prisma, {
      organizationId: report.organizationId,
      projectId: report.projectId,
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "PGS user",
      actorEmail: user?.email ?? null,
      entity: "daily_report_photo_volume",
      entityId: report.id,
      action: "create",
      summary: `Подготовлена AI-оценка объёмов по фото (${documents.length})`,
      after: {
        photoCount: documents.length,
        workCount: works.length,
        suggestedCount: result.suggestions.filter((item) => item.suggestedQuantity !== null).length
      }
    });
    return json({ result });
  } catch (error) {
    if (error instanceof PhotoAnalysisProviderError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Photo volume estimation failed" }, 500);
  }
}
