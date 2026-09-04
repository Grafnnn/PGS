import { NextRequest, NextResponse } from "next/server";
import { Prisma, type DailyReport as DbDailyReport, type ScheduleItem as DbScheduleItem } from "@prisma/client";
import { ZodError } from "zod";
import { askProjectAssistant, buildProjectContext, localAiFallback } from "@/lib/ai";
import { writeAudit } from "@/lib/audit";
import { getCurrentUser } from "@/lib/auth/session";
import { canEditProject, canViewAudit, canViewProject, type AppUser } from "@/lib/auth/permissions";
import { canProject, getEffectiveProjectRole, type ProjectAction } from "@/lib/auth/project-permissions";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import {
  canTransitionDailyReport,
  dailyReportDraftIssues,
  dailyReportSubmissionIssues,
  normalizeDailyReportFields
} from "@/lib/daily-reports";
import { buildDailyReportCrewMembers, dailyReportCrewCounts, parseDailyReportCrewMembers } from "@/lib/daily-report-crew";
import { applyDailyReportCrewAssignments, dailyReportCrewAssignmentIssues, normalizeDailyReportWorkOutputUnit, parseDailyReportWorkOutputs } from "@/lib/daily-report-work-outputs";
import { dailyReportProgressDeltas, scheduleStatusForActual } from "@/lib/daily-report-progress";
import { buildDailyReportScheduleUnits } from "@/lib/daily-report-work-units";
import { prepareScheduleRevision } from "@/lib/excel/import-commit-integrity";
import { dailyReportWorkScopeSummary, parseDailyReportWorkScopes } from "@/lib/daily-report-work-scopes";
import { demoState } from "@/lib/demo-data";
import { getDemoContext, getProjectBundleFromDb, getUserOrganizationContext, listProjectsFromDb } from "@/lib/project-data";
import { deleteProjectWithConfirmation, ProjectDeleteError } from "@/lib/project-delete";
import { prisma } from "@/lib/prisma";
import { checkRateLimit } from "@/lib/rate-limit";
import { deleteDocumentFile } from "@/lib/storage/documents";
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
      const projectId = request.nextUrl.searchParams.get("projectId");
      if (projectId) {
        if (!user.authenticated) {
          const project = demoState.projects.find((item) => item.id === projectId);
          if (!project) return json({ error: "Forbidden" }, 403);
          return json({ user, organization: { id: project.organizationId, name: "Локальная организация" } });
        }
        const [role, project] = await Promise.all([
          getEffectiveProjectRole(user, projectId),
          prisma.project.findUnique({
            where: { id: projectId },
            select: { organization: { select: { id: true, name: true } } }
          })
        ]);
        if (!role || !project) return json({ error: "Forbidden" }, 403);
        return json({ user: { ...user, role }, organization: project.organization });
      }
      const context = await getUserOrganizationContext(user);
      return json({ user, organization: context ? { id: context.organizationId, name: context.organizationName } : null });
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
        const items = await prisma.scheduleItem.findMany({ where: { projectId, isCurrent: true }, orderBy: { startsAt: "asc" } });
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
        const [items, currentSchedule] = await Promise.all([
          prisma.dailyReport.findMany({
            where: { projectId },
            include: {
              evidenceDocuments: { orderBy: { uploadedAt: "asc" } },
              progressEntries: { orderBy: { createdAt: "asc" } }
            },
            orderBy: [{ date: "desc" }, { createdAt: "desc" }]
          }),
          prisma.scheduleItem.findMany({ where: { projectId, isCurrent: true }, select: { id: true } })
        ]);
        const currentScheduleIds = new Set(currentSchedule.map((item) => item.id));
        return json({ items: items.map((item) => serializeDailyReport(item, currentScheduleIds)) });
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
      const context = await getUserOrganizationContext(user);
      if (!context) return json({ error: "Пользователь не состоит ни в одной организации." }, 403);
      const { contractAmount, vatPercent, selectedModules, ...projectData } = data;
      const project = await prisma.$transaction(async (tx) => {
        const created = await tx.project.create({
          data: {
            organizationId: context.organizationId,
            ...projectData,
            contractAmount: new Prisma.Decimal(contractAmount),
            vatPercent: vatPercent === undefined || vatPercent === null ? null : new Prisma.Decimal(vatPercent),
            selectedModules: selectedModules ?? undefined,
            members: user?.authenticated ? { create: { userId: user.id, role: user.role } } : undefined
          }
        });
        await writeAudit(tx, {
          organizationId: context.organizationId,
          projectId: created.id,
          ...auditActor(user),
          entity: "project",
          entityId: created.id,
          action: "create",
          summary: `Создан проект: ${created.name}`,
          after: serializeProject(created)
        });
        return created;
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
        const rateLimit = checkRateLimit({ key: `ai-legacy:${user.id}:${projectId}`, limit: 30, windowMs: 5 * 60_000 });
        if (!rateLimit.allowed) {
          return NextResponse.json(
            { error: "Слишком много AI-запросов. Повторите позже." },
            { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
          );
        }
        const body = await readBody() as Record<string, unknown>;
        const prompt = String(body.prompt ?? body.question ?? promptByAiEndpoint(path[3])).trim().slice(0, 2_000);
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

      return await createProjectResource(projectId, resource, readBody);
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { path?: string[] } }) {
  const path = pathOf(params);
  let parsedBody: unknown;
  const readBody = async () => {
    if (parsedBody === undefined) parsedBody = await request.json().catch(() => ({}));
    return parsedBody;
  };

  try {
    if (path[0] === "projects" && path[1] && path.length === 2) {
      const user = await getCurrentUser();
      if (!(await canProject(user, path[1], "edit"))) return json({ error: "Forbidden" }, 403);
      const data = partial(projectSchema).parse(await readBody());
      const { contractAmount, vatPercent, selectedModules, ...projectData } = data;
      const project = await prisma.$transaction(async (tx) => {
        const before = await tx.project.findUniqueOrThrow({ where: { id: path[1] } });
        const updated = await tx.project.update({
          where: { id: path[1] },
          data: {
            ...projectData,
            contractAmount: contractAmount === undefined ? undefined : new Prisma.Decimal(contractAmount),
            vatPercent: vatPercent === undefined ? undefined : vatPercent === null ? null : new Prisma.Decimal(vatPercent),
            selectedModules: selectedModules === undefined ? undefined : selectedModules === null ? Prisma.JsonNull : selectedModules
          }
        });
        await writeAudit(tx, {
          organizationId: updated.organizationId,
          projectId: updated.id,
          ...auditActor(user),
          entity: "project",
          entityId: updated.id,
          action: "update",
          summary: `Обновлён проект: ${updated.name}`,
          before: serializeProject(before),
          after: serializeProject(updated)
        });
        return updated;
      });
      return json({ project: serializeProject(project) });
    }

    const direct = directResource(path);
    if (direct) return await updateResource(direct.resource, direct.id, readBody);

    if (path[0] === "projects" && path[1] && path[2] && path[3]) {
      return await updateResource(path[2], path[3], readBody, path[1]);
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
      return await deleteResource(path[2], path[3], path[1]);
    }

    return json({ error: "Endpoint not found", path }, 404);
  } catch (error) {
    return handleError(error);
  }
}

async function createProjectResource(projectId: string, resource: string | undefined, readBody: () => Promise<unknown>) {
  const user = await getCurrentUser();
  const action: ProjectAction = resource === "documents" ? "upload_document" : "edit";
  if (!(await canProject(user, projectId, action))) return json({ error: "Forbidden" }, 403);
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } });
  if (!project) return json({ error: "Project not found" }, 404);
  const body = await readBody();
  const userId = user?.authenticated ? user.id : (await getDemoContext()).userId;
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
      const scheduleRevision = await prepareScheduleRevision(tx, { projectId, replace: false });
      const created = await tx.scheduleItem.create({
        data: {
          ...data,
          organizationId: project.organizationId,
          projectId,
          createdBy: userId,
          plannedQty: new Prisma.Decimal(data.plannedQty),
          actualQty: new Prisma.Decimal(data.actualQty),
          manualActualQty: new Prisma.Decimal(data.actualQty),
          reportActualQty: new Prisma.Decimal(0),
          isCurrent: true,
          revision: scheduleRevision.revision
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
    const linkedMaterialIds = [...new Set(data.items.flatMap((requestItem) => requestItem.materialId ? [requestItem.materialId] : []))];
    const linkedMaterials = linkedMaterialIds.length
      ? await prisma.material.findMany({ where: { projectId, id: { in: linkedMaterialIds } }, select: { id: true, unit: true } })
      : [];
    const linkedMaterialMap = new Map(linkedMaterials.map((material) => [material.id, material]));
    const invalidLine = data.items.find((requestItem) => {
      if (!requestItem.materialId) return false;
      const material = linkedMaterialMap.get(requestItem.materialId);
      return !material || material.unit.trim().toLocaleLowerCase("ru-RU") !== requestItem.unit.trim().toLocaleLowerCase("ru-RU");
    });
    if (invalidLine) {
      return json({ error: "Позиция заявки должна быть связана с материалом этого проекта в той же единице измерения." }, 409);
    }
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.procurementRequest.create({
        data: {
          organizationId: project.organizationId,
          projectId,
          title: data.title,
          initiator: data.initiator,
          neededAt: data.neededAt,
          priority: data.priority,
          status: "draft",
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
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "procurement_request",
        entityId: created.id,
        action: "create",
        summary: `Создан черновик заявки: ${created.requestNumber ?? created.title}`,
        after: serializeProcurementRequest(created)
      });
      return created;
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
    const parsed = normalizeDailyReportFields(dailyReportSchema.parse(body));
    const workScopes = parseDailyReportWorkScopes(parsed.workScopes, parsed.workCategory);
    const crewMembers = await resolveDailyReportCrew(projectId, parsed.crewResourceIds, parsed.date);
    const counts = dailyReportCrewCounts(crewMembers);
    const assignmentIssue = dailyReportCrewAssignmentIssues(parsed.workOutputs, crewMembers);
    if (assignmentIssue) return json({ error: `Рапорт не сохранён: ${assignmentIssue}` }, 400);
    const normalizedOutputs = applyDailyReportCrewAssignments(parsed.workOutputs, crewMembers, parsed.shiftHours);
    const { crewResourceIds: _crewResourceIds, ...data } = {
      ...parsed,
      workOutputs: normalizedOutputs,
      workScopes,
      workCategory: dailyReportWorkScopeSummary(workScopes, parsed.workCategory)
    };
    const candidate = {
      ...data,
      crewMembers,
      workers: crewMembers.length ? counts.workers : data.workers,
      engineers: crewMembers.length ? counts.engineers : data.engineers
    };
    const issues = dailyReportDraftIssues(candidate);
    if (issues.length) return json({ error: `Рапорт не сохранён: ${issues[0].message}`, issues }, 400);
    const item = await prisma.$transaction(async (tx) => {
      const {
        crewMembers: storedCrew,
        workOutputs: storedOutputs,
        workScopes: storedScopes,
        ...scalarCandidate
      } = candidate;
      const created = await tx.dailyReport.create({
        data: {
          ...scalarCandidate,
          crewMembers: storedCrew as unknown as Prisma.InputJsonValue,
          workOutputs: storedOutputs as unknown as Prisma.InputJsonValue,
          workScopes: storedScopes as unknown as Prisma.InputJsonValue,
          status: "draft",
          organizationId: project.organizationId,
          projectId,
          createdBy: userId
        }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "daily_report",
        entityId: created.id,
        action: "create",
        summary: created.phase === "open"
          ? `Открыта заявка на смену: ${created.date.toISOString().slice(0, 10)}`
          : `Создан ежедневный рапорт: ${created.date.toISOString().slice(0, 10)}`,
        after: serializeDailyReport(created)
      });
      return created;
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
    const item = await prisma.$transaction(async (tx) => {
      const created = await tx.document.create({
        data: { ...data, organizationId: project.organizationId, projectId, createdBy: userId }
      });
      await writeAudit(tx, {
        organizationId: project.organizationId,
        projectId,
        ...actor,
        entity: "document",
        entityId: created.id,
        action: "create",
        summary: `Добавлен документ: ${created.fileName ?? created.title}`,
        after: serializeDocument(created)
      });
      return created;
    });
    return json({ item: serializeDocument(item) }, 201);
  }

  return json({ error: "Endpoint not found", resource }, 404);
}

async function updateResource(resource: string, id: string, readBody: () => Promise<unknown>, expectedProjectId?: string) {
  const user = await getCurrentUser();
  const scopedProjectId = await projectIdForResource(resource, id);
  if (!scopedProjectId || (expectedProjectId && scopedProjectId !== expectedProjectId)) {
    return json({ error: "Record not found in project" }, 404);
  }
  if (!(await canProject(user, scopedProjectId, "edit"))) return json({ error: "Forbidden" }, 403);
  const body = await readBody();
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
      await lockDailyReportProject(tx, scopedProjectId);
      const before = await tx.scheduleItem.findUniqueOrThrow({ where: { id } });
      if (before.projectId !== scopedProjectId) throw new ResourceConflictError("Работа больше не принадлежит выбранному проекту.");
      if (!before.isCurrent) throw new DailyReportProgressError("Историческую версию графика нельзя редактировать.");
      if (data.actualQty !== undefined && data.actualQty + 0.0001 < decimalNumber(before.reportActualQty)) {
        throw new DailyReportProgressError("Общий факт не может быть меньше объёма, уже учтённого утверждёнными рапортами.");
      }
      const updated = await tx.scheduleItem.update({
        where: { id },
        data: {
          ...scheduleUpdateData(data),
          ...(data.actualQty === undefined
            ? {}
            : { manualActualQty: new Prisma.Decimal(Math.max(0, data.actualQty - decimalNumber(before.reportActualQty))) })
        }
      });
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
    const data = partial(procurementRequestSchema.omit({ items: true, status: true })).parse(body);
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.procurementRequest.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (before.status !== "draft") {
        throw new ResourceConflictError("Редактировать можно только черновик заявки. Используйте действия согласования и приёмки.");
      }
      const updated = await tx.procurementRequest.update({ where: { id }, data, include: { items: true } });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "procurement_request",
        entityId: id,
        action: "update",
        summary: `Обновлён черновик заявки: ${updated.requestNumber ?? updated.title}`,
        before: serializeProcurementRequest(before),
        after: serializeProcurementRequest(updated)
      });
      return updated;
    });
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
    const control = body && typeof body === "object" ? body as Record<string, unknown> : {};
    const applyProgress = control.applyProgress === true;
    const correctionReason = typeof control.correctionReason === "string"
      ? control.correctionReason.trim().replace(/\s+/g, " ")
      : "";
    const parsed = normalizeDailyReportFields(partial(dailyReportSchema).parse(body));
    const before = await prisma.dailyReport.findUniqueOrThrow({ where: { id } });
    const normalizedWorkScopes = parsed.workScopes === undefined && parsed.workCategory === undefined
      ? undefined
      : parseDailyReportWorkScopes(parsed.workScopes, parsed.workCategory ?? before.workCategory);
    const normalizedParsed = normalizedWorkScopes === undefined
      ? parsed
      : {
          ...parsed,
          workScopes: normalizedWorkScopes,
          workCategory: dailyReportWorkScopeSummary(normalizedWorkScopes, parsed.workCategory ?? before.workCategory)
        };
    const previousCrew = parseDailyReportCrewMembers(before.crewMembers);
    const requestedCrewIds = normalizedParsed.crewResourceIds !== undefined
      ? normalizedParsed.crewResourceIds
      : normalizedParsed.date !== undefined && previousCrew.length
        ? previousCrew.map((member) => member.resourceId)
        : undefined;
    const crewMembers = requestedCrewIds === undefined
      ? undefined
      : await resolveDailyReportCrew(before.projectId, requestedCrewIds, normalizedParsed.date ?? before.date);
    const counts = crewMembers ? dailyReportCrewCounts(crewMembers) : null;
    const { crewResourceIds: _crewResourceIds, ...parsedData } = normalizedParsed;
    const effectiveCrew = crewMembers ?? previousCrew;
    const previousOutputs = parseDailyReportWorkOutputs(before.workOutputs);
    const sourceWorkOutputs = normalizedParsed.workOutputs ?? (
      crewMembers !== undefined || normalizedParsed.shiftHours !== undefined ? previousOutputs : undefined
    );
    const assignmentIssue = sourceWorkOutputs === undefined
      ? null
      : dailyReportCrewAssignmentIssues(sourceWorkOutputs, effectiveCrew);
    if (assignmentIssue) return json({ error: `Рапорт не обновлён: ${assignmentIssue}` }, 400);
    const normalizedWorkOutputs = sourceWorkOutputs === undefined
      ? undefined
      : applyDailyReportCrewAssignments(sourceWorkOutputs, effectiveCrew, normalizedParsed.shiftHours ?? decimalNumber(before.shiftHours));
    const data = {
      ...parsedData,
      ...(normalizedWorkOutputs === undefined ? {} : { workOutputs: normalizedWorkOutputs }),
      ...(crewMembers !== undefined ? {
        crewMembers,
        workers: crewMembers.length ? counts?.workers ?? 0 : normalizedParsed.workers ?? 0,
        engineers: crewMembers.length ? counts?.engineers ?? 0 : normalizedParsed.engineers ?? 0
      } : {})
    };
    if ((!Object.keys(data).length && !applyProgress) || (data.status === before.status && Object.keys(data).length === 1 && !applyProgress)) {
      return json({ error: "No daily report changes requested" }, 409);
    }
    if (applyProgress && Object.keys(data).length) {
      return json({ error: "Progress synchronization must be requested separately" }, 409);
    }
    const role = data.status || applyProgress ? await getEffectiveProjectRole(user, before.projectId) : null;
    if (data.status) {
      if (!canTransitionDailyReport(before.status, data.status, role)) {
        return json({ error: "Invalid daily report status transition" }, 409);
      }
    }
    if (applyProgress && (before.status !== "approved" || (role !== "OWNER" && role !== "ADMIN"))) {
      return json({ error: "Only an owner or administrator can synchronize an approved report" }, 403);
    }
    const reopeningApproved = before.status === "approved" && data.status === "draft";
    if (reopeningApproved && correctionReason.length < 5) {
      return json({ error: "Укажите причину возврата рапорта на доработку (минимум 5 символов)." }, 400);
    }
    if (before.status !== "draft" && Object.keys(data).some((key) => key !== "status")) {
      return json({ error: "Only draft reports can be edited" }, 409);
    }
    const candidate = { ...serializeDailyReport(before), ...data };
    const contentChanged = Object.keys(data).some((key) => key !== "status");
    const issues = data.status && ["submitted", "checked", "approved"].includes(data.status)
      ? dailyReportSubmissionIssues(candidate)
      : contentChanged
        ? dailyReportDraftIssues(candidate)
        : [];
    if (issues.length) {
      const action = data.status ? "не готов к отправке" : "не обновлён";
      return json({ error: `Рапорт ${action}: ${issues[0].message}`, issues }, data.status ? 409 : 400);
    }
    const result = await prisma.$transaction(async (tx) => {
      await lockDailyReportProject(tx, before.projectId);
      const current = await tx.dailyReport.findUniqueOrThrow({ where: { id } });
      if (current.projectId !== before.projectId || dailyReportChangedSinceRead(before, current)) {
        throw new ResourceConflictError("Рапорт уже изменён другим пользователем. Обновите страницу и повторите действие.");
      }
      const progress = applyProgress
        ? await applyDailyReportProgress(tx, current, user)
        : reopeningApproved
          ? await rollbackDailyReportProgress(tx, current)
          : { mode: "none" as const, entries: 0, scheduleItems: [] as DbScheduleItem[] };
      const { crewMembers: updatedCrew, workOutputs: updatedOutputs, workScopes: updatedScopes, ...scalarData } = data;
      const updated = applyProgress ? current : await tx.dailyReport.update({
          where: { id },
          data: {
            ...scalarData,
            ...(updatedCrew !== undefined
              ? { crewMembers: updatedCrew as unknown as Prisma.InputJsonValue }
              : {}),
            ...(updatedOutputs !== undefined
              ? { workOutputs: updatedOutputs as unknown as Prisma.InputJsonValue }
              : {}),
            ...(updatedScopes !== undefined
              ? { workScopes: updatedScopes as unknown as Prisma.InputJsonValue }
              : {})
          }
        });
      const approvalProgress = current.status === "checked" && data.status === "approved"
        ? await applyDailyReportProgress(tx, current, user)
        : progress;
      await writeAudit(tx, {
        organizationId: current.organizationId,
        projectId: current.projectId,
        ...auditActor(user),
        entity: "daily_report",
        entityId: id,
        action: data.status === "approved" || applyProgress ? "accept" : "update",
        summary: applyProgress
          ? `Факт рапорта применен к графику: ${approvalProgress.scheduleItems.length} работ`
          : reopeningApproved
            ? `Рапорт возвращен на доработку: ${correctionReason}`
            : data.status
              ? `Статус рапорта изменен: ${current.status} → ${data.status}`
              : `Обновлен ежедневный рапорт: ${updated.date.toISOString().slice(0, 10)}`,
        before: serializeDailyReport(current),
        after: {
          ...serializeDailyReport(updated),
          ...(correctionReason ? { correctionReason } : {}),
          progress: {
            mode: approvalProgress.mode,
            entries: approvalProgress.entries,
            scheduleItemIds: approvalProgress.scheduleItems.map((item) => item.id)
          }
        }
      });
      return { report: updated, progress: approvalProgress };
    });
    return json({
      item: serializeDailyReport(result.report),
      progress: {
        mode: result.progress.mode,
        entries: result.progress.entries,
        scheduleItems: result.progress.scheduleItems.map(serializeScheduleItem)
      }
    });
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
    const item = await prisma.$transaction(async (tx) => {
      const before = await tx.document.findUniqueOrThrow({ where: { id } });
      const updated = await tx.document.update({ where: { id }, data });
      await writeAudit(tx, {
        organizationId: updated.organizationId,
        projectId: updated.projectId,
        ...auditActor(user),
        entity: "document",
        entityId: id,
        action: "update",
        summary: `Обновлён документ: ${updated.fileName ?? updated.title}`,
        before: serializeDocument(before),
        after: serializeDocument(updated)
      });
      return updated;
    });
    return json({ item: serializeDocument(item) });
  }
  return json({ error: "Endpoint not found", resource }, 404);
}

