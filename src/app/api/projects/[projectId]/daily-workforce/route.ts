import { NextResponse } from "next/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);

  const dateParam = new URL(request.url).searchParams.get("date")?.trim();
  const reportDate = dateParam ? new Date(`${dateParam}T00:00:00.000Z`) : null;
  if (dateParam && (
    !/^\d{4}-\d{2}-\d{2}$/.test(dateParam)
    || Number.isNaN(reportDate?.getTime())
    || reportDate?.toISOString().slice(0, 10) !== dateParam
  )) {
    return json({ error: "Invalid report date" }, 400);
  }

  const project = await prisma.project.findUnique({
    where: { id: params.projectId },
    select: { id: true }
  });
  if (!project) return json({ error: "Project not found" }, 404);

  const assignments = await prisma.projectResourceAssignment.findMany({
    where: {
      projectId: params.projectId,
      status: { not: "completed" },
      ...(reportDate ? { startsAt: { lte: reportDate }, endsAt: { gte: reportDate } } : {}),
      resource: { status: { not: "archived" }, kind: { in: ["worker", "engineer", "crew"] } }
    },
    include: {
      resource: {
        select: { name: true, profession: true, kind: true, headcount: true }
      }
    },
    orderBy: [{ resource: { kind: "asc" } }, { resource: { name: "asc" } }]
  });

  return json({
    items: assignments.map((item) => ({
      resourceId: item.resourceId,
      name: item.resource.name,
      profession: item.resource.profession ?? "",
      kind: item.resource.kind,
      headcount: item.resource.headcount
    }))
  });
}
