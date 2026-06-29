import * as XLSX from "xlsx";
import type {
  ColumnMap,
  ColumnTarget,
  AssistedImportRowKind,
  ImportCommitPlan,
  ImportMode,
  ImportPreview,
  ImportPreviewRow,
  ImportSheetDetectedType,
  ImportSheetMapping,
  ImportSourceRow,
  ImportSuspiciousFlag,
  RawSheetRow
} from "./import-types";
import { EXCEL_IMPORT_PARSER_VERSION } from "./import-types";
import { classifyRow, type ClassifiedRow } from "./import-classifier";
import { cell, detectColumns, detectHeaderRow, looksLikeHeader, normalizeHeader, normalizeText, parseMoney, parseQuantity } from "./import-normalizer";

const MAX_FILE_BYTES = 15 * 1024 * 1024;
const allowedExtensions = [".xlsx", ".xls", ".xlsm"];
const remappableTargets: ColumnTarget[] = ["index", "name", "unit", "qty", "unitPrice", "total", "section", "note", "startsAt", "endsAt"];

type BuildPreviewInput = Omit<ImportPreview, "mapping" | "parserVersion" | "summary" | "previewRows"> & {
  mapping?: ImportSheetMapping[];
  parserVersion?: string;
  summary?: Partial<ImportPreview["summary"]>;
  previewRows?: ImportPreviewRow[];
};

interface SheetRuntimeInfo {
  sheetName: string;
  hidden: boolean;
  rows: unknown[][];
  hiddenRows: Set<number>;
  formulaCellsByRow: Map<number, string[]>;
  formulaCells: number;
}

export function validateExcelFile(fileName: string, size: number) {
  const lowerName = fileName.toLowerCase();
  if (!allowedExtensions.some((extension) => lowerName.endsWith(extension))) {
    return "Разрешены только Excel-файлы .xlsx, .xls и .xlsm.";
  }
  if (size > MAX_FILE_BYTES) {
    return "Размер файла превышает лимит 15 MB.";
  }
  return null;
}

export function readWorkbook(buffer: Buffer) {
  return XLSX.read(buffer, {
    type: "buffer",
    cellDates: true,
    cellFormula: true,
    bookVBA: false
  });
}

export function detectSheets(workbook: XLSX.WorkBook): SheetRuntimeInfo[] {
  const workbookSheets = workbook.Workbook?.Sheets ?? [];

  return workbook.SheetNames.map((sheetName, index) => {
    const worksheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, {
      header: 1,
      defval: "",
      raw: true,
      blankrows: true
    });
    const formulaCellsByRow = collectFormulaCells(worksheet);
    const hiddenRows = new Set<number>();
    worksheet["!rows"]?.forEach((row, rowIndex) => {
      if (row?.hidden) hiddenRows.add(rowIndex + 1);
    });

    return {
      sheetName,
      hidden: Boolean(workbookSheets[index]?.Hidden),
      rows,
      hiddenRows,
      formulaCellsByRow,
      formulaCells: Array.from(formulaCellsByRow.values()).reduce((sum, cells) => sum + cells.length, 0)
    };
  });
}

