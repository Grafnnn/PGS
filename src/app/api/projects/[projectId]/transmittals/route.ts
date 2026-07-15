import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { serializeTransmittal, transmittalCreateSchema, transmittalSummary } from "@/lib/document-transmittals";

type Params = { params: { projectId: string } };
const includeRegister = { items: true, events: { orderBy: { createdAt: "asc" as const } } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const items = await prisma.projectDocumentTransmittal.findMany({
      where: { projectId: params.projectId },
      include: includeRegister,
      orderBy: { sequence: "desc" }
    });
    return NextResponse.json({ items: items.map(serializeTransmittal), summary: transmittalSummary(items) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    return NextResponse.json({ error: "Document transmittal register request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try {
    const data = transmittalCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { organizationId: true } });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    const documentIds = [...new Set(data.documentIds)];
    const documents = documentIds.length
      ? await prisma.document.findMany({ where: { projectId: params.projectId, id: { in: documentIds } }, select: { id: true, title: true, category: true, fileName: true, version: true } })
      : [];
    if (documents.length !== documentIds.length) return NextResponse.json({ error: "One or more package documents were not found in this project" }, { status: 400 });

    const item = await prisma.$transaction(async (tx) => {
      const last = await tx.projectDocumentTransmittal.findFirst({ where: { projectId: params.projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      const created = await tx.projectDocumentTransmittal.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          sequence: (last?.sequence ?? 0) + 1,
          subject: data.subject,
          purpose: data.purpose || null,
          recipient: data.recipient || null,
          ccRecipients: data.ccRecipients || null,
          reviewer: data.reviewer || null,
          dueAt: data.dueAt ? new Date(data.dueAt) : null,
          createdBy: user?.authenticated ? user.id : null,
          items: {
            create: documentIds.map((documentId) => {
              const document = documents.find((entry) => entry.id === documentId)!;
              return {
                documentId: document.id,
                documentVersion: document.version,
                titleSnapshot: document.title,
                fileNameSnapshot: document.fileName,
                categorySnapshot: document.category
              };
            })
          }
        },
        include: includeRegister
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "document_transmittal",
        entityId: created.id,
        action: "create",
        summary: `Создан ${`TR-${String(created.sequence).padStart(3, "0")}`}: ${created.subject}`,
        after: serializeTransmittal(created)
      });
      return created;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    return NextResponse.json({ item: serializeTransmittal(item) }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return NextResponse.json({ error: "Transmittal number conflict; retry the request" }, { status: 409 });
    if (error instanceof Error && error.name === "ZodError") return NextResponse.json({ error: "Invalid document transmittal request" }, { status: 400 });
    return NextResponse.json({ error: "Document transmittal create failed" }, { status: 500 });
  }
}
