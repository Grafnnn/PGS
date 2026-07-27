import { randomBytes } from "crypto";
import { Prisma } from "@prisma/client";
import * as XLSX from "xlsx";
import { AI_COMMAND_PROMPT_VERSION } from "@/lib/ai-run-journal";
import { connectorSummary, getConnectorStatuses } from "@/lib/connectors/status";
import { buildInviteEmail, getEmailProvider, getEmailProviderStatus } from "@/lib/email";
import { getEnvStatus } from "@/lib/env";
import { buildDeterministicImportExplanation } from "@/lib/excel/ai-import-summary";
import type { ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import type { BudgetItem, Project, ProjectLaborDemand, ProjectPayrollPolicy, WorkforceResource } from "@/lib/types";
import { buildWorkforceCapacitySummary, buildWorkforceEconomics } from "@/lib/workforce-capacity";
import { aiDecisionJournalSmokePassed, buildAiDecisionJournalSmokeInsight } from "./ai-decision-journal";
import { assertSmokeMutationTarget, SMOKE_PROJECT_ID } from "./cleanup";
import { CREATE_STAGING_SMOKE_USER_CONFIRM, createOrRotateStagingSmokeUser, type StagingSmokeUserReport } from "./user";
import {
  buildWorkforcePayrollSmokeFixture,
  expectedPayrollAmounts,
  workforcePayrollSmokePassed
} from "./workforce-payroll";
import {
  buildWorkforcePayrollImportSmokeWorkbook,
  inspectWorkforcePayrollImportPreview,
  workforcePayrollImportSmokePassed
} from "./workforce-payroll-import";

const STAGING_SMOKE_EMAIL = "smoke+staging-runtime@pgs.local";
const AI_SMOKE_PROMPT = "Кратко проверь smoke-проект и скажи, каких данных не хватает для управленческого анализа.";

type SmokeStatus = "pass" | "fail" | "skip";

export interface RuntimeSmokeCheck {
  name: string;
  status: SmokeStatus;
  httpStatus?: number;
  detail?: string;
}

export interface RuntimePipelineSmokeResult extends RuntimeSmokeCheck {
  projectId: string;
  operations: string[];
  readiness?: {
    status?: string;
    score?: number;
  };
  procurement?: {
    previewItems?: number;
    created?: number;
    cleanup: "pass" | "fail" | "skip";
  };
  schedule?: {
    previewItems?: number;
  };
  cashflow?: {
    previewItems?: number;
  };
}

export interface RuntimeProjectCreationDocumentSmokeResult extends RuntimeSmokeCheck {
  operations: string[];
  project?: {
    id: string;
    name: string;
    created: boolean;
    opened: boolean;
    deleted: boolean;
  };
  document?: {
    uploaded: boolean;
    visibleInDocumentsTab: boolean;
    category?: string;
    fileName?: string;
  };
  permissionScope?: "temporary-admin-restored" | "restore-failed";
  cleanup: "pass" | "fail" | "skip";
}

export interface RuntimeProjectControlsSmokeResult extends RuntimeSmokeCheck {
  projectId: string;
  operations: string[];
  baseline?: {
    previewed: boolean;
    activated: boolean;
    budgetAtCompletion?: number;
  };
  period?: {
    previewed: boolean;
    published: boolean;
    locked: boolean;
    costPerformanceIndex?: number | null;
    schedulePerformanceIndex?: number | null;
  };
  permissionScope?: "temporary-project-owner-restored" | "restore-failed";
  previousActiveBaselineRestored?: boolean;
  cleanup: "pass" | "fail" | "skip";
}

export interface RuntimeAiDecisionJournalSmokeResult extends RuntimeSmokeCheck {
  projectId: string;
  operations: string[];
  run?: {
    created: boolean;
    listed: boolean;
    feedbackRecorded: boolean;
  };
  action?: {
    created: boolean;
    duplicatePrevented: boolean;
  };
  permissionScope?: "temporary-project-manager-restored" | "restore-failed";
  cleanup: "pass" | "fail" | "skip";
}

export interface RuntimeWorkforcePayrollSmokeResult extends RuntimeSmokeCheck {
  projectId: string;
  operations: string[];
  resource?: {
    created: boolean;
    listed: boolean;
    cleaned: boolean;
  };
  demand?: {
    created: boolean;
    listed: boolean;
    cleaned: boolean;
  };
  payroll?: {
    grossPayroll: number;
    employerContributions: number;
    withheldPersonalIncomeTax: number;
    netPayroll: number;
    totalEmployerCost: number;
  };
  projectEconomics?: {
    forecastCostDelta: number;
    marginBefore: number;
    marginAfter: number;
  };
  capacity?: {
    headcountDelta: number;
    allocatedHoursDelta: number;
  };
  permissionScope?: "temporary-project-manager-restored" | "restore-failed";
  cleanup: "pass" | "fail" | "skip";
}

export interface RuntimeWorkforcePayrollImportSmokeResult extends RuntimeSmokeCheck {
  projectId: string;
  importBatchId?: string;
  operations: string[];
  preview?: {
    payrollItems: number;
    laborDemands: number;
    laborAllocations: number;
    allocationSharePercent: number;
    personMonths: number;
    plannedHours: number;
  };
  commit?: {
    budgetItems: number;
    laborDemands: number;
    laborAllocations: number;
    demandListed: boolean;
    importBatchCommitted: boolean;
  };
  economics?: {
    grossPayroll: number;
    employerContributions: number;
    withheldPersonalIncomeTax: number;
    netPayroll: number;
    totalEmployerCost: number;
    payrollBudget: number;
    adjustedForecastCost: number;
  };
  permissionScope?: "temporary-project-manager-restored" | "restore-failed";
  cleanup: "pass" | "fail" | "skip";
}

export interface RuntimeSmokeResult {
  ok: boolean;
  smokeUser: StagingSmokeUserReport;
  checks: RuntimeSmokeCheck[];
  liveAi: RuntimeSmokeCheck & {
    requested: boolean;
    responseChars?: number;
    providerError?: string;
  };
  storage?: RuntimeSmokeCheck & {
    provider: string;
    s3Configured: boolean;
    projectId: string;
    operations: string[];
    bytesRead?: number;
    cleanup: "pass" | "fail" | "skip";
  };
  email?: RuntimeSmokeCheck & {
    provider: string;
    delivered?: boolean;
    safeMode: boolean;
    warning?: string;
  };
  connectors?: RuntimeSmokeCheck & {
    summary: ReturnType<typeof connectorSummary>;
    items: Array<{
      id: string;
      label: string;
      mode: string;
      configured: boolean;
      warnings: string[];
      metadata?: Record<string, string>;
    }>;
  };
  importSmoke?: RuntimeSmokeCheck & {
    projectId: string;
    importBatchId?: string;
    operations: string[];
    permissionScope?: "temporary-project-manager-restored" | "restore-failed";
    preview?: {
      budgetItems: number;
      materials: number;
      warnings: number;
      errors: number;
    };
    explanation?: {
      status: string;
      confidence: number;
    };
    commit?: {
      created: number;
      budgetItems: number;
      materials: number;
    };
    cleanup: "pass" | "fail" | "skip";
    pipeline?: RuntimePipelineSmokeResult;
  };
  projectCreationDocumentsSmoke?: RuntimeProjectCreationDocumentSmokeResult;
  projectControlsSmoke?: RuntimeProjectControlsSmokeResult;
  aiDecisionJournalSmoke?: RuntimeAiDecisionJournalSmokeResult;
  workforcePayrollSmoke?: RuntimeWorkforcePayrollSmokeResult;
  workforcePayrollImportSmoke?: RuntimeWorkforcePayrollImportSmokeResult;
  secretsPrinted: false;
}

export interface RuntimeSmokeInput {
  baseUrl: string;
  includeLiveAi?: boolean;
  includeStorageSmoke?: boolean;
  includeEmailSmoke?: boolean;
  includeConnectorReadiness?: boolean;
  includeImportSmoke?: boolean;
  includePipelineSmoke?: boolean;
  includeProjectCreationDocumentsSmoke?: boolean;
  includeProjectControlsSmoke?: boolean;
  includeAiDecisionJournalSmoke?: boolean;
  includeWorkforcePayrollSmoke?: boolean;
  includeWorkforcePayrollImportSmoke?: boolean;
  requestId: string;
}

function generateSmokePassword() {
  return `${randomBytes(27).toString("base64url")}A1!`;
}

function cookieFrom(response: Response) {
  return response.headers.get("set-cookie")?.split(";")[0] ?? "";
}

function check(name: string, response: Response, expected: number[]): RuntimeSmokeCheck {
  return {
    name,
    status: expected.includes(response.status) ? "pass" : "fail",
    httpStatus: response.status
  };
}

function failed(name: string, error: unknown): RuntimeSmokeCheck {
  return {
    name,
    status: "fail",
    detail: error instanceof Error ? error.message.slice(0, 160) : "request failed"
  };
}

function failureDetail(error: unknown) {
  return error instanceof Error ? error.message.replace(/postgres(ql)?:\/\/\S+/g, "[REDACTED_DATABASE_URL]").slice(0, 160) : "request failed";
}

async function runStorageSmoke(requestId: string): Promise<NonNullable<RuntimeSmokeResult["storage"]>> {
  const env = getEnvStatus();
  const provider = getStorageProvider();
  const project = await prisma.project.findUnique({ where: { id: SMOKE_PROJECT_ID }, select: { id: true, isSmokeProject: true } });

  if (!project?.isSmokeProject) {
    return {
      name: "storage smoke",
      status: "fail",
      detail: `${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`,
      provider: provider.name,
      s3Configured: env.uploadProvider === "s3",
      projectId: SMOKE_PROJECT_ID,
      operations: [],
      cleanup: "skip"
    };
  }

  const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 48) || Date.now().toString();
  const firstKey = `${SMOKE_PROJECT_ID}/runtime-smoke/${runKey}-v1.pdf`;
  const secondKey = `${SMOKE_PROJECT_ID}/runtime-smoke/${runKey}-v2.pdf`;
  const firstBytes = Buffer.from(`PGS runtime storage smoke ${runKey} v1`);
  const secondBytes = Buffer.from(`PGS runtime storage smoke ${runKey} v2`);
  const operations: string[] = [];
  let cleanup: "pass" | "fail" | "skip" = "skip";

  try {
    await provider.write(firstKey, firstBytes);
    operations.push("write:v1");
    const firstRead = await provider.read(firstKey);
    operations.push("read:v1");
    await provider.write(secondKey, secondBytes);
    operations.push("write:v2");
    const secondRead = await provider.read(secondKey);
    operations.push("read:v2");
    await provider.delete(firstKey);
    await provider.delete(secondKey);
    operations.push("delete:v1", "delete:v2");
    cleanup = "pass";

    const bytesMatch = firstRead.equals(firstBytes) && secondRead.equals(secondBytes);
    return {
      name: "storage smoke",
      status: bytesMatch ? "pass" : "fail",
      detail: env.uploadProvider === "s3" ? undefined : "S3 provider is not active; verified the configured storage provider.",
      provider: provider.name,
      s3Configured: env.uploadProvider === "s3",
      projectId: SMOKE_PROJECT_ID,
      operations,
      bytesRead: firstRead.byteLength + secondRead.byteLength,
      cleanup
    };
  } catch (error) {
    await Promise.allSettled([provider.delete(firstKey), provider.delete(secondKey)]).then((results) => {
      cleanup = results.every((result) => result.status === "fulfilled") ? "pass" : "fail";
    });
    return {
      name: "storage smoke",
      status: "fail",
      detail: failureDetail(error),
      provider: provider.name,
      s3Configured: env.uploadProvider === "s3",
      projectId: SMOKE_PROJECT_ID,
      operations,
      cleanup
    };
  }
}

