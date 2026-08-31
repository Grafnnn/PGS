import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { projectExpenseCustomCategoryIds, projectExpenseInputSchema, serializeProjectExpense } from "@/lib/project-expenses";
import { prisma } from "@/lib/prisma";

type Params = { params: { projectId: string; expenseId: string } };
const expenseInclude = {
  costCode: { select: { id: true, code: true, name: true } },
  receiptDocument: { select: { id: true, title: true, fileName: true, mimeType: true } },
  items: { orderBy: { sequence: "asc" as const } }
};

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function PATCH(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const data = projectExpenseInputSchema.parse(await request.json().catch(() => null));
    const before = await prisma.projectExpense.findFirst({ where: { id: params.expenseId, projectId: params.projectId }, include: expenseInclude });
    if (!before) return json({ error: "Expense not found" }, 404);
    if (data.costCodeId && !(await prisma.projectCostCode.findFirst({ where: { id: data.costCodeId, projectId: params.projectId, status: "active" }, select: { id: true } }))) {
      return json({ error: "Код затрат не принадлежит проекту" }, 409);
    }
    const customCategoryIds = projectExpenseCustomCategoryIds(data);
    if (customCategoryIds.length) {
      const count = await prisma.projectExpenseCategory.count({ where: { projectId: params.projectId, id: { in: customCategoryIds } } });
      if (count !== customCategoryIds.length) return json({ error: "Статья расходов не принадлежит проекту" }, 409);
    }
    const updated = await prisma.$transaction(async (tx) => {
      const item = await tx.projectExpense.update({
        where: { id: before.id },
        data: {
          expenseDate: new Date(`${data.expenseDate}T12:00:00.000Z`), merchant: data.merchant, documentNumber: data.documentNumber || null,
          category: data.category, paymentMethod: data.paymentMethod, currency: data.currency, grossAmount: data.grossAmount, taxAmount: data.taxAmount,
          costCodeId: data.costCodeId || null, notes: data.notes || null,
          recognitionStatus: before.source === "receipt" ? "edited" : "not_applicable",
          items: { deleteMany: {}, create: data.items.map((line, index) => ({ ...line, sequence: index + 1 })) }
        },
        include: expenseInclude
      });
      await writeAudit(tx, {
        organizationId: before.organizationId, projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "PGS user", actorEmail: user?.email ?? null,
        entity: "project_expense", entityId: before.id, action: "update", summary: `Обновлён расход №${before.sequence}: ${data.merchant}`,
        before: { merchant: before.merchant, category: before.category, grossAmount: Number(before.grossAmount), itemCount: before.items.length },
        after: { merchant: item.merchant, category: item.category, grossAmount: Number(item.grossAmount), itemCount: item.items.length }
      });
      return item;
    });
    return json({ item: serializeProjectExpense(updated) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    if (error instanceof Error && error.name === "ZodError") return json({ error: "Проверьте поля расхода" }, 400);
    console.error(error);
    return json({ error: "Не удалось обновить расход" }, 500);
  }
}

export async function DELETE(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "delete"))) return json({ error: "Forbidden" }, 403);
  try {
    const before = await prisma.projectExpense.findFirst({ where: { id: params.expenseId, projectId: params.projectId }, include: { items: true } });
    if (!before) return json({ error: "Expense not found" }, 404);
    await prisma.$transaction(async (tx) => {
      await tx.projectExpense.delete({ where: { id: before.id } });
      await writeAudit(tx, {
        organizationId: before.organizationId, projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "PGS user", actorEmail: user?.email ?? null,
        entity: "project_expense", entityId: before.id, action: "delete", summary: `Удалён расход №${before.sequence}: ${before.merchant}`,
        before: { merchant: before.merchant, category: before.category, grossAmount: Number(before.grossAmount), itemCount: before.items.length, receiptPreserved: Boolean(before.receiptDocumentId) }
      });
    });
    return json({ ok: true, receiptDocumentPreserved: Boolean(before.receiptDocumentId) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Не удалось удалить расход" }, 500);
  }
}
