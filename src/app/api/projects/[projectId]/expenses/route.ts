import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { builtInExpenseCategoryOptions, customExpenseCategoryOption } from "@/lib/project-expense-config";
import { buildProjectExpenseSummary, projectExpenseCustomCategoryIds, projectExpenseInputSchema, serializeProjectExpense, type ProjectExpenseInput } from "@/lib/project-expenses";
import { prisma } from "@/lib/prisma";
import { deleteDocumentFile, hasPreviewMetadata, makeStorageKey, sanitizeFileName, saveDocumentFile, validateDocumentUpload } from "@/lib/storage/documents";

export const runtime = "nodejs";

const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
const expenseInclude = {
  costCode: { select: { id: true, code: true, name: true } },
  receiptDocument: { select: { id: true, title: true, fileName: true, mimeType: true } },
  items: { orderBy: { sequence: "asc" as const } }
};

type Params = { params: { projectId: string } };

function json(body: unknown, status = 200) {
  return NextResponse.json(body, { status });
}

async function readInput(request: NextRequest) {
  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.includes("multipart/form-data")) {
    return { data: projectExpenseInputSchema.parse(await request.json().catch(() => null)), file: null as File | null };
  }
  const form = await request.formData();
  const rawPayload = String(form.get("payload") ?? "");
  const file = form.get("file");
  return {
    data: projectExpenseInputSchema.parse({ ...JSON.parse(rawPayload), source: "receipt" }),
    file: file instanceof File ? file : null
  };
}

function fileValidation(file: File) {
  if (!RECEIPT_TYPES.has(file.type)) return "Чек должен быть PDF, JPEG, PNG или WebP.";
  if (file.size > MAX_RECEIPT_BYTES) return "Файл чека должен быть не больше 10 МБ.";
  return validateDocumentUpload(sanitizeFileName(file.name), file.type, file.size);
}

async function validateCostCode(projectId: string, costCodeId: string | null | undefined) {
  if (!costCodeId) return true;
  return Boolean(await prisma.projectCostCode.findFirst({ where: { id: costCodeId, projectId, status: "active" }, select: { id: true } }));
}

async function validateExpenseCategories(projectId: string, data: Pick<ProjectExpenseInput, "category" | "items">) {
  const ids = projectExpenseCustomCategoryIds(data);
  if (!ids.length) return true;
  const count = await prisma.projectExpenseCategory.count({ where: { projectId, id: { in: ids } } });
  return count === ids.length;
}

export async function GET(_request: Request, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "view"))) return json({ error: "Forbidden" }, 403);
  try {
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true } });
    if (!project) return json({ error: "Project not found" }, 404);
    const [items, costCodes, customCategories] = await Promise.all([
      prisma.projectExpense.findMany({ where: { projectId: params.projectId }, include: expenseInclude, orderBy: [{ expenseDate: "desc" }, { sequence: "desc" }] }),
      prisma.projectCostCode.findMany({ where: { projectId: params.projectId, status: "active" }, select: { id: true, code: true, name: true }, orderBy: [{ sortOrder: "asc" }, { code: "asc" }] }),
      prisma.projectExpenseCategory.findMany({ where: { projectId: params.projectId }, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { createdAt: "asc" }] })
    ]);
    const categories = [...builtInExpenseCategoryOptions, ...customCategories.map(customExpenseCategoryOption)];
    return json({ items: items.map(serializeProjectExpense), costCodes, categories, summary: buildProjectExpenseSummary(items, categories.map((category) => category.value)) });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    console.error(error);
    return json({ error: "Expense register request failed" }, 500);
  }
}

