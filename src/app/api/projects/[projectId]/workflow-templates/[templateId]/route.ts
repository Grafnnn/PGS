import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeWorkflowTemplate, workflowTemplateUpdateSchema } from "@/lib/project-workflows";

type Params = { projectId: string; templateId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = workflowTemplateUpdateSchema.parse(await request.json().catch(() => ({})));
    const current = await prisma.projectWorkflowTemplate.findFirst({
      where: { id: params.templateId, projectId: params.projectId },
      include: { steps: { orderBy: { sequence: "asc" } } }
    });
    if (!current) return NextResponse.json({ error: "Workflow template not found" }, { status: 404 });

    const template = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectWorkflowTemplate.update({
        where: { id: current.id },
        data: { status: data.status },
        include: { steps: { orderBy: { sequence: "asc" } } }
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "workflow_template",
        entityId: current.id,
        action: "update",
        summary: `${data.status === "active" ? "Активирован" : "Приостановлен"} шаблон процесса: ${current.name}`,
        before: serializeWorkflowTemplate(current),
        after: serializeWorkflowTemplate(updated)
      });
      return updated;
    });
    return NextResponse.json({ template: serializeWorkflowTemplate(template) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid workflow template update" }, { status: 400 });
    return NextResponse.json({ error: "Workflow template update failed" }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const current = await prisma.projectWorkflowTemplate.findFirst({
      where: { id: params.templateId, projectId: params.projectId },
      include: { steps: { orderBy: { sequence: "asc" } }, _count: { select: { runs: true } } }
    });
    if (!current) return NextResponse.json({ error: "Workflow template not found" }, { status: 404 });
    if (current._count.runs > 0) return NextResponse.json({ error: "Template with workflow history cannot be deleted; deactivate it instead" }, { status: 409 });

    await prisma.$transaction(async (tx) => {
      await tx.projectWorkflowTemplate.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "workflow_template",
        entityId: current.id,
        action: "delete",
        summary: `Удален неиспользованный шаблон процесса: ${current.name}`,
        before: serializeWorkflowTemplate(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Workflow template delete failed" }, { status: 500 });
  }
}
