import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  grossSalaryFromRegisterRow,
  normalizeWorkforceIdentity,
  parseWorkforceRegister,
  type WorkforceRegisterRow
} from "@/lib/excel/workforce-register-import";
import { prisma } from "@/lib/prisma";
import { DEFAULT_PAYROLL_POLICY, serializePayrollPolicy } from "@/lib/workforce-capacity";

export const runtime = "nodejs";

const MAX_WORKFORCE_FILE_BYTES = 15 * 1024 * 1024;
const selectionSchema = z.array(z.string().min(3).max(240)).max(500);

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

function workbookError(file: File) {
  if (!/\.(xlsx|xls)$/i.test(file.name)) return "Загрузите Excel-файл .xlsx или .xls.";
  if (file.size > MAX_WORKFORCE_FILE_BYTES) return "Реестр сотрудников не должен превышать 15 МБ.";
  return null;
}

function identity(row: Pick<WorkforceRegisterRow, "name" | "profession">) {
  return `${normalizeWorkforceIdentity(row.name)}:${normalizeWorkforceIdentity(row.profession)}`;
}

function sourceNote(fileName: string, row: WorkforceRegisterRow) {
  return [`Импорт реестра: ${fileName} · ${row.sheetName}, строка ${row.sourceRow}`, row.notes].filter(Boolean).join(". ").slice(0, 2000);
}

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "import"))) return json({ error: "Forbidden" }, 403);

  try {
    const form = await request.formData();
    const file = form.get("file");
    const action = String(form.get("action") || "preview");
    if (!(file instanceof File)) return json({ error: "Excel file is required" }, 400);
    const validationError = workbookError(file);
    if (validationError) return json({ error: validationError }, 400);
    if (action !== "preview" && action !== "commit") return json({ error: "Unknown import action" }, 400);

    const project = await prisma.project.findUnique({
      where: { id: params.projectId },
      select: { id: true, organizationId: true, startsAt: true, endsAt: true }
    });
    if (!project) return json({ error: "Project not found" }, 404);

    const preview = parseWorkforceRegister(Buffer.from(await file.arrayBuffer()), file.name);
    if (!preview.rows.length) return json({ error: preview.warnings[0] ?? "Сотрудники не найдены", preview }, 400);

    const existing = await prisma.organizationResource.findMany({
      where: { organizationId: project.organizationId, kind: { in: ["worker", "engineer", "crew"] } },
      select: {
        id: true,
        name: true,
        profession: true,
        assignments: { where: { projectId: params.projectId }, select: { id: true } }
      }
    });
    const existingByIdentity = new Map(existing.map((item) => [identity({ name: item.name, profession: item.profession ?? "" }), item]));
    const enrichedRows = preview.rows.map((row) => {
      const match = existingByIdentity.get(identity(row));
      return {
        ...row,
        existingStatus: match?.assignments.length ? "assigned" as const : match ? "organization" as const : "new" as const
      };
    });

    if (action === "preview") {
      return json({
        preview: { ...preview, rows: enrichedRows },
        summary: {
          found: enrichedRows.length,
          new: enrichedRows.filter((row) => row.existingStatus === "new" && !row.duplicateInFile).length,
          organization: enrichedRows.filter((row) => row.existingStatus === "organization").length,
          assigned: enrichedRows.filter((row) => row.existingStatus === "assigned").length,
          duplicates: enrichedRows.filter((row) => row.duplicateInFile).length
        }
      });
    }

    const selectedResult = selectionSchema.safeParse(JSON.parse(String(form.get("selectedKeys") || "[]")));
    if (!selectedResult.success) return json({ error: "Invalid employee selection" }, 400);
    const selectedSet = new Set(selectedResult.data);
    const selectedRows = enrichedRows.filter((row) => selectedSet.has(row.key) && !row.duplicateInFile);
    if (!selectedRows.length) return json({ error: "Выберите хотя бы одного сотрудника без дублей." }, 400);

    const policyRecord = await prisma.projectPayrollPolicy.findUnique({ where: { projectId: params.projectId } });
    const policy = serializePayrollPolicy(policyRecord, params.projectId);
    const createdBy = user?.authenticated ? user.id : null;
    const actorName = user?.name ?? "PGS user";
    const result = await prisma.$transaction(async (tx) => {
      let created = 0;
      let assigned = 0;
      let skipped = 0;
      const processed = new Set<string>();

      for (const row of selectedRows) {
        const rowIdentity = identity(row);
        if (processed.has(rowIdentity)) {
          skipped += 1;
          continue;
        }
        processed.add(rowIdentity);

        const known = existingByIdentity.get(rowIdentity);
        if (known?.assignments.length) {
          skipped += 1;
          continue;
        }

        let resourceId = known?.id;
        if (!resourceId) {
          const grossMonthlySalary = grossSalaryFromRegisterRow(row, policy);
          const employerMonthlyCost = row.employerMonthlyCost || grossMonthlySalary * (1 + (policy.insuranceContributionRate + policy.accidentContributionRate) / 100);
          const resource = await tx.organizationResource.create({
            data: {
              organizationId: project.organizationId,
              kind: row.kind,
              name: row.name,
              profession: row.profession,
              employmentType: row.employmentType,
              headcount: 1,
              capacityHoursPerMonth: new Prisma.Decimal(policy.workingHoursPerMonth || DEFAULT_PAYROLL_POLICY.workingHoursPerMonth),
              productivityNorm: new Prisma.Decimal(0),
              monthlyCost: new Prisma.Decimal(Math.round(employerMonthlyCost * 100) / 100),
              grossMonthlySalary: new Prisma.Decimal(grossMonthlySalary),
              hourlyCost: new Prisma.Decimal(policy.workingHoursPerMonth ? employerMonthlyCost / policy.workingHoursPerMonth : 0),
              certifications: [],
              status: "active",
              notes: sourceNote(file.name, row),
              createdBy
            }
          });
          resourceId = resource.id;
          created += 1;
        }

        await tx.projectResourceAssignment.create({
          data: {
            organizationId: project.organizationId,
            projectId: params.projectId,
            resourceId,
            startsAt: project.startsAt,
            endsAt: project.endsAt,
            allocationPercent: 100,
            plannedHours: new Prisma.Decimal(policy.workingHoursPerMonth || DEFAULT_PAYROLL_POLICY.workingHoursPerMonth),
            plannedOutput: new Prisma.Decimal(0),
            status: "active",
            notes: `Назначен из Excel-реестра ${file.name}`,
            createdBy
          }
        });
        assigned += 1;
      }

      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: params.projectId,
        actorId: createdBy,
        actorName,
        actorEmail: user?.email ?? null,
        entity: "workforce_register_import",
        entityId: params.projectId,
        action: "create",
        summary: `Импортирован реестр сотрудников: создано ${created}, назначено ${assigned}, пропущено ${skipped}`,
        after: { parserVersion: preview.parserVersion, fileName: file.name, created, assigned, skipped }
      });
      return { created, assigned, skipped };
    });

    return json({ ok: true, result, parserVersion: preview.parserVersion }, 201);
  } catch (error) {
    if (error instanceof SyntaxError) return json({ error: "Invalid employee selection" }, 400);
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return json({ error: "Один из сотрудников уже назначен на проект. Обновите preview и повторите." }, 409);
    }
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Workforce register import failed" }, 500);
  }
}
