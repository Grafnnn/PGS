import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { buildProcurementWorkbook } from "@/lib/procurement-export";
import { prisma } from "@/lib/prisma";
import { requireProjectAccess } from "@/lib/project-route-guards";
import { serializeMaterial, serializeProcurementRequest } from "@/lib/serializers";

export const runtime = "nodejs";

function exportName(projectName: string) {
  return `PGS-supply-${projectName.replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/g, "").slice(0, 80) || "project"}.xlsx`;
}

export async function GET(request: Request, { params }: { params: { projectId: string } }) {
  const access = await requireProjectAccess(params.projectId, "export_project");
  if ("response" in access) return access.response;

  try {
    const requestedIds = new URL(request.url).searchParams.get("ids")?.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 100) ?? [];
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, name: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const [requests, materials] = await Promise.all([
      prisma.procurementRequest.findMany({
        where: { projectId: params.projectId, ...(requestedIds.length ? { id: { in: requestedIds } } : {}) },
        include: { items: true },
        orderBy: [{ neededAt: "asc" }, { createdAt: "asc" }]
      }),
      prisma.material.findMany({ where: { projectId: params.projectId }, orderBy: { name: "asc" } })
    ]);
    const workbook = buildProcurementWorkbook(project.name, requests.map(serializeProcurementRequest), materials.map(serializeMaterial));
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
    return NextResponse.json({ error: "Не удалось сформировать Excel-заявку." }, { status: 500 });
  }
}
