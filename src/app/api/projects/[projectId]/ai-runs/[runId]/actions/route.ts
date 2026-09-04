import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { aiInsightResponseSchema } from "@/lib/ai-command/schemas";
import { aiRunActionSchema, aiRunTargetTab } from "@/lib/ai-run-journal";
import { prisma } from "@/lib/prisma";
import { serializeProjectAction } from "@/lib/project-actions";

export async function POST(request: NextRequest, { params }: { params: { projectId: string; runId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = aiRunActionSchema.parse(await request.json().catch(() => ({})));
    const run = await prisma.aiRun.findFirst({
      where: { id: params.runId, projectId: params.projectId },
      include: {
        actionLinks: {
          where: { actionIndex: data.actionIndex },
          include: { actionItem: true }
        }
      }
    });
    if (!run) return NextResponse.json({ error: "AI run not found" }, { status: 404 });
    if (run.actionLinks[0]) {
      return NextResponse.json({
        item: serializeProjectAction(run.actionLinks[0].actionItem),
        actionIndex: data.actionIndex,
        alreadyCreated: true
      });
    }

    const parsedInsight = aiInsightResponseSchema.safeParse(run.outputJson);
    if (!parsedInsight.success) return NextResponse.json({ error: "AI run output is not actionable" }, { status: 409 });
    const recommendation = parsedInsight.data.recommendedActions[data.actionIndex];
    if (!recommendation) return NextResponse.json({ error: "AI recommendation not found" }, { status: 404 });

    const created = await prisma.$transaction(async (tx) => {
      const actionItem = await tx.projectActionItem.create({
        data: {
          organizationId: run.organizationId,
          projectId: params.projectId,
          createdBy: user.authenticated ? user.id : null,
          title: recommendation.title.slice(0, 180),
          description: recommendation.description.slice(0, 2000),
          sourceModule: "ai-decision-journal",
          targetTab: aiRunTargetTab(parsedInsight.data.scenario),
          priority: recommendation.priority,
          requiresApproval: true
        }
      });
      await tx.aiRunAction.create({
        data: {
          aiRunId: run.id,
          actionIndex: data.actionIndex,
          actionItemId: actionItem.id,
          createdBy: user.authenticated ? user.id : null
        }
      });
      await writeAudit(tx, {
        organizationId: run.organizationId,
        projectId: params.projectId,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.email,
        entity: "ai_run",
        entityId: run.id,
        action: "create",
        summary: `Создано действие из AI-рекомендации: ${actionItem.title}`,
        after: {
          actionIndex: data.actionIndex,
          actionItem: serializeProjectAction(actionItem)
        }
      });
      return actionItem;
    });

    return NextResponse.json({ item: serializeProjectAction(created), actionIndex: data.actionIndex, alreadyCreated: false }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Action was already created from this recommendation" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid AI recommendation" }, { status: 400 });
    return NextResponse.json({ error: "AI action create failed" }, { status: 500 });
  }
}
