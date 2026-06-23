import type { ImportExplanation, ImportPreview } from "./import-types";
import { importExplanationSchema } from "./import-types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";
const REDACTED = "[REDACTED]";

export function buildDeterministicImportExplanation(preview: ImportPreview): ImportExplanation {
  const blockingIssues = preview.errors.slice(0, 12);
  const warningsToReview = preview.warnings.slice(0, 12);
  const suggestedMappingFixes = mappingHints(preview);
  const recommendedNextSteps = [
    preview.summary.errors > 0 ? "Исправьте блокирующие ошибки в Excel или mapping и повторите preview." : "Проверьте первые строки preview и подтвердите режим commit.",
    preview.summary.unknownRows > 0 ? "Разберите неизвестные строки: часть из них может быть итогами, комментариями или строками без цены/количества." : "",
    preview.summary.duplicateRows > 0 ? "Проверьте возможные дубли перед commit, чтобы не завысить бюджет." : "",
    preview.summary.hiddenRows > 0 ? "Убедитесь, что скрытые строки действительно не должны попадать в импорт." : ""
  ].filter(Boolean);

  return {
    status: "deterministic",
    summary: [
      `Файл "${preview.fileName}" содержит ${preview.summary.totalRows} строк на листах: ${preview.sheets.join(", ") || "-"}.`,
      `К импорту распознано: ВОР ${preview.summary.budgetItems}, материалы ${preview.summary.materials}, график ${preview.summary.scheduleItems}.`,
      `Ошибки: ${preview.summary.errors}, предупреждения: ${preview.summary.warnings}, пропущено: ${preview.summary.skippedRows}.`
    ].join(" "),
    blockingIssues,
    warningsToReview,
    suggestedMappingFixes,
    recommendedNextSteps,
    managementNote:
      preview.summary.errors > 0
        ? "Commit заблокирован до исправления ошибок. Предупреждения не блокируют commit, но требуют управленческой проверки."
        : "AI недоступен или не запрошен: показано расчетное объяснение по результатам parser/validator.",
    confidence: preview.mapping.length ? average(preview.mapping.map((item) => item.confidence ?? 0)) : 0,
    missingData: missingData(preview)
  };
}

export function sanitizeImportContext(preview: ImportPreview) {
  const context = {
    fileName: preview.fileName,
    fileSize: preview.fileSize,
    parserVersion: preview.parserVersion,
    sheets: preview.mapping.map((sheet) => ({
      sheetName: sheet.sheetName,
      included: sheet.included ?? true,
      detectedType: sheet.detectedType ?? "unknown",
      confidence: sheet.confidence ?? 0,
      headerRow: sheet.headerRow,
      rows: sheet.rows,
      parsedRows: sheet.parsedRows,
      warnings: sheet.warnings.slice(0, 8),
      columns: (sheet.columnDetails ?? []).map((column) => ({
        target: column.target,
        sourceHeader: column.sourceHeader,
        confidence: column.confidence,
        samples: column.samples.slice(0, 3)
      }))
    })),
    summary: preview.summary,
    errors: preview.errors.slice(0, 20),
    warnings: preview.warnings.slice(0, 20),
    sampleRows: (preview.previewRows ?? []).slice(0, 30).map((row) => ({
      sheetName: row.sheetName,
      sourceRowNumber: row.sourceRowNumber,
      status: row.status,
      entityType: row.entityType,
      section: row.section,
      name: row.name,
      unit: row.unit,
      quantity: row.quantity,
      unitPrice: row.unitPrice,
      totalAmount: row.totalAmount,
      warnings: row.warnings.slice(0, 5),
      errors: row.errors.slice(0, 5),
      suspiciousFlags: row.suspiciousFlags
    }))
  };

  return redactSecrets(context) as typeof context;
}

export async function explainImportPreview(preview: ImportPreview): Promise<ImportExplanation> {
  const fallback = buildDeterministicImportExplanation(preview);
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return fallback;

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.1,
        messages: [
          {
            role: "system",
            content:
              "Ты помощник ПТО и руководителя строительного проекта. Объясняй ошибки импорта ВОР/сметы строго по предоставленному sanitized context. Не выдумывай факты. Верни только JSON: summary, blockingIssues, warningsToReview, suggestedMappingFixes, recommendedNextSteps, managementNote, confidence, missingData."
          },
          {
            role: "user",
            content: JSON.stringify(sanitizeImportContext(preview))
          }
        ],
        response_format: { type: "json_object" }
      })
    });
    const payload = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    if (!response.ok) throw new Error("OpenAI import explanation failed");
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) throw new Error("OpenAI import explanation is empty");
    const parsed = importExplanationSchema.parse({ status: "ai", ...JSON.parse(content) });
    return parsed;
  } catch {
    return {
      ...fallback,
      status: "degraded",
      managementNote: "AI-объяснение временно недоступно, показано расчетное объяснение."
    };
  }
}

function mappingHints(preview: ImportPreview) {
  const hints: string[] = [];
  for (const sheet of preview.mapping) {
    if (sheet.included === false) continue;
    if ((sheet.confidence ?? 0) < 0.55) hints.push(`Лист "${sheet.sheetName}": низкая уверенность распознавания, проверьте строку заголовков и mapping колонок.`);
    if (sheet.columns.name === undefined) hints.push(`Лист "${sheet.sheetName}": не найдена колонка "Наименование".`);
    if (sheet.columns.qty === undefined) hints.push(`Лист "${sheet.sheetName}": не найдена колонка "Количество/Объем".`);
    if (sheet.columns.unitPrice === undefined && sheet.columns.total === undefined) hints.push(`Лист "${sheet.sheetName}": не найдена колонка цены или суммы.`);
  }
  return Array.from(new Set(hints)).slice(0, 10);
}

function missingData(preview: ImportPreview) {
  const missing: string[] = [];
  if (!preview.mapping.some((sheet) => sheet.columns.name !== undefined)) missing.push("Колонка наименования");
  if (!preview.mapping.some((sheet) => sheet.columns.qty !== undefined)) missing.push("Колонка количества");
  if (!preview.mapping.some((sheet) => sheet.columns.unitPrice !== undefined || sheet.columns.total !== undefined)) missing.push("Колонка цены или суммы");
  return missing;
}

function average(values: number[]) {
  const finiteValues = values.filter((value) => Number.isFinite(value));
  if (!finiteValues.length) return 0;
  return Number((finiteValues.reduce((sum, value) => sum + value, 0) / finiteValues.length).toFixed(2));
}

function redactSecrets(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]+/g, REDACTED)
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, REDACTED)
      .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, REDACTED)
      .replace(/(password|token|secret|cookie|database_url)\s*[:=]\s*[^\s,;]+/gi, `$1=${REDACTED}`);
  }
  if (Array.isArray(value)) return value.map(redactSecrets);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => {
        if (/secret|token|password|cookie|database_url/i.test(key)) return [key, REDACTED];
        return [key, redactSecrets(nested)];
      })
    );
  }
  return value;
}
