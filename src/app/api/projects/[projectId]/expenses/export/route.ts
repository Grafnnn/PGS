import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { buildProjectExpensesWorkbook } from "@/lib/project-expense-export";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

function exportName(projectName: string) {
  return `PGS-expenses-${projectName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "project"}.xlsx`;
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "export_project"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const items = await prisma.projectExpense.findMany({
      where: { projectId: params.projectId },
      include: {
        costCode: { select: { id: true, code: true, name: true } },
        receiptDocument: { select: { id: true, title: true, fileName: true, mimeType: true } },
        items: { orderBy: { sequence: "asc" } }
      },
      orderBy: [{ expenseDate: "asc" }, { sequence: "asc" }]
    });
    const workbook = buildProjectExpensesWorkbook(items, project.name);
    return new NextResponse(new Uint8Array(workbook), {
      headers: {
        "content-type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(exportName(project.name))}`,
        "cache-control": "no-store"
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    console.error(error);
    return NextResponse.json({ error: "Не удалось сформировать Excel-реестр" }, { status: 500 });
  }
}
