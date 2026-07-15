import type { FieldSyncRequest } from "@/lib/field-sync";

export type FieldQueueState = "pending" | "syncing" | "failed" | "conflict";
export type FieldQueueKind = FieldSyncRequest["kind"] | "photo_evidence";

type QueueBase = {
  id: string;
  projectId: string;
  capturedAt: string;
  createdAt: string;
  updatedAt: string;
  attempts: number;
  state: FieldQueueState;
  lastError: string;
};

export type DailyReportQueueItem = QueueBase & {
  kind: "daily_report";
  payload: {
    date: string;
    author: string;
    weather: string;
    workers: number;
    engineers: number;
    equipment: string;
    completedWorks: string;
    materialsReceived: string;
    materialsConsumed: string;
    downtime: string;
    issues: string;
  };
};

export type FieldIssueQueueItem = QueueBase & {
  kind: "field_issue";
  payload: {
    title: string;
    description: string;
    priority: "low" | "medium" | "high" | "critical";
    assignee: string;
    dueAt: string | null;
  };
};

export type PhotoEvidenceQueueItem = QueueBase & {
  kind: "photo_evidence";
  payload: {
    category: string;
    fileName: string;
    mimeType: string;
    file: Blob;
  };
};

export type FieldQueueItem = DailyReportQueueItem | FieldIssueQueueItem | PhotoEvidenceQueueItem;
export type NewFieldQueueItem =
  | Pick<DailyReportQueueItem, "projectId" | "kind" | "payload">
  | Pick<FieldIssueQueueItem, "projectId" | "kind" | "payload">
  | Pick<PhotoEvidenceQueueItem, "projectId" | "kind" | "payload">;

export type FieldSyncOutcome = {
  ok: boolean;
  state: "synced" | "failed" | "conflict";
  retryable: boolean;
  message: string;
  item?: unknown;
};

const DB_NAME = "pgs-field-offline-v1";
const STORE_NAME = "operations";
const DB_VERSION = 1;
export const FIELD_QUEUE_CHANGED_EVENT = "pgs:field-queue-changed";

function queueId() {
  if (!globalThis.crypto?.randomUUID) throw new Error("Secure browser identifier is unavailable");
  return globalThis.crypto.randomUUID();
}

export function createFieldQueueItem(input: NewFieldQueueItem, now = new Date(), id = queueId()): FieldQueueItem {
  const timestamp = now.toISOString();
  return {
    ...input,
    id,
    capturedAt: timestamp,
    createdAt: timestamp,
    updatedAt: timestamp,
    attempts: 0,
    state: "pending",
    lastError: ""
  } as FieldQueueItem;
}

export function classifyFieldSyncResponse(status: number, error = ""): FieldSyncOutcome {
  if (status >= 200 && status < 300) return { ok: true, state: "synced", retryable: false, message: "Синхронизировано" };
  if (status === 409 || status === 412) return { ok: false, state: "conflict", retryable: false, message: error || "Нужна проверка конфликта" };
  if (status === 401 || status === 403) return { ok: false, state: "failed", retryable: false, message: "Сессия истекла или недостаточно прав" };
  if (status === 400 || status === 404 || status === 413 || status === 415 || status === 422) {
    return { ok: false, state: "failed", retryable: false, message: error || "Запись отклонена сервером" };
  }
  return { ok: false, state: "failed", retryable: true, message: error || "Сервер временно недоступен" };
}

function openQueueDb() {
  return new Promise<IDBDatabase>((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error("Offline storage is unavailable in this browser"));
      return;
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
        store.createIndex("projectId", "projectId", { unique: false });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage could not be opened"));
  });
}

async function withStore<T>(mode: IDBTransactionMode, work: (store: IDBObjectStore) => IDBRequest<T>) {
  const db = await openQueueDb();
  return new Promise<T>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, mode);
    const request = work(transaction.objectStore(STORE_NAME));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Offline storage operation failed"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline storage transaction failed"));
  });
}

function notifyQueueChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(FIELD_QUEUE_CHANGED_EVENT));
}

export async function enqueueFieldOperation(input: NewFieldQueueItem) {
  const item = createFieldQueueItem(input);
  await withStore("readwrite", (store) => store.put(item));
  notifyQueueChanged();
  return item;
}

export async function listFieldQueue(projectId: string) {
  const db = await openQueueDb();
  return new Promise<FieldQueueItem[]>((resolve, reject) => {
    const transaction = db.transaction(STORE_NAME, "readonly");
    const request = transaction.objectStore(STORE_NAME).index("projectId").getAll(projectId);
    request.onsuccess = () => resolve((request.result as FieldQueueItem[]).sort((a, b) => a.createdAt.localeCompare(b.createdAt)));
    request.onerror = () => reject(request.error ?? new Error("Offline queue could not be read"));
    transaction.oncomplete = () => db.close();
    transaction.onerror = () => reject(transaction.error ?? new Error("Offline queue transaction failed"));
  });
}

export async function updateFieldQueueItem(item: FieldQueueItem) {
  await withStore("readwrite", (store) => store.put({ ...item, updatedAt: new Date().toISOString() }));
  notifyQueueChanged();
}

export async function removeFieldQueueItem(id: string) {
  await withStore("readwrite", (store) => store.delete(id));
  notifyQueueChanged();
}

export async function retryFieldQueueItem(item: FieldQueueItem) {
  await updateFieldQueueItem({ ...item, state: "pending", lastError: "" });
}

export async function syncFieldQueueItem(item: FieldQueueItem, request: typeof fetch = fetch): Promise<FieldSyncOutcome> {
  try {
    let response: Response;
    if (item.kind === "photo_evidence") {
      const form = new FormData();
      form.set("file", new File([item.payload.file], item.payload.fileName, { type: item.payload.mimeType }));
      form.set("category", item.payload.category);
      form.set("clientMutationId", item.id);
      response = await request(`/api/projects/${item.projectId}/documents/upload`, { method: "POST", body: form });
    } else {
      response = await request(`/api/projects/${item.projectId}/field-sync`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ clientMutationId: item.id, kind: item.kind, capturedAt: item.capturedAt, payload: item.payload })
      });
    }
    const body = (await response.json().catch(() => ({}))) as { error?: string; item?: unknown };
    return { ...classifyFieldSyncResponse(response.status, body.error), item: response.ok ? body.item : undefined };
  } catch {
    return { ok: false, state: "failed", retryable: true, message: "Нет соединения с сервером" };
  }
}

export async function syncFieldQueue(
  projectId: string,
  options: { request?: typeof fetch; onSynced?: (queueItem: FieldQueueItem, serverItem: unknown) => void } = {}
) {
  const items = (await listFieldQueue(projectId)).filter((item) => item.state !== "conflict");
  let synced = 0;
  for (const item of items) {
    const syncing = { ...item, state: "syncing" as const, attempts: item.attempts + 1, lastError: "" };
    await updateFieldQueueItem(syncing);
    const outcome = await syncFieldQueueItem(syncing, options.request);
    if (outcome.ok) {
      await removeFieldQueueItem(item.id);
      synced += 1;
      options.onSynced?.(item, outcome.item);
      continue;
    }
    await updateFieldQueueItem({ ...syncing, state: outcome.state === "synced" ? "failed" : outcome.state, lastError: outcome.message });
    if (outcome.retryable) break;
  }
  return { synced, remaining: (await listFieldQueue(projectId)).length };
}
