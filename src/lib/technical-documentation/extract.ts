import path from "node:path";
import mammoth from "mammoth";
import { extractText, getDocumentProxy } from "unpdf";
import * as XLSX from "xlsx";

export type ExtractedDocumentSection = {
  locator: string;
  text: string;
};

export type ExtractedDocument = {
  sections: ExtractedDocumentSection[];
  warnings: string[];
};

const MAX_PDF_PAGES = 600;
const MAX_EXTRACTED_CHARS = 4_000_000;

export class UnsupportedKnowledgeDocumentError extends Error {}

function cleanText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/[\t\f\v]+/g, " ")
    .replace(/ +\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function withinLimit(sections: ExtractedDocumentSection[]) {
  let remaining = MAX_EXTRACTED_CHARS;
  const result: ExtractedDocumentSection[] = [];
  for (const section of sections) {
    if (remaining <= 0) break;
    const text = cleanText(section.text).slice(0, remaining);
    if (text) result.push({ ...section, text });
    remaining -= text.length;
  }
  return result;
}

async function extractPdf(bytes: Buffer): Promise<ExtractedDocument> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  try {
    if (pdf.numPages > MAX_PDF_PAGES) throw new Error(`PDF содержит больше ${MAX_PDF_PAGES} страниц.`);
    const result = await extractText(pdf, { mergePages: false });
    const pages = Array.isArray(result.text) ? result.text : [result.text];
    return {
      sections: withinLimit(pages.map((text, index) => ({ locator: `Страница ${index + 1}`, text }))),
      warnings: []
    };
  } finally {
    const destroy = (pdf as typeof pdf & { destroy?: () => Promise<void> }).destroy;
    if (destroy) await destroy.call(pdf).catch(() => undefined);
  }
}

async function extractDocx(bytes: Buffer): Promise<ExtractedDocument> {
  const result = await mammoth.extractRawText({ buffer: bytes });
  return {
    sections: withinLimit([{ locator: "Документ", text: result.value }]),
    warnings: result.messages.map((message) => message.message).slice(0, 10)
  };
}

function extractWorkbook(bytes: Buffer): ExtractedDocument {
  const workbook = XLSX.read(bytes, { type: "buffer", cellDates: true });
  const sections: ExtractedDocumentSection[] = [];
  for (const sheetName of workbook.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<Array<string | number | boolean | Date>>(workbook.Sheets[sheetName], {
      header: 1,
      defval: "",
      raw: false
    });
    const batchSize = 25;
    for (let start = 0; start < rows.length; start += batchSize) {
      const batch = rows.slice(start, start + batchSize);
      const text = batch
        .map((row, offset) => {
          const values = row.map((value) => String(value).trim()).filter(Boolean);
          return values.length ? `Строка ${start + offset + 1}: ${values.join(" | ")}` : "";
        })
        .filter(Boolean)
        .join("\n");
      if (text) {
        sections.push({
          locator: `Лист «${sheetName}», строки ${start + 1}–${Math.min(start + batchSize, rows.length)}`,
          text
        });
      }
    }
  }
  return { sections: withinLimit(sections), warnings: [] };
}

function extractDelimitedText(bytes: Buffer, fileName: string): ExtractedDocument {
  const text = bytes.toString("utf8");
  const lines = text.split(/\r?\n/);
  const sections: ExtractedDocumentSection[] = [];
  for (let start = 0; start < lines.length; start += 80) {
    const batch = lines.slice(start, start + 80).join("\n");
    if (batch.trim()) {
      sections.push({
        locator: `${path.extname(fileName).toLowerCase() === ".csv" ? "CSV" : "Текст"}, строки ${start + 1}–${Math.min(start + 80, lines.length)}`,
        text: batch
      });
    }
  }
  return { sections: withinLimit(sections), warnings: [] };
}

export async function extractKnowledgeDocument(input: { fileName: string; mimeType?: string | null; bytes: Buffer }): Promise<ExtractedDocument> {
  const extension = path.extname(input.fileName).toLowerCase();
  if (extension === ".pdf" || input.mimeType === "application/pdf") return extractPdf(input.bytes);
  if (extension === ".docx" || input.mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
    return extractDocx(input.bytes);
  }
  if ([".xlsx", ".xls"].includes(extension) || input.mimeType?.includes("spreadsheet") || input.mimeType === "application/vnd.ms-excel") {
    return extractWorkbook(input.bytes);
  }
  if ([".txt", ".csv"].includes(extension) || input.mimeType?.startsWith("text/")) return extractDelimitedText(input.bytes, input.fileName);
  if (extension === ".doc") throw new UnsupportedKnowledgeDocumentError("Формат DOC нужно сохранить как DOCX или PDF.");
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(extension)) {
    throw new UnsupportedKnowledgeDocumentError("Изображение не содержит доступного текстового слоя. Сохраните скан как PDF с OCR.");
  }
  throw new UnsupportedKnowledgeDocumentError("Этот формат пока не поддерживает текстовое индексирование.");
}
