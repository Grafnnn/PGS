import crypto from "node:crypto";
import path from "node:path";
import { getEnv } from "@/lib/env";
import { getStorageProvider } from "./index";
import { resolveLocalStoragePath } from "./local";

const allowedExtensions = new Set([".pdf", ".doc", ".docx", ".xls", ".xlsx", ".jpg", ".jpeg", ".png", ".webp", ".zip"]);
const allowedMimePrefixes = ["application/pdf", "application/msword", "application/vnd.", "image/jpeg", "image/png", "image/webp", "application/zip"];

export function sanitizeFileName(fileName: string) {
  const base = path.basename(fileName).replace(/[^\p{L}\p{N}._ -]/gu, "_").trim();
  return base || "document";
}

export function validateDocumentUpload(fileName: string, mimeType: string, sizeBytes: number) {
  const env = getEnv();
  const ext = path.extname(fileName).toLowerCase();
  if (!allowedExtensions.has(ext)) return `Unsupported file extension: ${ext || "none"}`;
  if (!allowedMimePrefixes.some((prefix) => mimeType.startsWith(prefix))) return `Unsupported MIME type: ${mimeType || "unknown"}`;
  if (sizeBytes > env.MAX_UPLOAD_MB * 1024 * 1024) return `File exceeds ${env.MAX_UPLOAD_MB} MB limit`;
  return null;
}

export function makeStorageKey(projectId: string, fileName: string) {
  const ext = path.extname(fileName).toLowerCase();
  return `${projectId}/${crypto.randomUUID()}${ext}`;
}

export function resolveStoragePath(storageKey: string) {
  return resolveLocalStoragePath(storageKey);
}

export async function saveDocumentFile(storageKey: string, bytes: Buffer) {
  return getStorageProvider().write(storageKey, bytes);
}

export async function readDocumentFile(storageKey: string) {
  return getStorageProvider().read(storageKey);
}

export async function deleteDocumentFile(storageKey: string) {
  await getStorageProvider().delete(storageKey);
}

export function hasPreviewMetadata(mimeType: string | null | undefined) {
  return Boolean(mimeType?.startsWith("image/") || mimeType === "application/pdf");
}
