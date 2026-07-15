import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeWorkflowTemplate, workflowTemplateCreateSchema } from "@/lib/project-workflows";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const templates = await prisma.projectWorkflowTemplate.findMany({
      where: { projectId: params.projectId },
      include: { steps: { orderBy: { sequence: "asc" } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    return NextResponse.json({ templates: templates.map(serializeWorkflowTemplate) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Workflow templates request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = workflowTemplateCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const template = await prisma.$transaction(async (tx) => {
      const created = await tx.projectWorkflowTemplate.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          name: data.name,
          description: data.description || null,
          category: data.category,
          createdBy: user?.authenticated ? user.id : null,
          steps: {
            create: data.steps.map((step, index) => ({
              sequence: index + 1,
              name: step.name,
              description: step.description || null,
              stepType: step.stepType,
              assigneeRole: step.assigneeRole,
              dueDays: step.dueDays
            }))
          }
        },
        include: { steps: { orderBy: { sequence: "asc" } } }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "workflow_template",
        entityId: created.id,
        action: "create",
        summary: `Создан шаблон процесса: ${created.name}`,
        after: serializeWorkflowTemplate(created)
      });
      return created;
    });

    return NextResponse.json({ template: serializeWorkflowTemplate(template) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Workflow template name already exists" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid workflow template" }, { status: 400 });
    return NextResponse.json({ error: "Workflow template create failed" }, { status: 500 });
  }
}
