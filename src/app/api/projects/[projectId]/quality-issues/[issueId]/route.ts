import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { qualityIssueActionSchema, qualityIssueUpdateSchema, resolveQualityIssueTransition, serializeQualityIssue } from "@/lib/quality-management";
import { qualityIssueInclude, resolveQualityReferences } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";
import { dueDateFrom } from "@/lib/project-workflows";

type Params = { projectId: string; issueId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await prisma.projectQualityIssue.findFirst({
      where: { id: params.issueId, projectId: params.projectId },
      include: qualityIssueInclude
    });
    if (!current) return NextResponse.json({ error: "Quality issue not found" }, { status: 404 });
    if ("action" in raw) return applyAction(raw, current, role, user);
    if (!["open", "in_progress"].includes(current.status)) return NextResponse.json({ error: "Only open or in-progress issues can be edited" }, { status: 409 });

    const data = qualityIssueUpdateSchema.parse(raw);
    const references = await resolveQualityReferences(params.projectId, {
      linkedScheduleItemId: data.linkedScheduleItemId ?? current.linkedScheduleItemId ?? "",
      costCodeId: data.costCodeId ?? current.costCodeId ?? "",
      sourceDailyReportId: data.sourceDailyReportId ?? current.sourceDailyReportId ?? "",
      linkedDocumentId: data.linkedDocumentId ?? current.linkedDocumentId ?? ""
    });
    if (references.error) return NextResponse.json({ error: references.error }, { status: 409 });
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectQualityIssue.update({
        where: { id: current.id },
        data: {
          type: data.type,
          title: data.title,
          description: data.description,
          location: data.location === undefined ? undefined : data.location || null,
          severity: data.severity,
          responsibleParty: data.responsibleParty === undefined ? undefined : data.responsibleParty || null,
          dueAt: data.dueAt === undefined ? undefined : data.dueAt ? new Date(data.dueAt) : null,
          rootCause: data.rootCause === undefined ? undefined : data.rootCause || null,
          correctiveAction: data.correctiveAction === undefined ? undefined : data.correctiveAction || null,
          acceptanceBlocker: data.acceptanceBlocker,
          costImpact: data.costImpact,
          scheduleImpactDays: data.scheduleImpactDays,
          linkedScheduleItemId: data.linkedScheduleItemId === undefined ? undefined : references.scheduleItem?.id ?? null,
          costCodeId: data.costCodeId === undefined && data.linkedScheduleItemId === undefined
            ? undefined
            : references.costCode?.id ?? references.scheduleItem?.costCodeId ?? null,
          sourceDailyReportId: data.sourceDailyReportId === undefined ? undefined : references.dailyReport?.id ?? null,
          linkedDocumentId: data.linkedDocumentId === undefined ? undefined : references.document?.id ?? null,
          linkedDocumentVersion: data.linkedDocumentId === undefined ? undefined : references.document?.version ?? null,
          linkedDocumentVersionId: data.linkedDocumentId === undefined ? undefined : references.document?.versions[0]?.id ?? null,
          events: {
            create: {
              eventType: "update",
              statusBefore: current.status,
              statusAfter: current.status,
              createdBy: user?.authenticated ? user.id : null,
              createdByName: user?.name ?? "local-user"
            }
          }
        },
        include: qualityIssueInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_issue",
        entityId: current.id,
        action: "update",
        summary: `Обновлено замечание ${current.number}: ${item.title}`,
        before: serializeQualityIssue(current),
        after: serializeQualityIssue(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeQualityIssue(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality issue update" }, { status: 400 });
    return NextResponse.json({ error: "Quality issue update failed" }, { status: 500 });
  }
}

async function applyAction(raw: Record<string, unknown>, current: any, role: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  try {
    const data = qualityIssueActionSchema.parse(raw);
    const isAdmin = role === "OWNER" || role === "ADMIN";
    if (["verify", "close", "reopen", "void"].includes(data.action) && !isAdmin) return NextResponse.json({ error: "Owner or administrator decision is required" }, { status: 403 });
    if (["verify", "close", "reopen", "void"].includes(data.action) && !data.comment) return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });
    const correctiveAction = data.correctiveAction || current.correctiveAction || "";
    const rootCause = data.rootCause || current.rootCause || "";
    if (data.action === "submit_verification" && !correctiveAction) return NextResponse.json({ error: "Corrective action is required" }, { status: 409 });
    if (data.action === "submit_verification" && ["ncr", "defect"].includes(current.type) && !rootCause) return NextResponse.json({ error: "Root cause is required for NCR or defect" }, { status: 409 });
    if (data.action === "submit_verification" && !current.evidence.some((item: any) => item.phase === "closure" || item.phase === "corrective")) {
      return NextResponse.json({ error: "Corrective or closure evidence is required" }, { status: 409 });
    }
    if (data.action === "submit_verification" && current.verificationWorkflowRunId) return NextResponse.json({ error: "Verification workflow is already linked" }, { status: 409 });
    if (data.action === "verify" && current.verificationWorkflowRun && current.verificationWorkflowRun.status !== "approved") {
      return NextResponse.json({ error: "Linked verification workflow is not approved" }, { status: 409 });
    }
    const nextStatus = resolveQualityIssueTransition(current.status, data.action);
    const template = data.action === "submit_verification" && data.workflowTemplateId
      ? await prisma.projectWorkflowTemplate.findFirst({
          where: { id: data.workflowTemplateId, projectId: current.projectId, status: "active" },
          include: { steps: { orderBy: { sequence: "asc" } } }
        })
      : null;
    if (data.action === "submit_verification" && data.workflowTemplateId && !template) {
      return NextResponse.json({ error: "Active workflow template not found" }, { status: 404 });
    }
    if (template && !template.steps.length) return NextResponse.json({ error: "Workflow template has no steps" }, { status: 409 });
    const now = new Date();

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.projectQualityIssue.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: { updatedAt: now }
      });
      if (claim.count !== 1) throw new Error("Quality issue action was already handled");
      let workflowRunId: string | null | undefined;
      if (template) {
        const run = await tx.projectWorkflowRun.create({
          data: {
            organizationId: current.organizationId,
            projectId: current.projectId,
            templateId: template.id,
            title: `${current.number}: проверка устранения`,
            description: correctiveAction,
            sourceModule: "quality",
            targetTab: "Исполнение",
            referenceType: "quality_issue",
            referenceId: current.id,
            startedBy: user?.authenticated ? user.id : null,
            steps: {
              create: template.steps.map((step: any, index: number) => ({
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
          }
        });
        workflowRunId = run.id;
      }
      const item = await tx.projectQualityIssue.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          rootCause: data.rootCause || undefined,
          correctiveAction: data.correctiveAction || undefined,
          decisionComment: data.comment || undefined,
          verificationWorkflowRunId: data.action === "reopen" ? null : workflowRunId,
          startedAt: data.action === "start" || data.action === "reopen" ? now : undefined,
          submittedAt: data.action === "submit_verification" ? now : data.action === "reopen" ? null : undefined,
          verifiedAt: data.action === "verify" ? now : data.action === "reopen" ? null : undefined,
          closedAt: data.action === "close" ? now : data.action === "reopen" ? null : undefined,
          voidedAt: data.action === "void" ? now : undefined,
          events: {
            create: {
              eventType: data.action,
              statusBefore: current.status,
              statusAfter: nextStatus,
              comment: data.comment || null,
              createdBy: user?.authenticated ? user.id : null,
              createdByName: user?.name ?? "local-user"
            }
          }
        },
        include: qualityIssueInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_issue",
        entityId: current.id,
        action: data.action === "verify" ? "accept" : "update",
        summary: `${current.number}: ${data.action}${data.comment ? ` — ${data.comment}` : ""}`,
        before: serializeQualityIssue(current),
        after: serializeQualityIssue(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeQualityIssue(updated) });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality issue action" }, { status: 400 });
    if (error instanceof Error && /Quality issue action|Action /.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectQualityIssue.findFirst({
      where: { id: params.issueId, projectId: params.projectId },
      include: qualityIssueInclude
    });
    if (!current) return NextResponse.json({ error: "Quality issue not found" }, { status: 404 });
    if (current.status !== "open" || current.inspectionCheckId || current.evidence.length || current.verificationWorkflowRunId) {
      return NextResponse.json({ error: "Only an unused manually-created open issue can be deleted" }, { status: 409 });
    }
    await prisma.$transaction(async (tx) => {
      await tx.projectQualityIssue.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_issue",
        entityId: current.id,
        action: "delete",
        summary: `Удалено замечание ${current.number}: ${current.title}`,
        before: serializeQualityIssue(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Quality issue delete failed" }, { status: 500 });
  }
}
