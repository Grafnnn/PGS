import type { ImportPreview } from "./import-types";

export function stripImportSourceRows(preview: ImportPreview): ImportPreview {
  const { sourceRows: _sourceRows, ...safePreview } = preview;
  return safePreview;
}

export function importCommitResult(summary: unknown) {
  if (!summary || typeof summary !== "object") return null;
  const result = (summary as { commitResult?: unknown }).commitResult;
  return result && typeof result === "object" ? result : null;
}

export function serializeImportBatch(batch: {
  id: string;
  fileName: string;
  fileSize: number | null;
  parserVersion: string;
  status: string;
  mode: string | null;
  sheets: unknown;
  mapping: unknown;
  summary: unknown;
  warnings: unknown;
  errors: unknown;
  previewJson?: unknown;
  createdAt: Date;
  committedAt: Date | null;
  createdBy?: string | null;
}) {
  return {
    id: batch.id,
    fileName: batch.fileName,
    fileSize: batch.fileSize,
    parserVersion: batch.parserVersion,
    status: batch.status,
    mode: batch.mode,
    sheets: batch.sheets,
    mapping: batch.mapping,
    summary: batch.summary,
    warnings: batch.warnings,
    errors: batch.errors,
    commitResult: importCommitResult(batch.summary),
    createdBy: batch.createdBy,
    createdAt: batch.createdAt.toISOString(),
    committedAt: batch.committedAt?.toISOString() ?? null,
    preview: batch.previewJson ? stripImportSourceRows(batch.previewJson as ImportPreview) : undefined
  };
}
