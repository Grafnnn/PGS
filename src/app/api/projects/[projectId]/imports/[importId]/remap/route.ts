import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { remapImportPreview } from "@/lib/excel/import-parser";
import { importPreviewSchema, importRemapRequestSchema, type ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(request: NextRequest, { params }: { params: { projectId: string; importId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "import"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const payload = importRemapRequestSchema.parse(await request.json().catch(() => ({})));
    const batch = await prisma.importBatch.findFirst({
      where: {
        id: params.importId,
        projectId: project.id
      }
    });
    if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });
    if (batch.status === "committed") return NextResponse.json({ error: "Import batch already committed" }, { status: 409 });

    const preview = importPreviewSchema.parse(batch.previewJson) as unknown as ImportPreview;
    const remapped = remapImportPreview(preview, payload.mapping);

    await prisma.$transaction(async (tx) => {
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          status: remapped.errors.length ? "failed" : "previewed",
          mapping: toJson(remapped.mapping),
          summary: toJson(remapped.summary),
          previewJson: toJson(remapped),
          warnings: toJson(remapped.warnings),
          errors: toJson(remapped.errors)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.authenticated ? user.email : null,
        entity: "excel_import",
        entityId: batch.id,
        action: "import_preview",
        summary: `Excel import remapped: budget ${remapped.budgetItems.length}, materials ${remapped.materials.length}, errors ${remapped.errors.length}`,
        after: {
          importBatchId: batch.id,
          summary: remapped.summary,
          mapping: remapped.mapping
        }
      });
    });

    return NextResponse.json(remapped, { status: remapped.errors.length ? 422 : 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation error", issues: error.issues }, { status: 400 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    if (error instanceof Error && error.message.includes("сохраненных строк Excel")) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import remap failed" }, { status: 500 });
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
