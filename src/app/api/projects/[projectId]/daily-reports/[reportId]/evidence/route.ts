import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeDocument } from "@/lib/serializers";

export const runtime = "nodejs";

const requestSchema = z.object({
  documentIds: z.array(z.string().trim().min(1)).min(1).max(30)
});

const IMAGE_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);

class EvidenceLinkConflict extends Error {}

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; reportId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);

  const parsed = requestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ error: "Invalid evidence selection", issues: parsed.error.issues }, 400);
  const documentIds = [...new Set(parsed.data.documentIds)];

  const report = await prisma.dailyReport.findFirst({
    where: { id: params.reportId, projectId: params.projectId },
    select: { id: true, organizationId: true, projectId: true, status: true }
  });
  if (!report) return json({ error: "Daily report not found in project" }, 404);
  if (report.status !== "draft") return json({ error: "Photos can be attached only to a draft daily report" }, 409);

  const documents = await prisma.document.findMany({
    where: { id: { in: documentIds }, projectId: params.projectId }
  });
  if (documents.length !== documentIds.length) return json({ error: "One or more project photos were not found" }, 404);
  if (documents.some((item) => !item.mimeType || !IMAGE_TYPES.has(item.mimeType))) {
    return json({ error: "Only JPEG, PNG and WebP project photos can be attached" }, 400);
  }
  if (documents.some((item) => item.dailyReportId && item.dailyReportId !== report.id)) {
    return json({ error: "One or more photos are already attached to another daily report" }, 409);
  }

  const unlinkedIds = documents.filter((item) => !item.dailyReportId).map((item) => item.id);
  try {
    const items = await prisma.$transaction(async (tx) => {
      if (unlinkedIds.length) {
        const updated = await tx.document.updateMany({
          where: { id: { in: unlinkedIds }, projectId: report.projectId, dailyReportId: null },
          data: { dailyReportId: report.id }
        });
        if (updated.count !== unlinkedIds.length) throw new EvidenceLinkConflict();
        await writeAudit(tx, {
          organizationId: report.organizationId,
          projectId: report.projectId,
          actorId: user?.authenticated ? user.id : null,
          actorName: user?.name ?? "PGS user",
          actorEmail: user?.email ?? null,
          entity: "daily_report_evidence",
          entityId: report.id,
          action: "update",
          summary: `К рапорту прикреплены фото из документов: ${unlinkedIds.length}`,
          after: { documentIds: unlinkedIds }
        });
      }
      return tx.document.findMany({
        where: { id: { in: documentIds }, projectId: report.projectId, dailyReportId: report.id },
        orderBy: { uploadedAt: "asc" }
      });
    });
    return json({ items: items.map(serializeDocument), linked: unlinkedIds.length });
  } catch (error) {
    if (error instanceof EvidenceLinkConflict) return json({ error: "Photo selection changed. Refresh the report and try again." }, 409);
    throw error;
  }
}
