import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { validateExcelFile } from "@/lib/excel/import-parser";
import { parseProjectWorkbookBuffer, parseProjectWorkbookSheetOverrides } from "@/lib/excel/project-workbook-import";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true, startsAt: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Excel-файл не передан." }, { status: 400 });
    }

    const validationError = validateExcelFile(file.name, file.size);
    if (validationError) {
      return NextResponse.json({ error: validationError }, { status: 400 });
    }

    let sheetOverrides;
    try {
      sheetOverrides = parseProjectWorkbookSheetOverrides(formData.get("sheetOverrides"));
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Некорректная карта листов." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const batchId = randomUUID();
    const preview = {
      ...parseProjectWorkbookBuffer(buffer, file.name, params.projectId, { startsAt: project.startsAt, sheetOverrides }),
      importBatchId: batchId
    };

    await prisma.$transaction(async (tx) => {
      await tx.importBatch.create({
        data: {
          id: batchId,
          organizationId: project.organizationId,
          projectId: project.id,
          createdBy: user.id,
          fileName: file.name,
          fileSize: file.size,
          parserVersion: preview.parserVersion,
          status: preview.errors.length ? "failed" : "previewed",
          sheets: toJson(preview.sheets),
          mapping: toJson(preview.mapping),
          summary: toJson(preview.summary),
          previewJson: toJson(preview),
          warnings: toJson(preview.warnings),
          errors: toJson(preview.errors)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.authenticated ? user.email : null,
        entity: "excel_import",
        entityId: batchId,
        action: "import_preview",
        summary: `Excel import preview: budget ${preview.budgetItems.length}, materials ${preview.materials.length}, schedule ${preview.scheduleItems.length}, errors ${preview.errors.length}`,
        after: {
          fileName: file.name,
          parserVersion: preview.parserVersion,
          summary: preview.summary
        }
      });
    });

    return NextResponse.json(preview, { status: preview.errors.length ? 422 : 200 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import preview failed" }, { status: 500 });
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
