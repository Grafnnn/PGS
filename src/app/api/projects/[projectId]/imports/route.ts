import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { serializeImportBatch } from "@/lib/excel/import-audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const items = await prisma.importBatch.findMany({
      where: { projectId: params.projectId },
      orderBy: { createdAt: "desc" },
      take: 50
    });

    return NextResponse.json({ items: items.map((item) => serializeImportBatch(item)) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import history failed" }, { status: 500 });
  }
}
