import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";
import { readDocumentFile } from "@/lib/storage/documents";
import { getOpenAiRuntimeConfig } from "@/lib/env";
import { extractKnowledgeDocument, UnsupportedKnowledgeDocumentError } from "./extract";
import {
  downloadGoogleDriveFile,
  GoogleDriveSyncError,
  googleDriveConnectionStatus,
  listGoogleDriveFolder,
  type GoogleDriveProjectFile
} from "./google-drive";
import { chunkKnowledgeSections, knowledgeTerms, scoreKnowledgeChunk } from "./search";

type IndexSource = {
  sourceKind: "pgs" | "google_drive";
  sourceVersion: string;
  documentId?: string | null;
  documentVersionId?: string | null;
  externalId?: string | null;
  title: string;
  fileName?: string | null;
  mimeType?: string | null;
  sourceUrl?: string | null;
  sourceModifiedAt?: Date | null;
};

export type KnowledgeIndexResult = {
  discovered: number;
  indexed: number;
  unchanged: number;
  unsupported: number;
  failed: number;
  chunks: number;
  warnings: string[];
};

function emptyResult(): KnowledgeIndexResult {
  return { discovered: 0, indexed: 0, unchanged: 0, unsupported: 0, failed: 0, chunks: 0, warnings: [] };
}

function contentHash(bytes: Buffer) {
  return crypto.createHash("sha256").update(bytes).digest("hex");
}

function safeError(error: unknown) {
  if (error instanceof UnsupportedKnowledgeDocumentError) return error.message.slice(0, 500);
  if (error instanceof GoogleDriveSyncError) return error.message.slice(0, 500);
  return "Не удалось извлечь текст. Проверьте формат и целостность файла.";
}

async function existingKnowledgeDocument(projectId: string, source: IndexSource) {
  return prisma.projectKnowledgeDocument.findFirst({
    where: source.documentId
      ? { projectId, documentId: source.documentId }
      : { projectId, sourceKind: source.sourceKind, externalId: source.externalId }
  });
}

async function storeKnowledgeDocument(input: {
  organizationId: string;
  projectId: string;
  source: IndexSource;
  bytes: Buffer;
}) {
  const extracted = await extractKnowledgeDocument({
    fileName: input.source.fileName ?? input.source.title,
    mimeType: input.source.mimeType,
    bytes: input.bytes
  });
  const chunks = chunkKnowledgeSections(extracted.sections);
  if (!chunks.length) throw new UnsupportedKnowledgeDocumentError("В файле не найден текстовый слой. Для скана нужен PDF с OCR.");
  const hash = contentHash(input.bytes);
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const existing = await tx.projectKnowledgeDocument.findFirst({
      where: input.source.documentId
        ? { projectId: input.projectId, documentId: input.source.documentId }
        : { projectId: input.projectId, sourceKind: input.source.sourceKind, externalId: input.source.externalId }
    });
    const data = {
      organizationId: input.organizationId,
      projectId: input.projectId,
      documentId: input.source.documentId ?? null,
      documentVersionId: input.source.documentVersionId ?? null,
      sourceKind: input.source.sourceKind,
      externalId: input.source.externalId ?? null,
      sourceVersion: input.source.sourceVersion,
      title: input.source.title,
      fileName: input.source.fileName ?? null,
      mimeType: input.source.mimeType ?? null,
      sourceUrl: input.source.sourceUrl ?? null,
      contentHash: hash,
      status: "ready",
      error: extracted.warnings.length ? extracted.warnings.join(" ").slice(0, 500) : null,
      charCount: chunks.reduce((sum, chunk) => sum + chunk.charCount, 0),
      chunkCount: chunks.length,
      sourceModifiedAt: input.source.sourceModifiedAt ?? null,
      indexedAt: now
    };
    const stored = existing
      ? await tx.projectKnowledgeDocument.update({ where: { id: existing.id }, data })
      : await tx.projectKnowledgeDocument.create({ data });
    await tx.projectKnowledgeChunk.deleteMany({ where: { knowledgeDocumentId: stored.id } });
    await tx.projectKnowledgeChunk.createMany({
      data: chunks.map((chunk, index) => ({
        organizationId: input.organizationId,
        projectId: input.projectId,
        knowledgeDocumentId: stored.id,
        chunkIndex: index,
        locator: chunk.locator,
        text: chunk.text,
        terms: chunk.terms,
        charCount: chunk.charCount
      }))
    });
  });

  return { chunks: chunks.length, warnings: extracted.warnings };
}

