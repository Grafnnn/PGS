import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { askProjectAssistant, buildProjectContext, localAiFallback } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { canDeleteDocument, canDeleteProject, canEditProject, canViewAudit, canViewProject, type AppUser } from "@/lib/auth/permissions";
import { canProject, type ProjectAction } from "@/lib/auth/project-permissions";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { demoState } from "@/lib/demo-data";
import { getDemoContext, getProjectBundleFromDb, listProjectsFromDb } from "@/lib/project-data";
import { deleteProjectWithConfirmation, ProjectDeleteError } from "@/lib/project-delete";
import { prisma } from "@/lib/prisma";
import {
  serializeBudgetItem,
  serializeAuditLog,
  serializeDailyReport,
  serializeDocument,
  serializeMaterial,
  serializePayment,
  serializeProcurementRequest,
  serializeProject,
  serializeRisk,
  serializeScheduleItem
} from "@/lib/serializers";
import {
  budgetItemSchema,
  dailyReportSchema,
  documentSchema,
  materialSchema,
  partial,
  paymentSchema,
  procurementRequestSchema,
  projectSchema,
  riskSchema,
  scheduleItemSchema
} from "@/lib/validation";

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });
const pathOf = (params: { path?: string[] }) => params.path ?? [];

export async function GET(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = pathOf(params);

  try {
    if (path.join("/") === "auth/me") {
      const user = await getCurrentUser();
      if (!user) return json({ user: null, organization: null }, 401);
      return json({ user, organization: { id: "org-demo", name: "Демо Строй" } });
    }

    if (path[0] === "projects" && path.length === 1) {
      const user = await getCurrentUser();
      if (!canViewProject(user)) return json({ error: "Forbidden" }, 403);
      return json({ projects: await listProjectsFromDb(user) });
    }

    if (path[0] === "projects" && path[1]) {
      const user = await getCurrentUser();
      const projectId = path[1];
      const resource = path[2];
      if (!user) return json({ error: "Forbidden" }, 403);
      if (resource === "ai" && path[3] === "summary" && !(await projectExists(projectId))) return json({ error: "Project not found" }, 404);
      if (!(await canProject(user, projectId, "view"))) return json({ error: "Forbidden" }, 403);

      if (!resource) {
        const bundle = await getProjectBundleFromDb(projectId);
        if (!bundle) return json({ error: "Project not found" }, 404);

        const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
        const works = workTotals(bundle.scheduleItems);
        const materials = materialTotals(bundle.materials);
        const finance = financeTotals(bundle.payments);
        const autoRisks = deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments);
        return json({ ...bundle, calculations: { budget, works, materials, finance, autoRisks } });
      }

      if (resource === "budget") {
        const items = await prisma.budgetItem.findMany({ where: { projectId }, orderBy: [{ section: "asc" }, { code: "asc" }] });
        return json({ items: items.map(serializeBudgetItem) });
      }
      if (resource === "schedule") {
        const items = await prisma.scheduleItem.findMany({ where: { projectId }, orderBy: { startsAt: "asc" } });
        return json({ items: items.map(serializeScheduleItem) });
      }
      if (resource === "materials") {
        const items = await prisma.material.findMany({ where: { projectId }, orderBy: { neededAt: "asc" } });
        return json({ items: items.map(serializeMaterial) });
      }
      if (resource === "procurement") {
        const items = await prisma.procurementRequest.findMany({ where: { projectId }, include: { items: true }, orderBy: { neededAt: "asc" } });
        return json({ items: items.map(serializeProcurementRequest) });
      }
      if (resource === "finance") {
        const payments = await prisma.payment.findMany({ where: { projectId }, orderBy: { plannedAt: "asc" } });
        const serialized = payments.map(serializePayment);
        return json({ payments: serialized, totals: financeTotals(serialized) });
      }
      if (resource === "documents") {
        const items = await prisma.document.findMany({ where: { projectId }, orderBy: { createdAt: "desc" } });
        return json({ items: items.map(serializeDocument) });
      }
      if (resource === "daily-reports") {
        const items = await prisma.dailyReport.findMany({ where: { projectId }, orderBy: { date: "desc" } });
        return json({ items: items.map(serializeDailyReport) });
      }
      if (resource === "risks") {
        const bundle = await getProjectBundleFromDb(projectId);
        if (!bundle) return json({ error: "Project not found" }, 404);
        return json({ items: [...bundle.risks, ...deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments)] });
      }
      if (resource === "ai" && path[3] === "summary") {
        return json(await buildProjectContext(projectId));
      }
      if (resource === "audit") {
        const user = await getCurrentUser();
        if (!canViewAudit(user) || !(await canProject(user, projectId, "view_audit"))) return json({ error: "Forbidden" }, 403);
        const search = request.nextUrl.searchParams;
        const limit = Math.min(Number(search.get("limit") ?? 50), 100);
        const entityType = search.get("entityType");
        const action = search.get("action");
        const from = search.get("from");
        const to = search.get("to");
        const items = await prisma.auditLog.findMany({
          where: {
            projectId,
            entity: entityType ?? undefined,
            action: action ?? undefined,
            createdAt:
              from || to
                ? {
                    gte: from ? new Date(from) : undefined,
                    lte: to ? new Date(to) : undefined
                  }
                : undefined
          },
          orderBy: { createdAt: "desc" },
          take: limit
        });
        return json({ items: items.map(serializeAuditLog) });
      }
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

export async function POST(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = pathOf(params);
  let parsedBody: unknown;
  const readBody = async () => {
    if (parsedBody === undefined) parsedBody = await request.json().catch(() => ({}));
    return parsedBody;
  };

  try {
    if (path.join("/") === "auth/register") {
      return json({ error: "Registration is disabled. Use FIRST_ADMIN_* bootstrap through prisma seed." }, 410);
    }

    if (path.join("/") === "auth/login") {
      return json({ error: "Use POST /api/auth/login route." }, 400);
    }

    if (path.join("/") === "auth/logout") {
      return json({ ok: true });
    }

    if (path[0] === "projects" && path.length === 1) {
      const user = await getCurrentUser();
      if (!canEditProject(user)) return json({ error: "Forbidden" }, 403);
      const body = await readBody();
      const data = projectSchema.parse(body);
      const { organizationId } = await getDemoContext();
      const project = await prisma.project.create({
        data: {
          organizationId,
          ...data,
          contractAmount: new Prisma.Decimal(data.contractAmount)
        }
      });
      return json({ project: serializeProject(project) }, 201);
    }

    if (path[0] === "projects" && path[1]) {
      const projectId = path[1];
      const resource = path[2];

      if (resource === "ai" && ["chat", "summary", "analyze-budget", "analyze-contract", "procurement-suggestion", "risk-review"].includes(path[3] ?? "")) {
        const user = await getCurrentUser();
        if (!user) return json({ error: "Forbidden" }, 403);
        if (!(await projectExists(projectId))) return json({ error: "Project not found" }, 404);
        if (!(await canProject(user, projectId, "view"))) return json({ error: "Forbidden" }, 403);
        const body = await readBody() as Record<string, unknown>;
        const prompt = String(body.prompt ?? body.question ?? promptByAiEndpoint(path[3]));
        const result = path[3] === "chat" ? await askProjectAssistant(projectId, prompt) : { ok: true, status: 200, response: localAiFallback(prompt, projectId) };
        return json({ response: result.response, ok: result.ok, error: "error" in result ? result.error : undefined }, result.status);
      }

      if (resource === "budget" && path[3] === "import") {
        const user = await getCurrentUser();
        if (!(await canProject(user, projectId, "import"))) return json({ error: "Forbidden" }, 403);
        return json({
          imported: false,
          recommendations: [
            "Excel/CSV pipeline planned for v0.3.",
            "v0.2 now has real BudgetItem persistence, so parsed rows can be saved through POST /api/projects/:id/budget."
          ]
        });
      }

      return await createProjectResource(projectId, resource, await readBody());
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = pathOf(params);
  const body = await request.json().catch(() => ({}));

  try {
    if (path[0] === "projects" && path[1] && path.length === 2) {
      const user = await getCurrentUser();
      if (!(await canProject(user, path[1], "edit"))) return json({ error: "Forbidden" }, 403);
      const data = partial(projectSchema).parse(body);
      const project = await prisma.project.update({
        where: { id: path[1] },
        data: {
          ...data,
          contractAmount: data.contractAmount === undefined ? undefined : new Prisma.Decimal(data.contractAmount)
        }
      });
      return json({ project: serializeProject(project) });
    }

    const direct = directResource(path);
    if (direct) return await updateResource(direct.resource, direct.id, body);

    if (path[0] === "projects" && path[1] && path[2] && path[3]) {
      return await updateResource(path[2], path[3], body);
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

export async function DELETE(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = pathOf(params);

  try {
    if (path[0] === "projects" && path[1] && path.length === 2) {
      const user = await getCurrentUser();
      if (!user) return json({ error: "Unauthorized" }, 401);
      if (!(await canProject(user, path[1], "delete"))) return json({ error: "Forbidden" }, 403);
      const body = await request.json().catch(() => ({}));
      return json(await deleteProjectWithConfirmation({ projectId: path[1], actor: user, confirmation: body }));
    }

    const direct = directResource(path);
    if (direct) return await deleteResource(direct.resource, direct.id);

    if (path[0] === "projects" && path[1] && path[2] && path[3]) {
      return await deleteResource(path[2], path[3]);
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

async function createProjectResource(projectId: string, resource: string | undefined, body: unknown) {
  const user = await getCurrentUser();
  const action: ProjectAction = resource === "documents" ? "upload_document" : "edit";
  if (!(await canProject(user, projectId, action))) return json({ error: "Forbidden" }, 403);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) return json({ error: "Project not found" }, 404);
  const { userId: demoUserId } = await getDemoContext();
  const userId = user?.authenticated ? user.id : demoUserId;
  const actor = auditActor(user);

  if (resource === "budget") {
    const data = budgetItemSchema.parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.budgetItem.create({
        data: {
          ...data,
          organizationId: project.organizationId,
          projectId,
          createdBy: userId,
          actualUnitPrice: new Prisma.Decimal(data.actualUnitPrice ?? data.plannedUnitPrice),
          forecastUnitPrice: new Prisma.Decimal(data.forecastUnitPrice ?? data.plannedUnitPrice),
          plannedUnitPrice: new Prisma.Decimal(data.plannedUnitPrice),
          qty: new Prisma.Decimal(data.qty)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "budget_item",
        entityId: created.id,
        action: "create",
        summary: `Добавлена позиция ВОР: ${created.name}`,
        after: serializeBudgetItem(created)
      });
      return created;
    });
    return json({ item: serializeBudgetItem(item) }, 201);
  }

  if (resource === "schedule") {
    const data = scheduleItemSchema.parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.scheduleItem.create({
        data: {
          ...data,
          organizationId: project.organizationId,
          projectId,
          createdBy: userId,
          plannedQty: new Prisma.Decimal(data.plannedQty),
          actualQty: new Prisma.Decimal(data.actualQty)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "schedule_item",
        entityId: created.id,
        action: "create",
        summary: `Добавлена работа графика: ${created.name}`,
        after: serializeScheduleItem(created)
      });
      return created;
    });
    return json({ item: serializeScheduleItem(item) }, 201);
  }

  if (resource === "materials") {
    const data = materialSchema.parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.material.create({
        data: decimalMaterialData({ ...data, organizationId: project.organizationId, projectId, createdBy: userId })
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "material",
        entityId: created.id,
        action: "create",
        summary: `Добавлен материал: ${created.name}`,
        after: serializeMaterial(created)
      });
      return created;
    });
    return json({ item: serializeMaterial(item) }, 201);
  }

  if (resource === "procurement") {
    const data = procurementRequestSchema.parse(body);
    const item = await prisma.procurementRequest.create({
      data: {
        organizationId: project.organizationId,
        projectId,
        title: data.title,
        initiator: data.initiator,
        neededAt: data.neededAt,
        priority: data.priority,
        status: data.status,
        createdBy: userId,
        items: {
          create: data.items.map((requestItem) => ({
            materialId: requestItem.materialId,
            name: requestItem.name,
            qty: new Prisma.Decimal(requestItem.qty),
            unit: requestItem.unit,
            comment: requestItem.comment
          }))
        }
      },
      include: { items: true }
    });
    return json({ item: serializeProcurementRequest(item) }, 201);
  }

  if (resource === "finance" || resource === "payments") {
    const data = paymentSchema.parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.payment.create({
        data: {
          ...data,
          organizationId: project.organizationId,
          projectId,
          createdBy: userId,
          amount: new Prisma.Decimal(data.amount)
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "payment",
        entityId: created.id,
        action: "create",
        summary: `Добавлен платеж: ${created.title}`,
        after: serializePayment(created)
      });
      return created;
    });
    return json({ item: serializePayment(item) }, 201);
  }

  if (resource === "daily-reports") {
    const data = dailyReportSchema.parse(body);
    const item = await prisma.dailyReport.create({
      data: { ...data, organizationId: project.organizationId, projectId, createdBy: userId }
    });
    return json({ item: serializeDailyReport(item) }, 201);
  }

  if (resource === "risks") {
    const data = riskSchema.parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.risk.create({
        data: { ...data, organizationId: project.organizationId, projectId, createdBy: userId }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "risk",
        entityId: created.id,
        action: "create",
        summary: `Добавлен риск: ${created.title}`,
        after: serializeRisk(created)
      });
      return created;
    });
    return json({ item: serializeRisk(item) }, 201);
  }

  if (resource === "documents") {
    const data = documentSchema.parse(body);
    const item = await prisma.document.create({
      data: { ...data, organizationId: project.organizationId, projectId, createdBy: userId }
    });
    return json({ item: serializeDocument(item) }, 201);
  }

  return json({ error: "Endpoint not found", resource }, 404);
}

async function updateResource(resource: string, id: string, body: unknown) {
  const user = await getCurrentUser();
  const scopedProjectId = await projectIdForResource(resource, id);
  if (scopedProjectId ? !(await canProject(user, scopedProjectId, "edit")) : !canEditProject(user)) return json({ error: "Forbidden" }, 403);
  if (resource === "budget") {
    const data = partial(budgetItemSchema).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.budgetItem.findUniqueOrThrow({ where: { id } });
      const updated = await tx.budgetItem.update({ where: { id }, data: budgetUpdateData(data) });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "budget_item",
        entityId: id,
        action: "update",
        summary: `Обновлена позиция ВОР: ${updated.name}`,
        before: serializeBudgetItem(before),
        after: serializeBudgetItem(updated)
      });
      return updated;
    });
    return json({ item: serializeBudgetItem(item) });
  }
  if (resource === "schedule") {
    const data = partial(scheduleItemSchema).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.scheduleItem.findUniqueOrThrow({ where: { id } });
      const updated = await tx.scheduleItem.update({ where: { id }, data: scheduleUpdateData(data) });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "schedule_item",
        entityId: id,
        action: "update",
        summary: `Обновлена работа графика: ${updated.name}`,
        before: serializeScheduleItem(before),
        after: serializeScheduleItem(updated)
      });
      return updated;
    });
    return json({ item: serializeScheduleItem(item) });
  }
  if (resource === "materials") {
    const data = partial(materialSchema).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.material.findUniqueOrThrow({ where: { id } });
      const updated = await tx.material.update({ where: { id }, data: materialUpdateData(data) });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "material",
        entityId: id,
        action: "update",
        summary: `Обновлен материал: ${updated.name}`,
        before: serializeMaterial(before),
        after: serializeMaterial(updated)
      });
      return updated;
    });
    return json({ item: serializeMaterial(item) });
  }
  if (resource === "procurement") {
    const data = partial(procurementRequestSchema.omit({ items: true })).parse(body);
    const item = await prisma.procurementRequest.update({ where: { id }, data, include: { items: true } });
    return json({ item: serializeProcurementRequest(item) });
  }
  if (resource === "finance" || resource === "payments") {
    const data = partial(paymentSchema).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.payment.findUniqueOrThrow({ where: { id } });
      const updated = await tx.payment.update({ where: { id }, data: paymentUpdateData(data) });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "payment",
        entityId: id,
        action: "update",
        summary: `Обновлен платеж: ${updated.title}`,
        before: serializePayment(before),
        after: serializePayment(updated)
      });
      return updated;
    });
    return json({ item: serializePayment(item) });
  }
  if (resource === "daily-reports") {
    const data = partial(dailyReportSchema).parse(body);
    const item = await prisma.dailyReport.update({ where: { id }, data });
    return json({ item: serializeDailyReport(item) });
  }
  if (resource === "risks") {
    const data = partial(riskSchema).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.risk.findUniqueOrThrow({ where: { id } });
      const updated = await tx.risk.update({ where: { id }, data });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "risk",
        entityId: id,
        action: "update",
        summary: `Обновлен риск: ${updated.title}`,
        before: serializeRisk(before),
        after: serializeRisk(updated)
      });
      return updated;
    });
    return json({ item: serializeRisk(item) });
  }
  if (resource === "documents") {
    const data = partial(documentSchema).parse(body);
    const item = await prisma.document.update({ where: { id }, data });
    return json({ item: serializeDocument(item) });
  }
  return json({ error: "Endpoint not found", resource }, 404);
}