async function runEmailSmoke(): Promise<NonNullable<RuntimeSmokeResult["email"]>> {
  const status = getEmailProviderStatus();
  if (status.provider !== "console") {
    return {
      name: "email smoke",
      status: "skip",
      provider: status.provider,
      safeMode: false,
      warning: "Safe smoke does not invoke real email providers."
    };
  }

  try {
    const preview = await getEmailProvider().send(
      buildInviteEmail({
        to: "smoke+email@pgs.local",
        acceptUrl: "https://pgs.local/smoke"
      })
    );
    return {
      name: "email smoke",
      status: preview.provider === "console" && preview.delivered === false ? "pass" : "fail",
      provider: preview.provider,
      delivered: preview.delivered,
      safeMode: true,
      warning: preview.warning
    };
  } catch (error) {
    return {
      name: "email smoke",
      status: "fail",
      provider: status.provider,
      safeMode: true,
      warning: failureDetail(error)
    };
  }
}

function connectorReadiness(): NonNullable<RuntimeSmokeResult["connectors"]> {
  const items = getConnectorStatuses().map((connector) => ({
    id: connector.id,
    label: connector.label,
    mode: connector.mode,
    configured: connector.configured,
    warnings: connector.warnings,
    metadata: connector.metadata
  }));
  return {
    name: "connector readiness",
    status: "pass",
    summary: connectorSummary(),
    items
  };
}

async function get(baseUrl: string, path: string, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    headers: {
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    }
  });
}

async function postJson(baseUrl: string, path: string, body: unknown, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function deleteJson(baseUrl: string, path: string, body: unknown, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    method: "DELETE",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function patchJson(baseUrl: string, path: string, body: unknown, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    method: "PATCH",
    headers: {
      "content-type": "application/json",
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    },
    body: JSON.stringify(body)
  });
}

async function postForm(baseUrl: string, path: string, form: FormData, cookie: string, requestId: string) {
  return await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "x-request-id": requestId,
      ...(cookie ? { cookie } : {})
    },
    body: form
  });
}

async function safeJson<T>(response: Response): Promise<T | null> {
  return (await response.json().catch(() => null)) as T | null;
}

function smokeImportWorkbook(runKey: string) {
  const workCode = `SMOKE-WORK-${runKey}`;
  const materialCode = `SMOKE-MAT-${runKey}`;
  const workbook = XLSX.utils.book_new();
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Локальная смета PGS smoke"],
    ["Раздел", `SMOKE-IMPORT-${runKey}`, "", "", "", "", ""],
    ["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена за ед.", "Сумма", "Примечание"],
    [workCode, `SMOKE-${runKey} монтаж тестовой позиции`, "ед.", 2, 1000, 2000, "runtime import smoke"],
    [materialCode, `SMOKE-${runKey} бетон В25`, "м3", 1, 5000, 5000, "runtime import smoke"],
    ["", "Итого по разделу", "", "", "", 7000, ""]
  ]);
  XLSX.utils.book_append_sheet(workbook, worksheet, "ВОР");
  return {
    bytes: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    fileName: `SMOKE-${runKey}-vor.xlsx`,
    workCode,
    materialCode,
    workName: `SMOKE-${runKey} монтаж тестовой позиции`,
    materialName: `SMOKE-${runKey} бетон В25`,
    sectionName: `SMOKE-IMPORT-${runKey}`
  };
}

async function cleanupImportSmoke(input: { workCode: string; materialCode: string; workName: string; materialName: string; sectionName: string }) {
  const [budgetItems, materials, sections] = await prisma.$transaction([
    prisma.budgetItem.deleteMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [{ code: { in: [input.workCode, input.materialCode] } }, { name: { in: [input.workName, input.materialName] } }]
      }
    }),
    prisma.material.deleteMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        name: input.materialName
      }
    }),
    prisma.budgetSection.deleteMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        name: input.sectionName
      }
    })
  ]);
  return budgetItems.count + materials.count + sections.count;
}

async function cleanupPipelineSmokeProcurement(requestIds: string[]) {
  if (!requestIds.length) return 0;
  const deleted = await prisma.procurementRequest.deleteMany({
    where: {
      projectId: SMOKE_PROJECT_ID,
      id: { in: requestIds }
    }
  });
  return deleted.count;
}

async function runPipelineSmoke(baseUrl: string, cookie: string, requestId: string): Promise<RuntimePipelineSmokeResult> {
  const operations: string[] = [];
  const createdProcurementIds: string[] = [];
  let procurementCleanup: "pass" | "fail" | "skip" = "skip";

  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");

    const readinessResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/data-readiness`, cookie, requestId);
    operations.push("readiness");
    const readiness = await safeJson<{ readiness?: { status?: string; score?: number } }>(readinessResponse);

    const actionsResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/post-import-actions`, cookie, requestId);
    operations.push("post-import-actions");

    const materialsResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/materials`, cookie, requestId);
    operations.push("materials");

    const procurementPreviewResponse = await postJson(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/procurement/draft-from-import`, {}, cookie, requestId);
    operations.push("procurement-preview");
    const procurementPreview = await safeJson<{ draft?: { items?: unknown[] } }>(procurementPreviewResponse);

    const procurementCommitResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/procurement/draft-from-import`,
      { commit: true, confirmed: true },
      cookie,
      requestId
    );
    operations.push("procurement-commit");
    const procurementCommit = await safeJson<{ created?: Array<{ id?: string }> }>(procurementCommitResponse);
    for (const item of procurementCommit?.created ?? []) {
      if (item.id) createdProcurementIds.push(item.id);
    }

    const procurementResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/procurement`, cookie, requestId);
    operations.push("procurement-read");

    const schedulePreviewResponse = await postJson(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/schedule/draft-from-import`, {}, cookie, requestId);
    operations.push("schedule-preview");
    const schedulePreview = await safeJson<{ draft?: { items?: unknown[] } }>(schedulePreviewResponse);

    const cashflowPreviewResponse = await postJson(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/finance/draft-cashflow-from-import`, {}, cookie, requestId);
    operations.push("cashflow-preview");
    const cashflowPreview = await safeJson<{ draft?: { items?: unknown[] } }>(cashflowPreviewResponse);

    const checklistResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/document-checklist`, cookie, requestId);
    operations.push("document-checklist");

    const intelligenceResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/intelligence`, cookie, requestId);
    operations.push("intelligence");

    if (createdProcurementIds.length) {
      const deleted = await cleanupPipelineSmokeProcurement(createdProcurementIds);
      operations.push("procurement-cleanup");
      procurementCleanup = deleted === createdProcurementIds.length ? "pass" : "fail";
    }

    const failedResponse = [
      readinessResponse,
      actionsResponse,
      materialsResponse,
      procurementPreviewResponse,
      procurementCommitResponse,
      procurementResponse,
      schedulePreviewResponse,
      cashflowPreviewResponse,
      checklistResponse,
      intelligenceResponse
    ].find((response) => response.status !== 200);
    const procurementCreated = procurementCommit?.created?.length ?? 0;
    const status =
      !failedResponse &&
      (procurementPreview?.draft?.items?.length ?? 0) > 0 &&
      procurementCreated > 0 &&
      (procurementCleanup === "pass" || procurementCleanup === "skip")
        ? "pass"
        : "fail";

    return {
      name: "project data pipeline smoke",
      status,
      httpStatus: failedResponse?.status,
      detail: status === "pass" ? undefined : "Pipeline smoke did not complete all expected checks.",
      projectId: SMOKE_PROJECT_ID,
      operations,
      readiness: readiness?.readiness,
      procurement: {
        previewItems: procurementPreview?.draft?.items?.length ?? 0,
        created: procurementCreated,
        cleanup: procurementCleanup
      },
      schedule: {
        previewItems: schedulePreview?.draft?.items?.length ?? 0
      },
      cashflow: {
        previewItems: cashflowPreview?.draft?.items?.length ?? 0
      }
    };
  } catch (error) {
    if (createdProcurementIds.length) {
      await cleanupPipelineSmokeProcurement(createdProcurementIds)
        .then((deleted) => {
          operations.push("procurement-cleanup");
          procurementCleanup = deleted === createdProcurementIds.length ? "pass" : "fail";
        })
        .catch(() => {
          procurementCleanup = "fail";
        });
    }
    return {
      name: "project data pipeline smoke",
      status: "fail",
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      operations,
      procurement: {
        cleanup: procurementCleanup
      }
    };
  }
}

async function grantTemporaryImportRole() {
  const user = await prisma.user.findUnique({ where: { email: STAGING_SMOKE_EMAIL }, select: { id: true } });
  if (!user) throw new Error("Smoke import user is missing.");
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
    select: { role: true }
  });
  if (!membership) throw new Error("Smoke import user project membership is missing.");
  if (membership.role !== "MANAGER") {
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
      data: { role: "MANAGER" }
    });
  }
  return { userId: user.id, previousRole: membership.role };
}

async function restoreTemporaryImportRole(input: { userId: string; previousRole: string }) {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: input.userId } },
    data: { role: input.previousRole }
  });
}

async function cleanupImportRole(input: Awaited<ReturnType<typeof grantTemporaryImportRole>> | undefined, operations: string[]) {
  if (!input) return "temporary-project-manager-restored" as const;
  await restoreTemporaryImportRole(input);
  operations.push("restore-import-role");
  return "temporary-project-manager-restored" as const;
}

async function grantTemporaryAiDecisionJournalRole() {
  const user = await prisma.user.findUnique({ where: { email: STAGING_SMOKE_EMAIL }, select: { id: true } });
  if (!user) throw new Error("Smoke AI decision journal user is missing.");
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
    select: { role: true }
  });
  if (!membership) throw new Error("Smoke AI decision journal project membership is missing.");
  if (membership.role !== "MANAGER") {
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
      data: { role: "MANAGER" }
    });
  }
  return { userId: user.id };
}

async function restoreAiDecisionJournalRole(userId: string) {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId } },
    data: { role: "VIEWER" }
  });
}

async function cleanupAiDecisionJournalSmoke(runId: string | undefined) {
  if (!runId) return "skip" as const;
  const result = await prisma.$transaction(async (tx) => {
    const links = await tx.aiRunAction.findMany({
      where: { aiRunId: runId },
      select: { actionItemId: true }
    });
    const actionItemIds = links.map((item) => item.actionItemId);
    await tx.auditLog.deleteMany({
      where: { projectId: SMOKE_PROJECT_ID, entity: "ai_run", entityId: runId }
    });
    await tx.aiRunAction.deleteMany({ where: { aiRunId: runId } });
    const actions = actionItemIds.length
      ? await tx.projectActionItem.deleteMany({
          where: { projectId: SMOKE_PROJECT_ID, id: { in: actionItemIds } }
        })
      : { count: 0 };
    const runs = await tx.aiRun.deleteMany({
      where: { id: runId, projectId: SMOKE_PROJECT_ID }
    });
    return {
      actionCount: actionItemIds.length,
      deletedActions: actions.count,
      deletedRuns: runs.count
    };
  });

  const remainingRun = await prisma.aiRun.count({ where: { id: runId, projectId: SMOKE_PROJECT_ID } });
  const remainingLinks = await prisma.aiRunAction.count({ where: { aiRunId: runId } });
  return result.deletedRuns === 1 &&
    result.deletedActions === result.actionCount &&
    remainingRun === 0 &&
    remainingLinks === 0
    ? "pass" as const
    : "fail" as const;
}

