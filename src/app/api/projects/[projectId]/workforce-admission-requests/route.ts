import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import {
  serializeWorkforceAdmissionRequest,
  workforceAdmissionRequestCreateSchema
} from "@/lib/workforce-admission-requests";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

const requestInclude = {
  members: { orderBy: [{ fullName: "asc" as const }] }
};

export async function GET(_request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "import"))) return json({ error: "Forbidden" }, 403);

  const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
  if (!project) return json({ error: "Project not found" }, 404);

  const items = await prisma.workforceAdmissionRequest.findMany({
    where: { projectId: params.projectId },
    include: requestInclude,
    orderBy: [{ createdAt: "desc" }]
  });
  return json({ items: items.map(serializeWorkforceAdmissionRequest) });
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "import"))) return json({ error: "Forbidden" }, 403);

  try {
    const data = workforceAdmissionRequestCreateSchema.parse(await request.json());
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true }
    });
    if (!project) return json({ error: "Project not found" }, 404);

    const createdBy = user?.authenticated ? user.id : null;
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.workforceAdmissionRequest.create({
        data: {
          organizationId: project.organizationId,
          projectId: project.id,
          requestNumber: data.requestNumber,
          title: data.title,
          contractor: data.contractor,
          objectName: data.objectName,
          validFrom: data.validFrom,
          validUntil: data.validUntil,
          workScope: data.workScope,
          employmentType: data.employmentType,
          sourceFileName: data.sourceFileName,
          notes: data.notes,
          createdBy,
          members: {
            create: data.members.map((member) => ({
              fullName: member.fullName,
              profession: member.profession,
              kind: member.kind,
              birthDate: member.birthDate,
              citizenship: member.citizenship,
              documentType: member.documentType,
              documentLast4: member.documentLast4
            }))
          }
        },
        include: requestInclude
      });

      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: createdBy,
        actorName: user?.name ?? "PGS user",
        actorEmail: user?.email ?? null,
        entity: "workforce_admission_request",
        entityId: created.id,
        action: "create",
        summary: `Создана заявка на допуск ${created.requestNumber}: ${created.members.length} чел.`,
        after: { requestNumber: created.requestNumber, memberCount: created.members.length, status: created.status }
      });
      return created;
    });

    return json({ item: serializeWorkforceAdmissionRequest(item) }, 201);
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid workforce admission request", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Заявка с таким номером уже существует в проекте." }, 409);
    }
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Workforce admission request failed" }, 500);
  }
}
