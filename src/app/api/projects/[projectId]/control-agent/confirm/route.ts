import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { AiControlAgentError, commitAiControlAgentActions } from "@/lib/ai-control-agent-db";

const confirmSchema = z.object({
  previewId: z.string().length(64),
  generatedAt: z.string().datetime(),
  selectedProposalIds: z.array(z.string().min(1).max(80)).min(1).max(12),
  confirmed: z.literal(true)
});

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user || !(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const body = confirmSchema.parse(await request.json().catch(() => ({})));
    return NextResponse.json(await commitAiControlAgentActions({
      projectId: params.projectId,
      previewId: body.previewId,
      generatedAt: body.generatedAt,
      selectedProposalIds: body.selectedProposalIds,
      user
    }), { status: 201 });
  } catch (error) {
    if (error instanceof AiControlAgentError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Invalid confirmation request" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "AI Control Agent confirmation failed" }, { status: 500 });
  }
}