async function runAiDecisionJournalSmoke(
  baseUrl: string,
  cookie: string,
  requestId: string
): Promise<RuntimeAiDecisionJournalSmokeResult> {
  const operations: string[] = [];
  let cleanup: RuntimeAiDecisionJournalSmokeResult["cleanup"] = "skip";
  let permissionScope: RuntimeAiDecisionJournalSmokeResult["permissionScope"];
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryAiDecisionJournalRole>> | undefined;
  let runId: string | undefined;
  let runCreated = false;
  let runListed = false;
  let feedbackRecorded = false;
  let actionCreated = false;
  let duplicatePrevented = false;
  let lastHttpStatus: number | undefined;

  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, process.env.APP_ENV ?? process.env.NODE_ENV);
    const project = await prisma.project.findUnique({
      where: { id: SMOKE_PROJECT_ID },
      select: { id: true, organizationId: true, isSmokeProject: true }
    });
    if (!project?.isSmokeProject) throw new Error(`${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`);

    temporaryRole = await grantTemporaryAiDecisionJournalRole();
    operations.push("temporary-project-manager-role");

    const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
    const insight = buildAiDecisionJournalSmokeInsight(runKey);
    const run = await prisma.aiRun.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        userId: temporaryRole.userId,
        scenario: insight.scenario,
        promptVersion: AI_COMMAND_PROMPT_VERSION,
        inputJson: {
          scenario: insight.scenario,
          source: "runtime-smoke"
        } satisfies Prisma.InputJsonValue,
        outputJson: insight as Prisma.InputJsonValue,
        status: "succeeded",
        provider: "deterministic",
        durationMs: 0,
        completedAt: new Date()
      },
      select: { id: true }
    });
    runId = run.id;
    runCreated = true;
    operations.push("synthetic-ai-run");

    const historyResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/ai-runs?limit=50`, cookie, requestId);
    lastHttpStatus = historyResponse.status;
    operations.push("journal-read");
    const historyBody = await safeJson<{ items?: Array<{ id?: string }> }>(historyResponse);
    runListed = historyResponse.status === 200 && historyBody?.items?.some((item) => item.id === runId) === true;

    const feedbackResponse = await patchJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/ai-runs/${runId}`,
      {
        feedback: "needs_review",
        comment: `SMOKE-${runKey} deterministic review`
      },
      cookie,
      requestId
    );
    lastHttpStatus = feedbackResponse.status;
    operations.push("feedback-record");
    const feedbackBody = await safeJson<{ item?: { id?: string; feedback?: string; feedbackComment?: string | null } }>(feedbackResponse);
    feedbackRecorded =
      feedbackResponse.status === 200 &&
      feedbackBody?.item?.id === runId &&
      feedbackBody.item.feedback === "needs_review" &&
      feedbackBody.item.feedbackComment === `SMOKE-${runKey} deterministic review`;

    const actionResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/ai-runs/${runId}/actions`,
      { actionIndex: 0 },
      cookie,
      requestId
    );
    lastHttpStatus = actionResponse.status;
    operations.push("action-create");
    const actionBody = await safeJson<{ item?: { id?: string }; actionIndex?: number; alreadyCreated?: boolean }>(actionResponse);
    const actionId = actionBody?.item?.id;
    actionCreated =
      actionResponse.status === 201 &&
      actionBody?.actionIndex === 0 &&
      actionBody.alreadyCreated === false &&
      Boolean(actionId);

    const duplicateResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/ai-runs/${runId}/actions`,
      { actionIndex: 0 },
      cookie,
      requestId
    );
    lastHttpStatus = duplicateResponse.status;
    operations.push("duplicate-action-check");
    const duplicateBody = await safeJson<{ item?: { id?: string }; actionIndex?: number; alreadyCreated?: boolean }>(duplicateResponse);
    duplicatePrevented =
      duplicateResponse.status === 200 &&
      duplicateBody?.actionIndex === 0 &&
      duplicateBody.alreadyCreated === true &&
      Boolean(actionId) &&
      duplicateBody.item?.id === actionId;

    cleanup = await cleanupAiDecisionJournalSmoke(runId);
    operations.push("journal-cleanup");
    await restoreAiDecisionJournalRole(temporaryRole.userId);
    temporaryRole = undefined;
    permissionScope = "temporary-project-manager-restored";
    operations.push("restore-project-role");

    const status = aiDecisionJournalSmokePassed({
      runCreated,
      runListed,
      feedbackRecorded,
      actionCreated,
      duplicatePrevented,
      cleanupPassed: cleanup === "pass",
      roleRestored: permissionScope === "temporary-project-manager-restored"
    })
      ? "pass"
      : "fail";

    return {
      name: "AI decision journal smoke",
      status,
      httpStatus: status === "pass" ? undefined : lastHttpStatus,
      detail: status === "pass" ? undefined : "AI run, feedback, action conversion, duplicate prevention, or cleanup did not pass.",
      projectId: SMOKE_PROJECT_ID,
      operations,
      run: {
        created: runCreated,
        listed: runListed,
        feedbackRecorded
      },
      action: {
        created: actionCreated,
        duplicatePrevented
      },
      permissionScope,
      cleanup
    };
  } catch (error) {
    cleanup = await cleanupAiDecisionJournalSmoke(runId).catch(() => "fail" as const);
    if (runId) operations.push("journal-cleanup");
    if (temporaryRole) {
      await restoreAiDecisionJournalRole(temporaryRole.userId)
        .then(() => {
          permissionScope = "temporary-project-manager-restored";
          operations.push("restore-project-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    return {
      name: "AI decision journal smoke",
      status: "fail",
      httpStatus: lastHttpStatus,
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      operations,
      run: {
        created: runCreated,
        listed: runListed,
        feedbackRecorded
      },
      action: {
        created: actionCreated,
        duplicatePrevented
      },
      permissionScope,
      cleanup
    };
  }
}

async function grantTemporaryProjectAdminRole() {
  const user = await prisma.user.findUnique({ where: { email: STAGING_SMOKE_EMAIL }, select: { id: true, appRole: true } });
  if (!user) throw new Error("Smoke project creation user is missing.");
  if (user.appRole !== "ADMIN") {
    await prisma.user.update({ where: { id: user.id }, data: { appRole: "ADMIN" } });
  }
  return { userId: user.id, previousRole: user.appRole };
}

async function restoreTemporaryProjectAdminRole(input: { userId: string; previousRole: string }) {
  await prisma.user.update({ where: { id: input.userId }, data: { appRole: input.previousRole } });
}

async function cleanupProjectAdminRole(input: Awaited<ReturnType<typeof grantTemporaryProjectAdminRole>> | undefined, operations: string[]) {
  if (!input) return "temporary-admin-restored" as const;
  await restoreTemporaryProjectAdminRole(input);
  operations.push("restore-admin-role");
  return "temporary-admin-restored" as const;
}

function disposableProjectName(runKey: string) {
  return `SMOKE-${runKey} disposable docs project`;
}

async function fallbackDeleteDisposableProject(projectId: string | undefined, projectName: string | undefined, operations: string[]) {
  if (!projectId || !projectName?.startsWith("SMOKE-")) return "skip" as const;
  const project = await prisma.project.findUnique({ where: { id: projectId }, select: { id: true, name: true } });
  if (!project) return "pass" as const;
  if (project.name !== projectName || !project.name.startsWith("SMOKE-")) return "fail" as const;
  await prisma.project.delete({ where: { id: projectId } });
  operations.push("fallback-project-cleanup");
  return "pass" as const;
}

async function runProjectCreationDocumentsSmoke(
  baseUrl: string,
  cookie: string,
  requestId: string
): Promise<RuntimeProjectCreationDocumentSmokeResult> {
  const operations: string[] = [];
  let permissionScope: RuntimeProjectCreationDocumentSmokeResult["permissionScope"];
  let cleanup: RuntimeProjectCreationDocumentSmokeResult["cleanup"] = "skip";
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryProjectAdminRole>> | undefined;
  let projectId: string | undefined;
  let projectName: string | undefined;
  let storageKey: string | null | undefined;

  try {
    if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") throw new Error("Project creation document smoke is blocked in production.");

    temporaryRole = await grantTemporaryProjectAdminRole();
    operations.push("temporary-admin-role");

    const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
    projectName = disposableProjectName(runKey);
    const projectResponse = await postJson(
      baseUrl,
      "/api/projects",
      {
        name: projectName,
        customer: "SMOKE staging customer",
        object: "SMOKE project creation document upload",
        address: "SMOKE staging address",
        contractAmount: 123456,
        vatMode: "vat",
        startsAt: "2026-07-01",
        endsAt: "2026-08-01",
        manager: "Smoke Runtime",
        status: "planning"
      },
      cookie,
      requestId
    );
    operations.push("project-create");
    const projectBody = await safeJson<{ project?: { id?: string; name?: string } }>(projectResponse);
    projectId = projectBody?.project?.id;
    if (projectResponse.status !== 201 || !projectId || projectBody?.project?.name !== projectName) {
      permissionScope = await cleanupProjectAdminRole(temporaryRole, operations);
      temporaryRole = undefined;
      return {
        name: "project creation documents smoke",
        status: "fail",
        httpStatus: projectResponse.status,
        detail: "Disposable project was not created through /api/projects.",
        operations,
        permissionScope,
        cleanup
      };
    }

    const openResponse = await get(baseUrl, `/api/projects/${projectId}`, cookie, requestId);
    operations.push("project-open");

    const fileName = `SMOKE-${runKey}-starting-document.pdf`;
    const documentBytes = Buffer.from(`PGS disposable project starting document smoke ${runKey}`);
    const form = new FormData();
    form.append("category", "исполнительная");
    form.append("file", new Blob([Uint8Array.from(documentBytes)], { type: "application/pdf" }), fileName);
    const uploadResponse = await postForm(baseUrl, `/api/projects/${projectId}/documents/upload`, form, cookie, requestId);
    operations.push("document-upload");
    const uploadBody = await safeJson<{ item?: { id?: string; fileName?: string; category?: string; storageKey?: string | null } }>(uploadResponse);
    storageKey = uploadBody?.item?.storageKey;

    const documentsResponse = await get(baseUrl, `/api/projects/${projectId}/documents`, cookie, requestId);
    operations.push("documents-read");
    const documentsBody = await safeJson<{ items?: Array<{ fileName?: string; category?: string }> }>(documentsResponse);
    const documentVisible = Boolean(documentsBody?.items?.some((item) => item.fileName === fileName && item.category === "исполнительная"));

    const deleteResponse = await deleteJson(baseUrl, `/api/projects/${projectId}`, { confirm: true, projectName }, cookie, requestId);
    operations.push("project-delete");
    const deleted = deleteResponse.status === 200;

    const verifyDeletedResponse = await get(baseUrl, `/api/projects/${projectId}`, cookie, requestId);
    operations.push("verify-deleted");
    const deletedVerified = verifyDeletedResponse.status === 404;

    if (storageKey) {
      await getStorageProvider().delete(storageKey);
      operations.push("storage-cleanup");
    }

    cleanup = deleted && deletedVerified ? "pass" : "fail";
    permissionScope = await cleanupProjectAdminRole(temporaryRole, operations);
    temporaryRole = undefined;

    const status =
      openResponse.status === 200 &&
      uploadResponse.status === 201 &&
      documentsResponse.status === 200 &&
      documentVisible &&
      cleanup === "pass" &&
      permissionScope === "temporary-admin-restored"
        ? "pass"
        : "fail";

    return {
      name: "project creation documents smoke",
      status,
      httpStatus: status === "pass" ? undefined : uploadResponse.status,
      detail: status === "pass" ? undefined : "Disposable project create/upload/read/delete smoke did not complete all expected checks.",
      operations,
      project: {
        id: projectId,
        name: projectName,
        created: projectResponse.status === 201,
        opened: openResponse.status === 200,
        deleted: cleanup === "pass"
      },
      document: {
        uploaded: uploadResponse.status === 201,
        visibleInDocumentsTab: documentVisible,
        category: uploadBody?.item?.category,
        fileName: uploadBody?.item?.fileName
      },
      permissionScope,
      cleanup
    };
  } catch (error) {
    if (storageKey) {
      await getStorageProvider()
        .delete(storageKey)
        .then(() => operations.push("storage-cleanup"))
        .catch(() => undefined);
    }
    cleanup = await fallbackDeleteDisposableProject(projectId, projectName, operations).catch(() => "fail" as const);
    if (temporaryRole) {
      await restoreTemporaryProjectAdminRole(temporaryRole)
        .then(() => {
          permissionScope = "temporary-admin-restored";
          operations.push("restore-admin-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    return {
      name: "project creation documents smoke",
      status: "fail",
      detail: failureDetail(error),
      operations,
      ...(projectId && projectName ? { project: { id: projectId, name: projectName, created: true, opened: false, deleted: cleanup === "pass" } } : {}),
      permissionScope,
      cleanup
    };
  }
}

async function grantTemporaryProjectOwnerRole() {
  const user = await prisma.user.findUnique({ where: { email: STAGING_SMOKE_EMAIL }, select: { id: true } });
  if (!user) throw new Error("Smoke Project Controls user is missing.");
  const membership = await prisma.projectMember.findUnique({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
    select: { role: true }
  });
  if (!membership) throw new Error("Smoke Project Controls membership is missing.");
  if (membership.role !== "OWNER") {
    await prisma.projectMember.update({
      where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: user.id } },
      data: { role: "OWNER" }
    });
  }
  return { userId: user.id, previousRole: membership.role };
}

async function restoreTemporaryProjectOwnerRole(input: { userId: string; previousRole: string }) {
  await prisma.projectMember.update({
    where: { projectId_userId: { projectId: SMOKE_PROJECT_ID, userId: input.userId } },
    data: { role: input.previousRole }
  });
}

async function prepareProjectControlsSmokeData(runKey: string, userId: string) {
  assertSmokeMutationTarget(SMOKE_PROJECT_ID, process.env.APP_ENV ?? process.env.NODE_ENV);
  const project = await prisma.project.findUnique({
    where: { id: SMOKE_PROJECT_ID },
    select: { id: true, organizationId: true, isSmokeProject: true }
  });
  if (!project?.isSmokeProject) throw new Error(`${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`);
  const previousActiveBaseline = await prisma.projectControlBaseline.findFirst({
    where: { projectId: SMOKE_PROJECT_ID, status: "active" },
    select: { id: true }
  });
  const dataDate = new Date();
  dataDate.setUTCHours(0, 0, 0, 0);
  const startsAt = new Date(dataDate.getTime() - 10 * 86_400_000);
  const endsAt = new Date(dataDate.getTime() + 10 * 86_400_000);
  const code = `SMOKE-PC-${runKey}`;

  const source = await prisma.$transaction(async (tx) => {
    const costCode = await tx.projectCostCode.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        code,
        name: `${code} Project Controls`,
        description: "Synthetic staging-only Project Controls source",
        source: "runtime-smoke",
        createdBy: userId
      }
    });
    const budgetItem = await tx.budgetItem.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        costCodeId: costCode.id,
        section: code,
        code: `${code}-WORK`,
        name: `${code} synthetic work`,
        unit: "ед.",
        qty: 10,
        plannedUnitPrice: 100,
        actualUnitPrice: 90,
        forecastUnitPrice: 95,
        kind: "work",
        source: "runtime-smoke",
        createdBy: userId
      }
    });
    const scheduleItem = await tx.scheduleItem.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        costCodeId: costCode.id,
        budgetItemId: budgetItem.id,
        name: `${code} scheduled work`,
        owner: "Smoke Runtime",
        startsAt,
        endsAt,
        plannedQty: 10,
        actualQty: 4,
        status: "in_progress",
        createdBy: userId
      }
    });
    const progressEntry = await tx.workProgressEntry.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        scheduleItemId: scheduleItem.id,
        date: dataDate,
        qty: 4,
        performer: "Smoke Runtime",
        comment: `${code} approved progress`,
        status: "approved",
        createdBy: userId
      }
    });
    const payment = await tx.payment.create({
      data: {
        organizationId: project.organizationId,
        projectId: SMOKE_PROJECT_ID,
        costCodeId: costCode.id,
        title: `${code} paid actual cost`,
        counterparty: "SMOKE staging contractor",
        direction: "outgoing",
        plannedAt: dataDate,
        paidAt: dataDate,
        amount: 350,
        status: "paid",
        category: "subcontractor",
        createdBy: userId
      }
    });
    return { costCodeId: costCode.id, budgetItemId: budgetItem.id, scheduleItemId: scheduleItem.id, progressEntryId: progressEntry.id, paymentId: payment.id };
  });

  return {
    ...source,
    dataDate: dataDate.toISOString().slice(0, 10),
    previousActiveBaselineId: previousActiveBaseline?.id
  };
}

