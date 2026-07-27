import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { aiRunFeedbackSchema, sanitizeAiJournalText, serializeAiRun } from "@/lib/ai-run-journal";
import { prisma } from "@/lib/prisma";

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string; runId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = aiRunFeedbackSchema.parse(await request.json().catch(() => ({})));
    const existing = await prisma.aiRun.findFirst({
      where: { id: params.runId, projectId: params.projectId },
      include: {
        actionLinks: {
          select: { actionIndex: true, actionItemId: true }
        }
      }
    });
    if (!existing) return NextResponse.json({ error: "AI run not found" }, { status: 404 });
    const feedbackComment = data.feedback && data.comment ? sanitizeAiJournalText(data.comment, 500) : null;

    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.aiRun.update({
        where: { id: existing.id },
        data: {
          feedback: data.feedback,
          feedbackComment,
          feedbackBy: data.feedback && user.authenticated ? user.id : null,
          feedbackAt: data.feedback ? new Date() : null
        },
        include: {
          actionLinks: {
            select: { actionIndex: true, actionItemId: true }
          }
        }
      });
      await writeAudit(tx, {
        organizationId: existing.organizationId,
        projectId: params.projectId,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.email,
        entity: "ai_run",
        entityId: existing.id,
        action: "update",
        summary: data.feedback === "helpful" ? "AI-результат отмечен полезным" : data.feedback === "needs_review" ? "AI-результат требует проверки" : "Оценка AI-результата снята",
        before: { feedback: existing.feedback, feedbackComment: existing.feedbackComment },
        after: { feedback: item.feedback, feedbackComment: item.feedbackComment }
      });
      return item;
    });

    return NextResponse.json({ item: serializeAiRun(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid AI run feedback" }, { status: 400 });
    return NextResponse.json({ error: "AI run feedback failed" }, { status: 500 });
  }
}
