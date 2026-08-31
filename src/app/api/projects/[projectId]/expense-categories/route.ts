import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { z } from "zod";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import {
  customExpenseCategoryOption,
  expenseCategoryLabels,
  normalizeExpenseCategoryName
} from "@/lib/project-expense-config";
import { prisma } from "@/lib/prisma";

const inputSchema = z.object({ name: z.string().trim().min(2).max(80) });
const systemNames = new Set(Object.values(expenseCategoryLabels).map(normalizeExpenseCategoryName));
type Params = { params: { projectId: string } };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return json({ error: "Project not found" }, 404);
    const categories = await prisma.projectExpenseCategory.findMany({
      where: { projectId: params.projectId },
      select: { id: true, name: true },
      orderBy: [{ name: "asc" }, { createdAt: "asc" }]
    });
    return json({ items: categories.map(customExpenseCategoryOption) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Не удалось загрузить статьи расходов" }, 500);
  }
}

export async function POST(request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  try {
    const data = inputSchema.parse(await request.json().catch(() => null));
    const normalizedName = normalizeExpenseCategoryName(data.name);
    if (systemNames.has(normalizedName)) return json({ error: "Такая системная статья уже существует" }, 409);
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, organizationId: true } });
    if (!project) return json({ error: "Project not found" }, 404);
    const category = await prisma.$transaction(async (tx) => {
      const created = await tx.projectExpenseCategory.create({ data: {
        organizationId: project.organizationId,
        projectId: project.id,
        name: data.name,
        normalizedName,
        createdBy: user?.authenticated ? user.id : null
      } });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId: project.id,
        actorId: user?.authenticated ? user.id : null,
        actorName: user?.name ?? "PGS user",
        actorEmail: user?.email ?? null,
        entity: "project_expense_category",
        entityId: created.id,
        action: "create",
        summary: `Добавлена статья расходов: ${created.name}`,
        after: { id: created.id, name: created.name }
      });
      return created;
    });
    return json({ item: customExpenseCategoryOption(category) }, 201);
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return json({ error: "Такая статья уже существует" }, 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    if (error instanceof Error && error.name === "ZodError") return json({ error: "Название статьи должно содержать от 2 до 80 символов" }, 400);
    console.error(error);
    return json({ error: "Не удалось добавить статью расходов" }, 500);
  }
}
