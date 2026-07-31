import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  applyDailyProgressImpact,
  DailyProgressImpactError,
  findDailyProgressProjectId,
  loadDailyProgressImpact
} from "@/lib/daily-progress-impact-db";

const applySchema = z.object({ confirmed: z.literal(true) }).strict();

async function authorizedProject(reportId: string, action: "view" | "edit") {
  const user = await getCurrentUser();
  if (!user) return { user: null, projectId: null, status: 403 as const };
  const projectId = await findDailyProgressProjectId(reportId);
  if (!projectId) return { user, projectId: null, status: 404 as const };
  if (!(await canProject(user, projectId, action))) return { user, projectId, status: 403 as const };
  return { user, projectId, status: 200 as const };
}

export async function GET(_request: NextRequest, { params }: { params: { reportId: string } }) {
  try {
    const access = await authorizedProject(params.reportId, "view");
    if (access.status === 403) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (access.status === 404) return NextResponse.json({ error: "Daily report not found" }, { status: 404 });
    const loaded = await loadDailyProgressImpact(params.reportId);
    if (!loaded) return NextResponse.json({ error: "Daily report not found" }, { status: 404 });
    return NextResponse.json(loaded);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Daily progress preview failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { reportId: string } }) {
  try {
    const access = await authorizedProject(params.reportId, "edit");
    if (access.status === 403 || !access.user) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    if (access.status === 404) return NextResponse.json({ error: "Daily report not found" }, { status: 404 });
    applySchema.parse(await request.json().catch(() => ({})));
    const applied = await applyDailyProgressImpact(params.reportId, access.user);
    return NextResponse.json(applied, { status: applied.alreadyApplied ? 200 : 201 });
  } catch (error) {
    if (error instanceof DailyProgressImpactError) return NextResponse.json({ error: error.message }, { status: error.status });
    if (error instanceof z.ZodError) return NextResponse.json({ error: "Explicit confirmation is required" }, { status: 400 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Daily progress apply failed" }, { status: 500 });
  }
}
