import { NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { serializeImportBatch } from "@/lib/excel/import-audit";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: { projectId: string; importId: string } }) {
  try {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    if (!(await canProject(user, params.projectId, "view"))) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    const batch = await prisma.importBatch.findFirst({
      where: {
        id: params.importId,
        projectId: params.projectId
      }
    });
    if (!batch) return NextResponse.json({ error: "Import batch not found" }, { status: 404 });

    return NextResponse.json({ item: serializeImportBatch(batch) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Import details failed" }, { status: 500 });
  }
}
