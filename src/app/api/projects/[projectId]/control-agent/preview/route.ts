import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { runAiScenario } from "@/lib/ai-command";
import { loadAiControlAgentPreview } from "@/lib/ai-control-agent-db";

const bodySchema = z.object({
  includeAi: z.boolean().default(false)
});

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = bodySchema.parse(await request.json().catch(() => ({})));
    const preview = await loadAiControlAgentPreview(params.projectId);
    if (!preview) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const aiNarrative = body.includeAi
      ? await runAiScenario({
          projectId: params.projectId,
          scenario: "summary",
          instructions: "Подготовь краткое управленческое пояснение к плану действий. Не предлагай автоматические изменения данных."
        })
      : null;
    return NextResponse.json({
      preview,
      aiNarrative: aiNarrative ? {
        provider: aiNarrative.provider,
        summary: aiNarrative.summary,
        findings: aiNarrative.findings.slice(0, 5),
        limitations: aiNarrative.dataLimitations
      } : null
    });
  } catch (error) {
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid preview request" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "AI Control Agent preview failed" }, { status: 500 });
  }
}
