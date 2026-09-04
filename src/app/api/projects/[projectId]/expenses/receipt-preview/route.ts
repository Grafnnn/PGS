import { NextRequest, NextResponse } from "next/server";
import { canProject } from "@/lib/auth/project-permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { recognizeReceipt, ReceiptRecognitionProviderError } from "@/lib/receipt-recognition";
import { checkRateLimit } from "@/lib/rate-limit";
import { sanitizeFileName, validateDocumentUpload } from "@/lib/storage/documents";

export const runtime = "nodejs";

const RECEIPT_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;

export async function POST(request: NextRequest, { params }: { params: { projectId: string } }) {
  const user = await getCurrentUser();
  if (!user || !(await canProject(user, params.projectId, "edit"))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const rateLimit = checkRateLimit({ key: `ai-receipt:${user.id}:${params.projectId}`, limit: 12, windowMs: 5 * 60_000 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: "Слишком много запросов на распознавание чеков. Повторите позже." },
      { status: 429, headers: { "Retry-After": String(rateLimit.retryAfterSeconds) } }
    );
  }
  try {
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) return NextResponse.json({ error: "Файл чека обязателен" }, { status: 400 });
    if (!RECEIPT_TYPES.has(file.type)) return NextResponse.json({ error: "Чек должен быть PDF, JPEG, PNG или WebP" }, { status: 400 });
    if (file.size > MAX_RECEIPT_BYTES) return NextResponse.json({ error: "Файл чека должен быть не больше 10 МБ" }, { status: 400 });
    const safeName = sanitizeFileName(file.name);
    const validationError = validateDocumentUpload(safeName, file.type, file.size);
    if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });
    const preview = await recognizeReceipt({ fileName: safeName, mimeType: file.type as "image/jpeg" | "image/png" | "image/webp" | "application/pdf", bytes: Buffer.from(await file.arrayBuffer()) });
    return NextResponse.json({ preview });
  } catch (error) {
    if (error instanceof ReceiptRecognitionProviderError) return NextResponse.json({ error: error.message }, { status: error.status });
    console.error(error);
    return NextResponse.json({ error: "Не удалось распознать чек" }, { status: 500 });
  }
}
