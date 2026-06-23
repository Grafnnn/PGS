import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { getCurrentUser } from "@/lib/auth/session";
import { canProject } from "@/lib/auth/project-permissions";
import { demoState } from "@/lib/demo-data";
import { aiScenarioAliases, runAiScenario, type AiScenario } from "@/lib/ai-command";
import { prisma } from "@/lib/prisma";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function sanitizeError(error: unknown) {
  return error instanceof Error
    ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "[REDACTED_DATABASE_URL]").replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]").slice(0, 180)
    : "AI scenario failed";
}

async function projectExists(projectId: string) {
  if (demoState.projects.some((project) => project.id === projectId)) return true;
  try {
    return Boolean(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return false;
    throw error;
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string; scenario: string } }) {
  const scenario = aiScenarioAliases[params.scenario];
  if (!scenario) return json({ error: "Unknown AI scenario" }, 404);

  const user = await getCurrentUser();
  if (!user) return json({ error: "Forbidden" }, 403);
  if (!(await projectExists(params.projectId))) return json({ error: "Project not found" }, 404);
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);

  const body = (await request.json().catch(() => ({}))) as { textType?: string; topic?: string; instructions?: string; scenario?: AiScenario };

  try {
    const insight = await runAiScenario({
      projectId: params.projectId,
      scenario,
      textType: body.textType,
      topic: body.topic,
      instructions: body.instructions
    });
    return json({ ok: true, insight });
  } catch (error) {
    return json({ ok: false, error: "AI_SCENARIO_FAILED", message: sanitizeError(error) }, 502);
  }
}
