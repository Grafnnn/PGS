import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { canProject } from "@/lib/auth/project-permissions";
import { demoState } from "@/lib/demo-data";
import { AiContextUnavailableError, aiScenarioAliases, runAiScenario, type AiScenario } from "@/lib/ai-command";
import { aiRunStatusForInsight, recordAiRunSafely, sanitizeAiRunError, serializeAiRun } from "@/lib/ai-run-journal";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

const AI_RATE_LIMIT = 30;
const AI_RATE_WINDOW_MS = 5 * 60_000;

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function projectContext(projectId: string) {
  if (!process.env.DATABASE_URL) {
    const demoProject = demoState.projects.find((project) => project.id === projectId);
    return demoProject ? { id: demoProject.id, organizationId: demoProject.organizationId } : null;
  }
  return prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; scenario: string } }) {
  const scenario = aiScenarioAliases[params.scenario];
  if (!scenario) return json({ error: "Unknown AI scenario" }, 404);

  const user = await getCurrentUser();
  if (!user) return json({ error: "Forbidden" }, 403);
  let project: Awaited<ReturnType<typeof projectContext>>;
  try {
    project = await projectContext(params.projectId);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "AI_CONTEXT_UNAVAILABLE", message: "Project data is temporarily unavailable" }, 503);
    throw error;
  }
  if (!project) return json({ error: "Project not found" }, 404);
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);

  const rateLimit = checkRateLimit({
    key: `ai:${user.id}:${params.projectId}`,
    limit: AI_RATE_LIMIT,
    windowMs: AI_RATE_WINDOW_MS
  });
  if (!rateLimit.allowed) {
    return new NextResponse(JSON.stringify({ error: "AI_RATE_LIMITED", message: "Слишком много AI-запросов. Повторите позже." }), {
      status: 429,
      headers: { "content-type": "application/json", "Retry-After": String(rateLimit.retryAfterSeconds) }
    });
  }

  const body = (await request.json().catch(() => ({}))) as { textType?: string; topic?: string; instructions?: string; scenario?: AiScenario };
  const runInput = {
    projectId: params.projectId,
    scenario,
    textType: typeof body.textType === "string" ? body.textType.trim().slice(0, 120) : undefined,
    topic: typeof body.topic === "string" ? body.topic.trim().slice(0, 240) : undefined,
    instructions: typeof body.instructions === "string" ? body.instructions.trim().slice(0, 1200) : undefined
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
    if (error instanceof AiContextUnavailableError) {
      return json({ ok: false, error: "AI_CONTEXT_UNAVAILABLE", message: error.message, journaled: Boolean(run) }, 503);
    }
    return json({ ok: false, error: "AI_SCENARIO_FAILED", message: sanitizeAiRunError(error), journaled: Boolean(run) }, 502);
  }
}