async function deleteResource(resource: string, id: string) {
  const user = await getCurrentUser();
  const scopedProjectId = await projectIdForResource(resource, id);
  const deleteAction: ProjectAction = resource === "documents" ? "delete_document" : "delete";
  if (scopedProjectId ? !(await canProject(user, scopedProjectId, deleteAction)) : resource === "documents" ? !canDeleteDocument(user) : !canDeleteProject(user)) {
    return json({ error: "Forbidden" }, 403);
  }
  const actor = auditActor(user);
  if (resource === "budget") await deleteWithAudit("budget_item", id, "budgetItem", serializeBudgetItem, actor);
  else if (resource === "schedule") await deleteWithAudit("schedule_item", id, "scheduleItem", serializeScheduleItem, actor);
  else if (resource === "materials") await deleteWithAudit("material", id, "material", serializeMaterial, actor);
  else if (resource === "procurement") await prisma.procurementRequest.delete({ where: { id } });
  else if (resource === "finance" || resource === "payments") await deleteWithAudit("payment", id, "payment", serializePayment, actor);
  else if (resource === "daily-reports") await prisma.dailyReport.delete({ where: { id } });
  else if (resource === "risks") await deleteWithAudit("risk", id, "risk", serializeRisk, actor);
  else if (resource === "documents") await prisma.document.delete({ where: { id } });
  else return json({ error: "Endpoint not found", resource }, 404);
  return json({ ok: true, deletedId: id });
}

