import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { importPreviewCommitSchema } from "@/lib/excel/import-types";
import { getDemoContext } from "@/lib/project-data";
import { prisma } from "@/lib/prisma";
import { serializeBudgetItem, serializeMaterial, serializeScheduleItem } from "@/lib/serializers";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const body = await request.json().catch(() => ({}));

  try {
    const user = await getCurrentUser();
    if (!(await canProject(user, params.projectId, "import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
    const payload = importPreviewCommitSchema.parse(body);
    const { userId: demoUserId } = await getDemoContext();
    const userId = user?.authenticated ? user.id : demoUserId;
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });

    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const result = await prisma.$transaction(async (tx) => {
      if (payload.mode === "replace_budget") {
        await tx.budgetItem.deleteMany({ where: { projectId: project.id } });
        await tx.budgetSection.deleteMany({ where: { projectId: project.id } });
      }
      if (payload.mode === "replace_materials") {
        await tx.material.deleteMany({ where: { projectId: project.id } });
      }
      if (payload.mode === "replace_schedule") {
        await tx.scheduleItem.deleteMany({ where: { projectId: project.id } });
      }

      const sectionNames = Array.from(new Set([...payload.sections.map((section) => section.name), ...payload.budgetItems.map((item) => item.section)]));
      for (const [index, name] of sectionNames.entries()) {
        await tx.budgetSection.upsert({
          where: { projectId_name: { projectId: project.id, name } },
          update: {},
          create: {
            organizationId: project.organizationId,
            projectId: project.id,
            name,
            sortOrder: index,
            createdBy: userId
          }
        });
      }

      const budgetItems = await Promise.all(
        payload.budgetItems.map((item) =>
          tx.budgetItem.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              section: item.section,
              code: item.code || `${item.sheetName}:${item.rowNumber}`,
              name: item.name,
              unit: item.unit,
              qty: new Prisma.Decimal(item.qty),
              plannedUnitPrice: new Prisma.Decimal(item.plannedUnitPrice),
              actualUnitPrice: new Prisma.Decimal(item.actualUnitPrice),
              forecastUnitPrice: new Prisma.Decimal(item.forecastUnitPrice),
              kind: item.kind,
              source: item.source,
              comment: item.comment,
              createdBy: userId
            }
          })
        )
      );

      const materials = await Promise.all(
        payload.materials.map((item) =>
          tx.material.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              name: item.name,
              unit: item.unit,
              requiredQty: new Prisma.Decimal(item.requiredQty),
              orderedQty: new Prisma.Decimal(item.orderedQty),
              deliveredQty: new Prisma.Decimal(item.deliveredQty),
              consumedQty: new Prisma.Decimal(item.consumedQty),
              plannedUnitPrice: new Prisma.Decimal(item.plannedUnitPrice),
              actualUnitPrice: new Prisma.Decimal(item.actualUnitPrice),
              supplier: item.supplier,
              neededAt: item.neededAt,
              status: item.status,
              createdBy: userId
            }
          })
        )
      );

      const scheduleItems = await Promise.all(
        payload.scheduleItems.map((item) =>
          tx.scheduleItem.create({
            data: {
              organizationId: project.organizationId,
              projectId: project.id,
              name: item.name,
              owner: item.owner,
              startsAt: item.startsAt,
              endsAt: item.endsAt,
              plannedQty: new Prisma.Decimal(item.plannedQty),
              actualQty: new Prisma.Decimal(item.actualQty),
              status: item.status,
              dependency: item.dependency,
              createdBy: userId
            }
          })
        )
      );

      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "excel_import",
        entityId: `import-${Date.now()}`,
        action: "import_commit",
        summary: `Excel import saved: budget ${budgetItems.length}, materials ${materials.length}, schedule ${scheduleItems.length}, mode ${payload.mode}`,
        after: {
          mode: payload.mode,
          budgetItems: budgetItems.length,
          materials: materials.length,
          scheduleItems: scheduleItems.length
        }
      });

      return {
        budgetItems: budgetItems.map(serializeBudgetItem),
        materials: materials.map(serializeMaterial),
        scheduleItems: scheduleItems.map(serializeScheduleItem)
      };
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation error", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import commit failed" }, { status: 500 });
  }
}