async function cleanupProjectControlsSmoke(input: {
  source?: Awaited<ReturnType<typeof prepareProjectControlsSmokeData>>;
  baselineId?: string;
  baselineName?: string;
  periodId?: string;
  activeBaselineChanged: boolean;
}) {
  if (!input.source) return { cleanup: "skip" as const, previousActiveBaselineRestored: false };
  const source = input.source;
  const result = await prisma.$transaction(async (tx) => {
    const createdBaseline = input.baselineId
      ? await tx.projectControlBaseline.findFirst({
          where: { id: input.baselineId, projectId: SMOKE_PROJECT_ID },
          select: { id: true, status: true }
        })
      : input.baselineName
        ? await tx.projectControlBaseline.findFirst({
            where: { projectId: SMOKE_PROJECT_ID, name: input.baselineName },
            orderBy: { createdAt: "desc" },
            select: { id: true, status: true }
          })
        : null;
    const resolvedBaselineId = createdBaseline?.id ?? input.baselineId;
    const activeBaselineChanged = input.activeBaselineChanged || createdBaseline?.status === "active";
    const auditEntityIds = [resolvedBaselineId, input.periodId].filter((value): value is string => Boolean(value));
    if (auditEntityIds.length) {
      await tx.auditLog.deleteMany({ where: { projectId: SMOKE_PROJECT_ID, entityId: { in: auditEntityIds } } });
    }
    const baselineDeleted = resolvedBaselineId
      ? await tx.projectControlBaseline.deleteMany({ where: { id: resolvedBaselineId, projectId: SMOKE_PROJECT_ID } })
      : { count: 0 };
    const paymentDeleted = await tx.payment.deleteMany({ where: { id: source.paymentId, projectId: SMOKE_PROJECT_ID } });
    const progressDeleted = await tx.workProgressEntry.deleteMany({ where: { id: source.progressEntryId, projectId: SMOKE_PROJECT_ID } });
    const scheduleDeleted = await tx.scheduleItem.deleteMany({ where: { id: source.scheduleItemId, projectId: SMOKE_PROJECT_ID } });
    const budgetDeleted = await tx.budgetItem.deleteMany({ where: { id: source.budgetItemId, projectId: SMOKE_PROJECT_ID } });
    const costCodeDeleted = await tx.projectCostCode.deleteMany({ where: { id: source.costCodeId, projectId: SMOKE_PROJECT_ID } });
    let previousActiveBaselineRestored = !activeBaselineChanged || !source.previousActiveBaselineId;
    if (activeBaselineChanged && source.previousActiveBaselineId) {
      const restored = await tx.projectControlBaseline.updateMany({
        where: { id: source.previousActiveBaselineId, projectId: SMOKE_PROJECT_ID, status: "superseded" },
        data: { status: "active", supersededAt: null }
      });
      previousActiveBaselineRestored = restored.count === 1;
    }
    const expectedBaselineDeleted = resolvedBaselineId ? baselineDeleted.count === 1 : true;
    const sourceDeleted = [paymentDeleted, progressDeleted, scheduleDeleted, budgetDeleted, costCodeDeleted].every((item) => item.count === 1);
    return { ok: expectedBaselineDeleted && sourceDeleted && previousActiveBaselineRestored, previousActiveBaselineRestored };
  });
  return { cleanup: result.ok ? "pass" as const : "fail" as const, previousActiveBaselineRestored: result.previousActiveBaselineRestored };
}

