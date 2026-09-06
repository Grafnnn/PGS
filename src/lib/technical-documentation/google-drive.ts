import crypto from "node:crypto";
import { getEnv } from "@/lib/env";

const DRIVE_API = "https://www.googleapis.com/drive/v3";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive.readonly";
const GOOGLE_FOLDER_MIME = "application/vnd.google-apps.folder";
const GOOGLE_SHORTCUT_MIME = "application/vnd.google-apps.shortcut";
const GOOGLE_FILE_FIELDS = "id,name,mimeType,modifiedTime,size,webViewLink,shortcutDetails(targetId,targetMimeType)";
const MAX_DRIVE_FILES = 500;
const MAX_DRIVE_FILE_MB = 64;
const MAX_DRIVE_FILE_BYTES = MAX_DRIVE_FILE_MB * 1024 * 1024;

type GoogleAccess = { type: "bearer"; value: string } | { type: "api-key"; value: string };

export type GoogleDriveProjectFile = {
  id: string;
  name: string;
  mimeType: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  shortcutDetails?: {
    targetId: string;
    targetMimeType: string;
  };
};

let tokenCache: { token: string; expiresAt: number } | null = null;

function base64Url(value: Buffer | string) {
  return Buffer.from(value).toString("base64url");
}
async function serviceAccountToken(email: string, privateKey: string) {
  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;
  const now = Math.floor(Date.now() / 1000);
  const unsigned = `${base64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${base64Url(JSON.stringify({
    iss: email,
    scope: DRIVE_SCOPE,
    aud: GOOGLE_TOKEN_URL,
    iat: now,
    exp: now + 3600
  }))}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(unsigned), privateKey.replace(/\\n/g, "\n"));
  const assertion = `${unsigned}.${base64Url(signature)}`;
  const response = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion })
  });
  const payload = (await response.json().catch(() => null)) as { access_token?: string; expires_in?: number } | null;
  if (!response.ok || !payload?.access_token) throw new GoogleDriveSyncError("Не удалось получить read-only доступ Google Drive.", 502);
  tokenCache = { token: payload.access_token, expiresAt: Date.now() + (payload.expires_in ?? 3600) * 1000 };
  return tokenCache.token;
}

async function googleAccess(): Promise<GoogleAccess> {
  const env = getEnv();
  if (env.GOOGLE_DRIVE_CONNECTOR_MODE === "disabled") throw new GoogleDriveSyncError("Google Drive выключен в настройках сервера.", 503);
  if (env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return { type: "bearer", value: await serviceAccountToken(env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL, env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY) };
  }
  if (env.GOOGLE_DRIVE_API_KEY) return { type: "api-key", value: env.GOOGLE_DRIVE_API_KEY };
  throw new GoogleDriveSyncError("Google Drive не настроен на сервере. Нужен API key или service account.", 503);
}

async function driveFetch(url: URL, access: GoogleAccess) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  if (access.type === "api-key") url.searchParams.set("key", access.value);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      headers: access.type === "bearer" ? { authorization: `Bearer ${access.value}` } : undefined
    });
    if (!response.ok) {
      const status = response.status === 403 || response.status === 404 ? 403 : 502;
      throw new GoogleDriveSyncError(status === 403 ? "Папка Google Drive недоступна этому read-only подключению." : "Google Drive временно недоступен.", status);
    }
    return response;
  } catch (error) {
    if (error instanceof GoogleDriveSyncError) throw error;
    throw new GoogleDriveSyncError(controller.signal.aborted ? "Google Drive не ответил вовремя." : "Google Drive временно недоступен.", 502);
  } finally {
    clearTimeout(timeout);
  }
}

async function getGoogleDriveFileMetadata(fileId: string, access: GoogleAccess) {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", GOOGLE_FILE_FIELDS);
  url.searchParams.set("supportsAllDrives", "true");
  const response = await driveFetch(url, access);
  return response.json() as Promise<GoogleDriveProjectFile>;
}

export function parseGoogleDriveFolderId(value: string) {
  const trimmed = value.trim();
  const folderMatch = trimmed.match(/\/folders\/([A-Za-z0-9_-]{10,})/);
  const queryMatch = trimmed.match(/[?&]id=([A-Za-z0-9_-]{10,})/);
  const rawMatch = trimmed.match(/^[A-Za-z0-9_-]{10,}$/);
  return folderMatch?.[1] ?? queryMatch?.[1] ?? rawMatch?.[0] ?? null;
}

export function googleDriveConnectionStatus() {
  const env = getEnv();
  const authentication = env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL && env.GOOGLE_DRIVE_SERVICE_ACCOUNT_PRIVATE_KEY
    ? "service-account"
    : env.GOOGLE_DRIVE_API_KEY
      ? "api-key"
      : "none";
  return {
    enabled: env.GOOGLE_DRIVE_CONNECTOR_MODE !== "disabled" && authentication !== "none",
    mode: env.GOOGLE_DRIVE_CONNECTOR_MODE,
    authentication,
    shareWith: authentication === "service-account" ? env.GOOGLE_DRIVE_SERVICE_ACCOUNT_EMAIL ?? null : null
  } as const;
}

export async function listGoogleDriveFolder(folderId: string) {
  const access = await googleAccess();
  const queue = [folderId];
  const visitedFolders = new Set<string>();
  const visitedFiles = new Set<string>();
  const files: GoogleDriveProjectFile[] = [];
  while (queue.length && files.length < MAX_DRIVE_FILES) {
    const parentId = queue.shift() as string;
    if (visitedFolders.has(parentId)) continue;
    visitedFolders.add(parentId);
    let pageToken = "";
    do {
      const url = new URL(`${DRIVE_API}/files`);
      url.searchParams.set("q", `'${parentId}' in parents and trashed = false`);
      url.searchParams.set("fields", `nextPageToken,files(${GOOGLE_FILE_FIELDS})`);
      url.searchParams.set("pageSize", "1000");
      url.searchParams.set("orderBy", "name");
      url.searchParams.set("supportsAllDrives", "true");
      url.searchParams.set("includeItemsFromAllDrives", "true");
      if (pageToken) url.searchParams.set("pageToken", pageToken);
      const response = await driveFetch(url, access);
      const payload = (await response.json()) as { nextPageToken?: string; files?: GoogleDriveProjectFile[] };
      for (const file of payload.files ?? []) {
        const shortcut = file.mimeType === GOOGLE_SHORTCUT_MIME ? file.shortcutDetails : null;
        const targetId = shortcut?.targetId ?? file.id;
        const targetMimeType = shortcut?.targetMimeType ?? file.mimeType;
        if (targetMimeType === GOOGLE_FOLDER_MIME) {
          if (!visitedFolders.has(targetId)) queue.push(targetId);
        } else if (!visitedFiles.has(targetId)) {
          visitedFiles.add(targetId);
          // Shortcut metadata does not change when its target is edited, so resolve
          // the target before comparing Drive versions during incremental sync.
          files.push(shortcut ? await getGoogleDriveFileMetadata(targetId, access) : file);
        }
        if (files.length >= MAX_DRIVE_FILES) break;
      }
      pageToken = payload.nextPageToken ?? "";
    } while (pageToken && files.length < MAX_DRIVE_FILES);
  }
  return { files, truncated: files.length >= MAX_DRIVE_FILES };
}

function exportDescriptor(file: GoogleDriveProjectFile) {
  if (file.mimeType === "application/vnd.google-apps.document") {
    return { mimeType: "text/plain", extension: ".txt", exportMimeType: "text/plain" };
  }
  if (file.mimeType === "application/vnd.google-apps.spreadsheet") {
    return { mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: ".xlsx", exportMimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" };
  }
  if (file.mimeType === "application/vnd.google-apps.presentation") {
    return { mimeType: "application/pdf", extension: ".pdf", exportMimeType: "application/pdf" };
  }
  return null;
}

export async function downloadGoogleDriveFile(file: GoogleDriveProjectFile) {
  const access = await googleAccess();
  const exported = exportDescriptor(file);
  const url = exported
    ? new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}/export`)
    : new URL(`${DRIVE_API}/files/${encodeURIComponent(file.id)}`);
  if (exported) url.searchParams.set("mimeType", exported.exportMimeType);
  else {
    url.searchParams.set("alt", "media");
    url.searchParams.set("supportsAllDrives", "true");
  }
  if (file.size && Number(file.size) > MAX_DRIVE_FILE_BYTES) throw new GoogleDriveSyncError(`Файл превышает лимит индексирования ${MAX_DRIVE_FILE_MB} МБ.`, 400);
  const response = await driveFetch(url, access);
  const bytes = Buffer.from(await response.arrayBuffer());
  if (bytes.byteLength > MAX_DRIVE_FILE_BYTES) throw new GoogleDriveSyncError(`Файл превышает лимит индексирования ${MAX_DRIVE_FILE_MB} МБ.`, 400);
  return {
    bytes,
    fileName: exported ? `${file.name}${exported.extension}` : file.name,
    mimeType: exported?.mimeType ?? file.mimeType
  };
}

export class GoogleDriveSyncError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