async function deleteWithAudit<T extends { organizationId: string; projectId: string }>(
  entity: string,
  id: string,
  model: "budgetItem" | "scheduleItem" | "material" | "payment" | "risk",
  serializer: (item: T) => unknown,
  actor: ReturnType<typeof auditActor>
) {
  await prisma.$transaction(async (tx) => {
    const delegate = tx[model] as unknown as {
      findUniqueOrThrow(args: { where: { id: string } }): Promise<T>;
      delete(args: { where: { id: string } }): Promise<T>;
    };
    const before = await delegate.findUniqueOrThrow({ where: { id } });
    await delegate.delete({ where: { id } });
    await writeAudit(tx, {
      organizationId: before.organizationId,
      projectId: before.projectId,
      ...actor,
      entity,
      entityId: id,
      action: "delete",
      summary: `Удалено: ${entity}`,
      before: serializer(before)
    });
  });
}

function directResource(path: string[]) {
  const aliases: Record<string, string> = {
    budget: "budget",
    schedule: "schedule",
    materials: "materials",
    procurement: "procurement",
    payments: "payments",
    finance: "finance",
    "daily-reports": "daily-reports",
    risks: "risks",
    documents: "documents"
  };
  if (path.length === 2 && aliases[path[0]]) return { resource: aliases[path[0]], id: path[1] };
  return null;
}

