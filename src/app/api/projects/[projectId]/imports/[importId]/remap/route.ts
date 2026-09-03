import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { ImportBatchNotFound, ImportCommitConflict, lockProjectForMutation } from "@/lib/excel/import-commit-integrity";
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
    const remapped = await prisma.$transaction(async (tx) => {
      await lockProjectForMutation(tx, project.id);
      const batch = await tx.importBatch.findFirst({
        where: { id: params.importId, projectId: project.id }
      });
      if (!batch) throw new ImportBatchNotFound("Import batch not found");
      if (batch.status === "committed" || batch.status === "committing") {
        throw new ImportCommitConflict(batch.status === "committed" ? "Import batch already committed" : "Import batch is being committed");
      }

      const preview = importPreviewSchema.parse(batch.previewJson) as unknown as ImportPreview;
      const nextPreview = remapImportPreview(preview, payload.mapping);
      const updated = await tx.importBatch.updateMany({
        where: {
          id: batch.id,
          projectId: project.id,
          status: batch.status,
          updatedAt: batch.updatedAt
        },
        data: {
          status: nextPreview.errors.length ? "failed" : "previewed",
          mapping: toJson(nextPreview.mapping),
          summary: toJson(nextPreview.summary),
          previewJson: toJson(nextPreview),
          warnings: toJson(nextPreview.warnings),
          errors: toJson(nextPreview.errors)
        }
      });
      if (updated.count !== 1) throw new ImportCommitConflict("Import batch changed while remapping. Refresh the preview and try again.");
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user.authenticated ? user.id : null,
        actorName: user.name,
        actorEmail: user.authenticated ? user.email : null,
        entity: "excel_import",
        entityId: batch.id,
        action: "import_preview",
        summary: `Excel import remapped: budget ${nextPreview.budgetItems.length}, materials ${nextPreview.materials.length}, errors ${nextPreview.errors.length}`,
        after: {
          importBatchId: batch.id,
          summary: nextPreview.summary,
          mapping: nextPreview.mapping
        }
      });
      return nextPreview;
    });

    return NextResponse.json(remapped, { status: remapped.errors.length ? 422 : 200 });
  } catch (error) {
    if (error instanceof ZodError) {
      return NextResponse.json({ error: "Validation error", issues: error.issues }, { status: 400 });
    }
    if (error instanceof ImportBatchNotFound) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }
    if (error instanceof ImportCommitConflict) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
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
