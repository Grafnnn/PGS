import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_POLICY, serializePayrollPolicy } from "@/lib/workforce-capacity";
import {
  normalizeWorkforceAdmissionIdentity,
  serializeWorkforceAdmissionRequest
} from "@/lib/workforce-admission-requests";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function identity(member: { fullName: string; profession: string }) {
  return `${normalizeWorkforceAdmissionIdentity(member.fullName)}:${normalizeWorkforceAdmissionIdentity(member.profession)}`;
}

class AdmissionApprovalConflict extends Error {}

export async function POST(
  _request: NextRequest,
  { params }: { params: { projectId: string; requestId: string } }
) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "import"))) return json({ error: "Forbidden" }, 403);

  try {
    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true, startsAt: true, endsAt: true }
    });
    if (!project) return json({ error: "Project not found" }, 404);

    const admission = await prisma.workforceAdmissionRequest.findFirst({
      where: { id: params.requestId, projectId: project.id },
      include: { members: { orderBy: [{ fullName: "asc" }] } }
    });
    if (!admission) return json({ error: "Workforce admission request not found" }, 404);
    if (admission.status === "approved") {
      return json({ item: serializeWorkforceAdmissionRequest(admission), result: { created: 0, assigned: 0, reused: admission.members.length } });
    }
    if (admission.status !== "draft") return json({ error: "Only draft requests can be approved" }, 409);
    const assignmentStartsAt = admission.validFrom > project.startsAt ? admission.validFrom : project.startsAt;
    const assignmentEndsAt = admission.validUntil && admission.validUntil < project.endsAt ? admission.validUntil : project.endsAt;
    if (assignmentEndsAt < assignmentStartsAt) return json({ error: "Период допуска не пересекается со сроками проекта." }, 409);

    const policyRecord = await prisma.projectPayrollPolicy.findUnique({ where: { projectId: project.id } });
    const policy = serializePayrollPolicy(policyRecord, project.id);
    const existing = await prisma.organizationResource.findMany({
      where: { organizationId: project.organizationId, kind: { in: ["worker", "engineer"] } },
      select: {
        id: true,
        name: true,
        profession: true,
        status: true,
        assignments: { where: { projectId: project.id }, select: { id: true } }
      }
    });
    const existingByIdentity = new Map(existing.map((item) => [identity({ fullName: item.name, profession: item.profession ?? "" }), item]));
    const createdBy = user?.authenticated ? user.id : null;
    const approvedAt = new Date();

    const result = await prisma.$transaction(async (tx) => {
      const claim = await tx.workforceAdmissionRequest.updateMany({
        where: { id: admission.id, status: "draft" },
        data: { status: "approved", approvedBy: createdBy, approvedAt }
      });
      if (claim.count !== 1) throw new AdmissionApprovalConflict();

      let created = 0;
      let assigned = 0;
      let reused = 0;

      for (const member of admission.members) {
        const known = existingByIdentity.get(identity(member));
        let resourceId = known?.id;

        if (!resourceId) {
          const resource = await tx.organizationResource.create({
            data: {
              organizationId: project.organizationId,
              kind: member.kind,
              name: member.fullName,
              profession: member.profession,
              employmentType: admission.employmentType,
              headcount: 1,
              capacityHoursPerMonth: new Prisma.Decimal(policy.workingHoursPerMonth || DEFAULT_PAYROLL_POLICY.workingHoursPerMonth),
              productivityNorm: new Prisma.Decimal(0),
              monthlyCost: new Prisma.Decimal(0),
              grossMonthlySalary: new Prisma.Decimal(0),
              hourlyCost: new Prisma.Decimal(0),
              certifications: [],
              status: "active",
              notes: `Заявка на допуск ${admission.requestNumber}; реквизиты удостоверяющих документов в реестр сотрудников не перенесены.`,
              createdBy
            }
          });
          resourceId = resource.id;
          created += 1;
        } else {
          reused += 1;
          if (known?.status !== "active") {
            await tx.organizationResource.update({ where: { id: resourceId }, data: { status: "active" } });
          }
        }

        if (!known?.assignments.length) assigned += 1;
        await tx.projectResourceAssignment.upsert({
          where: { projectId_resourceId: { projectId: project.id, resourceId } },
          create: {
            organizationId: project.organizationId,
            projectId: project.id,
            resourceId,
            startsAt: assignmentStartsAt,
            endsAt: assignmentEndsAt,
            allocationPercent: 100,
            plannedHours: new Prisma.Decimal(policy.workingHoursPerMonth || DEFAULT_PAYROLL_POLICY.workingHoursPerMonth),
            plannedOutput: new Prisma.Decimal(0),
            status: "active",
            notes: `Назначен по заявке на допуск ${admission.requestNumber}`,
            createdBy
          },
          update: {
            startsAt: assignmentStartsAt,
            endsAt: assignmentEndsAt,
            status: "active",
            notes: `Назначение подтверждено заявкой на допуск ${admission.requestNumber}`
          }
        });
        await tx.workforceAdmissionMember.update({
          where: { id: member.id },
          data: { resourceId, status: "approved" }
        });
      }

      const updated = await tx.workforceAdmissionRequest.update({
        where: { id: admission.id },
        data: { approvedBy: createdBy, approvedAt },
        include: { members: { orderBy: [{ fullName: "asc" }] } }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: createdBy,
        actorName: user?.name ?? "PGS user",
        actorEmail: user?.email ?? null,
        entity: "workforce_admission_request",
        entityId: admission.id,
        action: "update",
        summary: `Согласована заявка ${admission.requestNumber}: создано ${created}, назначено ${assigned}, найдено в реестре ${reused}`,
        after: { requestNumber: admission.requestNumber, memberCount: admission.members.length, created, assigned, reused, status: "approved" }
      });
      return { item: updated, result: { created, assigned, reused } };
    });

    return json({ item: serializeWorkforceAdmissionRequest(result.item), result: result.result });
  } catch (error) {
    if (error instanceof AdmissionApprovalConflict) return json({ error: "Заявка уже согласована или изменила статус." }, 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Workforce admission approval failed" }, 500);
  }
}