async function storeIndexError(input: {
  organizationId: string;
  projectId: string;
  source: IndexSource;
  error: unknown;
}) {
  const existing = await existingKnowledgeDocument(input.projectId, input.source);
  const status = input.error instanceof UnsupportedKnowledgeDocumentError ? "unsupported" : "error";
  const data = {
    organizationId: input.organizationId,
    projectId: input.projectId,
    documentId: input.source.documentId ?? null,
    documentVersionId: input.source.documentVersionId ?? null,
    sourceKind: input.source.sourceKind,
    externalId: input.source.externalId ?? null,
    sourceVersion: input.source.sourceVersion,
    title: input.source.title,
    fileName: input.source.fileName ?? null,
    mimeType: input.source.mimeType ?? null,
    sourceUrl: input.source.sourceUrl ?? null,
    contentHash: "",
    status,
    error: safeError(input.error),
    charCount: 0,
    chunkCount: 0,
    sourceModifiedAt: input.source.sourceModifiedAt ?? null,
    indexedAt: new Date()
  };
  const stored = existing
    ? await prisma.projectKnowledgeDocument.update({ where: { id: existing.id }, data })
    : await prisma.projectKnowledgeDocument.create({ data });
  await prisma.projectKnowledgeChunk.deleteMany({ where: { knowledgeDocumentId: stored.id } });
  return status;
}

async function indexOne(input: {
  organizationId: string;
  projectId: string;
  source: IndexSource;
  loadBytes: () => Promise<Buffer>;
  force?: boolean;
}, result: KnowledgeIndexResult) {
  result.discovered += 1;
  const existing = await existingKnowledgeDocument(input.projectId, input.source);
  if (!input.force && existing?.sourceVersion === input.source.sourceVersion && existing.status === "ready") {
    result.unchanged += 1;
    result.chunks += existing.chunkCount;
    return;
  }
  try {
    const stored = await storeKnowledgeDocument({ ...input, bytes: await input.loadBytes() });
    result.indexed += 1;
    result.chunks += stored.chunks;
    result.warnings.push(...stored.warnings.map((warning) => `${input.source.title}: ${warning}`));
  } catch (error) {
    const status = await storeIndexError({ ...input, error });
    if (status === "unsupported") result.unsupported += 1;
    else result.failed += 1;
  }
}

export async function indexPgsProjectDocuments(projectId: string, force = false) {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    select: {
      organizationId: true,
      documents: {
        where: { dailyReportId: null },
        orderBy: { updatedAt: "asc" },
        include: { versions: { orderBy: { versionNumber: "desc" }, take: 1 } }
      }
    }
  });
  if (!project) throw new Error("Project not found");
  const result = emptyResult();
  for (const document of project.documents) {
    const version = document.versions[0];
    const storageKey = version?.storageKey ?? document.storageKey;
    const fileName = version?.fileName ?? document.fileName ?? document.title;
    const mimeType = version?.mimeType ?? document.mimeType;
    const sourceVersion = version?.id ?? `${document.version}:${document.updatedAt.toISOString()}:${document.sizeBytes ?? 0}`;
    const source: IndexSource = {
      sourceKind: "pgs",
      sourceVersion,
      documentId: document.id,
      documentVersionId: version?.id ?? null,
      title: document.title,
      fileName,
      mimeType,
      sourceUrl: `/api/projects/${projectId}/documents/${document.id}/download`
    };
    if (!storageKey) {
      result.discovered += 1;
      await storeIndexError({ organizationId: project.organizationId, projectId, source, error: new Error("missing storage") });
      result.failed += 1;
      continue;
    }
    await indexOne({
      organizationId: project.organizationId,
      projectId,
      source,
      force,
      loadBytes: () => readDocumentFile(storageKey)
    }, result);
  }
  return result;
}

