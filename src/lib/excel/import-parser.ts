import * as XLSX from "xlsx";
import type { ImportPreview, RawSheetRow } from "./import-types";
import { classifyRow } from "./import-classifier";
import { detectColumns, looksLikeHeader } from "./import-normalizer";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const allowedExtensions = [".xlsx", ".xls"];

export function validateExcelFile(fileName: string, size: number) {
  const lowerName = fileName.toLowerCase();
  if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
    return "Разрешены только Excel-файлы .xlsx и .xls.";
  }
  if (size > MAX_FILE_BYTES) {
    return "Размер файла превышает лимит 15 MB.";
  }
  return null;
}

export function parseExcelBuffer(buffer: Buffer, fileName: string, projectId: string): ImportPreview {
  const validationError = validateExcelFile(fileName, buffer.byteLength);
  if (validationError) {
    return emptyPreview(projectId, fileName, [validationError]);
  }

  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const warnings: string[] = [];
  const errors: string[] = [];
  const sections: ImportPreview["sections"] = [];
  const budgetItems: ImportPreview["budgetItems"] = [];
  const materials: ImportPreview["materials"] = [];
  const scheduleItems: ImportPreview["scheduleItems"] = [];
  const unknownRows: ImportPreview["unknownRows"] = [];

  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true });
    if (!rows.length) {
      warnings.push(`Лист "${sheetName}" пуст.`);
      continue;
    }

    const headerIndex = rows.findIndex(looksLikeHeader);
    if (headerIndex < 0) {
      warnings.push(`На листе "${sheetName}" не найдена строка заголовков.`);
      continue;
    }

    const columns = detectColumns(rows[headerIndex]);
    const state = { currentSection: "Без раздела" };

    for (let rowIndex = headerIndex + 1; rowIndex < rows.length; rowIndex += 1) {
      const raw: RawSheetRow = {
        sheetName,
        rowNumber: rowIndex + 1,
        values: rows[rowIndex]
      };
      const classified = classifyRow(raw, columns, state);
      if (classified.kind === "section") sections.push(classified.section);
      if (classified.kind === "budget_item") budgetItems.push(classified.budgetItem);
      if (classified.kind === "material") {
        budgetItems.push(classified.budgetItem);
        materials.push(classified.material);
      }
      if (classified.kind === "schedule_item") scheduleItems.push(classified.scheduleItem);
      if (classified.kind === "unknown") unknownRows.push(classified.unknown);
    }
  }

  if (!budgetItems.length && !materials.length && !scheduleItems.length && !sections.length) {
    errors.push("Файл прочитан, но импортируемые строки не распознаны.");
  }

  return buildPreview({
    projectId,
    fileName,
    sheets: workbook.SheetNames,
    sections,
    budgetItems,
    materials,
    scheduleItems,
    unknownRows,
    warnings,
    errors
  });
}

export function buildPreview(input: Omit<ImportPreview, "summary">): ImportPreview {
  return {
    ...input,
    summary: {
      sections: input.sections.length,
      budgetItems: input.budgetItems.length,
      materials: input.materials.length,
      scheduleItems: input.scheduleItems.length,
      unknownRows: input.unknownRows.length,
      errors: input.errors.length,
      warnings: input.warnings.length
    }
  };
}

function emptyPreview(projectId: string, fileName: string, errors: string[]): ImportPreview {
  return buildPreview({
    projectId,
    fileName,
    sheets: [],
    sections: [],
    budgetItems: [],
    materials: [],
    scheduleItems: [],
    unknownRows: [],
    warnings: [],
    errors
  });
}
