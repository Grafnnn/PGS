import { NextResponse } from "next/server";
import { canProject, type ProjectAction } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";

export async function requireProjectAccess(projectId: string, action: ProjectAction) {
  const user = await getCurrentUser();
  if (!user) return { response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };

  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
  if (!project) return { response: NextResponse.json({ error: "Project not found" }, { status: 404 }) };

  if (!(await canProject(user, projectId, action))) {
    return { response: NextResponse.json({ error: "Forbidden" }, { status: 403 }) };
  }

  return { user, project };
}