export function parseExcelBuffer(buffer: Buffer, fileName: string, projectId: string): ImportPreview {
  const validationError = validateExcelFile(fileName, buffer.byteLength);
  if (validationError) {
    return emptyPreview(projectId, fileName, [validationError], buffer.byteLength);
  }

  let workbook: XLSX.WorkBook;
  try {
    workbook = readWorkbook(buffer);
  } catch {
    return emptyPreview(projectId, fileName, ["Excel-файл не удалось прочитать. Проверьте формат и целостность файла."], buffer.byteLength);
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const sections: ImportPreview["sections"] = [];
  const budgetItems: ImportPreview["budgetItems"] = [];
  const materials: ImportPreview["materials"] = [];
  const scheduleItems: ImportPreview["scheduleItems"] = [];
  const unknownRows: ImportPreview["unknownRows"] = [];
  const previewRows: ImportPreviewRow[] = [];
  const sourceRows: ImportSourceRow[] = [];
  const mapping: ImportSheetMapping[] = [];
  let ignoredRows = 0;
  let totalRows = 0;

  for (const sheet of detectSheets(workbook)) {
    totalRows += sheet.rows.length;

    if (sheet.hidden) {
      warnings.push(`Лист "${sheet.sheetName}" скрыт и пропущен.`);
      mapping.push(emptySheetMapping(sheet, null, [`Лист скрыт и не импортировался.`]));
      sourceRows.push(...sourceRowsFromSheet(sheet));
      continue;
    }

    if (!sheet.rows.length) {
      warnings.push(`Лист "${sheet.sheetName}" пуст.`);
      mapping.push(emptySheetMapping(sheet, null, [`Лист пуст.`]));
      continue;
    }

    sourceRows.push(...sourceRowsFromSheet(sheet));

    if (sheet.hiddenRows.size > 0) {
      warnings.push(`На листе "${sheet.sheetName}" пропущено скрытых строк: ${sheet.hiddenRows.size}.`);
    }
    if (sheet.formulaCells > 0) {
      warnings.push(`На листе "${sheet.sheetName}" обнаружены формулы: ${sheet.formulaCells}. Формулы не выполнялись, использованы сохраненные значения ячеек.`);
    }

    const headerIndex = detectHeaderRow(sheet.rows);
    if (headerIndex < 0 || !looksLikeHeader(sheet.rows[headerIndex])) {
      warnings.push(`На листе "${sheet.sheetName}" не найдена строка заголовков.`);
      mapping.push(emptySheetMapping(sheet, null, [`Не найдена строка заголовков.`]));
      continue;
    }

    const columns = detectColumns(sheet.rows[headerIndex]);
    const sheetWarnings: string[] = [];
    const state = { currentSection: "Без раздела" };
    let parsedRows = 0;
    const sheetCounts = { budgetItems: 0, materials: 0, scheduleItems: 0, sections: 0, unknownRows: 0 };

    for (let rowIndex = headerIndex + 1; rowIndex < sheet.rows.length; rowIndex += 1) {
      const rowNumber = rowIndex + 1;
      const hidden = sheet.hiddenRows.has(rowNumber);
      if (hidden) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw: {
              sheetName: sheet.sheetName,
              rowNumber,
              values: sheet.rows[rowIndex],
              formulaCells: sheet.formulaCellsByRow.get(rowNumber),
              hidden
            },
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "note",
            warnings: ["Строка скрыта в Excel и не импортируется по умолчанию."],
            flags: ["hiddenRow"],
            normalizedJson: { values: rowValues(sheet.rows[rowIndex]) }
          })
        );
        continue;
      }

      const raw: RawSheetRow = {
        sheetName: sheet.sheetName,
        rowNumber,
        values: sheet.rows[rowIndex],
        formulaCells: sheet.formulaCellsByRow.get(rowNumber),
        hidden
      };
      if (looksLikeHeader(raw.values)) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw,
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "note",
            warnings: ["Повторная строка заголовков распознана и будет пропущена."],
            flags: ["lowConfidence"],
            normalizedJson: { values: rowValues(raw.values) }
          })
        );
        continue;
      }
      if (isLikelyTotalRow(raw, columns)) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw,
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "subtotal",
            warnings: ["Итоговая строка распознана и будет пропущена."],
            flags: ["skippedTotalRow"],
            normalizedJson: { values: rowValues(raw.values) }
          })
        );
        continue;
      }
      const classified = classifyRow(raw, columns, state);
      if (classified.kind === "ignored") ignoredRows += 1;
      if (classified.kind === "section") {
        sections.push(classified.section);
        sheetCounts.sections += 1;
        parsedRows += 1;
      }
      if (classified.kind === "budget_item") {
        budgetItems.push(classified.budgetItem);
        sheetCounts.budgetItems += 1;
        parsedRows += 1;
      }
      if (classified.kind === "material") {
        budgetItems.push(classified.budgetItem);
        materials.push(classified.material);
        sheetCounts.budgetItems += 1;
        sheetCounts.materials += 1;
        parsedRows += 1;
      }
      if (classified.kind === "schedule_item") {
        scheduleItems.push(classified.scheduleItem);
        sheetCounts.scheduleItems += 1;
        parsedRows += 1;
      }
      if (classified.kind === "unknown") {
        unknownRows.push(classified.unknown);
        sheetCounts.unknownRows += 1;
        sheetWarnings.push(`Строка ${rowNumber}: ${classified.unknown.reason}`);
      }
      if (classified.kind !== "ignored") {
        previewRows.push(previewRowFromClassified(raw, columns, classified));
      }
    }

    mapping.push({
      sheetName: sheet.sheetName,
      headerRow: headerIndex + 1,
      columns,
      included: true,
      detectedType: detectSheetType(sheetCounts),
      confidence: sheetConfidence(columns, parsedRows, sheet.rows.length, sheetWarnings.length),
      sampleRows: sampleRows(sheet.rows, headerIndex),
      columnDetails: columnDetails(sheet.rows, headerIndex, columns),
      rows: sheet.rows.length,
      parsedRows,
      hiddenRows: sheet.hiddenRows.size,
      formulaCells: sheet.formulaCells,
      warnings: sheetWarnings.slice(0, 10)
    });
  }

  if (!budgetItems.length && !materials.length && !scheduleItems.length && !sections.length) {
    errors.push("Файл прочитан, но импортируемые строки не распознаны.");
  }

  const preview = buildPreview({
    projectId,
    fileName,
    fileSize: buffer.byteLength,
    sheets: workbook.SheetNames,
    mapping,
    sections,
    budgetItems,
    materials,
    scheduleItems,
    unknownRows,
    previewRows,
    sourceRows,
    warnings,
    errors,
    summary: {
      totalRows,
      ignoredRows,
      hiddenRows: mapping.reduce((sum, item) => sum + item.hiddenRows, 0),
      formulaCells: mapping.reduce((sum, item) => sum + item.formulaCells, 0)
    }
  });
  const validation = validateRows(preview);

  return buildPreview({
    ...preview,
    warnings: [...preview.warnings, ...validation.warnings],
    errors: [...preview.errors, ...validation.errors],
    summary: {
      ...preview.summary,
      duplicateRows: validation.duplicateRows
    }
  });
}

