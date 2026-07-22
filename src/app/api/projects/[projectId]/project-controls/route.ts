import { Prisma } from "@prisma/client";
import { apiError, apiOk, getRequestId } from "@/lib/api/errors";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  projectControlBaselineInclude,
  projectControlPeriodInclude,
  serializeProjectControlBaseline,
  serializeProjectControlPeriod
} from "@/lib/project-controls-db";

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const requestId = getRequestId(request);
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return apiError(requestId, "FORBIDDEN", "Forbidden", 403);
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return apiError(requestId, "NOT_FOUND", "Project not found", 404);
    const [baselines, periods] = await Promise.all([
      prisma.projectControlBaseline.findMany({
        where: { projectId: params.projectId },
        include: projectControlBaselineInclude,
        orderBy: { sequence: "desc" }
      }),
      prisma.projectControlPeriod.findMany({
        where: { projectId: params.projectId },
        include: projectControlPeriodInclude,
        orderBy: { sequence: "desc" },
        take: 24
      })
    ]);
    return apiOk(requestId, {
      activeBaselineId: baselines.find((item) => item.status === "active")?.id ?? null,
      latestPeriodId: periods.find((item) => item.status !== "void")?.id ?? null,
      baselines: baselines.map(serializeProjectControlBaseline),
      periods: periods.map(serializeProjectControlPeriod)
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return apiError(requestId, "DB_UNAVAILABLE", "Database is not available", 503);
    return apiError(requestId, "PROJECT_CONTROLS_FAILED", "Project controls request failed", 500);
  }
}