async function deleteResource(resource: string, id: string, expectedProjectId?: string) {
  const user = await getCurrentUser();
  const scopedProjectId = await projectIdForResource(resource, id);
  if (!scopedProjectId || (expectedProjectId && scopedProjectId !== expectedProjectId)) return json({ error: "Record not found in project" }, 404);
  const deleteAction: ProjectAction = resource === "documents" ? "delete_document" : "delete";
  if (!(await canProject(user, scopedProjectId, deleteAction))) {
    return json({ error: "Forbidden" }, 403);
  }
  const actor = auditActor(user);
  if (resource === "budget") await deleteWithAudit("budget_item", id, "budgetItem", serializeBudgetItem, actor);
  else if (resource === "schedule") await archiveScheduleWithAudit(id, scopedProjectId, actor);
  else if (resource === "materials") await deleteWithAudit("material", id, "material", serializeMaterial, actor);
  else if (resource === "procurement") {
    await prisma.$transaction(async (tx) => {
      const before = await tx.procurementRequest.findUniqueOrThrow({ where: { id }, include: { items: true } });
      if (before.status !== "draft") throw new ResourceConflictError("Удалить можно только черновик заявки.");
      await tx.procurementRequest.delete({ where: { id } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: before.projectId,
        ...actor,
        entity: "procurement_request",
        entityId: id,
        action: "delete",
        summary: `Удалён черновик заявки: ${before.requestNumber ?? before.title}`,
        before: serializeProcurementRequest(before)
      });
    });
  }
  else if (resource === "finance" || resource === "payments") await deleteWithAudit("payment", id, "payment", serializePayment, actor);
  else if (resource === "daily-reports") {
    await prisma.$transaction(async (tx) => {
      await lockDailyReportProject(tx, scopedProjectId);
      const before = await tx.dailyReport.findUniqueOrThrow({ where: { id } });
      if (before.projectId !== scopedProjectId) throw new ResourceConflictError("Рапорт больше не принадлежит выбранному проекту.");
      if (before.status !== "draft") throw new ResourceConflictError("Удалить можно только черновик рапорта.");
      await tx.dailyReport.delete({ where: { id } });
      await writeAudit(tx, {
        organizationId: before.organizationId,
        projectId: before.projectId,
        ...actor,
        entity: "daily_report",
        entityId: id,
        action: "delete",
        summary: `Удален черновик ежедневного рапорта: ${before.date.toISOString().slice(0, 10)}`,
        before: serializeDailyReport(before)
      });
    });
  }
  else if (resource === "risks") await deleteWithAudit("risk", id, "risk", serializeRisk, actor);
  else if (resource === "documents") {
    const storageKeys = await deleteDocumentWithAudit(id, actor);
    for (const storageKey of storageKeys) await deleteDocumentFile(storageKey);
  }
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

async function archiveScheduleWithAudit(id: string, projectId: string, actor: ReturnType<typeof auditActor>) {
  await prisma.$transaction(async (tx) => {
    await lockDailyReportProject(tx, projectId);
    const before = await tx.scheduleItem.findUniqueOrThrow({ where: { id } });
    if (before.projectId !== projectId) throw new ResourceConflictError("Работа больше не принадлежит выбранному проекту.");
    if (!before.isCurrent) throw new DailyReportProgressError("Работа уже находится в истории графика.");
    const archived = await tx.scheduleItem.update({
      where: { id },
      data: { isCurrent: false, supersededAt: new Date() }
    });
    await writeAudit(tx, {
      organizationId: before.organizationId,
      projectId: before.projectId,
      ...actor,
      entity: "schedule_item",
      entityId: id,
      action: "update",
      summary: `Работа перенесена в историю графика: ${before.name}`,
      before: serializeScheduleItem(before),
      after: serializeScheduleItem(archived)
    });
  });
}

async function deleteDocumentWithAudit(id: string, actor: ReturnType<typeof auditActor>) {
  return prisma.$transaction(async (tx) => {
    const before = await tx.document.findUniqueOrThrow({
      where: { id },
      include: { versions: { select: { storageKey: true } } }
    });
    await tx.document.delete({ where: { id } });
    await writeAudit(tx, {
      organizationId: before.organizationId,
      projectId: before.projectId,
      ...actor,
      entity: "document",
      entityId: id,
      action: "delete",
      summary: `Удалён документ: ${before.fileName ?? before.title}`,
      before: serializeDocument(before)
    });
    return [...new Set([before.storageKey, ...before.versions.map((version) => version.storageKey)].filter((key): key is string => Boolean(key)))];
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

async function resolveDailyReportCrew(projectId: string, resourceIds: string[], reportDate: Date) {
  if (!resourceIds.length) return [];
  const uniqueIds = [...new Set(resourceIds)];
  const assignments = await prisma.projectResourceAssignment.findMany({
    where: {
      projectId,
      resourceId: { in: uniqueIds },
      status: { not: "completed" },
      startsAt: { lte: reportDate },
      endsAt: { gte: reportDate },
      resource: { status: { not: "archived" }, kind: { in: ["worker", "engineer", "crew"] } }
    },
    include: { resource: true }
  });
  if (assignments.length !== uniqueIds.length) {
    throw new DailyReportCrewError("Один или несколько сотрудников не назначены на этот проект.");
  }
  return buildDailyReportCrewMembers(assignments);
}

class DailyReportCrewError extends Error {}

class DailyReportProgressError extends Error {}

class ResourceConflictError extends Error {}

async function lockDailyReportProject(tx: Prisma.TransactionClient, projectId: string) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM "projects" WHERE id = ${projectId} FOR UPDATE`;
  if (!rows.length) throw new ResourceConflictError("Проект больше не существует.");
}

function dailyReportChangedSinceRead(expected: DbDailyReport, current: DbDailyReport) {
  return expected.status !== current.status || expected.updatedAt.getTime() !== current.updatedAt.getTime();
}

type DailyReportProgressResult = {
  mode: "applied" | "already_applied" | "rolled_back" | "none";
  entries: number;
  scheduleItems: DbScheduleItem[];
};

function decimalNumber(value: Prisma.Decimal | number | null | undefined) {
  if (typeof value === "number") return value;
  return value?.toNumber() ?? 0;
}

async function applyDailyReportProgress(
  tx: Prisma.TransactionClient,
  report: DbDailyReport,
  user: AppUser | null
): Promise<DailyReportProgressResult> {
  const deltas = dailyReportProgressDeltas(report.workOutputs);
  if (!deltas.length) return { mode: "none", entries: 0, scheduleItems: [] };

  const existing = await tx.workProgressEntry.findMany({ where: { dailyReportId: report.id } });
  if (existing.length) {
    const scheduleItems = await tx.scheduleItem.findMany({
      where: { projectId: report.projectId, isCurrent: true, id: { in: existing.map((entry) => entry.scheduleItemId).filter((id): id is string => Boolean(id)) } }
    });
    if (scheduleItems.length !== existing.filter((entry) => entry.scheduleItemId).length) {
      throw new DailyReportProgressError("Факт этого рапорта относится к прежней версии графика. Верните рапорт на доработку и привяжите работы к актуальному графику.");
    }
    return { mode: "already_applied", entries: existing.length, scheduleItems };
  }

  const [scheduleItems, budgetItems] = await Promise.all([
    tx.scheduleItem.findMany({
      where: { projectId: report.projectId, isCurrent: true, id: { in: deltas.map((delta) => delta.scheduleItemId) } }
    }),
    tx.budgetItem.findMany({ where: { projectId: report.projectId } })
  ]);
  if (scheduleItems.length !== deltas.length) {
    throw new DailyReportProgressError("Одна или несколько работ рапорта больше не существуют в графике проекта.");
  }

  const byId = new Map(scheduleItems.map((item) => [item.id, item]));
  const scheduleUnits = buildDailyReportScheduleUnits(
    scheduleItems.map(serializeScheduleItem),
    budgetItems.map(serializeBudgetItem)
  );
  const reportOutputs = parseDailyReportWorkOutputs(report.workOutputs);
  const updatedScheduleItems: DbScheduleItem[] = [];
  for (const delta of deltas) {
    const scheduleItem = byId.get(delta.scheduleItemId)!;
    const outputUnits = new Set(reportOutputs.filter((output) => output.scheduleItemId === scheduleItem.id).map((output) => output.unit));
    const scheduleUnit = scheduleUnits.get(scheduleItem.id)
      ?? (scheduleItem.unit ? normalizeDailyReportWorkOutputUnit(scheduleItem.unit) : null);
    if (scheduleUnit && (outputUnits.size !== 1 || !outputUnits.has(scheduleUnit))) {
      throw new DailyReportProgressError(`Единица факта для «${scheduleItem.name}» должна быть «${scheduleUnit}».`);
    }
    await tx.workProgressEntry.create({
      data: {
        organizationId: report.organizationId,
        projectId: report.projectId,
        scheduleItemId: scheduleItem.id,
        dailyReportId: report.id,
        date: report.date,
        qty: new Prisma.Decimal(delta.quantity),
        performer: report.author,
        comment: `Рапорт ${report.date.toISOString().slice(0, 10)} · ${delta.workNames.join(", ")}`,
        status: "approved",
        createdBy: user?.authenticated ? user.id : report.createdBy
      }
    });
    const incremented = await tx.scheduleItem.update({
      where: { id: scheduleItem.id },
      data: {
        actualQty: { increment: new Prisma.Decimal(delta.quantity) },
        reportActualQty: { increment: new Prisma.Decimal(delta.quantity) }
      }
    });
    const nextStatus = scheduleStatusForActual(
      incremented.status as Parameters<typeof scheduleStatusForActual>[0],
      decimalNumber(incremented.plannedQty),
      decimalNumber(incremented.actualQty)
    );
    const updated = nextStatus === incremented.status
      ? incremented
      : await tx.scheduleItem.update({ where: { id: scheduleItem.id }, data: { status: nextStatus } });
    updatedScheduleItems.push(updated);
  }
  return { mode: "applied", entries: deltas.length, scheduleItems: updatedScheduleItems };
}

async function rollbackDailyReportProgress(
  tx: Prisma.TransactionClient,
  report: DbDailyReport
): Promise<DailyReportProgressResult> {
  const entries = await tx.workProgressEntry.findMany({ where: { dailyReportId: report.id } });
  if (!entries.length) return { mode: "none", entries: 0, scheduleItems: [] };

  const grouped = new Map<string, number>();
  for (const entry of entries) {
    if (!entry.scheduleItemId) continue;
    grouped.set(entry.scheduleItemId, (grouped.get(entry.scheduleItemId) ?? 0) + decimalNumber(entry.qty));
  }
  const scheduleItems = await tx.scheduleItem.findMany({
    where: { projectId: report.projectId, id: { in: [...grouped.keys()] } }
  });
  const updatedScheduleItems: DbScheduleItem[] = [];
  for (const scheduleItem of scheduleItems) {
    const quantity = grouped.get(scheduleItem.id) ?? 0;
    const decremented = await tx.scheduleItem.update({
      where: { id: scheduleItem.id },
      data: {
        actualQty: { decrement: new Prisma.Decimal(quantity) },
        reportActualQty: { decrement: new Prisma.Decimal(quantity) }
      }
    });
    const reportActualQty = Math.max(0, decimalNumber(decremented.reportActualQty));
    const actualQty = Math.max(0, decimalNumber(decremented.manualActualQty)) + reportActualQty;
    const nextStatus = scheduleStatusForActual(
      decremented.status as Parameters<typeof scheduleStatusForActual>[0],
      decimalNumber(decremented.plannedQty),
      actualQty
    );
    const updated = actualQty !== decimalNumber(decremented.actualQty) || reportActualQty !== decimalNumber(decremented.reportActualQty) || nextStatus !== decremented.status
      ? await tx.scheduleItem.update({
          where: { id: scheduleItem.id },
          data: { actualQty: new Prisma.Decimal(actualQty), reportActualQty: new Prisma.Decimal(reportActualQty), status: nextStatus }
        })
      : decremented;
    updatedScheduleItems.push(updated);
  }
  await tx.workProgressEntry.deleteMany({ where: { dailyReportId: report.id } });
  return { mode: "rolled_back", entries: entries.length, scheduleItems: updatedScheduleItems };
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
  if (error instanceof DailyReportCrewError) {
    return json({ error: error.message }, 400);
  }
  if (error instanceof DailyReportProgressError) {
    return json({ error: error.message }, 409);
  }
  if (error instanceof ResourceConflictError) {
    return json({ error: error.message }, 409);
  }
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
    return json({ error: "Database is not available" }, 503);
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