export function validateRows(preview: ImportPreview) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const duplicateKeys = new Set<string>();
  const seenKeys = new Map<string, string>();
  const rowByLocation = new Map((preview.previewRows ?? []).map((row) => [`${row.sheetName}:${row.sourceRowNumber}`, row]));

  for (const item of preview.budgetItems) {
    const key = `${item.section.toLowerCase()}|${item.code || item.name.toLowerCase()}|${item.unit}`;
    const location = `${item.sheetName}:${item.rowNumber}`;
    if (seenKeys.has(key)) {
      duplicateKeys.add(key);
      warnings.push(`Возможный дубль ВОР: "${item.name}" (${seenKeys.get(key)} и ${location}).`);
      const row = rowByLocation.get(location);
      if (row) {
        row.status = row.status === "error" ? "error" : "warning";
        row.suspiciousFlags = Array.from(new Set([...row.suspiciousFlags, "duplicate"]));
        row.warnings = Array.from(new Set([...row.warnings, "Возможный дубль позиции ВОР."]));
      }
    } else {
      seenKeys.set(key, location);
    }
    if (item.qty <= 0) {
      errors.push(`Строка ${location}: количество должно быть больше нуля.`);
      markRowError(rowByLocation.get(location), "Количество должно быть больше нуля.", "missingQuantity");
    }
    if (item.plannedUnitPrice < 0) {
      errors.push(`Строка ${location}: цена не может быть отрицательной.`);
      markRowError(rowByLocation.get(location), "Цена не может быть отрицательной.", "negativeValue");
    }
    const row = rowByLocation.get(location);
    if (row?.totalAmount !== undefined && item.qty > 0) {
      const expected = item.qty * item.plannedUnitPrice;
      const delta = Math.abs(row.totalAmount - expected);
      if (delta > Math.max(1, Math.abs(row.totalAmount) * 0.02)) {
        warnings.push(`Строка ${location}: сумма ${row.totalAmount} отличается от количество × цена (${expected}).`);
        markRowWarning(row, "Сумма отличается от количество × цена.", "amountMismatch");
      }
    }
  }

  for (const item of preview.scheduleItems) {
    if (new Date(item.endsAt) < new Date(item.startsAt)) {
      errors.push(`Строка ${item.sheetName}:${item.rowNumber}: дата окончания раньше даты начала.`);
    }
  }

  const budgetSections = new Set(preview.budgetItems.map((item) => item.section.toLowerCase()));
  for (const section of preview.sections) {
    if (!budgetSections.has(section.name.toLowerCase())) {
      warnings.push(`Раздел "${section.name}" распознан, но внутри него нет импортируемых позиций ВОР.`);
    }
  }

  if (preview.unknownRows.length > 0) {
    warnings.push(`Не распознано строк: ${preview.unknownRows.length}. Их можно проверить в preview и внести вручную.`);
  }

  return { warnings, errors, duplicateRows: duplicateKeys.size };
}

export function buildCommitPlan(preview: ImportPreview, mode: ImportMode): ImportCommitPlan {
  if (preview.errors.length > 0) {
    throw new Error("Нельзя сохранить импорт с ошибками preview.");
  }
  if (!preview.budgetItems.length && !preview.materials.length && !preview.scheduleItems.length) {
    throw new Error("В preview нет строк для сохранения.");
  }

  return {
    mode,
    sections: preview.sections,
    budgetItems: preview.budgetItems,
    materials: preview.materials,
    scheduleItems: preview.scheduleItems,
    warnings: preview.warnings,
    summary: preview.summary
  };
}

