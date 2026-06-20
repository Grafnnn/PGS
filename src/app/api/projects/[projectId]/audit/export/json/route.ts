import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeAuditLog } from "@/lib/serializers";

export async function GET(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "export_audit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  try {
    const search = request.nextUrl.searchParams;
    const limit = Math.min(Number(search.get("limit") ?? 1000), 5000);
    const entityType = search.get("entityType");
    const action = search.get("action");
    const from = search.get("from");
    const to = search.get("to");
    const items = await prisma.auditLog.findMany({
      where: {
        projectId: params.projectId,
        entity: entityType ?? undefined,
        action: action ?? undefined,
        createdAt:
          from || to
            ? {
                gte: from ? new Date(from) : undefined,
                lte: to ? new Date(to) : undefined
              }
            : undefined
      },
      orderBy: { createdAt: "desc" },
      take: limit
    });
    return NextResponse.json({ exportedAt: new Date().toISOString(), items: items.map(serializeAuditLog) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, { status: 503 });
    }
    console.error(error);
    return NextResponse.json({ error: "Audit export failed" }, { status: 500 });
  }
}
