import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { askPhotoQuestion, PhotoQuestionProviderError, photoQuestionRequestSchema } from "@/lib/photo-question";
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

export async function POST(request: NextRequest, { params }: { params: { projectId: string; reportId: string } }) {
  const user = await getCurrentUser();
  if (!user || !(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  const rateLimit = checkRateLimit({ key: `ai-photo-question:${user.id}:${params.projectId}`, limit: 12, windowMs: 5 * 60_000 });
  if (!rateLimit.allowed) {
    return new NextResponse(JSON.stringify({ error: "Слишком много AI-запросов по фото. Повторите позже." }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }

  const report = await prisma.dailyReport.findFirst({
    where: { id: params.reportId, projectId: params.projectId },
    select: { id: true, organizationId: true, projectId: true }
  });
  if (!report) return json({ error: "Daily report not found in project" }, 404);

  const parsed = photoQuestionRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid photo question", issues: parsed.error.issues }, 400);
  const uniqueIds = [...new Set(parsed.data.documentIds)];
  const documents = await prisma.document.findMany({
    where: { id: { in: uniqueIds }, projectId: params.projectId, dailyReportId: params.reportId },
    select: { id: true, mimeType: true, sizeBytes: true, storageKey: true }
  });
  if (documents.length !== uniqueIds.length) return json({ error: "One or more photos are not attached to this daily report" }, 404);
  if (documents.some((item) => !item.mimeType || !IMAGE_TYPES.has(item.mimeType))) return json({ error: "Only JPEG, PNG and WebP evidence can be analyzed" }, 400);
  if (documents.some((item) => item.sizeBytes === null || !item.storageKey)) return json({ error: "Photo storage metadata is incomplete" }, 400);
  if (documents.some((item) => (item.sizeBytes ?? 0) > MAX_IMAGE_BYTES)) return json({ error: "Each photo must be 8 MB or less" }, 400);
  if (documents.reduce((sum, item) => sum + (item.sizeBytes ?? 0), 0) > MAX_TOTAL_BYTES) return json({ error: "Selected photos exceed the 20 MB analysis limit" }, 400);

  try {
    const photos = await Promise.all(documents.map(async (item) => ({
      mimeType: item.mimeType as "image/jpeg" | "image/png" | "image/webp",
      bytes: await readDocumentFile(item.storageKey as string)
    })));
    const result = await askPhotoQuestion({ question: parsed.data.question, photos });
    await writeAudit(prisma, {
      organizationId: report.organizationId,
      projectId: report.projectId,
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "PGS user",
      actorEmail: user?.email ?? null,
      entity: "daily_report_photo_question",
      entityId: report.id,
      action: "create",
      summary: `Выполнен AI-анализ фото рапорта (${documents.length})`,
      after: { photoCount: documents.length, confidence: result.confidence }
    });
    return json({ result });
  } catch (error) {
    if (error instanceof PhotoQuestionProviderError) return json({ error: error.message }, error.status);
    console.error(error);
    return json({ error: "Photo analysis failed" }, 500);
  }
}
