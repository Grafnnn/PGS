import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { canProject } from "@/lib/auth/project-permissions";
import { demoState } from "@/lib/demo-data";
import { aiScenarioAliases, runAiScenario, type AiScenario } from "@/lib/ai-command";
import { aiRunStatusForInsight, recordAiRunSafely, sanitizeAiRunError, serializeAiRun } from "@/lib/ai-run-journal";
import { prisma } from "@/lib/prisma";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function projectContext(projectId: string) {
  const demoProject = demoState.projects.find((project) => project.id === projectId);
  if (demoProject) return { id: demoProject.id, organizationId: demoProject.organizationId };
  try {
    return await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return null;
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; scenario: string } }) {
  const scenario = aiScenarioAliases[params.scenario];
  if (!scenario) return json({ error: "Unknown AI scenario" }, 404);

  const user = await getCurrentUser();
  if (!user) return json({ error: "Forbidden" }, 403);
  const project = await projectContext(params.projectId);
  if (!project) return json({ error: "Project not found" }, 404);
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);

  const body = (await request.json().catch(() => ({}))) as { textType?: string; topic?: string; instructions?: string; scenario?: AiScenario };
  const runInput = {
    projectId: params.projectId,
    scenario,
    textType: body.textType,
    topic: body.topic,
    instructions: body.instructions
  };
  const startedAt = Date.now();

  try {
    const insight = await runAiScenario(runInput);
    const run = await recordAiRunSafely({
      organizationId: project.organizationId,
      projectId: params.projectId,
      user,
      runInput,
      insight,
      status: aiRunStatusForInsight(insight),
      provider: insight.provider,
      durationMs: Date.now() - startedAt
    });
    return json({ ok: true, insight, journaled: Boolean(run), run: run ? serializeAiRun(run) : null });
  } catch (error) {
    const run = await recordAiRunSafely({
      organizationId: project.organizationId,
      projectId: params.projectId,
      user,
      runInput,
      status: "failed",
      provider: "none",
      durationMs: Date.now() - startedAt,
      error
    });
    return json({ ok: false, error: "AI_SCENARIO_FAILED", message: sanitizeAiRunError(error), journaled: Boolean(run) }, 502);
  }
}