export function commitImportPlan(preview: ImportPreview, mode: ImportMode) {
  return buildCommitPlan(preview, mode);
}

export function buildPreview(input: BuildPreviewInput): ImportPreview {
  const mapping = input.mapping ?? [];
  const summary = input.summary ?? {};
  const previewRows = input.previewRows ?? [];
  const parsedRows = input.sections.length + input.budgetItems.length + input.scheduleItems.length;
  const errors = input.errors.length;
  const warnings = input.warnings.length;
  const readyRows = previewRows.filter((row) => row.status === "ready").length;
  const warningRows = previewRows.filter((row) => row.status === "warning").length;
  const errorRows = previewRows.filter((row) => row.status === "error").length;
  const skippedRows = previewRows.filter((row) => row.status === "skipped").length;

  return {
    ...input,
    parserVersion: input.parserVersion ?? EXCEL_IMPORT_PARSER_VERSION,
    mapping,
    previewRows,
    summary: {
      totalRows: summary.totalRows ?? parsedRows + input.unknownRows.length,
      parsedRows: summary.parsedRows ?? parsedRows,
      readyRows: summary.readyRows ?? readyRows,
      warningRows: summary.warningRows ?? warningRows,
      errorRows: summary.errorRows ?? errorRows,
      skippedRows: summary.skippedRows ?? skippedRows,
      ignoredRows: summary.ignoredRows ?? 0,
      sections: input.sections.length,
      budgetItems: input.budgetItems.length,
      materials: input.materials.length,
      scheduleItems: input.scheduleItems.length,
      workRows: summary.workRows ?? input.budgetItems.filter((item) => item.kind === "work").length,
      materialRows: summary.materialRows ?? input.materials.length,
      unknownRows: input.unknownRows.length,
      duplicateRows: summary.duplicateRows ?? 0,
      hiddenRows: summary.hiddenRows ?? 0,
      formulaCells: summary.formulaCells ?? 0,
      estimatedTotalAmount: summary.estimatedTotalAmount ?? input.budgetItems.reduce((sum, item) => sum + item.qty * item.plannedUnitPrice, 0),
      errors,
      warnings
    }
  };
}

function emptyPreview(projectId: string, fileName: string, errors: string[], fileSize?: number): ImportPreview {
  return buildPreview({
    projectId,
    fileName,
    fileSize,
    sheets: [],
    mapping: [],
    sections: [],
    budgetItems: [],
    materials: [],
    scheduleItems: [],
    unknownRows: [],
    previewRows: [],
    warnings: [],
    errors
  });
}

function emptySheetMapping(sheet: SheetRuntimeInfo, headerRow: number | null, warnings: string[]): ImportSheetMapping {
  return {
    sheetName: sheet.sheetName,
    headerRow,
    columns: {},
    included: false,
    detectedType: "unknown",
    confidence: 0,
    sampleRows: sampleRows(sheet.rows, headerRow ? headerRow - 1 : 0),
    columnDetails: [],
    rows: sheet.rows.length,
    parsedRows: 0,
    hiddenRows: sheet.hiddenRows.size,
    formulaCells: sheet.formulaCells,
    warnings
  };
}

