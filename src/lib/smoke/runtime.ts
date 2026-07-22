import { randomBytes } from "crypto";
import * as XLSX from "xlsx";
import { connectorSummary, getConnectorStatuses } from "@/lib/connectors/status";
import { buildInviteEmail, getEmailProvider, getEmailProviderStatus } from "@/lib/email";
import { getEnvStatus } from "@/lib/env";
import { buildDeterministicImportExplanation } from "@/lib/excel/ai-import-summary";
import type { ImportPreview } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";
import { getStorageProvider } from "@/lib/storage";
import { assertSmokeMutationTarget, SMOKE_PROJECT_ID } from "./cleanup";
import { CREATE_STAGING_SMOKE_USER_CONFIRM, createOrRotateStagingSmokeUser, type StagingSmokeUserReport } from "./user";

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
    secretsPrinted: false
  };
}