async function projectIdForResource(resource: string, id: string) {
  if (resource === "budget") return (await prisma.budgetItem.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "schedule") return (await prisma.scheduleItem.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "materials") return (await prisma.material.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "procurement") return (await prisma.procurementRequest.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "finance" || resource === "payments") return (await prisma.payment.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "daily-reports") return (await prisma.dailyReport.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "risks") return (await prisma.risk.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  if (resource === "documents") return (await prisma.document.findUnique({ where: { id }, select: { projectId: true } }))?.projectId ?? null;
  return null;
}

async function projectExists(projectId: string) {
  return Boolean(await prisma.project.findUnique({ where: { id: projectId }, select: { id: true } }));
}

function budgetUpdateData(data: Partial<ReturnType<typeof budgetItemSchema.parse>>) {
  return {
    ...data,
    qty: data.qty === undefined ? undefined : new Prisma.Decimal(data.qty),
    plannedUnitPrice: data.plannedUnitPrice === undefined ? undefined : new Prisma.Decimal(data.plannedUnitPrice),
    actualUnitPrice: data.actualUnitPrice === undefined ? undefined : new Prisma.Decimal(data.actualUnitPrice),
    forecastUnitPrice: data.forecastUnitPrice === undefined ? undefined : new Prisma.Decimal(data.forecastUnitPrice)
  };
}

function scheduleUpdateData(data: Partial<ReturnType<typeof scheduleItemSchema.parse>>) {
  return {
    ...data,
    plannedQty: data.plannedQty === undefined ? undefined : new Prisma.Decimal(data.plannedQty),
    actualQty: data.actualQty === undefined ? undefined : new Prisma.Decimal(data.actualQty)
  };
}

function decimalMaterialData<T extends Record<string, unknown>>(data: T) {
  return {
    ...data,
    requiredQty: new Prisma.Decimal(Number(data.requiredQty)),
    orderedQty: new Prisma.Decimal(Number(data.orderedQty)),
    deliveredQty: new Prisma.Decimal(Number(data.deliveredQty)),
    consumedQty: new Prisma.Decimal(Number(data.consumedQty)),
    plannedUnitPrice: new Prisma.Decimal(Number(data.plannedUnitPrice)),
    actualUnitPrice: new Prisma.Decimal(Number(data.actualUnitPrice))
  };
}

function materialUpdateData(data: Partial<ReturnType<typeof materialSchema.parse>>) {
  return {
    ...data,
    requiredQty: data.requiredQty === undefined ? undefined : new Prisma.Decimal(data.requiredQty),
    orderedQty: data.orderedQty === undefined ? undefined : new Prisma.Decimal(data.orderedQty),
    deliveredQty: data.deliveredQty === undefined ? undefined : new Prisma.Decimal(data.deliveredQty),
    consumedQty: data.consumedQty === undefined ? undefined : new Prisma.Decimal(data.consumedQty),
    plannedUnitPrice: data.plannedUnitPrice === undefined ? undefined : new Prisma.Decimal(data.plannedUnitPrice),
    actualUnitPrice: data.actualUnitPrice === undefined ? undefined : new Prisma.Decimal(data.actualUnitPrice)
  };
}

function paymentUpdateData(data: Partial<ReturnType<typeof paymentSchema.parse>>) {
  return {
    ...data,
    amount: data.amount === undefined ? undefined : new Prisma.Decimal(data.amount)
  };
}

function auditActor(user?: AppUser | null) {
  if (!user) return { actorName: "anonymous" };
  return {
    actorId: user.authenticated ? user.id : null,
    actorName: user.name,
    actorEmail: user.email
  };
}

function handleError(error: unknown) {
  if (error instanceof ProjectDeleteError) {
    return json({ error: error.message }, error.status);
  }
  if (error instanceof ZodError) {
    return json({ error: "Validation error", issues: error.issues }, 400);
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2025") {
    return json({ error: "Record not found" }, 404);
  }
  if (error instanceof Prisma.PrismaClientInitializationError) {
    return json({ error: "Database is not available. Start PostgreSQL and run prisma migrate/seed.", detail: error.message }, 503);
  }
  console.error(error);
  return json({ error: "Internal server error" }, 500);
}

function promptByAiEndpoint(endpoint?: string) {
  switch (endpoint) {
    case "summary":
      return "Сформируй отчет руководству по проекту.";
    case "analyze-budget":
      return "Проверь бюджет, маржинальность и перерасходы.";
    case "analyze-contract":
      return "Проанализируй договор и риски подрядчика.";
    case "procurement-suggestion":
      return "Сформируй предложения по заявкам снабжению.";
    case "risk-review":
      return "Найди ключевые риски и решения на ближайшую неделю.";
    default:
      return "Что сейчас самое важное по проекту?";
  }
}
