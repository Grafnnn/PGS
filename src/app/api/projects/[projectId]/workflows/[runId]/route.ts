import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { canActOnWorkflowStep, dueDateFrom, resolveWorkflowTransition, serializeWorkflowRun, workflowRunActionSchema } from "@/lib/project-workflows";

type Params = { projectId: string; runId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const data = workflowRunActionSchema.parse(await request.json().catch(() => ({})));
    if (["request_revision", "reject"].includes(data.action) && !data.comment) {
      return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });
    }

    const current = await prisma.projectWorkflowRun.findFirst({
      where: { id: params.runId, projectId: params.projectId },
      include: { steps: { orderBy: { sequence: "asc" } } }
    });
    if (!current) return NextResponse.json({ error: "Workflow run not found" }, { status: 404 });
    if (current.status !== "active") return NextResponse.json({ error: "Workflow run is not active" }, { status: 409 });
    const activeStep = current.steps.find((step) => step.sequence === current.currentStep && step.status === "active");
    if (!activeStep) return NextResponse.json({ error: "Active workflow step not found" }, { status: 409 });

    const isAdmin = role === "OWNER" || role === "ADMIN";
    if (data.action === "cancel" ? !isAdmin : !canActOnWorkflowStep(role, activeStep.assigneeRole)) {
      return NextResponse.json({ error: "Current workflow step belongs to another role" }, { status: 403 });
    }

    const transition = resolveWorkflowTransition({
      runStatus: current.status,
      currentSequence: current.currentStep,
      totalSteps: current.steps.length,
      action: data.action
    });
    const now = new Date();

    const run = await prisma.$transaction(async (tx) => {
      const claim = await tx.projectWorkflowRun.updateMany({
        where: {
          id: current.id,
          status: "active",
          currentStep: current.currentStep,
          updatedAt: current.updatedAt
        },
        data: { updatedAt: now }
      });
      if (claim.count !== 1) throw new Error("Workflow action was already handled");

      const activeStatus = data.action === "approve" ? "approved" : data.action === "request_revision" ? "revision_required" : data.action === "reject" ? "rejected" : "cancelled";
      await tx.projectWorkflowRunStep.update({
        where: { id: activeStep.id },
        data: {
          status: activeStatus,
          decisionComment: data.comment || null,
          actedBy: user?.authenticated ? user.id : null,
          actedByName: user?.name ?? "local-user",
          actedAt: now
        }
      });

      if (transition.activateStep) {
        const target = current.steps.find((step) => step.sequence === transition.activateStep);
        if (!target) throw new Error("Workflow target step not found");
        await tx.projectWorkflowRunStep.update({
          where: { id: target.id },
          data: {
            status: "active",
            dueAt: dueDateFrom(now, target.dueDays),
            decisionComment: data.action === "request_revision" ? data.comment : null,
            actedBy: null,
            actedByName: null,
            actedAt: null
          }
        });
      }

      if (transition.terminal) {
        await tx.projectWorkflowRunStep.updateMany({
          where: { runId: current.id, status: "pending" },
          data: { status: "cancelled" }
        });
      }

      const updated = await tx.projectWorkflowRun.update({
        where: { id: current.id },
        data: {
          status: transition.runStatus,
          currentStep: transition.currentStep,
          completedAt: transition.terminal ? now : null
        },
        include: { steps: { orderBy: { sequence: "asc" } } }
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "workflow_run",
        entityId: current.id,
        action: "update",
        summary: `Процесс ${current.title}: ${data.action}`,
        before: serializeWorkflowRun(current),
        after: serializeWorkflowRun(updated)
      });
      return updated;
    });

    return NextResponse.json({ run: serializeWorkflowRun(run) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid workflow action" }, { status: 400 });
    if (error instanceof Error && /Workflow/.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    return NextResponse.json({ error: "Workflow action failed" }, { status: 500 });
  }
}