export function remapImportPreview(preview: ImportPreview, mappingOverrides: Array<Pick<ImportSheetMapping, "sheetName" | "columns"> & Partial<Pick<ImportSheetMapping, "headerRow" | "included">>>) {
  if (!preview.sourceRows?.length) {
    throw new Error("Для этого batch нет сохраненных строк Excel. Загрузите файл заново и выполните preview.");
  }

  const warnings: string[] = [];
  const errors: string[] = [];
  const sections: ImportPreview["sections"] = [];
  const budgetItems: ImportPreview["budgetItems"] = [];
  const materials: ImportPreview["materials"] = [];
  const scheduleItems: ImportPreview["scheduleItems"] = [];
  const unknownRows: ImportPreview["unknownRows"] = [];
  const previewRows: ImportPreviewRow[] = [];
  const mapping: ImportSheetMapping[] = [];
  let ignoredRows = 0;

  const overridesBySheet = new Map(mappingOverrides.map((item) => [item.sheetName, item]));
  const sourceRowsBySheet = groupBy(preview.sourceRows, (row) => row.sheetName);

  for (const sheetName of preview.sheets) {
    const rows = sourceRowsBySheet.get(sheetName) ?? [];
    const override = overridesBySheet.get(sheetName);
    const previous = preview.mapping.find((item) => item.sheetName === sheetName);
    const included = override?.included ?? previous?.included ?? true;
    const headerRow = override?.headerRow ?? previous?.headerRow ?? null;
    const columns = override?.columns ?? previous?.columns ?? {};
    const sheetWarnings: string[] = [];
    const state = { currentSection: "Без раздела" };
    const sheetCounts = { budgetItems: 0, materials: 0, scheduleItems: 0, sections: 0, unknownRows: 0 };
    let parsedRows = 0;

    if (!included) {
      ignoredRows += rows.length;
      mapping.push({
        sheetName,
        headerRow,
        columns,
        included: false,
        detectedType: "unknown",
        confidence: 0,
        sampleRows: rows.slice(0, 3).map((row) => row.values.slice(0, 8)),
        columnDetails: [],
        rows: rows.length,
        parsedRows: 0,
        hiddenRows: rows.filter((row) => row.hidden).length,
        formulaCells: rows.reduce((sum, row) => sum + (row.formulaCells?.length ?? 0), 0),
        warnings: ["Лист исключен пользователем."]
      });
      continue;
    }

    if (!headerRow) {
      warnings.push(`На листе "${sheetName}" не задана строка заголовков.`);
      mapping.push({
        sheetName,
        headerRow,
        columns,
        included,
        detectedType: "unknown",
        confidence: 0,
        sampleRows: rows.slice(0, 3).map((row) => row.values.slice(0, 8)),
        columnDetails: [],
        rows: rows.length,
        parsedRows: 0,
        hiddenRows: rows.filter((row) => row.hidden).length,
        formulaCells: rows.reduce((sum, row) => sum + (row.formulaCells?.length ?? 0), 0),
        warnings: ["Не задана строка заголовков."]
      });
      continue;
    }

    for (const source of rows.filter((row) => row.rowNumber > headerRow)) {
      const raw: RawSheetRow = {
        sheetName,
        rowNumber: source.rowNumber,
        values: source.values,
        formulaCells: source.formulaCells,
        hidden: source.hidden
      };

      if (source.hidden) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw,
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "note",
            warnings: ["Строка скрыта в Excel и не импортируется по умолчанию."],
            flags: ["hiddenRow"],
            normalizedJson: { values: source.values }
          })
        );
        continue;
      }

      if (looksLikeHeader(raw.values)) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw,
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "note",
            warnings: ["Повторная строка заголовков распознана и будет пропущена."],
            flags: ["lowConfidence"],
            normalizedJson: { values: source.values }
          })
        );
        continue;
      }

      if (isLikelyTotalRow(raw, columns)) {
        ignoredRows += 1;
        previewRows.push(
          previewRow({
            raw,
            columns,
            status: "skipped",
            entityType: "unknown",
            rowKind: "subtotal",
            warnings: ["Итоговая строка распознана и будет пропущена."],
            flags: ["skippedTotalRow"],
            normalizedJson: { values: source.values }
          })
        );
        continue;
      }

      const classified = classifyRow(raw, columns, state);
      if (classified.kind === "ignored") ignoredRows += 1;
      if (classified.kind === "section") {
        sections.push(classified.section);
        sheetCounts.sections += 1;
        parsedRows += 1;
      }
      if (classified.kind === "budget_item") {
        budgetItems.push(classified.budgetItem);
        sheetCounts.budgetItems += 1;
        parsedRows += 1;
      }
      if (classified.kind === "material") {
        budgetItems.push(classified.budgetItem);
        materials.push(classified.material);
        sheetCounts.budgetItems += 1;
        sheetCounts.materials += 1;
        parsedRows += 1;
      }
      if (classified.kind === "schedule_item") {
        scheduleItems.push(classified.scheduleItem);
        sheetCounts.scheduleItems += 1;
        parsedRows += 1;
      }
      if (classified.kind === "unknown") {
        unknownRows.push(classified.unknown);
        sheetCounts.unknownRows += 1;
        sheetWarnings.push(`Строка ${source.rowNumber}: ${classified.unknown.reason}`);
      }
      if (classified.kind !== "ignored") {
        previewRows.push(previewRowFromClassified(raw, columns, classified));
      }
    }

    const rowsAsArrays = rows.map((row) => row.values);
    mapping.push({
      sheetName,
      headerRow,
      columns,
      included,
      detectedType: detectSheetType(sheetCounts),
      confidence: sheetConfidence(columns, parsedRows, rows.length, sheetWarnings.length),
      sampleRows: sampleRows(rowsAsArrays, Math.max(headerRow - 1, 0)),
      columnDetails: columnDetails(rowsAsArrays, Math.max(headerRow - 1, 0), columns),
      rows: rows.length,
      parsedRows,
      hiddenRows: rows.filter((row) => row.hidden).length,
      formulaCells: rows.reduce((sum, row) => sum + (row.formulaCells?.length ?? 0), 0),
      warnings: sheetWarnings.slice(0, 10)
    });
  }

  const remapped = buildPreview({
    importBatchId: preview.importBatchId,
    projectId: preview.projectId,
    fileName: preview.fileName,
    fileSize: preview.fileSize,
    parserVersion: preview.parserVersion,
    sheets: preview.sheets,
    mapping,
    sections,
    budgetItems,
    materials,
    scheduleItems,
    unknownRows,
    previewRows,
    sourceRows: preview.sourceRows,
    warnings,
    errors,
    summary: {
      totalRows: preview.summary.totalRows,
      ignoredRows,
      hiddenRows: mapping.reduce((sum, item) => sum + item.hiddenRows, 0),
      formulaCells: mapping.reduce((sum, item) => sum + item.formulaCells, 0)
    }
  });
  const validation = validateRows(remapped);
  return buildPreview({
    ...remapped,
    warnings: [...remapped.warnings, ...validation.warnings],
    errors: [...remapped.errors, ...validation.errors],
    summary: {
      ...remapped.summary,
      duplicateRows: validation.duplicateRows
    }
  });
}

