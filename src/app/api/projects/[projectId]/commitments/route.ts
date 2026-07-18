import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { commitmentCreateSchema, commitmentSummary, normalizeCommitmentLine, serializeCommitment } from "@/lib/contract-commitments";
import { commitmentInclude, resolveCommitmentLineReferences } from "@/lib/contract-commitments-db";
import { prisma } from "@/lib/prisma";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const items = await prisma.projectCommitment.findMany({
      where: { projectId: params.projectId },
      include: commitmentInclude,
      orderBy: [{ status: "asc" }, { updatedAt: "desc" }]
    });
    return NextResponse.json({ items: items.map(serializeCommitment), summary: commitmentSummary(items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Commitments request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = commitmentCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const sourceRequest = data.sourceProcurementRequestId
      ? await prisma.procurementRequest.findFirst({ where: { id: data.sourceProcurementRequestId, projectId: params.projectId } })
      : null;
    if (data.sourceProcurementRequestId && !sourceRequest) return NextResponse.json({ error: "Procurement request not found" }, { status: 404 });
    const linkedDocument = data.linkedDocumentId
      ? await prisma.document.findFirst({ where: { id: data.linkedDocumentId, projectId: params.projectId }, include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } } })
      : null;
    if (data.linkedDocumentId && !linkedDocument) return NextResponse.json({ error: "Linked document not found" }, { status: 404 });

    const references = await resolveCommitmentLineReferences(params.projectId, data.lines);
    if (references.error) return NextResponse.json({ error: references.error }, { status: 409 });
    const lines = data.lines.map(normalizeCommitmentLine);
    const item = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectCommitment.findFirst({ where: { projectId: params.projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const sequence = (latest?.sequence ?? 0) + 1;
      const created = await tx.projectCommitment.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence,
          number: `COM-${String(sequence).padStart(3, "0")}`,
          type: data.type,
          title: data.title,
          counterparty: data.counterparty,
          externalNumber: data.externalNumber || null,
          retentionPercent: data.retentionPercent,
          paymentTerms: data.paymentTerms || null,
          startsAt: data.startsAt ? new Date(data.startsAt) : null,
          endsAt: data.endsAt ? new Date(data.endsAt) : null,
          sourceProcurementRequestId: sourceRequest?.id ?? null,
          linkedDocumentId: linkedDocument?.id ?? null,
          linkedDocumentVersion: linkedDocument?.version ?? null,
          linkedDocumentVersionId: linkedDocument?.versions[0]?.id ?? null,
          createdBy: user?.authenticated ? user.id : null,
          lines: {
            create: lines.map((line, index) => ({
              sequence: index + 1,
              budgetItemId: line.budgetItemId || null,
              costCodeId: line.costCodeId || references.budgetCostCodes.get(line.budgetItemId) || references.procurementCostCodes.get(line.sourceProcurementRequestItemId) || null,
              sourceProcurementRequestItemId: line.sourceProcurementRequestItemId || null,
              code: line.code || null,
              description: line.description,
              quantity: line.quantity,
              unit: line.unit,
              unitPrice: line.unitPrice,
              scheduledValue: line.scheduledValue
            }))
          }
        },
        include: commitmentInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "commitment",
        entityId: created.id,
        action: "create",
        summary: `Создано обязательство ${created.number}: ${created.title}`,
        after: serializeCommitment(created)
      });
      return created;
    });
    return NextResponse.json({ item: serializeCommitment(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Commitment sequence conflict; retry" }, { status: 409 });
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid commitment" }, { status: 400 });
    return NextResponse.json({ error: "Commitment create failed" }, { status: 500 });
  }
}
