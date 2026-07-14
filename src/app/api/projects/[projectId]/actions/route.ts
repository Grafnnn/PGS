import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { projectActionCreateSchema, projectActionSummary, serializeProjectAction } from "@/lib/project-actions";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const items = await prisma.projectActionItem.findMany({
      where: { projectId: params.projectId },
      orderBy: [{ status: "asc" }, { dueAt: "asc" }, { createdAt: "desc" }]
    });
    return NextResponse.json({ items: items.map(serializeProjectAction), summary: projectActionSummary(items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Project actions request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = projectActionCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.projectActionItem.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          createdBy: user?.authenticated ? user.id : null,
          title: data.title,
          description: data.description || null,
          sourceModule: data.sourceModule,
          targetTab: data.targetTab || null,
          priority: data.priority,
          assignee: data.assignee || null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          requiresApproval: data.requiresApproval
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_action",
        entityId: created.id,
        action: "create",
        summary: `Создано действие: ${created.title}`,
        after: serializeProjectAction(created)
      });
      return created;
    });

    return NextResponse.json({ item: serializeProjectAction(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid project action" }, { status: 400 });
    return NextResponse.json({ error: "Project action create failed" }, { status: 500 });
  }
}