async function runProjectControlsSmoke(baseUrl: string, cookie: string, requestId: string): Promise<RuntimeProjectControlsSmokeResult> {
  const operations: string[] = [];
  let cleanup: RuntimeProjectControlsSmokeResult["cleanup"] = "skip";
  let permissionScope: RuntimeProjectControlsSmokeResult["permissionScope"];
  let previousActiveBaselineRestored = false;
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryProjectOwnerRole>> | undefined;
  let source: Awaited<ReturnType<typeof prepareProjectControlsSmokeData>> | undefined;
  let baselineId: string | undefined;
  let baselineName: string | undefined;
  let periodId: string | undefined;
  let activeBaselineChanged = false;

  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, process.env.APP_ENV ?? process.env.NODE_ENV);
    temporaryRole = await grantTemporaryProjectOwnerRole();
    operations.push("temporary-project-owner-role");
    const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
    source = await prepareProjectControlsSmokeData(runKey, temporaryRole.userId);
    operations.push("synthetic-controls-source");
    baselineName = `SMOKE-${runKey} Project Controls baseline`;

    const baselinePreviewResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/project-controls/baselines`,
      { mode: "preview", name: baselineName, dataDate: source.dataDate },
      cookie,
      requestId
    );
    operations.push("baseline-preview");
    const baselinePreviewBody = await safeJson<{ preview?: { summary?: { canActivate?: boolean; budgetAtCompletion?: number } } }>(baselinePreviewResponse);

    const baselineCreateResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/project-controls/baselines`,
      { mode: "create", name: baselineName, dataDate: source.dataDate, activate: true, confirm: true },
      cookie,
      requestId
    );
    operations.push("baseline-create-active");
    const baselineCreateBody = await safeJson<{ baseline?: { id?: string; status?: string; budgetAtCompletion?: number } }>(baselineCreateResponse);
    baselineId = baselineCreateBody?.baseline?.id;
    activeBaselineChanged = baselineCreateBody?.baseline?.status === "active";

    const controlsResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/project-controls`, cookie, requestId);
    operations.push("controls-read");

    let periodPreviewResponse: Response | undefined;
    let periodPreviewBody: { preview?: { summary?: { costPerformanceIndex?: number | null; schedulePerformanceIndex?: number | null } } } | null = null;
    let periodPublishResponse: Response | undefined;
    let periodCreateBody: { period?: { id?: string; status?: string; costPerformanceIndex?: number | null; schedulePerformanceIndex?: number | null } } | null = null;
    let periodLockResponse: Response | undefined;
    let periodLockBody: { period?: { status?: string } } | null = null;

    if (baselineId) {
      periodPreviewResponse = await postJson(
        baseUrl,
        `/api/projects/${SMOKE_PROJECT_ID}/project-controls/periods`,
        { mode: "preview", baselineId, dataDate: source.dataDate },
        cookie,
        requestId
      );
      operations.push("period-preview");
      periodPreviewBody = await safeJson(periodPreviewResponse);

      periodPublishResponse = await postJson(
        baseUrl,
        `/api/projects/${SMOKE_PROJECT_ID}/project-controls/periods`,
        { mode: "publish", baselineId, dataDate: source.dataDate, confirm: true },
        cookie,
        requestId
      );
      operations.push("period-publish");
      periodCreateBody = await safeJson(periodPublishResponse);
      periodId = periodCreateBody?.period?.id;
    }

    if (periodId) {
      periodLockResponse = await patchJson(
        baseUrl,
        `/api/projects/${SMOKE_PROJECT_ID}/project-controls/periods/${periodId}`,
        { action: "lock", confirm: true },
        cookie,
        requestId
      );
      operations.push("period-lock");
      periodLockBody = await safeJson(periodLockResponse);
    }

    const finalReadResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/project-controls`, cookie, requestId);
    operations.push("controls-final-read");
    const finalReadBody = await safeJson<{ activeBaselineId?: string | null; periods?: Array<{ id?: string; status?: string }> }>(finalReadResponse);
    const baselinePreviewed = baselinePreviewResponse.status === 200 && baselinePreviewBody?.preview?.summary?.canActivate === true;
    const baselineActivated = baselineCreateResponse.status === 201 && Boolean(baselineId) && finalReadBody?.activeBaselineId === baselineId;
    const periodPreviewed = periodPreviewResponse?.status === 200 && periodPreviewBody?.preview?.summary?.costPerformanceIndex !== undefined;
    const periodPublished = periodPublishResponse?.status === 201 && periodCreateBody?.period?.status === "published";
    const periodLocked = periodLockResponse?.status === 200 && periodLockBody?.period?.status === "locked" && finalReadBody?.periods?.some((item) => item.id === periodId && item.status === "locked") === true;

    const cleanupResult = await cleanupProjectControlsSmoke({ source, baselineId, baselineName, periodId, activeBaselineChanged });
    cleanup = cleanupResult.cleanup;
    previousActiveBaselineRestored = cleanupResult.previousActiveBaselineRestored;
    operations.push("controls-cleanup");
    await restoreTemporaryProjectOwnerRole(temporaryRole);
    temporaryRole = undefined;
    permissionScope = "temporary-project-owner-restored";
    operations.push("restore-project-role");

    const status =
      baselinePreviewed &&
      baselineActivated &&
      controlsResponse.status === 200 &&
      periodPreviewed &&
      periodPublished &&
      periodLocked &&
      finalReadResponse.status === 200 &&
      cleanup === "pass" &&
      permissionScope === "temporary-project-owner-restored"
        ? "pass"
        : "fail";

    return {
      name: "project controls earned value smoke",
      status,
      httpStatus: status === "pass" ? undefined : periodLockResponse?.status ?? periodPublishResponse?.status ?? baselineCreateResponse.status,
      detail: status === "pass" ? undefined : "Project Controls preview/create/publish/lock/cleanup did not complete all checks.",
      projectId: SMOKE_PROJECT_ID,
      operations,
      baseline: {
        previewed: baselinePreviewed,
        activated: baselineActivated,
        budgetAtCompletion: baselineCreateBody?.baseline?.budgetAtCompletion
      },
      period: {
        previewed: periodPreviewed,
        published: periodPublished,
        locked: periodLocked,
        costPerformanceIndex: periodCreateBody?.period?.costPerformanceIndex,
        schedulePerformanceIndex: periodCreateBody?.period?.schedulePerformanceIndex
      },
      permissionScope,
      previousActiveBaselineRestored,
      cleanup
    };
  } catch (error) {
    if (source) {
      await cleanupProjectControlsSmoke({ source, baselineId, baselineName, periodId, activeBaselineChanged })
        .then((result) => {
          cleanup = result.cleanup;
          previousActiveBaselineRestored = result.previousActiveBaselineRestored;
          operations.push("controls-cleanup");
        })
        .catch(() => {
          cleanup = "fail";
        });
    }
    if (temporaryRole) {
      await restoreTemporaryProjectOwnerRole(temporaryRole)
        .then(() => {
          permissionScope = "temporary-project-owner-restored";
          operations.push("restore-project-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    return {
      name: "project controls earned value smoke",
      status: "fail",
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      operations,
      permissionScope,
      previousActiveBaselineRestored,
      cleanup
    };
  }
}

async function runImportSmoke(baseUrl: string, cookie: string, requestId: string, includePipelineSmoke = false): Promise<NonNullable<RuntimeSmokeResult["importSmoke"]>> {
  const operations: string[] = [];
  let cleanup: "pass" | "fail" | "skip" = "skip";
  let permissionScope: NonNullable<RuntimeSmokeResult["importSmoke"]>["permissionScope"] | undefined;
  let workbook: ReturnType<typeof smokeImportWorkbook> | undefined;
  let importBatchId: string | undefined;
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryImportRole>> | undefined;
  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");
    const project = await prisma.project.findUnique({ where: { id: SMOKE_PROJECT_ID }, select: { id: true, isSmokeProject: true } });
    if (!project?.isSmokeProject) {
      return {
        name: "import smoke",
        status: "fail",
        detail: `${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`,
        projectId: SMOKE_PROJECT_ID,
        operations,
        cleanup
      };
    }

    temporaryRole = await grantTemporaryImportRole();
    operations.push("temporary-import-role");

    const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
    workbook = smokeImportWorkbook(runKey);
    const form = new FormData();
    form.append(
      "file",
      new Blob([Uint8Array.from(workbook.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      workbook.fileName
    );

    const previewResponse = await postForm(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/imports/budget/preview`, form, cookie, requestId);
    operations.push("preview");
    const preview = await safeJson<ImportPreview>(previewResponse);
    importBatchId = preview?.importBatchId;
    if (previewResponse.status !== 200 || !preview?.importBatchId) {
      permissionScope = await cleanupImportRole(temporaryRole, operations);
      temporaryRole = undefined;
      return {
        name: "import smoke",
        status: "fail",
        httpStatus: previewResponse.status,
        detail: "Preview did not return a commit-ready import batch.",
        projectId: SMOKE_PROJECT_ID,
        operations,
        permissionScope,
        cleanup
      };
    }

    const explanation = buildDeterministicImportExplanation(preview);
    operations.push("deterministic-explanation");

    const commitResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/imports/${preview.importBatchId}/commit`,
      { mode: "append", replaceConfirmed: false },
      cookie,
      requestId
    );
    operations.push("commit");
    const commit = await safeJson<{
      ok?: boolean;
      commitResult?: {
        created: number;
        budgetItems: number;
        materials: number;
      };
    }>(commitResponse);
    if (commitResponse.status !== 200 || commit?.ok !== true || !commit.commitResult || commit.commitResult.created < 2) {
      const cleaned = await cleanupImportSmoke(workbook);
      cleanup = cleaned > 0 ? "pass" : "skip";
      operations.push("cleanup");
      permissionScope = await cleanupImportRole(temporaryRole, operations);
      temporaryRole = undefined;
      return {
        name: "import smoke",
        status: "fail",
        httpStatus: commitResponse.status,
        detail: "Commit did not create the expected smoke import rows.",
        projectId: SMOKE_PROJECT_ID,
        importBatchId,
        operations,
        preview: {
          budgetItems: preview.summary.budgetItems,
          materials: preview.summary.materials,
          warnings: preview.summary.warnings,
          errors: preview.summary.errors
        },
        explanation: { status: explanation.status, confidence: explanation.confidence },
        cleanup
      };
    }

    const historyResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/imports`, cookie, requestId);
    operations.push("history");
    if (historyResponse.status !== 200) {
      const cleaned = await cleanupImportSmoke(workbook);
      cleanup = cleaned > 0 ? "pass" : "skip";
      operations.push("cleanup");
      permissionScope = await cleanupImportRole(temporaryRole, operations);
      temporaryRole = undefined;
      return {
        name: "import smoke",
        status: "fail",
        httpStatus: historyResponse.status,
        detail: "Import history did not respond after commit.",
        projectId: SMOKE_PROJECT_ID,
        importBatchId,
        operations,
        preview: {
          budgetItems: preview.summary.budgetItems,
          materials: preview.summary.materials,
          warnings: preview.summary.warnings,
          errors: preview.summary.errors
        },
        explanation: { status: explanation.status, confidence: explanation.confidence },
        commit: commit.commitResult,
        cleanup
      };
    }

    const pipeline = includePipelineSmoke ? await runPipelineSmoke(baseUrl, cookie, requestId) : undefined;
    if (pipeline) operations.push("pipeline-smoke");

    const cleaned = await cleanupImportSmoke(workbook);
    cleanup = cleaned >= 2 ? "pass" : "fail";
    operations.push("cleanup");

    if (temporaryRole) {
      permissionScope = await cleanupImportRole(temporaryRole, operations);
      temporaryRole = undefined;
    }

    return {
      name: "import smoke",
      status: cleanup === "pass" && (!pipeline || pipeline.status === "pass") ? "pass" : "fail",
      detail:
        cleanup !== "pass"
          ? "Smoke import rows were not fully cleaned up."
          : pipeline && pipeline.status !== "pass"
            ? "Pipeline smoke failed after import commit."
            : undefined,
      projectId: SMOKE_PROJECT_ID,
      importBatchId,
      operations,
      permissionScope,
      preview: {
        budgetItems: preview.summary.budgetItems,
        materials: preview.summary.materials,
        warnings: preview.summary.warnings,
        errors: preview.summary.errors
      },
      explanation: { status: explanation.status, confidence: explanation.confidence },
      commit: commit.commitResult,
      cleanup,
      ...(pipeline ? { pipeline } : {})
    };
  } catch (error) {
    if (temporaryRole) {
      await restoreTemporaryImportRole(temporaryRole)
        .then(() => {
          permissionScope = "temporary-project-manager-restored";
          operations.push("restore-import-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    if (workbook) {
      await cleanupImportSmoke(workbook)
        .then(() => {
          cleanup = "pass";
        })
        .catch(() => {
          cleanup = "fail";
        });
    }
    return {
      name: "import smoke",
      status: "fail",
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      importBatchId,
      operations,
      permissionScope,
      cleanup
    };
  }
}

type WorkforceApiResponse = {
  items?: WorkforceResource[];
  demands?: ProjectLaborDemand[];
  policy?: ProjectPayrollPolicy;
};

type ProjectBundleResponse = {
  project?: Project;
  budgetItems?: BudgetItem[];
};

function closeEnough(actual: number, expected: number) {
  return Math.abs(actual - expected) <= Math.max(0.01, Math.abs(expected) * 0.000001);
}

async function cleanupWorkforcePayrollSmoke(input: {
  organizationId: string;
  marker: string;
  resourceId?: string;
  assignmentId?: string;
  demandId?: string;
}) {
  assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");

  const [resources, demands] = await Promise.all([
    prisma.organizationResource.findMany({
      where: {
        organizationId: input.organizationId,
        OR: [
          ...(input.resourceId ? [{ id: input.resourceId }] : []),
          { name: { startsWith: input.marker } }
        ]
      },
      select: { id: true }
    }),
    prisma.projectLaborDemand.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          ...(input.demandId ? [{ id: input.demandId }] : []),
          { source: input.marker }
        ]
      },
      select: { id: true }
    })
  ]);
  const resourceIds = [...new Set([...resources.map((item) => item.id), ...(input.resourceId ? [input.resourceId] : [])])];
  const demandIds = [...new Set([...demands.map((item) => item.id), ...(input.demandId ? [input.demandId] : [])])];
  const auditEntityIds = [...new Set([...resourceIds, ...demandIds, ...(input.assignmentId ? [input.assignmentId] : [])])];

  await prisma.$transaction(async (tx) => {
    if (demandIds.length) {
      await tx.projectLaborAllocation.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, laborDemandId: { in: demandIds } }
      });
      await tx.projectLaborDemand.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: demandIds } }
      });
    }
    if (resourceIds.length) {
      await tx.projectResourceAssignment.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, resourceId: { in: resourceIds } }
      });
      await tx.organizationResource.deleteMany({
        where: {
          organizationId: input.organizationId,
          id: { in: resourceIds },
          name: { startsWith: input.marker }
        }
      });
    }
    if (auditEntityIds.length) {
      await tx.auditLog.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, entityId: { in: auditEntityIds } }
      });
    }
  });

  const [remainingResources, remainingDemands] = await Promise.all([
    prisma.organizationResource.count({
      where: { organizationId: input.organizationId, name: { startsWith: input.marker } }
    }),
    prisma.projectLaborDemand.count({
      where: { projectId: SMOKE_PROJECT_ID, source: input.marker }
    })
  ]);

  return {
    resourceCleaned: remainingResources === 0,
    demandCleaned: remainingDemands === 0
  };
}

async function runWorkforcePayrollSmoke(
  baseUrl: string,
  cookie: string,
  requestId: string
): Promise<RuntimeWorkforcePayrollSmokeResult> {
  const operations: string[] = [];
  let permissionScope: RuntimeWorkforcePayrollSmokeResult["permissionScope"];
  let cleanup: RuntimeWorkforcePayrollSmokeResult["cleanup"] = "skip";
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryImportRole>> | undefined;
  let organizationId: string | undefined;
  let marker = "";
  let resourceId: string | undefined;
  let assignmentId: string | undefined;
  let demandId: string | undefined;
  let resourceCreated = false;
  let demandCreated = false;
  let resourceListed = false;
  let demandListed = false;
  let resourceCleaned = false;
  let demandCleaned = false;
  let lastHttpStatus: number | undefined;
  let payroll: RuntimeWorkforcePayrollSmokeResult["payroll"];
  let projectEconomics: RuntimeWorkforcePayrollSmokeResult["projectEconomics"];
  let capacity: RuntimeWorkforcePayrollSmokeResult["capacity"];

  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");
    if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
      throw new Error("Workforce payroll smoke is blocked in production.");
    }
    const smokeProject = await prisma.project.findUnique({
      where: { id: SMOKE_PROJECT_ID },
      select: { id: true, organizationId: true, isSmokeProject: true }
    });
    if (!smokeProject?.isSmokeProject) {
      throw new Error(`${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`);
    }
    organizationId = smokeProject.organizationId;

    temporaryRole = await grantTemporaryImportRole();
    operations.push("temporary-project-manager-role");

    const [bundleResponse, beforeResponse] = await Promise.all([
      get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}`, cookie, requestId),
      get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/resources`, cookie, requestId)
    ]);
    operations.push("project-read", "workforce-before-read");
    lastHttpStatus = beforeResponse.status;
    const bundle = await safeJson<ProjectBundleResponse>(bundleResponse);
    const beforeBody = await safeJson<WorkforceApiResponse>(beforeResponse);
    if (
      bundleResponse.status !== 200 ||
      beforeResponse.status !== 200 ||
      !bundle?.project ||
      !beforeBody?.items ||
      !beforeBody.demands ||
      !beforeBody.policy
    ) {
      throw new Error("Workforce payroll baseline could not be read.");
    }

    const beforeEconomics = buildWorkforceEconomics({
      resources: beforeBody.items,
      demands: beforeBody.demands,
      policy: beforeBody.policy,
      budgetItems: bundle.budgetItems ?? [],
      contractAmount: bundle.project.contractAmount
    });
    const beforeCapacity = buildWorkforceCapacitySummary(beforeBody.items, beforeBody.demands, beforeBody.policy);
    const contributionFactor = 1 + (
      beforeBody.policy.insuranceContributionRate + beforeBody.policy.accidentContributionRate
    ) / 100;
    const desiredCostDelta = 120_000;
    const requiredDemandGross = Math.max(
      120_000,
      beforeEconomics.grossPayroll + desiredCostDelta - beforeEconomics.demandGrossPayroll,
      (Math.max(beforeEconomics.totalEmployerCost, beforeEconomics.payrollBudget) + desiredCostDelta) / contributionFactor -
        beforeEconomics.demandGrossPayroll
    );
    if (!Number.isFinite(requiredDemandGross) || requiredDemandGross > 50_000_000) {
      throw new Error("Synthetic payroll requirement exceeds the bounded smoke limit.");
    }

    const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
    const fixture = buildWorkforcePayrollSmokeFixture(runKey, requiredDemandGross);
    marker = fixture.marker;

    const resourceResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/resources`,
      fixture.resource,
      cookie,
      requestId
    );
    operations.push("resource-create");
    lastHttpStatus = resourceResponse.status;
    const resourceBody = await safeJson<{ item?: WorkforceResource }>(resourceResponse);
    resourceId = resourceBody?.item?.id;
    assignmentId = resourceBody?.item?.assignment.id;
    resourceCreated = resourceResponse.status === 201 && Boolean(resourceId) && resourceBody?.item?.name === fixture.resource.name;
    if (!resourceCreated) throw new Error("Synthetic workforce resource was not created.");

    const demandResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/labor-demands`,
      fixture.demand,
      cookie,
      requestId
    );
    operations.push("labor-demand-create");
    lastHttpStatus = demandResponse.status;
    const demandBody = await safeJson<{ item?: ProjectLaborDemand }>(demandResponse);
    demandId = demandBody?.item?.id;
    demandCreated = demandResponse.status === 201 && Boolean(demandId) && demandBody?.item?.source === marker;
    if (!demandCreated) throw new Error("Synthetic labor demand was not created.");

    const afterResponse = await get(baseUrl, `/api/projects/${SMOKE_PROJECT_ID}/resources`, cookie, requestId);
    operations.push("workforce-after-read");
    lastHttpStatus = afterResponse.status;
    const afterBody = await safeJson<WorkforceApiResponse>(afterResponse);
    if (afterResponse.status !== 200 || !afterBody?.items || !afterBody.demands || !afterBody.policy) {
      throw new Error("Workforce payroll result could not be read.");
    }
    const createdResource = afterBody.items.find((item) => item.id === resourceId);
    const createdDemand = afterBody.demands.find((item) => item.id === demandId);
    resourceListed = Boolean(createdResource);
    demandListed = Boolean(createdDemand);
    if (!createdResource || !createdDemand) throw new Error("Synthetic workforce rows are missing from the project read model.");

    const isolatedEconomics = buildWorkforceEconomics({
      resources: [createdResource],
      demands: [createdDemand],
      policy: afterBody.policy
    });
    const expected = expectedPayrollAmounts(
      createdDemand.grossMonthlySalary * createdDemand.personMonths,
      afterBody.policy
    );
    payroll = {
      grossPayroll: isolatedEconomics.grossPayroll,
      employerContributions: isolatedEconomics.employerContributions,
      withheldPersonalIncomeTax: isolatedEconomics.withheldPersonalIncomeTax,
      netPayroll: isolatedEconomics.netPayroll,
      totalEmployerCost: isolatedEconomics.totalEmployerCost
    };

    const afterEconomics = buildWorkforceEconomics({
      resources: afterBody.items,
      demands: afterBody.demands,
      policy: afterBody.policy,
      budgetItems: bundle.budgetItems ?? [],
      contractAmount: bundle.project.contractAmount
    });
    const afterCapacity = buildWorkforceCapacitySummary(afterBody.items, afterBody.demands, afterBody.policy);
    projectEconomics = {
      forecastCostDelta: afterEconomics.adjustedForecastCost - beforeEconomics.adjustedForecastCost,
      marginBefore: beforeEconomics.adjustedForecastMarginPercent,
      marginAfter: afterEconomics.adjustedForecastMarginPercent
    };
    capacity = {
      headcountDelta: afterCapacity.headcount - beforeCapacity.headcount,
      allocatedHoursDelta: afterCapacity.allocatedCapacityHours - beforeCapacity.allocatedCapacityHours
    };

    const payrollCalculated = closeEnough(isolatedEconomics.grossPayroll, expected.grossPayroll);
    const contributionsCalculated =
      closeEnough(isolatedEconomics.employerContributions, expected.employerContributions) &&
      closeEnough(isolatedEconomics.totalEmployerCost, expected.totalEmployerCost);
    const personalIncomeTaxCalculated =
      closeEnough(isolatedEconomics.withheldPersonalIncomeTax, expected.withheldPersonalIncomeTax) &&
      closeEnough(isolatedEconomics.netPayroll, expected.netPayroll);
    const capacityChanged = closeEnough(capacity.headcountDelta, 1) && closeEnough(capacity.allocatedHoursDelta, 160);
    const profitabilityChanged =
      projectEconomics.forecastCostDelta >= desiredCostDelta - 1 &&
      (bundle.project.contractAmount <= 0 || projectEconomics.marginAfter < projectEconomics.marginBefore);

    const demandDeleteResponse = await deleteJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/labor-demands/${demandId}`,
      {},
      cookie,
      requestId
    );
    operations.push("labor-demand-delete");
    const resourceDeleteResponse = await deleteJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/resources/${resourceId}`,
      {},
      cookie,
      requestId
    );
    operations.push("resource-unassign");
    lastHttpStatus = resourceDeleteResponse.status;

    const cleanupResult = await cleanupWorkforcePayrollSmoke({
      organizationId,
      marker,
      resourceId,
      assignmentId,
      demandId
    });
    resourceCleaned = cleanupResult.resourceCleaned;
    demandCleaned = cleanupResult.demandCleaned;
    cleanup =
      demandDeleteResponse.status === 200 &&
      resourceDeleteResponse.status === 200 &&
      resourceCleaned &&
      demandCleaned
        ? "pass"
        : "fail";
    operations.push("workforce-cleanup");

    await restoreTemporaryImportRole(temporaryRole);
    temporaryRole = undefined;
    permissionScope = "temporary-project-manager-restored";
    operations.push("restore-project-role");

    const status = workforcePayrollSmokePassed({
      resourceCreated,
      demandCreated,
      resourceListed,
      demandListed,
      payrollCalculated,
      contributionsCalculated,
      personalIncomeTaxCalculated,
      capacityChanged,
      profitabilityChanged,
      cleanupPassed: cleanup === "pass",
      roleRestored: permissionScope === "temporary-project-manager-restored"
    })
      ? "pass"
      : "fail";

    return {
      name: "workforce payroll lifecycle smoke",
      status,
      httpStatus: status === "pass" ? undefined : lastHttpStatus,
      detail: status === "pass" ? undefined : "Workforce payroll lifecycle did not complete every calculation or cleanup check.",
      projectId: SMOKE_PROJECT_ID,
      operations,
      resource: { created: resourceCreated, listed: resourceListed, cleaned: resourceCleaned },
      demand: { created: demandCreated, listed: demandListed, cleaned: demandCleaned },
      payroll,
      projectEconomics,
      capacity,
      permissionScope,
      cleanup
    };
  } catch (error) {
    if (organizationId && marker) {
      await cleanupWorkforcePayrollSmoke({ organizationId, marker, resourceId, assignmentId, demandId })
        .then((result) => {
          resourceCleaned = result.resourceCleaned;
          demandCleaned = result.demandCleaned;
          cleanup = resourceCleaned && demandCleaned ? "pass" : "fail";
          operations.push("workforce-cleanup");
        })
        .catch(() => {
          cleanup = "fail";
        });
    }
    if (temporaryRole) {
      await restoreTemporaryImportRole(temporaryRole)
        .then(() => {
          permissionScope = "temporary-project-manager-restored";
          operations.push("restore-project-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    return {
      name: "workforce payroll lifecycle smoke",
      status: "fail",
      httpStatus: lastHttpStatus,
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      operations,
      resource: { created: resourceCreated, listed: resourceListed, cleaned: resourceCleaned },
      demand: { created: demandCreated, listed: demandListed, cleaned: demandCleaned },
      ...(payroll ? { payroll } : {}),
      ...(projectEconomics ? { projectEconomics } : {}),
      ...(capacity ? { capacity } : {}),
      permissionScope,
      cleanup
    };
  }
}

async function cleanupWorkforcePayrollImportSmoke(input: {
  marker: string;
  importBatchId?: string;
  budgetItemIds?: string[];
  materialIds?: string[];
  scheduleItemIds?: string[];
  laborDemandIds?: string[];
  sectionIds?: string[];
  payrollPolicyId?: string;
}) {
  assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");

  const [budgetItems, materials, scheduleItems, demands, sections] = await Promise.all([
    prisma.budgetItem.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(input.budgetItemIds?.length ? [{ id: { in: input.budgetItemIds } }] : [])
        ]
      },
      select: { id: true }
    }),
    prisma.material.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(input.materialIds?.length ? [{ id: { in: input.materialIds } }] : [])
        ]
      },
      select: { id: true }
    }),
    prisma.scheduleItem.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(input.scheduleItemIds?.length ? [{ id: { in: input.scheduleItemIds } }] : [])
        ]
      },
      select: { id: true }
    }),
    prisma.projectLaborDemand.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { profession: { startsWith: input.marker } },
          ...(input.importBatchId ? [{ importBatchId: input.importBatchId }] : []),
          ...(input.laborDemandIds?.length ? [{ id: { in: input.laborDemandIds } }] : [])
        ]
      },
      select: { id: true }
    }),
    prisma.budgetSection.findMany({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(input.sectionIds?.length ? [{ id: { in: input.sectionIds } }] : [])
        ]
      },
      select: { id: true }
    })
  ]);

  const budgetItemIds = [...new Set([...budgetItems.map((item) => item.id), ...(input.budgetItemIds ?? [])])];
  const materialIds = [...new Set([...materials.map((item) => item.id), ...(input.materialIds ?? [])])];
  const scheduleItemIds = [...new Set([...scheduleItems.map((item) => item.id), ...(input.scheduleItemIds ?? [])])];
  const laborDemandIds = [...new Set([...demands.map((item) => item.id), ...(input.laborDemandIds ?? [])])];
  const sectionIds = [...new Set([...sections.map((item) => item.id), ...(input.sectionIds ?? [])])];

  const removed = await prisma.$transaction(async (tx) => {
    const allocations = laborDemandIds.length
      ? await tx.projectLaborAllocation.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, laborDemandId: { in: laborDemandIds } }
      })
      : { count: 0 };
    const laborDemands = laborDemandIds.length
      ? await tx.projectLaborDemand.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: laborDemandIds } }
      })
      : { count: 0 };
    const schedules = scheduleItemIds.length
      ? await tx.scheduleItem.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: scheduleItemIds } }
      })
      : { count: 0 };
    const deletedMaterials = materialIds.length
      ? await tx.material.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: materialIds } }
      })
      : { count: 0 };
    const budget = budgetItemIds.length
      ? await tx.budgetItem.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: budgetItemIds } }
      })
      : { count: 0 };
    const deletedSections = sectionIds.length
      ? await tx.budgetSection.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, id: { in: sectionIds } }
      })
      : { count: 0 };
    const audit = input.importBatchId
      ? await tx.auditLog.deleteMany({
        where: { projectId: SMOKE_PROJECT_ID, entityId: input.importBatchId }
      })
      : { count: 0 };
    const batch = input.importBatchId
      ? await tx.importBatch.deleteMany({
        where: { id: input.importBatchId, projectId: SMOKE_PROJECT_ID }
      })
      : { count: 0 };
    const payrollPolicy = input.payrollPolicyId
      ? await tx.projectPayrollPolicy.deleteMany({
        where: { id: input.payrollPolicyId, projectId: SMOKE_PROJECT_ID }
      })
      : { count: 0 };

    return allocations.count + laborDemands.count + schedules.count + deletedMaterials.count +
      budget.count + deletedSections.count + audit.count + batch.count + payrollPolicy.count;
  });

  const [
    remainingBudget,
    remainingMaterials,
    remainingSchedules,
    remainingDemands,
    remainingSections,
    remainingBatch,
    remainingAudit,
    remainingPolicy
  ] = await Promise.all([
    prisma.budgetItem.count({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(budgetItemIds.length ? [{ id: { in: budgetItemIds } }] : [])
        ]
      }
    }),
    prisma.material.count({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(materialIds.length ? [{ id: { in: materialIds } }] : [])
        ]
      }
    }),
    prisma.scheduleItem.count({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(scheduleItemIds.length ? [{ id: { in: scheduleItemIds } }] : [])
        ]
      }
    }),
    prisma.projectLaborDemand.count({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { profession: { startsWith: input.marker } },
          ...(input.importBatchId ? [{ importBatchId: input.importBatchId }] : []),
          ...(laborDemandIds.length ? [{ id: { in: laborDemandIds } }] : [])
        ]
      }
    }),
    prisma.budgetSection.count({
      where: {
        projectId: SMOKE_PROJECT_ID,
        OR: [
          { name: { startsWith: input.marker } },
          ...(sectionIds.length ? [{ id: { in: sectionIds } }] : [])
        ]
      }
    }),
    input.importBatchId
      ? prisma.importBatch.count({ where: { id: input.importBatchId, projectId: SMOKE_PROJECT_ID } })
      : Promise.resolve(0),
    input.importBatchId
      ? prisma.auditLog.count({ where: { projectId: SMOKE_PROJECT_ID, entityId: input.importBatchId } })
      : Promise.resolve(0),
    input.payrollPolicyId
      ? prisma.projectPayrollPolicy.count({ where: { id: input.payrollPolicyId, projectId: SMOKE_PROJECT_ID } })
      : Promise.resolve(0)
  ]);

  return {
    cleaned:
      remainingBudget === 0 &&
      remainingMaterials === 0 &&
      remainingSchedules === 0 &&
      remainingDemands === 0 &&
      remainingSections === 0 &&
      remainingBatch === 0 &&
      remainingAudit === 0 &&
      remainingPolicy === 0,
    removed
  };
}

async function runWorkforcePayrollImportSmoke(
  baseUrl: string,
  cookie: string,
  requestId: string
): Promise<RuntimeWorkforcePayrollImportSmokeResult> {
  const operations: string[] = [];
  let permissionScope: RuntimeWorkforcePayrollImportSmokeResult["permissionScope"];
  let cleanup: RuntimeWorkforcePayrollImportSmokeResult["cleanup"] = "skip";
  let temporaryRole: Awaited<ReturnType<typeof grantTemporaryImportRole>> | undefined;
  const runKey = requestId.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || Date.now().toString();
  const fixture = buildWorkforcePayrollImportSmokeWorkbook(runKey);
  let importBatchId: string | undefined;
  let budgetItemIds: string[] = [];
  let materialIds: string[] = [];
  let scheduleItemIds: string[] = [];
  let laborDemandIds: string[] = [];
  let sectionIds: string[] = [];
  let payrollPolicyId: string | undefined;
  let payrollPolicyExisted: boolean | undefined;
  let previewReport: RuntimeWorkforcePayrollImportSmokeResult["preview"];
  let commitReport: RuntimeWorkforcePayrollImportSmokeResult["commit"];
  let economicsReport: RuntimeWorkforcePayrollImportSmokeResult["economics"];
  let lastHttpStatus: number | undefined;

  try {
    assertSmokeMutationTarget(SMOKE_PROJECT_ID, "staging");
    if ((process.env.APP_ENV ?? process.env.NODE_ENV) === "production") {
      throw new Error("Workforce payroll import smoke is blocked in production.");
    }
    const smokeProject = await prisma.project.findUnique({
      where: { id: SMOKE_PROJECT_ID },
      select: { id: true, isSmokeProject: true }
    });
    if (!smokeProject?.isSmokeProject) {
      throw new Error(`${SMOKE_PROJECT_ID} is missing or isSmokeProject=false`);
    }

    const existingPayrollPolicy = await prisma.projectPayrollPolicy.findUnique({
      where: { projectId: SMOKE_PROJECT_ID },
      select: { id: true }
    });
    payrollPolicyExisted = Boolean(existingPayrollPolicy);

    temporaryRole = await grantTemporaryImportRole();
    operations.push("temporary-project-manager-role");

    const form = new FormData();
    form.append(
      "file",
      new Blob([Uint8Array.from(fixture.bytes)], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }),
      fixture.fileName
    );
    const previewResponse = await postForm(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/imports/budget/preview`,
      form,
      cookie,
      requestId
    );
    operations.push("excel-preview");
    lastHttpStatus = previewResponse.status;
    const preview = await safeJson<ImportPreview>(previewResponse);
    importBatchId = preview?.importBatchId;
    if (!preview || previewResponse.status !== 200 || !importBatchId) {
      throw new Error("Synthetic FOT workbook did not produce a commit-ready preview.");
    }

    const inspectedPreview = inspectWorkforcePayrollImportPreview(preview, fixture);
    previewReport = {
      payrollItems: preview.budgetItems.filter((item) => item.kind === "payroll").length,
      laborDemands: preview.laborDemands?.length ?? 0,
      laborAllocations: preview.laborDemands?.reduce((sum, item) => sum + item.allocations.length, 0) ?? 0,
      allocationSharePercent: inspectedPreview.allocationSharePercent,
      personMonths: inspectedPreview.demand?.personMonths ?? 0,
      plannedHours: inspectedPreview.demand?.plannedHours ?? 0
    };
    if (!inspectedPreview.recognized || preview.errors.length > 0) {
      throw new Error("Synthetic FOT workbook preview did not recognize payroll demand and VOR allocation.");
    }

    const candidateSectionNames = [...new Set([
      ...preview.sections.map((item) => item.name),
      ...preview.budgetItems.map((item) => item.section)
    ])];
    const sectionsBeforeCommit = candidateSectionNames.length
      ? await prisma.budgetSection.findMany({
        where: { projectId: SMOKE_PROJECT_ID, name: { in: candidateSectionNames } },
        select: { id: true }
      })
      : [];
    const sectionIdsBeforeCommit = new Set(sectionsBeforeCommit.map((item) => item.id));

    const commitResponse = await postJson(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/imports/budget/commit`,
      { importBatchId, mode: "append", replaceConfirmed: false },
      cookie,
      requestId
    );
    operations.push("excel-commit");
    lastHttpStatus = commitResponse.status;
    const commit = await safeJson<{
      ok?: boolean;
      budgetItems?: BudgetItem[];
      materials?: Array<{ id: string }>;
      scheduleItems?: Array<{ id: string }>;
      laborDemands?: ProjectLaborDemand[];
    }>(commitResponse);
    budgetItemIds = commit?.budgetItems?.map((item) => item.id) ?? [];
    materialIds = commit?.materials?.map((item) => item.id) ?? [];
    scheduleItemIds = commit?.scheduleItems?.map((item) => item.id) ?? [];
    laborDemandIds = commit?.laborDemands?.map((item) => item.id) ?? [];
    if (commitResponse.status !== 200 || commit?.ok !== true) {
      throw new Error("Synthetic FOT workbook commit failed.");
    }

    const sectionsAfterCommit = candidateSectionNames.length
      ? await prisma.budgetSection.findMany({
        where: { projectId: SMOKE_PROJECT_ID, name: { in: candidateSectionNames } },
        select: { id: true }
      })
      : [];
    sectionIds = sectionsAfterCommit
      .map((item) => item.id)
      .filter((id) => !sectionIdsBeforeCommit.has(id));
    if (!existingPayrollPolicy) {
      payrollPolicyId = (await prisma.projectPayrollPolicy.findUnique({
        where: { projectId: SMOKE_PROJECT_ID },
        select: { id: true }
      }))?.id;
    }

    const committedDemand = commit.laborDemands?.find(
      (item) => item.profession === fixture.profession && item.importBatchId === importBatchId
    );
    const allocationSharePercent = committedDemand?.allocations.reduce((sum, item) => sum + item.sharePercent, 0) ?? 0;
    const linkedAllocation = committedDemand?.allocations.find(
      (item) =>
        item.workName === fixture.workName &&
        Boolean(item.budgetItemId) &&
        commit.budgetItems?.some((budgetItem) => budgetItem.id === item.budgetItemId && budgetItem.name === fixture.workName)
    );
    const importBatchCommitted = (await prisma.importBatch.findUnique({
      where: { id: importBatchId },
      select: { status: true }
    }))?.status === "committed";
    const commitCreated =
      Boolean(committedDemand) &&
      commit.budgetItems?.some((item) => item.name === fixture.profession && item.kind === "payroll") === true &&
      Math.abs(allocationSharePercent - 100) <= 0.001 &&
      importBatchCommitted;
    if (!commitCreated || !linkedAllocation || !committedDemand) {
      throw new Error("Committed FOT rows or their VOR allocation were incomplete.");
    }

    const workforceResponse = await get(
      baseUrl,
      `/api/projects/${SMOKE_PROJECT_ID}/resources`,
      cookie,
      requestId
    );
    operations.push("workforce-read");
    lastHttpStatus = workforceResponse.status;
    const workforce = await safeJson<WorkforceApiResponse>(workforceResponse);
    const listedDemand = workforce?.demands?.find((item) => item.id === committedDemand.id);
    if (workforceResponse.status !== 200 || !workforce?.policy || !listedDemand) {
      throw new Error("Imported FOT demand is missing from the workforce read model.");
    }

    const importedBudgetItems = commit.budgetItems ?? [];
    const economics = buildWorkforceEconomics({
      resources: [],
      demands: [listedDemand],
      policy: workforce.policy,
      budgetItems: importedBudgetItems
    });
    const expected = expectedPayrollAmounts(fixture.expectedGrossPayroll, workforce.policy);
    economicsReport = {
      grossPayroll: economics.grossPayroll,
      employerContributions: economics.employerContributions,
      withheldPersonalIncomeTax: economics.withheldPersonalIncomeTax,
      netPayroll: economics.netPayroll,
      totalEmployerCost: economics.totalEmployerCost,
      payrollBudget: economics.payrollBudget,
      adjustedForecastCost: economics.adjustedForecastCost
    };
    const payrollCalculated =
      closeEnough(economics.grossPayroll, expected.grossPayroll) &&
      closeEnough(economics.payrollBudget, expected.grossPayroll);
    const taxesCalculated =
      closeEnough(economics.employerContributions, expected.employerContributions) &&
      closeEnough(economics.withheldPersonalIncomeTax, expected.withheldPersonalIncomeTax) &&
      closeEnough(economics.netPayroll, expected.netPayroll);
    const economicsCalculated =
      closeEnough(economics.totalEmployerCost, expected.totalEmployerCost) &&
      closeEnough(economics.uncoveredEmployerCost, expected.employerContributions) &&
      economics.adjustedForecastCost >= economics.totalEmployerCost;

    commitReport = {
      budgetItems: budgetItemIds.length,
      laborDemands: laborDemandIds.length,
      laborAllocations: committedDemand.allocations.length,
      demandListed: Boolean(listedDemand),
      importBatchCommitted
    };

    const cleanupResult = await cleanupWorkforcePayrollImportSmoke({
      marker: fixture.marker,
      importBatchId,
      budgetItemIds,
      materialIds,
      scheduleItemIds,
      laborDemandIds,
      sectionIds,
      payrollPolicyId
    });
    cleanup = cleanupResult.cleaned ? "pass" : "fail";
    operations.push("import-cleanup");

    await restoreTemporaryImportRole(temporaryRole);
    temporaryRole = undefined;
    permissionScope = "temporary-project-manager-restored";
    operations.push("restore-project-role");

    const status = workforcePayrollImportSmokePassed({
      previewRecognized: inspectedPreview.recognized,
      commitCreated,
      demandListed: Boolean(listedDemand),
      allocationLinked: Boolean(linkedAllocation),
      payrollCalculated,
      taxesCalculated,
      economicsCalculated,
      cleanupPassed: cleanup === "pass",
      roleRestored: permissionScope === "temporary-project-manager-restored"
    })
      ? "pass"
      : "fail";

    return {
      name: "workforce payroll Excel import smoke",
      status,
      httpStatus: status === "pass" ? undefined : lastHttpStatus,
      detail: status === "pass" ? undefined : "FOT import lifecycle did not complete every preview, commit, economics, or cleanup check.",
      projectId: SMOKE_PROJECT_ID,
      importBatchId,
      operations,
      preview: previewReport,
      commit: commitReport,
      economics: economicsReport,
      permissionScope,
      cleanup
    };
  } catch (error) {
    if (payrollPolicyExisted === false && !payrollPolicyId) {
      payrollPolicyId = (await prisma.projectPayrollPolicy.findUnique({
        where: { projectId: SMOKE_PROJECT_ID },
        select: { id: true }
      }).catch(() => null))?.id;
    }
    await cleanupWorkforcePayrollImportSmoke({
      marker: fixture.marker,
      importBatchId,
      budgetItemIds,
      materialIds,
      scheduleItemIds,
      laborDemandIds,
      sectionIds,
      payrollPolicyId
    }).then((result) => {
      cleanup = result.cleaned ? "pass" : "fail";
      operations.push("import-cleanup");
    }).catch(() => {
      cleanup = "fail";
    });
    if (temporaryRole) {
      await restoreTemporaryImportRole(temporaryRole)
        .then(() => {
          permissionScope = "temporary-project-manager-restored";
          operations.push("restore-project-role");
        })
        .catch(() => {
          permissionScope = "restore-failed";
        });
    }
    return {
      name: "workforce payroll Excel import smoke",
      status: "fail",
      httpStatus: lastHttpStatus,
      detail: failureDetail(error),
      projectId: SMOKE_PROJECT_ID,
      importBatchId,
      operations,
      ...(previewReport ? { preview: previewReport } : {}),
      ...(commitReport ? { commit: commitReport } : {}),
      ...(economicsReport ? { economics: economicsReport } : {}),
      permissionScope,
      cleanup
    };
  }
}

export async function runStagingSmokeBootstrap(input: RuntimeSmokeInput): Promise<RuntimeSmokeResult> {
  const password = generateSmokePassword();
  const smokeUser = await createOrRotateStagingSmokeUser(prisma, {
    ...process.env,
    APP_ENV: "staging",
    NODE_ENV: "production",
    CREATE_STAGING_SMOKE_USER_CONFIRM,
    SMOKE_EMAIL: STAGING_SMOKE_EMAIL,
    SMOKE_PASSWORD: password
  });

  const checks: RuntimeSmokeCheck[] = [];
  let sessionCookie = "";

  try {
    const login = await postJson(input.baseUrl, "/api/auth/login", { email: STAGING_SMOKE_EMAIL, password }, "", input.requestId);
    sessionCookie = cookieFrom(login);
    checks.push({ ...check("login", login, [200]), detail: sessionCookie ? undefined : "session cookie was not set" });
    if (!sessionCookie) checks[checks.length - 1].status = "fail";
  } catch (error) {
    checks.push(failed("login", error));
  }

  try {
    checks.push(check("auth me", await get(input.baseUrl, "/api/auth/me", sessionCookie, input.requestId), [200]));
  } catch (error) {
    checks.push(failed("auth me", error));
  }

  try {
    checks.push(check("project-smoke read", await get(input.baseUrl, "/api/projects/project-smoke", sessionCookie, input.requestId), [200]));
  } catch (error) {
    checks.push(failed("project-smoke read", error));
  }

  try {
    checks.push(check("unauth AI guard", await postJson(input.baseUrl, "/api/projects/project-smoke/ai/summary", {}, "", input.requestId), [403]));
  } catch (error) {
    checks.push(failed("unauth AI guard", error));
  }

  try {
    checks.push(
      check(
        "authenticated missing-project AI guard",
        await postJson(input.baseUrl, "/api/projects/project-missing-ai/ai/summary", {}, sessionCookie, input.requestId),
        [404]
      )
    );
  } catch (error) {
    checks.push(failed("authenticated missing-project AI guard", error));
  }

  let liveAi: RuntimeSmokeResult["liveAi"] = {
    name: "live AI smoke",
    status: "skip",
    requested: false,
    detail: "includeLiveAi was not true"
  };

  if (input.includeLiveAi) {
    liveAi = {
      name: "live AI smoke",
      status: "fail",
      requested: true
    };
    try {
      const response = await postJson(
        input.baseUrl,
        "/api/projects/project-smoke/ai/summary",
        { instructions: AI_SMOKE_PROMPT },
        sessionCookie,
        input.requestId
      );
      const body = (await response.json().catch(() => null)) as {
        ok?: boolean;
        insight?: { summary?: string; draftText?: string };
        error?: string;
        message?: string;
      } | null;
      const responseText = body?.insight?.summary ?? body?.insight?.draftText ?? "";
      liveAi = {
        name: "live AI smoke",
        status: response.status === 200 && body?.ok === true && Boolean(responseText) ? "pass" : "fail",
        requested: true,
        httpStatus: response.status,
        responseChars: responseText.length,
        providerError: body?.error ?? body?.message
      };
    } catch (error) {
      liveAi = { ...liveAi, detail: error instanceof Error ? error.message.slice(0, 160) : "request failed" };
    }
  }

  const optionalChecks: RuntimeSmokeCheck[] = [];
  let storage: RuntimeSmokeResult["storage"];
  let email: RuntimeSmokeResult["email"];
  let connectors: RuntimeSmokeResult["connectors"];
  let importSmoke: RuntimeSmokeResult["importSmoke"];
  let projectCreationDocumentsSmoke: RuntimeSmokeResult["projectCreationDocumentsSmoke"];
  let projectControlsSmoke: RuntimeSmokeResult["projectControlsSmoke"];
  let aiDecisionJournalSmoke: RuntimeSmokeResult["aiDecisionJournalSmoke"];
  let workforcePayrollSmoke: RuntimeSmokeResult["workforcePayrollSmoke"];
  let workforcePayrollImportSmoke: RuntimeSmokeResult["workforcePayrollImportSmoke"];

  if (input.includeStorageSmoke) {
    storage = await runStorageSmoke(input.requestId);
    optionalChecks.push(storage);
  }

  if (input.includeEmailSmoke) {
    email = await runEmailSmoke();
    optionalChecks.push(email);
  }

  if (input.includeConnectorReadiness) {
    connectors = connectorReadiness();
    optionalChecks.push(connectors);
  }

  if (input.includeImportSmoke) {
    importSmoke = await runImportSmoke(input.baseUrl, sessionCookie, input.requestId, input.includePipelineSmoke);
    optionalChecks.push(importSmoke);
  }

  if (input.includeProjectCreationDocumentsSmoke) {
    projectCreationDocumentsSmoke = await runProjectCreationDocumentsSmoke(input.baseUrl, sessionCookie, input.requestId);
    optionalChecks.push(projectCreationDocumentsSmoke);
  }

  if (input.includeProjectControlsSmoke) {
    projectControlsSmoke = await runProjectControlsSmoke(input.baseUrl, sessionCookie, input.requestId);
    optionalChecks.push(projectControlsSmoke);
  }

  if (input.includeAiDecisionJournalSmoke) {
    aiDecisionJournalSmoke = await runAiDecisionJournalSmoke(input.baseUrl, sessionCookie, input.requestId);
    optionalChecks.push(aiDecisionJournalSmoke);
  }

  if (input.includeWorkforcePayrollSmoke) {
    workforcePayrollSmoke = await runWorkforcePayrollSmoke(input.baseUrl, sessionCookie, input.requestId);
    optionalChecks.push(workforcePayrollSmoke);
  }

  if (input.includeWorkforcePayrollImportSmoke) {
    workforcePayrollImportSmoke = await runWorkforcePayrollImportSmoke(input.baseUrl, sessionCookie, input.requestId);
    optionalChecks.push(workforcePayrollImportSmoke);
  }

  return {
    ok:
      checks.every((item) => item.status === "pass") &&
      optionalChecks.every((item) => item.status === "pass" || item.status === "skip") &&
      (liveAi.status === "pass" || liveAi.status === "skip"),
    smokeUser,
    checks,
    liveAi,
    ...(storage ? { storage } : {}),
    ...(email ? { email } : {}),
    ...(connectors ? { connectors } : {}),
    ...(importSmoke ? { importSmoke } : {}),
    ...(projectCreationDocumentsSmoke ? { projectCreationDocumentsSmoke } : {}),
    ...(projectControlsSmoke ? { projectControlsSmoke } : {}),
    ...(aiDecisionJournalSmoke ? { aiDecisionJournalSmoke } : {}),
    ...(workforcePayrollSmoke ? { workforcePayrollSmoke } : {}),
    ...(workforcePayrollImportSmoke ? { workforcePayrollImportSmoke } : {}),
    secretsPrinted: false
  };
}
