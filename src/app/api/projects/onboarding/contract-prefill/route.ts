import { NextRequest, NextResponse } from "next/server";
import { canEditProject } from "@/lib/auth/permissions";
import { getCurrentUser } from "@/lib/auth/session";
import { extractProjectPrefillFromContractText, validateContractPrefillResult } from "@/lib/contract-project-prefill";

export const runtime = "nodejs";

const MAX_CONTRACT_PREFILL_MB = 2;
const supportedMimeTypes = new Set(["text/plain", "text/markdown", "application/json"]);
const supportedExtensions = [".txt", ".md", ".markdown", ".text"];
const supportedFormats = ["TXT", "Markdown", "plain extracted text"];

function safeError(message: string, status: number) {
  return NextResponse.json({ error: message, supportedFormats }, { status });
}

function extensionOf(fileName: string) {
  const match = fileName.toLowerCase().match(/\.[a-z0-9]+$/);
  return match?.[0] ?? "";
}

function isSupportedTextFile(file: File) {
  const mime = file.type.toLowerCase();
  const ext = extensionOf(file.name);
  return supportedMimeTypes.has(mime) || supportedExtensions.includes(ext);
}

export async function POST(request: NextRequest) {
  const user = await getCurrentUser();
  if (!canEditProject(user)) return safeError("Forbidden", 403);

  const formData = await request.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File)) return safeError("File is required.", 400);
  if (file.size <= 0) return safeError("Contract file is empty.", 400);
  if (file.size > MAX_CONTRACT_PREFILL_MB * 1024 * 1024) return safeError(`Contract preview is limited to ${MAX_CONTRACT_PREFILL_MB} MB.`, 400);
  if (!isSupportedTextFile(file)) {
    return safeError("This file type is not supported for deterministic contract prefill yet. Attach it as a starting document and fill fields manually.", 400);
  }

  const text = await file.text();
  if (!text.trim()) return safeError("No readable contract text was found.", 400);

  const result = extractProjectPrefillFromContractText({ text, fileName: file.name });
  const validation = validateContractPrefillResult(result);

  return NextResponse.json({
    ok: true,
    file: {
      name: file.name,
      size: file.size,
      type: file.type || "text/plain"
    },
    supportedFormats,
    result,
    validation,
    writes: {
      projectCreated: false,
      documentPersisted: false
    }
  });
}