function driveSource(file: GoogleDriveProjectFile): IndexSource {
  const exported = file.mimeType === "application/vnd.google-apps.document"
    ? { suffix: ".txt", mimeType: "text/plain" }
    : file.mimeType === "application/vnd.google-apps.spreadsheet"
      ? { suffix: ".xlsx", mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
      : file.mimeType === "application/vnd.google-apps.presentation"
        ? { suffix: ".pdf", mimeType: "application/pdf" }
        : null;
  return {
    sourceKind: "google_drive",
    sourceVersion: file.modifiedTime ?? `${file.id}:${file.size ?? "native"}`,
    externalId: file.id,
    title: file.name,
    fileName: exported ? `${file.name}${exported.suffix}` : file.name,
    mimeType: exported?.mimeType ?? file.mimeType,
    sourceUrl: file.webViewLink ?? `https://drive.google.com/open?id=${encodeURIComponent(file.id)}`,
    sourceModifiedAt: file.modifiedTime ? new Date(file.modifiedTime) : null
  };
}

export async function indexGoogleDriveDocuments(projectId: string, force = false) {
  const [project, config] = await Promise.all([
    prisma.project.findUnique({ where: { id: projectId }, select: { organizationId: true } }),
    prisma.projectKnowledgeConfig.findUnique({ where: { projectId } })
  ]);
  if (!project) throw new Error("Project not found");
  if (!config?.driveFolderId) throw new Error("Google Drive folder is not configured");
  await prisma.projectKnowledgeConfig.update({ where: { projectId }, data: { driveSyncStatus: "syncing", driveSyncError: null } });
  const result = emptyResult();
  try {
    const listing = await listGoogleDriveFolder(config.driveFolderId);
    for (const file of listing.files) {
      const source = driveSource(file);
      await indexOne({
        organizationId: project.organizationId,
        projectId,
        source,
        force,
        loadBytes: async () => (await downloadGoogleDriveFile(file)).bytes
      }, result);
    }
    const currentIds = listing.files.map((file) => file.id);
    await prisma.projectKnowledgeDocument.deleteMany({
      where: {
        projectId,
        sourceKind: "google_drive",
        ...(currentIds.length ? { externalId: { notIn: currentIds } } : {})
      }
    });
    if (listing.truncated) result.warnings.push(`Обработаны первые ${listing.files.length} файлов. Разделите большую папку на проектные подпапки.`);
    await prisma.projectKnowledgeConfig.update({
      where: { projectId },
      data: { driveSyncStatus: "ready", driveSyncError: null, lastDriveSyncedAt: new Date() }
    });
    return result;
  } catch (error) {
    await prisma.projectKnowledgeConfig.update({
      where: { projectId },
      data: { driveSyncStatus: "error", driveSyncError: safeError(error) }
    });
    throw error;
  }
}

export async function getProjectKnowledgeStatus(projectId: string) {
  const [project, config, indexedDocuments] = await Promise.all([
    prisma.project.findUnique({
      where: { id: projectId },
      select: {
        documents: {
          where: { dailyReportId: null },
          select: { id: true, version: true, updatedAt: true, sizeBytes: true, versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true } } }
        }
      }
    }),
    prisma.projectKnowledgeConfig.findUnique({ where: { projectId } }),
    prisma.projectKnowledgeDocument.findMany({ where: { projectId }, orderBy: [{ status: "asc" }, { title: "asc" }] })
  ]);
  if (!project) return null;
  const currentVersion = new Map(project.documents.map((document) => [
    document.id,
    document.versions[0]?.id ?? `${document.version}:${document.updatedAt.toISOString()}:${document.sizeBytes ?? 0}`
  ]));
  const indexedPgs = new Map(indexedDocuments.filter((item) => item.sourceKind === "pgs" && item.documentId).map((item) => [item.documentId as string, item]));
  const stalePgsDocuments = project.documents.filter((document) => indexedPgs.get(document.id)?.sourceVersion !== currentVersion.get(document.id)).length;
  const ready = indexedDocuments.filter((item) => item.status === "ready");
  return {
    summary: {
      sourceDocuments: project.documents.length + indexedDocuments.filter((item) => item.sourceKind === "google_drive").length,
      indexedDocuments: ready.length,
      chunks: ready.reduce((sum, item) => sum + item.chunkCount, 0),
      staleDocuments: stalePgsDocuments,
      unavailableDocuments: indexedDocuments.filter((item) => item.status !== "ready").length,
      lastIndexedAt: ready.map((item) => item.indexedAt).sort((a, b) => b.getTime() - a.getTime())[0]?.toISOString() ?? null
    },
    documents: indexedDocuments.map((item) => ({
      id: item.id,
      sourceKind: item.sourceKind,
      title: item.title,
      fileName: item.fileName,
      status: item.status,
      error: item.error,
      chunkCount: item.chunkCount,
      indexedAt: item.indexedAt.toISOString(),
      sourceUrl: item.sourceUrl
    })),
    drive: {
      ...googleDriveConnectionStatus(),
      folderUrl: config?.driveFolderUrl ?? "",
      folderName: config?.driveFolderName ?? "",
      syncStatus: config?.driveSyncStatus ?? "not_configured",
      syncError: config?.driveSyncError ?? null,
      lastSyncedAt: config?.lastDriveSyncedAt?.toISOString() ?? null
    },
    aiConfigured: getOpenAiRuntimeConfig().enabled
  };
}