function previewRowFromClassified(raw: RawSheetRow, columns: ColumnMap, classified: ClassifiedRow): ImportPreviewRow {
  if (classified.kind === "section") {
    return previewRow({
      raw,
      columns,
      status: "ready",
      entityType: "section",
      rowKind: rowKindForClassified(classified),
      section: classified.section.name,
      name: classified.section.name,
      normalizedJson: toRecord(classified.section)
    });
  }
  if (classified.kind === "budget_item") {
    return previewRowFromBudget(raw, columns, classified.budgetItem, "budgetItem");
  }
  if (classified.kind === "material") {
    return previewRowFromBudget(raw, columns, classified.budgetItem, "material", classified.material);
  }
  if (classified.kind === "schedule_item") {
    return previewRow({
      raw,
      columns,
      status: "ready",
      entityType: "scheduleItem",
      rowKind: "work_item",
      name: classified.scheduleItem.name,
      quantity: classified.scheduleItem.plannedQty,
      normalizedJson: toRecord(classified.scheduleItem)
    });
  }
  if (classified.kind === "unknown") {
    return previewRow({
      raw,
      columns,
      status: "warning",
      entityType: "unknown",
      rowKind: "unknown",
      name: classified.unknown.values[0],
      warnings: [classified.unknown.reason],
      flags: ["unknownClassification"],
      normalizedJson: toRecord(classified.unknown)
    });
  }
  return previewRow({ raw, columns, status: "skipped", entityType: "unknown", normalizedJson: { values: rowValues(raw.values) } });
}

function previewRowFromBudget(raw: RawSheetRow, columns: ColumnMap, item: ImportPreview["budgetItems"][number], entityType: "budgetItem" | "material", material?: ImportPreview["materials"][number]) {
  const warnings: string[] = [];
  const errors: string[] = [];
  const flags: ImportSuspiciousFlag[] = [];
  const totalAmount = parseMoney(cell(raw.values, columns.total)) ?? undefined;
  if (!item.name) errors.push("Нет наименования строки.");
  if (!Number.isFinite(item.qty) || item.qty <= 0) {
    errors.push("Количество должно быть больше нуля.");
    flags.push("missingQuantity");
  }
  if (!Number.isFinite(item.plannedUnitPrice) || item.plannedUnitPrice < 0) {
    errors.push("Цена должна быть неотрицательным числом.");
    flags.push("missingPrice");
  }
  if (item.plannedUnitPrice === 0) {
    warnings.push("Цена не указана или равна нулю.");
    flags.push("missingPrice");
  }
  if (totalAmount !== undefined && item.qty > 0) {
    const expected = item.qty * item.plannedUnitPrice;
    if (Math.abs(totalAmount - expected) > Math.max(1, Math.abs(totalAmount) * 0.02)) {
      warnings.push("Сумма отличается от количество × цена.");
      flags.push("amountMismatch");
    }
  }
  return previewRow({
    raw,
    columns,
    status: errors.length ? "error" : warnings.length ? "warning" : "ready",
    entityType,
    rowKind: rowKindForBudgetKind(item.kind, entityType),
    section: item.section,
    name: item.name,
    unit: item.unit,
    quantity: item.qty,
    unitPrice: item.plannedUnitPrice,
    totalAmount,
    warnings,
    errors,
    flags,
    normalizedJson: toRecord(material ?? item)
  });
}

