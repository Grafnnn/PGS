import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { serializeAiRun } from "@/lib/ai-run-journal";
import { prisma } from "@/lib/prisma";

function requestedLimit(request: NextRequest) {
  const parsed = Number(request.nextUrl.searchParams.get("limit") ?? 20);
  return Number.isFinite(parsed) ? Math.min(50, Math.max(1, Math.round(parsed))) : 20;
}

export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const items = await prisma.aiRun.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: "desc" },
      take: requestedLimit(request),
      include: {
        actionLinks: {
          select: { actionIndex: true, actionItemId: true }
        }
      }
    });
    return NextResponse.json({
      items: items.map(serializeAiRun),
      summary: {
        total: items.length,
        succeeded: items.filter((item) => item.status === "succeeded").length,
        degraded: items.filter((item) => item.status === "degraded").length,
        failed: items.filter((item) => item.status === "failed").length,
        needsReview: items.filter((item) => item.feedback === "needs_review").length
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "AI run history request failed" }, { status: 500 });
  }
}