export async function searchProjectKnowledge(projectId: string, question: string, limit = 6) {
  const questionTerms = knowledgeTerms(question, 40);
  if (!questionTerms.length) return [];
  const literalTerms = questionTerms.filter((term) => !term.startsWith("~")).slice(0, 6);
  const candidates = await prisma.projectKnowledgeChunk.findMany({
    where: {
      projectId,
      knowledgeDocument: { status: "ready" },
      OR: [
        { terms: { hasSome: questionTerms } },
        ...literalTerms.map((term) => ({ knowledgeDocument: { status: "ready", title: { contains: term, mode: "insensitive" as const } } }))
      ]
    },
    include: { knowledgeDocument: true },
    take: 250
  });
  return candidates
    .map((chunk) => ({
      id: chunk.id,
      documentId: chunk.knowledgeDocument.id,
      sourceKind: chunk.knowledgeDocument.sourceKind,
      title: chunk.knowledgeDocument.title,
      locator: chunk.locator,
      text: chunk.text,
      sourceUrl: chunk.knowledgeDocument.sourceUrl,
      score: scoreKnowledgeChunk({ questionTerms, chunkTerms: chunk.terms, title: chunk.knowledgeDocument.title, locator: chunk.locator })
    }))
    .filter((item) => item.score > 0)
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "ru"))
    .slice(0, limit);
}

export async function projectKnowledgeFingerprint(projectId: string) {
  const documents = await prisma.projectKnowledgeDocument.findMany({
    where: { projectId, status: "ready" },
    select: { id: true, contentHash: true, sourceVersion: true },
    orderBy: { id: "asc" }
  });
  return crypto.createHash("sha256").update(documents.map((item) => `${item.id}:${item.contentHash}:${item.sourceVersion}`).join("|")).digest("hex");
}