function previewRow(input: {
  raw: RawSheetRow;
  columns: ColumnMap;
  status: ImportPreviewRow["status"];
  entityType: ImportPreviewRow["entityType"];
  rowKind?: AssistedImportRowKind;
  section?: string;
  name?: string;
  unit?: string;
  quantity?: number;
  unitPrice?: number;
  totalAmount?: number;
  warnings?: string[];
  errors?: string[];
  flags?: ImportSuspiciousFlag[];
  normalizedJson: Record<string, unknown>;
}): ImportPreviewRow {
  const quantity = input.quantity ?? parseQuantity(cell(input.raw.values, input.columns.qty)) ?? undefined;
  const unitPrice = input.unitPrice ?? parseMoney(cell(input.raw.values, input.columns.unitPrice)) ?? undefined;
  const totalAmount = input.totalAmount ?? parseMoney(cell(input.raw.values, input.columns.total)) ?? undefined;
  const originalNumber = normalizeText(cell(input.raw.values, input.columns.index)) || undefined;
  return {
    id: `${input.raw.sheetName}:${input.raw.rowNumber}`,
    sheetName: input.raw.sheetName,
    sourceRowNumber: input.raw.rowNumber,
    originalNumber,
    normalizedNumber: normalizeVorNumber(originalNumber, input.raw.rowNumber),
    rowKind: input.rowKind ?? rowKindForPreview(input.entityType, input.status),
    confidence: confidenceForPreview(input.status, input.entityType, input.flags ?? [], input.warnings ?? [], input.errors ?? []),
    status: input.status,
    entityType: input.entityType,
    section: input.section,
    name: input.name ?? normalizeText(cell(input.raw.values, input.columns.name)),
    unit: input.unit ?? normalizeText(cell(input.raw.values, input.columns.unit)),
    quantity,
    unitPrice,
    totalAmount,
    normalizedJson: input.normalizedJson,
    warnings: input.warnings ?? [],
    errors: input.errors ?? [],
    suspiciousFlags: Array.from(new Set(input.flags ?? []))
  };
}

export function normalizeVorNumber(value: unknown, fallbackRowNumber?: number) {
  const text = normalizeText(value)
    .replace(/^№\s*/i, "")
    .replace(/\s+/g, "")
    .replace(/[,;]/g, ".")
    .replace(/[^\d.a-zа-я/-]/gi, "");
  if (text && /[\dа-яa-z]/i.test(text)) return text;
  return fallbackRowNumber ? `row-${fallbackRowNumber}` : "";
}

function rowKindForClassified(classified: ClassifiedRow): AssistedImportRowKind {
  if (classified.kind === "section") return /этап/i.test(classified.section.name) ? "stage" : "section_header";
  if (classified.kind === "schedule_item") return "work_item";
  if (classified.kind === "unknown") return "unknown";
  if (classified.kind === "budget_item") return rowKindForBudgetKind(classified.budgetItem.kind, "budgetItem");
  if (classified.kind === "material") return "material_item";
  return "unknown";
}

function rowKindForBudgetKind(kind: ImportPreview["budgetItems"][number]["kind"], entityType: "budgetItem" | "material"): AssistedImportRowKind {
  if (entityType === "material" || kind === "material") return "material_item";
  if (kind === "equipment") return "equipment_item";
  if (kind === "payroll") return "labor_item";
  return "work_item";
}

function rowKindForPreview(entityType: ImportPreviewRow["entityType"], status: ImportPreviewRow["status"]): AssistedImportRowKind {
  if (status === "skipped") return "note";
  if (entityType === "section") return "section_header";
  if (entityType === "material") return "material_item";
  if (entityType === "scheduleItem" || entityType === "budgetItem") return "work_item";
  return "unknown";
}

function confidenceForPreview(status: ImportPreviewRow["status"], entityType: ImportPreviewRow["entityType"], flags: ImportSuspiciousFlag[], warnings: string[], errors: string[]) {
  if (status === "error" || errors.length) return 0.2;
  if (entityType === "unknown") return 0.25;
  if (status === "skipped") return flags.includes("skippedTotalRow") ? 0.85 : 0.55;
  const penalty = Math.min(warnings.length * 0.12 + flags.filter((flag) => flag !== "amountMismatch").length * 0.1, 0.35);
  return Number(Math.max(0.35, Math.min(0.98, 0.92 - penalty)).toFixed(2));
}