export async function POST(request: NextRequest, { params }: Params) {
  const user = await getCurrentUser();
  if (!(await canProject(user, params.projectId, "edit"))) return json({ error: "Forbidden" }, 403);
  let orphanedStorageKey: string | null = null;
  try {
    const { data, file } = await readInput(request);
    if (data.source === "receipt" && !file) return json({ error: "Файл чека обязателен" }, 400);
    if (file) {
      const validationError = fileValidation(file);
      if (validationError) return json({ error: validationError }, 400);
    }
    const project = await prisma.project.findUnique({ where: { id: params.projectId }, select: { id: true, organizationId: true } });
    if (!project) return json({ error: "Project not found" }, 404);
    if (!(await validateCostCode(params.projectId, data.costCodeId))) return json({ error: "Код затрат не принадлежит проекту" }, 409);
    if (!(await validateExpenseCategories(params.projectId, data))) return json({ error: "Статья расходов не принадлежит проекту" }, 409);

    let stored: { key: string; name: string; mimeType: string; size: number } | null = null;
    if (file) {
      const name = sanitizeFileName(file.name);
      const key = makeStorageKey(params.projectId, name);
      orphanedStorageKey = key;
      await saveDocumentFile(key, Buffer.from(await file.arrayBuffer()));
      stored = { key, name, mimeType: file.type, size: file.size };
    }

    const created = await prisma.$transaction(async (tx) => {
      const latest = await tx.projectExpense.findFirst({ where: { projectId: params.projectId }, orderBy: { sequence: "desc" }, select: { sequence: true } });
      let documentId: string | null = null;
      if (stored) {
        const document = await tx.document.create({ data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          category: "чек / расход",
          title: `Чек: ${data.merchant}`,
          filePath: stored.key,
          fileName: stored.name,
          mimeType: stored.mimeType,
          sizeBytes: stored.size,
          storageKey: stored.key,
          author: user?.name ?? "PGS user",
          createdBy: user?.authenticated ? user.id : null
        } });
        await tx.documentVersion.create({ data: {
          documentId: document.id,
          versionNumber: 1,
          fileName: stored.name,
          mimeType: stored.mimeType,
          sizeBytes: stored.size,
          storageKey: stored.key,
          uploadedById: user?.authenticated ? user.id : null,
          uploadedByName: user?.name ?? "PGS user",
          previewAvailable: hasPreviewMetadata(stored.mimeType)
        } });
        documentId = document.id;
        await writeAudit(tx, {
          organizationId: project.organizationId, projectId: params.projectId,
          actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "PGS user", actorEmail: user?.email ?? null,
          entity: "document", entityId: document.id, action: "create", summary: `Загружен чек расхода: ${stored.name}`,
          after: { id: document.id, fileName: stored.name, mimeType: stored.mimeType, sizeBytes: stored.size, category: "чек / расход" }
        });
      }
      const expense = await tx.projectExpense.create({
        data: {
          organizationId: project.organizationId,
          projectId: params.projectId,
          costCodeId: data.costCodeId || null,
          receiptDocumentId: documentId,
          sequence: (latest?.sequence ?? 0) + 1,
          expenseDate: new Date(`${data.expenseDate}T12:00:00.000Z`),
          merchant: data.merchant,
          documentNumber: data.documentNumber || null,
          category: data.category,
          paymentMethod: data.paymentMethod,
          currency: data.currency,
          grossAmount: data.grossAmount,
          taxAmount: data.taxAmount,
          source: stored ? "receipt" : "manual",
          recognitionStatus: stored ? data.recognitionStatus : "not_applicable",
          recognitionConfidence: stored ? data.recognitionConfidence : null,
          notes: data.notes || null,
          createdBy: user?.authenticated ? user.id : null,
          items: { create: data.items.map((line, index) => ({ ...line, sequence: index + 1 })) }
        },
        include: expenseInclude
      });
      await writeAudit(tx, {
        organizationId: project.organizationId, projectId: params.projectId,
        actorId: user?.authenticated ? user.id : null, actorName: user?.name ?? "PGS user", actorEmail: user?.email ?? null,
        entity: "project_expense", entityId: expense.id, action: "create",
        summary: `Добавлен расход №${expense.sequence}: ${expense.merchant}`,
        after: { sequence: expense.sequence, merchant: expense.merchant, category: expense.category, grossAmount: Number(expense.grossAmount), source: expense.source, itemCount: expense.items.length, hasReceipt: Boolean(documentId) }
      });
      return expense;
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    orphanedStorageKey = null;
    return json({ item: serializeProjectExpense(created) }, 201);
  } catch (error) {
    if (orphanedStorageKey) await deleteDocumentFile(orphanedStorageKey).catch(() => undefined);
    if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2002", "P2034"].includes(error.code)) return json({ error: "Реестр изменился параллельно; повторите сохранение" }, 409);
    if (error instanceof Prisma.PrismaClientInitializationError) return json({ error: "Database is not available" }, 503);
    if (error instanceof SyntaxError || (error instanceof Error && error.name === "ZodError")) return json({ error: "Проверьте поля расхода" }, 400);
    console.error(error);
    return json({ error: "Не удалось сохранить расход" }, 500);
  }
}
