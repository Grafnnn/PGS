import type { ProjectDocument } from "@/lib/types";

export const REPORT_PHOTO_TYPES = new Set(["image/jpeg", "image/png", "image/webp"]);
export const REPORT_PHOTO_MAX_FILES = 12;
export const REPORT_PHOTO_MAX_SOURCE_BYTES = 50 * 1024 * 1024;
const REPORT_PHOTO_MAX_EDGE = 2_048;
const REPORT_PHOTO_OPTIMIZE_FROM_BYTES = 1_250_000;
const REPORT_PHOTO_QUALITY = 0.84;

export type PreparedReportPhoto = {
  file: File;
  originalSize: number;
  width?: number;
  height?: number;
  optimized: boolean;
};

export class ReportPhotoUploadError extends Error {
  constructor(message: string, readonly status = 0) {
    super(message);
  }
}

export function reportPhotoFileKey(file: Pick<File, "name" | "size" | "lastModified">, index = 0) {
  return `${file.name}:${file.size}:${file.lastModified}:${index}`;
}

export function reportPhotoOutputName(fileName: string) {
  const dot = fileName.lastIndexOf(".");
  const base = dot > 0 ? fileName.slice(0, dot) : fileName;
  return `${base || "photo"}.webp`;
}

export function formatReportPhotoBytes(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("ru-RU")} КБ`;
  return `${(bytes / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export async function mapWithConcurrency<T, R>(items: T[], concurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let cursor = 0;
  const count = Math.max(1, Math.min(Math.floor(concurrency) || 1, items.length || 1));
  await Promise.all(Array.from({ length: count }, async () => {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await worker(items[index], index);
    }
  }));
  return results;
}

function canvasBlob(canvas: HTMLCanvasElement, type: string, quality: number) {
  return new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, type, quality));
}

export async function prepareReportPhoto(file: File): Promise<PreparedReportPhoto> {
  if (!REPORT_PHOTO_TYPES.has(file.type)) throw new Error("Поддерживаются только JPEG, PNG и WebP.");
  if (file.size > REPORT_PHOTO_MAX_SOURCE_BYTES) throw new Error("Фото больше 50 МБ. Уменьшите файл и повторите попытку.");
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") {
    return { file, originalSize: file.size, optimized: false };
  }

  let bitmap: ImageBitmap | null = null;
  try {
    bitmap = await createImageBitmap(file);
    const scale = Math.min(1, REPORT_PHOTO_MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    if (scale === 1 && file.size < REPORT_PHOTO_OPTIMIZE_FROM_BYTES) {
      return { file, originalSize: file.size, width, height, optimized: false };
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) return { file, originalSize: file.size, width, height, optimized: false };
    context.drawImage(bitmap, 0, 0, width, height);
    const blob = await canvasBlob(canvas, "image/webp", REPORT_PHOTO_QUALITY);
    canvas.width = 1;
    canvas.height = 1;
    if (!blob || blob.size >= file.size * 0.95) {
      return { file, originalSize: file.size, width, height, optimized: false };
    }
    return {
      file: new File([blob], reportPhotoOutputName(file.name), { type: "image/webp", lastModified: file.lastModified }),
      originalSize: file.size,
      width,
      height,
      optimized: true
    };
  } catch {
    return { file, originalSize: file.size, optimized: false };
  } finally {
    bitmap?.close();
  }
}

function responseBody(xhr: XMLHttpRequest) {
  if (xhr.response && typeof xhr.response === "object") return xhr.response as { item?: ProjectDocument; error?: string };
  try {
    return JSON.parse(xhr.responseText || "{}") as { item?: ProjectDocument; error?: string };
  } catch {
    return {};
  }
}

export function uploadReportPhoto(input: {
  projectId: string;
  reportId: string;
  file: File;
  clientMutationId: string;
  onProgress?: (progress: number) => void;
}) {
  return new Promise<ProjectDocument>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const data = new FormData();
    data.set("file", input.file);
    data.set("category", "фотофиксация");
    data.set("dailyReportId", input.reportId);
    data.set("clientMutationId", input.clientMutationId);
    xhr.open("POST", `/api/projects/${input.projectId}/documents/upload`);
    xhr.responseType = "json";
    xhr.timeout = 120_000;
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) input.onProgress?.(Math.min(99, Math.round((event.loaded / event.total) * 100)));
    };
    xhr.onload = () => {
      const body = responseBody(xhr);
      if (xhr.status >= 200 && xhr.status < 300 && body.item) {
        input.onProgress?.(100);
        resolve(body.item);
        return;
      }
      const message = xhr.status === 401 || xhr.status === 403
        ? "Недостаточно прав для загрузки фото."
        : body.error ?? `Не удалось загрузить ${input.file.name}.`;
      reject(new ReportPhotoUploadError(message, xhr.status));
    };
    xhr.onerror = () => reject(new ReportPhotoUploadError(`Соединение прервано при загрузке ${input.file.name}.`));
    xhr.ontimeout = () => reject(new ReportPhotoUploadError(`Загрузка ${input.file.name} заняла слишком много времени.`));
    xhr.send(data);
  });
}
