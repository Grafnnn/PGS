import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { serializeDailyReport } from "@/lib/serializers";
import { parseProductionJournalPeriod, productionJournalDays } from "@/lib/work-production-journal";
import { buildWorkProductionJournalWorkbook } from "@/lib/work-production-journal-export";

export const runtime = "nodejs";

export async function GET(request: Request, { params }: { params: { projectId: string } }): Promise<Response> {
  try {
    const access = await requireProjectAccess(params.projectId, "export_project");
    if (access.response) return access.response;

    const { searchParams } = new URL(request.url);
    const period = parseProductionJournalPeriod(searchParams.get("from") ?? "", searchParams.get("to") ?? "");
    if (!period) return NextResponse.json({ error: "Укажите корректный период журнала." }, { status: 400 });

    const date: Prisma.DateTimeFilter = {
      ...(period.from ? { gte: new Date(`${period.from}T00:00:00.000Z`) } : {}),
      ...(period.to ? { lte: new Date(`${period.to}T23:59:59.999Z`) } : {})
    };
    const project = await prisma.project.findUnique({
      where: { id: access.project.id, organizationId: access.project.organizationId },
      select: {
        name: true,
        dailyReports: { where: { date } }
      }
    });
    if (!project) return NextResponse.json({ error: "Проект не найден." }, { status: 404 });

    const filters = { ...period, query: searchParams.get("q")?.trim() };
    const days = productionJournalDays(project.dailyReports.map((report) => serializeDailyReport(report)), filters);
    const workbook = buildWorkProductionJournalWorkbook(project.name, days, filters);
    const nameSlug = project.name.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "");
    const projectName = Array.from(nameSlug).slice(0, 70).join("");
    const filename = projectName ? `PGS-журнал-${projectName}.xlsx` : "PGS-журнал.xlsx";

    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename="PGS-work-journal.xlsx"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "База данных недоступна." }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Не удалось выгрузить журнал производства работ." }, { status: 500 });
  }
}
