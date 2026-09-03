import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { buildScheduleDraft, draftRequestSchema, loadPipelineData } from "@/lib/project-pipeline";
import { serializeBudgetItem, serializeScheduleItem } from "@/lib/serializers";

export const runtime = "nodejs";

class ScheduleDraftCommitError extends Error {}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

export async function POST(request: Request, { params }: { params: { projectId: string } }) {
  const previewAccess = await requireProjectAccess(params.projectId, "view");
  if ("response" in previewAccess) return previewAccess.response;
  const body = draftRequestSchema.parse(await request.json().catch(() => ({})));

  if (!body.commit) {
    const data = await loadPipelineData(params.projectId);
    if (!data) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({ ok: true, mode: "preview", draft: buildScheduleDraft(data) });
  }

  if (!body.confirmed) return NextResponse.json({ error: "Draft schedule creation requires explicit confirmation." }, { status: 409 });
  const editAccess = await requireProjectAccess(params.projectId, "edit");
  if ("response" in editAccess) return editAccess.response;
  const seedData = await loadPipelineData(params.projectId);
  if (!seedData) return NextResponse.json({ error: "Project not found" }, { status: 404 });

  try {
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM "projects" WHERE id = ${params.projectId} FOR UPDATE`;
      const project = await tx.project.findUnique({
        where: { id: params.projectId },
        select: { id: true, organizationId: true, contractAmount: true, startsAt: true, endsAt: true, name: true }
      });
      if (!project) throw new ScheduleDraftCommitError("Project not found");
      const [budgetItems, scheduleItems, latestRevision] = await Promise.all([
        tx.budgetItem.findMany({ where: { projectId: params.projectId }, orderBy: [{ section: "asc" }, { code: "asc" }] }),
        tx.scheduleItem.findMany({ where: { projectId: params.projectId, isCurrent: true }, orderBy: { startsAt: "asc" } }),
        tx.scheduleItem.aggregate({ where: { projectId: params.projectId }, _max: { revision: true } })
      ]);
      const currentRevision = scheduleItems.reduce((maximum, item) => Math.max(maximum, item.revision), 0);
      const revision = currentRevision || ((latestRevision._max.revision ?? 0) + 1);
      const freshData = {
        ...seedData,
        project: {
          id: project.id,
          organizationId: project.organizationId,
          contractAmount: Number(project.contractAmount),
          startsAt: dateOnly(project.startsAt),
          endsAt: dateOnly(project.endsAt),
          name: project.name
        },
        budgetItems: budgetItems.map(serializeBudgetItem),
        scheduleItems: scheduleItems.map(serializeScheduleItem)
      };
      const draft = buildScheduleDraft(freshData);
      const itemsToCreate = draft.items.filter((item) => item.status !== "already_exists");
      const latestCurrentFinish = scheduleItems.reduce<Date | null>((latest, item) => !latest || item.endsAt > latest ? item.endsAt : latest, null);
      let cursor = latestCurrentFinish ? new Date(latestCurrentFinish) : new Date(project.startsAt);
      if (latestCurrentFinish) cursor.setUTCDate(cursor.getUTCDate() + 1);
      const created = [];
      for (const item of itemsToCreate) {
        const startsAt = new Date(cursor);
        const endsAt = new Date(cursor);
        endsAt.setUTCDate(endsAt.getUTCDate() + item.suggestedDurationDays);
        const row = await tx.scheduleItem.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            name: item.name,
            owner: "ПТО",
            startsAt,
            endsAt,
            plannedQty: new Prisma.Decimal(100),
            actualQty: new Prisma.Decimal(0),
            manualActualQty: new Prisma.Decimal(0),
            reportActualQty: new Prisma.Decimal(0),
            unit: "%",
            progressMode: "milestone",
            revision,
            isCurrent: true,
            supersededAt: null,
            status: "not_started",
            dependency: item.dependency ?? undefined,
            createdBy: editAccess.user.id
          }
        });
        created.push(serializeScheduleItem(row));
        cursor = new Date(endsAt);
        cursor.setUTCDate(cursor.getUTCDate() + 1);
      }
      return { draft, created };
    }, { timeout: 30_000 });

    return NextResponse.json({ ok: true, mode: "commit", ...result });
  } catch (error) {
    if (error instanceof ScheduleDraftCommitError) return NextResponse.json({ error: error.message }, { status: 404 });
    throw error;
  }
}
