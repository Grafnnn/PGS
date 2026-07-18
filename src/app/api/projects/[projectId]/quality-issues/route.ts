import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { qualityIssueCreateSchema, qualityIssuePrefix, qualityManagementSummary, serializeQualityIssue } from "@/lib/quality-management";
import { qualityIssueInclude, resolveQualityReferences } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [items, inspections] = await Promise.all([
      prisma.projectQualityIssue.findMany({
        where: { projectId: params.projectId },
        include: qualityIssueInclude,
        orderBy: [{ status: "asc" }, { dueAt: "asc" }, { updatedAt: "desc" }]
      }),
      prisma.projectQualityInspection.findMany({
        where: { projectId: params.projectId },
        select: { status: true, scheduledAt: true }
      })
    ]);
    return NextResponse.json({ items: items.map(serializeQualityIssue), summary: qualityManagementSummary(inspections, items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Quality issues request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = qualityIssueCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const references = await resolveQualityReferences(params.projectId, data);
    if (references.error) return NextResponse.json({ error: references.error }, { status: 409 });

    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectQualityIssue.findFirst({
        where: { projectId: params.projectId },
        orderBy: { sequence: "desc" },
        select: { sequence: true }
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const created = await tx.projectQualityIssue.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence,
          number: `${qualityIssuePrefix(data.type)}-${String(sequence).padStart(3, "0")}`,
          type: data.type,
          title: data.title,
          description: data.description,
          location: data.location || null,
          severity: data.severity,
          responsibleParty: data.responsibleParty || null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          rootCause: data.rootCause || null,
          correctiveAction: data.correctiveAction || null,
          acceptanceBlocker: data.acceptanceBlocker,
          costImpact: data.costImpact,
          scheduleImpactDays: data.scheduleImpactDays,
          linkedScheduleItemId: references.scheduleItem?.id ?? null,
          costCodeId: references.costCode?.id ?? references.scheduleItem?.costCodeId ?? null,
          sourceDailyReportId: references.dailyReport?.id ?? null,
          linkedDocumentId: references.document?.id ?? null,
          linkedDocumentVersion: references.document?.version ?? null,
          linkedDocumentVersionId: references.document?.versions[0]?.id ?? null,
          createdBy: user?.authenticated ? user.id : null,
          events: {
            create: {
              eventType: "create",
              statusAfter: "open",
              createdBy: user?.authenticated ? user.id : null,
              createdByName: user?.name ?? "local-user"
            }
          }
        },
        include: qualityIssueInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_issue",
        entityId: created.id,
        action: "create",
        summary: `Создано замечание ${created.number}: ${created.title}`,
        after: serializeQualityIssue(created)
      });
      return created;
    });
    return NextResponse.json({ item: serializeQualityIssue(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Quality issue sequence conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality issue" }, { status: 400 });
    return NextResponse.json({ error: "Quality issue create failed" }, { status: 500 });
  }
}
