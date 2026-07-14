import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeSubmittal, submittalCreateSchema, workflowSummary } from "@/lib/rfi-submittals";

type Params = { params: { projectId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const [items, rfis] = await Promise.all([
      prisma.projectSubmittal.findMany({ where: { projectId: params.projectId }, include: { reviews: { orderBy: { createdAt: "asc" } } }, orderBy: { sequence: "desc" } }),
      prisma.projectRfi.findMany({ where: { projectId: params.projectId }, select: { status: true, dueAt: true } })
    ]);
    return NextResponse.json({ items: items.map(serializeSubmittal), summary: workflowSummary(rfis, items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Submittal register request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = submittalCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    if (data.linkedDocumentId) {
      const document = await prisma.document.findFirst({ where: { id: data.linkedDocumentId, projectId: params.projectId }, select: { id: true } });
      if (!document) return NextResponse.json({ error: "Linked document not found in this project" }, { status: 400 });
    }
    const item = await prisma.$transaction(async (tx) => {
      const last = await tx.projectSubmittal.findFirst({ where: { projectId: params.projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const created = await tx.projectSubmittal.create({ data: {
        organizationId: project.organizationId, projectId: params.projectId, sequence: (last?.sequence ?? 0) + 1,
        title: data.title, category: data.category, specSection: data.specSection || null, reviewer: data.reviewer || null,
        dueAt: data.dueAt ? new Date(data.dueAt) : null, linkedDocumentId: data.linkedDocumentId || null,
        createdBy: user?.authenticated ? user.id : null
      }, include: { reviews: true } });
      await writeAudit(tx, { organizationId: project.organizationId, projectId: params.projectId, actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user", actorEmail: user?.email ?? null, entity: "project_submittal", entityId: created.id,
        action: "create", summary: `Создан ${`SUB-${String(created.sequence).padStart(3, "0")}`}: ${created.title}`, after: serializeSubmittal(created) });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ item: serializeSubmittal(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Submittal number conflict; retry the request" }, { status: 409 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid submittal request" }, { status: 400 });
    return NextResponse.json({ error: "Submittal create failed" }, { status: 500 });
  }
}
