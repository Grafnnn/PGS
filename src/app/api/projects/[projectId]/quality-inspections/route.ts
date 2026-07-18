import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { qualityInspectionCreateSchema, qualityManagementSummary, serializeQualityInspection } from "@/lib/quality-management";
import { qualityInspectionInclude, resolveQualityReferences } from "@/lib/quality-management-db";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [items, issues] = await Promise.all([
      prisma.projectQualityInspection.findMany({
        where: { projectId: params.projectId },
        include: qualityInspectionInclude,
        orderBy: [{ status: "asc" }, { scheduledAt: "asc" }, { updatedAt: "desc" }]
      }),
      prisma.projectQualityIssue.findMany({
        where: { projectId: params.projectId },
        select: { status: true, severity: true, acceptanceBlocker: true, dueAt: true, costImpact: true, scheduleImpactDays: true }
      })
    ]);
    return NextResponse.json({ items: items.map(serializeQualityInspection), summary: qualityManagementSummary(items, issues) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Quality inspections request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = qualityInspectionCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const references = await resolveQualityReferences(params.projectId, data);
    if (references.error) return NextResponse.json({ error: references.error }, { status: 409 });

    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectQualityInspection.findFirst({
        where: { projectId: params.projectId },
        orderBy: { sequence: "desc" },
        select: { sequence: true }
      });
      const sequence = (latest?.sequence ?? 0) + 1;
      const created = await tx.projectQualityInspection.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence,
          number: `INS-${String(sequence).padStart(3, "0")}`,
          type: data.type,
          title: data.title,
          location: data.location || null,
          inspector: data.inspector || null,
          responsibleParty: data.responsibleParty || null,
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
          linkedScheduleItemId: references.scheduleItem?.id ?? null,
          costCodeId: references.costCode?.id ?? references.scheduleItem?.costCodeId ?? null,
          linkedDocumentId: references.document?.id ?? null,
          linkedDocumentVersion: references.document?.version ?? null,
          linkedDocumentVersionId: references.document?.versions[0]?.id ?? null,
          createdBy: user?.authenticated ? user.id : null,
          checks: {
            create: data.checks.map((check, index) => ({
              sequence: index + 1,
              title: check.title,
              requirement: check.requirement || null
            }))
          }
        },
        include: qualityInspectionInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "quality_inspection",
        entityId: created.id,
        action: "create",
        summary: `Создана инспекция ${created.number}: ${created.title}`,
        after: serializeQualityInspection(created)
      });
      return created;
    });
    return NextResponse.json({ item: serializeQualityInspection(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Inspection sequence conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid quality inspection" }, { status: 400 });
    return NextResponse.json({ error: "Quality inspection create failed" }, { status: 500 });
  }
}
