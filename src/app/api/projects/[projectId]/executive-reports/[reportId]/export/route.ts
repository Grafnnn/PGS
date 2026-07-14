import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import type { ExecutiveReportContent } from "@/lib/executive-reports";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; reportId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const report = await prisma.executiveReport.findUnique({ where: { id: params.reportId } });
    if (!report || report.projectId !== params.projectId) return NextResponse.json({ error: "Executive report not found" }, { status: 404 });
    const content = report.content as unknown as ExecutiveReportContent;
    if (typeof content.copyText !== "string") return NextResponse.json({ error: "Executive report content is unavailable" }, { status: 500 });
    const fileName = `executive-report-v${report.version}-${report.reportDate.toISOString().slice(0, 10)}.txt`;

    return new NextResponse(content.copyText, {
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "content-disposition": `attachment; filename="${fileName}"`,
        "cache-control": "private, no-store"
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Executive report export failed" }, { status: 500 });
  }
}
