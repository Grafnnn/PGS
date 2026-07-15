import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { dueDateFrom, serializeWorkflowRun, workflowRunCreateSchema, workflowSummary } from "@/lib/project-workflows";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const runs = await prisma.projectWorkflowRun.findMany({
      where: { projectId: params.projectId },
      include: { steps: { orderBy: { sequence: "asc" } } },
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    return NextResponse.json({ runs: runs.map(serializeWorkflowRun), summary: workflowSummary(runs) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Workflow runs request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = workflowRunCreateSchema.parse(await request.json().catch(() => ({})));
    const template = await prisma.projectWorkflowTemplate.findFirst({
      where: { id: data.templateId, projectId: params.projectId, status: "active" },
      include: { project: { select: { organizationId: true } }, steps: { orderBy: { sequence: "asc" } } }
    });
    if (!template) return NextResponse.json({ error: "Active workflow template not found" }, { status: 404 });
    if (!template.steps.length) return NextResponse.json({ error: "Workflow template has no steps" }, { status: 409 });
    const now = new Date();

    const run = await prisma.$transaction(async (tx) => {
      const created = await tx.projectWorkflowRun.create({
        data: {
          organizationId: template.project.organizationId,
          projectId: params.projectId,
          templateId: template.id,
          title: data.title,
          description: data.description || null,
          sourceModule: data.sourceModule,
          targetTab: data.targetTab || null,
          referenceType: data.referenceType || null,
          referenceId: data.referenceId || null,
          startedBy: user?.authenticated ? user.id : null,
          steps: {
            create: template.steps.map((step, index) => ({
              templateStepId: step.id,
              sequence: step.sequence,
              name: step.name,
              description: step.description,
              stepType: step.stepType,
              assigneeRole: step.assigneeRole,
              dueDays: step.dueDays,
              status: index === 0 ? "active" : "pending",
              dueAt: index === 0 ? dueDateFrom(now, step.dueDays) : null
            }))
          }
        },
        include: { steps: { orderBy: { sequence: "asc" } } }
      });
      await writeAudit(tx, {
        organizationId: template.project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "workflow_run",
        entityId: created.id,
        action: "create",
        summary: `Запущен процесс: ${created.title}`,
        after: serializeWorkflowRun(created)
      });
      return created;
    });

    return NextResponse.json({ run: serializeWorkflowRun(run) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid workflow run" }, { status: 400 });
    return NextResponse.json({ error: "Workflow run create failed" }, { status: 500 });
  }
}
