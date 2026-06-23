import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { explainImportPreview } from "@/lib/excel/ai-import-summary";
import { importPreviewSchema, type ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function POST(_request: Request, { params }: { params: { projectId: string; importId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const batch = await prisma.importBatch.findFirst({
      where: {
        id: params.importId,
        projectId: project.id
      }
    });
    if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });

    const preview = importPreviewSchema.parse(batch.previewJson) as unknown as ImportPreview;
    const explanation = await explainImportPreview(preview);
    const nextPreview = { ...preview, explanation };

    await prisma.$transaction(async (tx) => {
      await tx.importBatch.update({
        where: { id: batch.id },
        data: {
          previewJson: toJson(nextPreview),
          summary: toJson({ ...(batch.summary as Record<string, unknown>), aiExplanationStatus: explanation.status })
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
        summary: `Excel import explanation generated: ${explanation.status}`,
        after: {
          importBatchId: batch.id,
          status: explanation.status,
          confidence: explanation.confidence
        }
      });
    });

    return NextResponse.json({ explanation });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import explanation failed" }, { status: 500 });
  }
}

function toJson(value: unknown) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}
