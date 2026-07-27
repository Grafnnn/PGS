import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { hashOneTimeToken } from "@/lib/auth/tokens";
import {
  externalCollaborationActor,
  externalCollaborationLinkIsUsable,
  externalCollaborationResponseSchema
} from "@/lib/external-collaboration";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";

type Params = { params: { token: string } };

function tokenHash(token: string) {
  return token.length >= 32 && token.length <= 200 ? hashOneTimeToken(token) : "";
}

async function findPublicLink(token: string) {
  const hash = tokenHash(token);
  if (!hash) return null;
  return prisma.externalCollaborationLink.findUnique({
    where: { tokenHash: hash },
    include: { project: { select: { name: true, customer: true, object: true } } }
  });
}

export async function GET(_request: Request, { params }: Params) {
  try {
    const link = await findPublicLink(params.token);
    if (!link) return NextResponse.json({ error: "Response link not found" }, { status: 404 });
    if (!externalCollaborationLinkIsUsable(link)) {
      return NextResponse.json({ error: "Response link is no longer active" }, { status: 410 });
    }
    const entity = link.entityType === "rfi"
      ? await prisma.projectRfi.findFirst({
          where: { id: link.entityId, projectId: link.projectId },
          select: {
            id: true, sequence: true, subject: true, question: true, discipline: true,
            location: true, priority: true, status: true, dueAt: true
          }
        })
      : await prisma.projectSubmittal.findFirst({
          where: { id: link.entityId, projectId: link.projectId },
          select: {
            id: true, sequence: true, title: true, category: true, specSection: true,
            revision: true, status: true, dueAt: true
          }
        });
    if (!entity) return NextResponse.json({ error: "Shared item not found" }, { status: 404 });
    const expectedStatus = link.entityType === "rfi" ? "open" : "submitted";
    if (entity.status !== expectedStatus) {
      return NextResponse.json({ error: "Shared item is no longer awaiting a response" }, { status: 410 });
    }
    return NextResponse.json({
      project: link.project,
      entityType: link.entityType,
      recipientName: link.recipientName,
      expiresAt: link.expiresAt.toISOString(),
      entity: {
        ...entity,
        number: `${link.entityType === "rfi" ? "RFI" : "SUB"}-${String(entity.sequence).padStart(3, "0")}`,
        dueAt: entity.dueAt?.toISOString() ?? null
      }
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Service is temporarily unavailable" }, { status: 503 });
    }
    return NextResponse.json({ error: "Response link request failed" }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const hash = tokenHash(params.token);
  if (!hash) return NextResponse.json({ error: "Response link not found" }, { status: 404 });
  const address = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
  const rateLimit = checkRateLimit({ key: `external-collaboration:${hash}:${address}`, limit: 8, windowMs: 15 * 60 * 1000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Too many response attempts" },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  try {
    const data = externalCollaborationResponseSchema.parse(await request.json().catch(() => ({})));
    await prisma.$transaction(async (tx) => {
      const link = await tx.externalCollaborationLink.findUnique({ where: { tokenHash: hash } });
      if (!link) throw new PublicCollaborationError("Response link not found", 404);
      if (!externalCollaborationLinkIsUsable(link)) throw new PublicCollaborationError("Response link is no longer active", 410);
      const actor = externalCollaborationActor(link);
      const now = new Date();

      if (link.entityType === "rfi") {
        if (!("response" in data)) throw new PublicCollaborationError("RFI response is required", 400);
        const rfi = await tx.projectRfi.findFirst({ where: { id: link.entityId, projectId: link.projectId } });
        if (!rfi) throw new PublicCollaborationError("Shared RFI not found", 404);
        if (rfi.status !== "open") throw new PublicCollaborationError("RFI is no longer awaiting a response", 409);
        await tx.rfiResponse.create({
          data: { rfiId: rfi.id, body: data.response, createdByName: actor.name }
        });
        await tx.projectRfi.update({
          where: { id: rfi.id },
          data: { status: "answered", answeredAt: now }
        });
        await writeAudit(tx, {
          organizationId: link.organizationId,
          projectId: link.projectId,
          actorName: actor.name,
          actorEmail: actor.email,
          entity: "project_rfi",
          entityId: rfi.id,
          action: "accept",
          summary: `Получен внешний ответ на RFI-${String(rfi.sequence).padStart(3, "0")}`
        });
      } else if (link.entityType === "submittal") {
        if (!("decision" in data)) throw new PublicCollaborationError("Submittal decision is required", 400);
        const submittal = await tx.projectSubmittal.findFirst({ where: { id: link.entityId, projectId: link.projectId } });
        if (!submittal) throw new PublicCollaborationError("Shared submittal not found", 404);
        if (submittal.status !== "submitted") throw new PublicCollaborationError("Submittal is no longer awaiting review", 409);
        await tx.submittalReview.create({
          data: {
            submittalId: submittal.id,
            revision: submittal.revision,
            decision: data.decision,
            comment: data.comment || null,
            createdByName: actor.name
          }
        });
        await tx.projectSubmittal.update({
          where: { id: submittal.id },
          data: { status: data.decision, reviewedAt: now }
        });
        await writeAudit(tx, {
          organizationId: link.organizationId,
          projectId: link.projectId,
          actorName: actor.name,
          actorEmail: actor.email,
          entity: "project_submittal",
          entityId: submittal.id,
          action: "accept",
          summary: `Получено внешнее решение по SUB-${String(submittal.sequence).padStart(3, "0")}`
        });
      } else {
        throw new PublicCollaborationError("Unsupported shared item", 409);
      }

      const nextCount = link.responseCount + 1;
      await tx.externalCollaborationLink.update({
        where: { id: link.id },
        data: {
          responseCount: nextCount,
          status: nextCount >= link.responseLimit ? "responded" : "active",
          lastRespondedAt: now
        }
      });
      await writeAudit(tx, {
        organizationId: link.organizationId,
        projectId: link.projectId,
        actorName: actor.name,
        actorEmail: actor.email,
        entity: "external_collaboration_link",
        entityId: link.id,
        action: "accept",
        summary: "Внешний ответ принят; ссылка закрыта"
      });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
    return NextResponse.json({ ok: true });
  } catch (error) {
    if (error instanceof PublicCollaborationError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2034") {
      return NextResponse.json({ error: "Response was already processed; refresh the page" }, { status: 409 });
    }
    if (error instanceof Prisma.PrismaClientInitializationError) {
      return NextResponse.json({ error: "Service is temporarily unavailable" }, { status: 503 });
    }
    if (error instanceof Error && error.name === "ZodError") {
      return NextResponse.json({ error: "Invalid response" }, { status: 400 });
    }
    return NextResponse.json({ error: "Could not submit the response" }, { status: 500 });
  }
}

class PublicCollaborationError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PublicCollaborationError";
  }
}