function markRowWarning(row: ImportPreviewRow | undefined, warning: string, flag: ImportSuspiciousFlag) {
  if (!row) return;
  row.status = row.status === "error" ? "error" : "warning";
  row.warnings = Array.from(new Set([...row.warnings, warning]));
  row.suspiciousFlags = Array.from(new Set([...row.suspiciousFlags, flag]));
}

function markRowError(row: ImportPreviewRow | undefined, error: string, flag: ImportSuspiciousFlag) {
  if (!row) return;
  row.status = "error";
  row.errors = Array.from(new Set([...row.errors, error]));
  row.suspiciousFlags = Array.from(new Set([...row.suspiciousFlags, flag]));
}

function sourceRowsFromSheet(sheet: SheetRuntimeInfo): ImportSourceRow[] {
  return sheet.rows.map((row, index) => ({
    sheetName: sheet.sheetName,
    rowNumber: index + 1,
    values: rowValues(row),
    formulaCells: sheet.formulaCellsByRow.get(index + 1),
    hidden: sheet.hiddenRows.has(index + 1)
  }));
}

function rowValues(row: unknown[]) {
  return row.map((value) => normalizeText(value));
}

function isLikelyTotalRow(raw: RawSheetRow, columns: ColumnMap) {
  const name = normalizeText(cell(raw.values, columns.name)) || rowValues(raw.values).find(Boolean) || "";
  const text = normalizeHeader(name);
  return /^(итого|всего|ндс|сметная стоимость|общая стоимость)/.test(text) || text.includes("итого по") || text.includes("всего по смете");
}

function detectSheetType(counts: { budgetItems: number; materials: number; scheduleItems: number; sections: number; unknownRows: number }): ImportSheetDetectedType {
  const importable = counts.budgetItems + counts.materials + counts.scheduleItems;
  if (!importable && counts.sections <= 1) return "unknown";
  const kinds = [counts.budgetItems > counts.materials, counts.materials > 0, counts.scheduleItems > 0].filter(Boolean).length;
  if (kinds > 1) return "mixed";
  if (counts.scheduleItems > 0) return "schedule";
  if (counts.materials > counts.budgetItems / 2) return "materials";
  if (counts.budgetItems > 0) return "works";
  return "unknown";
}

function sheetConfidence(columns: ColumnMap, parsedRows: number, totalRows: number, warningCount: number) {
  const required = [columns.name, columns.qty, columns.unit, columns.unitPrice ?? columns.total].filter((value) => value !== undefined).length;
  const columnScore = required / 4;
  const rowScore = totalRows > 0 ? Math.min(parsedRows / Math.max(totalRows - 1, 1), 1) : 0;
  const warningPenalty = Math.min(warningCount * 0.04, 0.25);
  return Math.max(0, Math.min(1, Number((columnScore * 0.7 + rowScore * 0.3 - warningPenalty).toFixed(2))));
}

function sampleRows(rows: unknown[][], headerIndex: number) {
  return rows.slice(headerIndex, headerIndex + 4).map((row) => rowValues(row).slice(0, 10));
}

function columnDetails(rows: unknown[][], headerIndex: number, columns: ColumnMap) {
  const header = rows[headerIndex] ?? [];
  return remappableTargets.map((target) => {
    const sourceIndex = columns[target];
    return {
      target,
      sourceIndex,
      sourceHeader: sourceIndex === undefined ? undefined : normalizeText(header[sourceIndex]),
      confidence: sourceIndex === undefined ? 0 : 0.88,
      samples: sourceIndex === undefined ? [] : rows.slice(headerIndex + 1, headerIndex + 4).map((row) => normalizeText(row[sourceIndex])).filter(Boolean)
    };
  });
}

function groupBy<T>(items: T[], getKey: (item: T) => string) {
  const grouped = new Map<string, T[]>();
  for (const item of items) {
    const key = getKey(item);
    grouped.set(key, [...(grouped.get(key) ?? []), item]);
  }
  return grouped;
}

function toRecord(value: unknown): Record<string, unknown> {
  return JSON.parse(JSON.stringify(value)) as Record<string, unknown>;
}

function collectFormulaCells(worksheet: XLSX.WorkSheet) {
  const byRow = new Map<number, string[]>();
  if (!worksheet["!ref"]) return byRow;
  const range = XLSX.utils.decode_range(worksheet["!ref"]);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const value = worksheet[address] as XLSX.CellObject | undefined;
      if (!value?.f) continue;
      const rowNumber = row + 1;
      byRow.set(rowNumber, [...(byRow.get(rowNumber) ?? []), address]);
    }
  }

  return byRow;
}
