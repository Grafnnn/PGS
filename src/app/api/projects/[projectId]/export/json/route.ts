import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  projectControlBaselineInclude,
  projectControlPeriodInclude,
  serializeProjectControlBaseline,
  serializeProjectControlPeriod
} from "@/lib/project-controls-db";
import {
  serializeBudgetItem,
  serializeDailyReport,
  serializeDocument,
  serializeMaterial,
  serializePayment,
  serializeProcurementRequest,
  serializeProject,
  serializeRisk,
  serializeScheduleItem
} from "@/lib/serializers";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "export_project"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      include: {
        budgetSections: { orderBy: { sortOrder: "asc" } },
        budgetItems: { orderBy: [{ section: "asc" }, { code: "asc" }] },
        scheduleItems: { orderBy: { startsAt: "asc" } },
        materials: { orderBy: { neededAt: "asc" } },
        procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
        payments: { orderBy: { plannedAt: "asc" } },
        dailyReports: { orderBy: { date: "desc" } },
        risks: { orderBy: { dueAt: "asc" } },
        documents: { include: { versions: { orderBy: { versionNumber: "desc" } } }, orderBy: { uploadedAt: "desc" } },
        controlBaselines: { include: projectControlBaselineInclude, orderBy: { sequence: "asc" } },
        controlPeriods: { include: projectControlPeriodInclude, orderBy: { sequence: "asc" } }
      }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({
      exportedAt: new Date().toISOString(),
      project: serializeProject(project),
      budgetSections: project.budgetSections.map((section) => ({ id: section.id, name: section.name, parentId: section.parentId, sortOrder: section.sortOrder })),
      budgetItems: project.budgetItems.map(serializeBudgetItem),
      scheduleItems: project.scheduleItems.map(serializeScheduleItem),
      materials: project.materials.map(serializeMaterial),
      procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
      payments: project.payments.map(serializePayment),
      dailyReports: project.dailyReports.map(serializeDailyReport),
      risks: project.risks.map(serializeRisk),
      documents: project.documents.map((document) => ({
        ...serializeDocument(document),
        versions: document.versions.map((version) => ({
          id: version.id,
          versionNumber: version.versionNumber,
          fileName: version.fileName,
          mimeType: version.mimeType,
          sizeBytes: version.sizeBytes,
          uploadedByName: version.uploadedByName,
          createdAt: version.createdAt.toISOString()
        }))
      })),
      projectControls: {
        baselines: project.controlBaselines.map(serializeProjectControlBaseline),
        periods: project.controlPeriods.map(serializeProjectControlPeriod)
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Project export failed" }, { status: 500 });
  }
}
