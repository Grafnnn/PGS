import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { fieldSyncRequestSchema, type FieldSyncRequest } from "@/lib/field-sync";
import { prisma } from "@/lib/prisma";
import { serializeProjectAction } from "@/lib/project-actions";
import { serializeDailyReport } from "@/lib/serializers";

export async function GET(_request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const [capture, upload] = await Promise.all([
    canProject(user, params.projectId, "edit"),
    canProject(user, params.projectId, "upload_document")
  ]);
  return NextResponse.json({ capabilities: { capture, upload } });
}

async function existingResult(projectId: string, clientMutationId: string, expectedKind: FieldSyncRequest["kind"]) {
  const receipt = await prisma.fieldSyncReceipt.findUnique({
    where: { projectId_clientMutationId: { projectId, clientMutationId } }
  });
  if (!receipt) return null;
  if (receipt.kind !== expectedKind) {
    return NextResponse.json({ error: "Mutation identifier is already used by another operation" }, { status: 409 });
  }

  if (receipt.kind === "daily_report") {
    const item = await prisma.dailyReport.findUnique({ where: { id: receipt.entityId } });
    if (!item) return NextResponse.json({ error: "Synced report is no longer available" }, { status: 409 });
    return NextResponse.json({ item: serializeDailyReport(item), duplicate: true, clientMutationId });
  }

  const item = await prisma.projectActionItem.findUnique({ where: { id: receipt.entityId } });
  if (!item) return NextResponse.json({ error: "Synced issue is no longer available" }, { status: 409 });
  return NextResponse.json({ item: serializeProjectAction(item), duplicate: true, clientMutationId });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const parsed = fieldSyncRequestSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid field sync operation" }, { status: 400 });
  const input = parsed.data;

  try {
    const previous = await existingResult(params.projectId, input.clientMutationId, input.kind);
    if (previous) return previous;

    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const actor = {
      actorId: user?.authenticated ? user.id : null,
      actorName: user?.name ?? "field-user",
      actorEmail: user?.email ?? null
    };

    const item = await prisma.$transaction(async (tx) => {
      if (input.kind === "daily_report") {
        const created = await tx.dailyReport.create({
          data: {
            ...input.payload,
            status: "draft",
            organizationId: project.organizationId,
            projectId: params.projectId,
            createdBy: user?.authenticated ? user.id : null
          }
        });
        await writeAudit(tx, {
          organizationId: project.organizationId,
          projectId: params.projectId,
          ...actor,
          entity: "daily_report",
          entityId: created.id,
          action: "create",
          summary: `Синхронизирован полевой рапорт: ${created.date.toISOString().slice(0, 10)}`,
          after: { ...serializeDailyReport(created), capturedAt: input.capturedAt, source: "field_offline" }
        });
        await tx.fieldSyncReceipt.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            clientMutationId: input.clientMutationId,
            kind: input.kind,
            entityId: created.id,
            createdBy: user?.authenticated ? user.id : null
          }
        });
        return { kind: input.kind, value: serializeDailyReport(created) } as const;
      }

      const created = await tx.projectActionItem.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          createdBy: user?.authenticated ? user.id : null,
          title: input.payload.title,
          description: input.payload.description || null,
          sourceModule: "Площадка",
          targetTab: "Действия",
          priority: input.payload.priority,
          assignee: input.payload.assignee || null,
          dueAt: input.payload.dueAt ? new Date(input.payload.dueAt) : null,
          requiresApproval: input.payload.priority === "critical"
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        ...actor,
        entity: "project_action",
        entityId: created.id,
        action: "create",
        summary: `Синхронизировано замечание площадки: ${created.title}`,
        after: { ...serializeProjectAction(created), capturedAt: input.capturedAt, source: "field_offline" }
      });
      await tx.fieldSyncReceipt.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          clientMutationId: input.clientMutationId,
          kind: input.kind,
          entityId: created.id,
          createdBy: user?.authenticated ? user.id : null
        }
      });
      return { kind: input.kind, value: serializeProjectAction(created) } as const;
    });

    return NextResponse.json({ item: item.value, duplicate: false, clientMutationId: input.clientMutationId }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const previous = await existingResult(params.projectId, input.clientMutationId, input.kind);
      if (previous) return previous;
    }
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    console.error(error);
    return NextResponse.json({ error: "Field sync failed" }, { status: 500 });
  }
}
