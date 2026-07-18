import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  qualityInspectionActionSchema,
  qualityInspectionUpdateSchema,
  resolveInspectionTransition,
  serializeQualityInspection
} from "@/lib/quality-management";
import { qualityInspectionInclude, resolveQualityReferences } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";

type Params = { projectId: string; inspectionId: string };

export async function PATCH(request: NextRequest, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (!role || role === "VIEWER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const raw = await request.json().catch(() => ({})) as Record<string, unknown>;
    const current = await prisma.projectQualityInspection.findFirst({
      where: { id: params.inspectionId, projectId: params.projectId },
      include: qualityInspectionInclude
    });
    if (!current) return NextResponse.json({ error: "Quality inspection not found" }, { status: 404 });
    if ("action" in raw) return applyAction(raw, current, role, user);
    if (current.status !== "planned") return NextResponse.json({ error: "Only a planned inspection can be edited" }, { status: 409 });

    const data = qualityInspectionUpdateSchema.parse(raw);
    const references = await resolveQualityReferences(params.projectId, {
      linkedScheduleItemId: data.linkedScheduleItemId ?? current.linkedScheduleItemId ?? "",
      costCodeId: data.costCodeId ?? current.costCodeId ?? "",
      linkedDocumentId: data.linkedDocumentId ?? current.linkedDocumentId ?? ""
    });
    if (references.error) return NextResponse.json({ error: references.error }, { status: 409 });
    const item = await prisma.$transaction(async (tx) => {
      const updated = await tx.projectQualityInspection.update({
        where: { id: current.id },
        data: {
          type: data.type,
          title: data.title,
          location: data.location === undefined ? undefined : data.location || null,
          inspector: data.inspector === undefined ? undefined : data.inspector || null,
          responsibleParty: data.responsibleParty === undefined ? undefined : data.responsibleParty || null,
          scheduledAt: data.scheduledAt === undefined ? undefined : data.scheduledAt ? new Date(data.scheduledAt) : null,
          linkedScheduleItemId: data.linkedScheduleItemId === undefined ? undefined : references.scheduleItem?.id ?? null,
          costCodeId: data.costCodeId === undefined && data.linkedScheduleItemId === undefined
            ? undefined
            : references.costCode?.id ?? references.scheduleItem?.costCodeId ?? null,
          linkedDocumentId: data.linkedDocumentId === undefined ? undefined : references.document?.id ?? null,
          linkedDocumentVersion: data.linkedDocumentId === undefined ? undefined : references.document?.version ?? null,
          linkedDocumentVersionId: data.linkedDocumentId === undefined ? undefined : references.document?.versions[0]?.id ?? null,
          checks: data.checks ? {
            deleteMany: {},
            create: data.checks.map((check, index) => ({ sequence: index + 1, title: check.title, requirement: check.requirement || null }))
          } : undefined
        },
        include: qualityInspectionInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_inspection",
        entityId: current.id,
        action: "update",
        summary: `Обновлена инспекция ${current.number}: ${updated.title}`,
        before: serializeQualityInspection(current),
        after: serializeQualityInspection(updated)
      });
      return updated;
    });
    return NextResponse.json({ item: serializeQualityInspection(item) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality inspection update" }, { status: 400 });
    return NextResponse.json({ error: "Quality inspection update failed" }, { status: 500 });
  }
}

async function applyAction(raw: Record<string, unknown>, current: any, role: string, user: Awaited<ReturnType<typeof getCurrentUser>>) {
  try {
    const data = qualityInspectionActionSchema.parse(raw);
    const isAdmin = role === "OWNER" || role === "ADMIN";
    if (["close", "void"].includes(data.action) && !isAdmin) return NextResponse.json({ error: "Owner or administrator decision is required" }, { status: 403 });
    if (data.action === "void" && !data.comment) return NextResponse.json({ error: "Decision comment is required" }, { status: 400 });
    if (data.action === "close" && current.issues.some((issue: any) => !["closed", "void"].includes(issue.status))) {
      return NextResponse.json({ error: "Resolve linked quality issues before closing the inspection" }, { status: 409 });
    }

    let completedChecks = current.checks;
    if (data.action === "complete") {
      if (data.checks.length !== current.checks.length) return NextResponse.json({ error: "Every inspection check requires a result" }, { status: 400 });
      const incoming = new Map(data.checks.map((check) => [check.id, check]));
      if (incoming.size !== current.checks.length || current.checks.some((check: any) => !incoming.has(check.id))) {
        return NextResponse.json({ error: "Inspection checks do not match" }, { status: 409 });
      }
      completedChecks = current.checks.map((check: any) => ({ ...check, ...incoming.get(check.id) }));
      if (completedChecks.some((check: any) => check.result === "pending")) return NextResponse.json({ error: "Pending checks must be resolved" }, { status: 409 });
    }
    const failedChecks = completedChecks.filter((check: any) => check.result === "fail");
    const nextStatus = resolveInspectionTransition(current.status, data.action, failedChecks.length);
    const now = new Date();
    const dueAt = new Date(now);
    dueAt.setUTCDate(dueAt.getUTCDate() + 7);

    const updated = await prisma.$transaction(async (tx) => {
      const claim = await tx.projectQualityInspection.updateMany({
        where: { id: current.id, status: current.status, updatedAt: current.updatedAt },
        data: { updatedAt: now }
      });
      if (claim.count !== 1) throw new Error("Inspection action was already handled");
      if (data.action === "complete") {
        await Promise.all(completedChecks.map((check: any) => tx.projectQualityInspectionCheck.update({
          where: { id: check.id },
          data: { result: check.result, comment: check.comment || null }
        })));
        const latestIssue = await tx.projectQualityIssue.findFirst({
          where: { projectId: current.projectId },
          orderBy: { sequence: "desc" },
          select: { sequence: true }
        });
        let issueSequence = latestIssue?.sequence ?? 0;
        for (const check of failedChecks) {
          issueSequence += 1;
          const issue = await tx.projectQualityIssue.create({
            data: {
              organizationId: current.organizationId,
              projectId: current.projectId,
              inspectionId: current.id,
              inspectionCheckId: check.id,
              sequence: issueSequence,
              number: `NCR-${String(issueSequence).padStart(3, "0")}`,
              type: "ncr",
              title: `Не пройдено: ${check.title}`,
              description: check.comment || check.requirement || `Пункт инспекции ${current.number} не пройден.`,
              location: current.location,
              severity: "high",
              responsibleParty: current.responsibleParty,
              dueAt,
              acceptanceBlocker: true,
              linkedScheduleItemId: current.linkedScheduleItemId,
              costCodeId: current.costCodeId,
              linkedDocumentId: current.linkedDocumentId,
              linkedDocumentVersion: current.linkedDocumentVersion,
              linkedDocumentVersionId: current.linkedDocumentVersionId,
              createdBy: user?.authenticated ? user.id : null,
              events: {
                create: {
                  eventType: "create_from_failed_inspection",
                  statusAfter: "open",
                  comment: `${current.number} · пункт ${check.sequence}`,
                  createdBy: user?.authenticated ? user.id : null,
                  createdByName: user?.name ?? "local-user"
                }
              }
            }
          });
          await writeAudit(tx, {
            organizationId: current.organizationId,
            projectId: current.projectId,
            actorId: user?.authenticated ? user.id : null,
            actorName: user?.name ?? "local-user",
            actorEmail: user?.email ?? null,
            entity: "quality_issue",
            entityId: issue.id,
            action: "create",
            summary: `${issue.number} создано из непройденного пункта ${current.number}`
          });
        }
      }
      const item = await tx.projectQualityInspection.update({
        where: { id: current.id },
        data: {
          status: nextStatus,
          decisionComment: data.comment || undefined,
          startedAt: data.action === "start" ? now : undefined,
          completedAt: data.action === "complete" ? now : undefined,
          closedAt: data.action === "close" ? now : undefined,
          voidedAt: data.action === "void" ? now : undefined
        },
        include: qualityInspectionInclude
      });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_inspection",
        entityId: current.id,
        action: "update",
        summary: `${current.number}: ${data.action}${failedChecks.length ? ` · NCR ${failedChecks.length}` : ""}${data.comment ? ` — ${data.comment}` : ""}`,
        before: serializeQualityInspection(current),
        after: serializeQualityInspection(item)
      });
      return item;
    });
    return NextResponse.json({ item: serializeQualityInspection(updated), createdIssues: failedChecks.length });
  } catch (error) {
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality inspection action" }, { status: 400 });
    if (error instanceof Error && /Inspection action|Action /.test(error.message)) return NextResponse.json({ error: error.message }, { status: 409 });
    throw error;
  }
}

export async function DELETE(_request: Request, { params }: { params: Params }) {
  const user = await getCurrentUser();
  const role = await getEffectiveProjectRole(user, params.projectId);
  if (role !== "OWNER" && role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const current = await prisma.projectQualityInspection.findFirst({
      where: { id: params.inspectionId, projectId: params.projectId },
      include: qualityInspectionInclude
    });
    if (!current) return NextResponse.json({ error: "Quality inspection not found" }, { status: 404 });
    if (current.status !== "planned" || current.issues.length) return NextResponse.json({ error: "Only an unused planned inspection can be deleted" }, { status: 409 });
    await prisma.$transaction(async (tx) => {
      await tx.projectQualityInspection.delete({ where: { id: current.id } });
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_inspection",
        entityId: current.id,
        action: "delete",
        summary: `Удалена плановая инспекция ${current.number}: ${current.title}`,
        before: serializeQualityInspection(current)
      });
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Quality inspection delete failed" }, { status: 500 });
  }
}
