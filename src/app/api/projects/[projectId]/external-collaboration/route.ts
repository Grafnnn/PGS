import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { generateOneTimeToken, hashOneTimeToken, tokenExpiresAt } from "@/lib/auth/tokens";
import { getEnv } from "@/lib/env";
import {
  externalCollaborationCreateSchema,
  externalCollaborationLinkIsUsable,
  serializeExternalCollaborationLink
} from "@/lib/external-collaboration";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string } };

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const [project, rfis, submittals, links] = await Promise.all([
      prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } }),
      prisma.projectRfi.findMany({
        where: { projectId: params.projectId, status: "open" },
        select: { id: true, sequence: true, subject: true, assignee: true, dueAt: true },
        orderBy: { sequence: "desc" }
      }),
      prisma.projectSubmittal.findMany({
        where: { projectId: params.projectId, status: "submitted" },
        select: { id: true, sequence: true, title: true, reviewer: true, dueAt: true, revision: true },
        orderBy: { sequence: "desc" }
      }),
      prisma.externalCollaborationLink.findMany({
        where: { projectId: params.projectId },
        orderBy: { createdAt: "desc" },
        take: 100
      })
    ]);
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });
    return NextResponse.json({
      eligible: [
        ...rfis.map((item) => ({
          id: item.id,
          entityType: "rfi" as const,
          number: `RFI-${String(item.sequence).padStart(3, "0")}`,
          title: item.subject,
          recipientHint: item.assignee,
          dueAt: item.dueAt?.toISOString() ?? null
        })),
        ...submittals.map((item) => ({
          id: item.id,
          entityType: "submittal" as const,
          number: `SUB-${String(item.sequence).padStart(3, "0")} · Rev ${item.revision}`,
          title: item.title,
          recipientHint: item.reviewer,
          dueAt: item.dueAt?.toISOString() ?? null
        }))
      ],
      links: links.map((item) => serializeExternalCollaborationLink(item))
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    return NextResponse.json({ error: "External collaboration request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "manage_members"))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  try {
    const data = externalCollaborationCreateSchema.parse(await request.json().catch(() => ({})));
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return NextResponse.json({ error: "Project not found" }, { status: 404 });

    const entity = data.entityType === "rfi"
      ? await prisma.projectRfi.findFirst({
          where: { id: data.entityId, projectId: params.projectId },
          select: { id: true, sequence: true, subject: true, status: true }
        })
      : await prisma.projectSubmittal.findFirst({
          where: { id: data.entityId, projectId: params.projectId },
          select: { id: true, sequence: true, title: true, status: true }
        });
    if (!entity) return NextResponse.json({ error: "RFI or submittal not found" }, { status: 404 });
    const expectedStatus = data.entityType === "rfi" ? "open" : "submitted";
    if (entity.status !== expectedStatus) {
      return NextResponse.json({ error: "Only an active RFI or submitted submittal can be shared" }, { status: 409 });
    }
    const existing = await prisma.externalCollaborationLink.findMany({
      where: { projectId: params.projectId, entityType: data.entityType, entityId: data.entityId, status: "active" },
      orderBy: { createdAt: "desc" },
      take: 5
    });
    if (existing.some((item) => externalCollaborationLinkIsUsable(item))) {
      return NextResponse.json({ error: "An active response link already exists for this item" }, { status: 409 });
    }

    const token = generateOneTimeToken();
    const title = "subject" in entity ? entity.subject : entity.title;
    const number = `${data.entityType === "rfi" ? "RFI" : "SUB"}-${String(entity.sequence).padStart(3, "0")}`;
    const created = await prisma.$transaction(async (tx) => {
      const now = new Date();
      await tx.externalCollaborationLink.updateMany({
        where: {
          projectId: params.projectId,
          entityType: data.entityType,
          entityId: data.entityId,
          status: "active",
          OR: [{ expiresAt: { lte: now } }, { responseCount: { gte: 1 } }]
        },
        data: { status: "revoked", revokedAt: now }
      });
      const item = await tx.externalCollaborationLink.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          entityType: data.entityType,
          entityId: data.entityId,
          recipientName: data.recipientName || null,
          recipientEmail: data.recipientEmail.toLowerCase(),
          tokenHash: hashOneTimeToken(token),
          expiresAt: tokenExpiresAt(data.expiresInHours),
          responseLimit: data.responseLimit,
          createdBy: user?.authenticated ? user.id : null,
          metadata: { number, title }
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "external_collaboration_link",
        entityId: item.id,
        action: "create",
        summary: `Создана внешняя ссылка для ${number}: ${title}`,
        after: serializeExternalCollaborationLink(item)
      });
      return item;
    });
    const responseUrl = new URL(`/external/respond/${token}`, getEnv().APP_URL).toString();
    return NextResponse.json({ item: serializeExternalCollaborationLink(created), responseUrl }, { status: 201 });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Database is not available" }, { status: 503 });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: "Could not create a unique response link; retry" }, { status: 409 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid external collaboration request" }, { status: 400 });
    }
    return NextResponse.json({ error: "External collaboration link creation failed" }, { status: 500 });
  }
}
