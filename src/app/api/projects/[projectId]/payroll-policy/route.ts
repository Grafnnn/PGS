import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/prisma";
import { payrollPolicySchema, serializePayrollPolicy } from "@/lib/workforce-capacity";

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function projectContext(projectId: string) {
  return prisma.project.findUnique({ where: { id: projectId }, select: { id: true, organizationId: true } });
}

export async function GET(_request: Request, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const policy = await prisma.projectPayrollPolicy.findUnique({ where: { projectId: params.projectId } });
    return json({ policy: serializePayrollPolicy(policy, params.projectId) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Payroll policy request failed" }, 500);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await projectContext(params.projectId);
    if (!project) return json({ error: "Project not found" }, 404);
    const data = payrollPolicySchema.parse(await request.json().catch(() => ({})));
    const before = await prisma.projectPayrollPolicy.findUnique({ where: { projectId: params.projectId } });
    const policy = await prisma.$transaction(async (tx) => {
      const saved = await tx.projectPayrollPolicy.upsert({
        where: { projectId: params.projectId },
        update: {
          insuranceContributionRate: new Prisma.Decimal(data.insuranceContributionRate),
          accidentContributionRate: new Prisma.Decimal(data.accidentContributionRate),
          personalIncomeTaxRate: new Prisma.Decimal(data.personalIncomeTaxRate),
          workingHoursPerMonth: new Prisma.Decimal(data.workingHoursPerMonth),
          sourceYear: data.sourceYear,
          notes: data.notes || null
        },
        create: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          insuranceContributionRate: new Prisma.Decimal(data.insuranceContributionRate),
          accidentContributionRate: new Prisma.Decimal(data.accidentContributionRate),
          personalIncomeTaxRate: new Prisma.Decimal(data.personalIncomeTaxRate),
          workingHoursPerMonth: new Prisma.Decimal(data.workingHoursPerMonth),
          sourceYear: data.sourceYear,
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "local-user",
        actorEmail: user?.email ?? null,
        entity: "project_payroll_policy",
        entityId: saved.id,
        action: before ? "update" : "create",
        summary: "Обновлена плановая политика ФОТ и начислений",
        before: before ? serializePayrollPolicy(before, params.projectId) : null,
        after: serializePayrollPolicy(saved, params.projectId)
      });
      return saved;
    });
    return json({ policy: serializePayrollPolicy(policy, params.projectId) });
  } catch (error) {
    if (error instanceof z.ZodError) return json({ error: "Invalid payroll policy", issues: error.issues }, 400);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    return json({ error: "Payroll policy update failed" }, 500);
  }
}
