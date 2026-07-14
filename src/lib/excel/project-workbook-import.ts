import * as XLSX from "xlsx";
import { parseExcelBuffer, readWorkbook, validateExcelFile } from "./import-parser";
import { normalizeDate, normalizeHeader, normalizeText, parseMoney, parseQuantity } from "./import-normalizer";
import type {
  ImportBudgetItem,
  ImportMaterial,
  ImportPreview,
  ImportPreviewRow,
  ImportScheduleItem,
  ImportSheetDetectedType,
  ImportSheetMapping
} from "./import-types";
import { buildProjectWorkbookQualityGate, failedProjectWorkbookQualityGate, type ProjectWorkbookQualityGate } from "./project-workbook-quality";

export type { ProjectWorkbookQualityGate, ProjectWorkbookQualityIssue, ProjectWorkbookQualityStatus } from "./project-workbook-quality";

export const PROJECT_WORKBOOK_PARSER_VERSION = "project_workbook_v1";

export type ProjectWorkbookSheetRole =
  | "works"
  | "materials"
  | "schedule"
  | "payroll"
  | "equipment"
  | "summary"
  | "reference"
  | "control"
  | "unknown";

export type ProjectWorkbookModuleId =
  | "budget"
  | "materials"
  | "schedule"
  | "payroll"
  | "equipment"
  | "procurement"
  | "cashflow"
  | "intelligence"
  | "source_control";

export type ProjectWorkbookSuggestionConfidence = "low" | "medium" | "high";

export type ProjectWorkbookSuggestionField =
  | "name"
  | "code"
  | "customer"
  | "object"
  | "objectType"
  | "address"
  | "description"
  | "contractAmount"
  | "vatMode"
  | "vatPercent"
  | "startsAt"
  | "endsAt"
  | "manager"
  | "tenderSource"
  | "paymentNotes"
  | "volumeChangeMode"
  | "templateId";

export interface ProjectWorkbookSuggestions {
  name?: string;
  code?: string;
  customer?: string;
  object?: string;
  objectType?: "residential" | "commercial" | "social" | "engineering" | "reconstruction" | "roofing_facade" | "interior" | "other";
  address?: string;
  description?: string;
  contractAmount?: number;
  vatMode?: "including_vat" | "excluding_vat" | "no_vat" | "unknown";
  vatPercent?: number;
  startsAt?: string;
  endsAt?: string;
  durationMonths?: number;
  manager?: string;
  tenderSource?: "contract" | "tender" | "commercial_offer" | "draft" | "unknown";
  paymentNotes?: string;
  volumeChangeMode?: "fixed_scope" | "fact_based" | "can_change" | "unknown";
  templateId?: "general_construction" | "engineering_networks" | "fit_out" | "roofing" | "concrete" | "facade" | "tender" | "empty";
  selectedModules: Array<"vor" | "documents" | "schedule" | "materials" | "acceptance" | "risks" | "contract" | "reports">;
  confidenceByField: Partial<Record<ProjectWorkbookSuggestionField, ProjectWorkbookSuggestionConfidence>>;
  evidenceByField: Partial<Record<ProjectWorkbookSuggestionField, string>>;
  missingFields: string[];
}

export interface ProjectWorkbookSheetAnalysis {
  sheetName: string;
  detectedRole: ProjectWorkbookSheetRole;
  role: ProjectWorkbookSheetRole;
  enabled: boolean;
  overridden: boolean;
  included: boolean;
  confidence: number;
  rows: number;
  importedRows: number;
  formulaCells: number;
  hiddenRows: number;
  reason: string;
}

export interface ProjectWorkbookModuleSummary {
  id: ProjectWorkbookModuleId;
  label: string;
  sheets: string[];
  rows: number;
  amount: number;
  status: "ready" | "derived" | "reference" | "not_found";
  detail: string;
}

export interface ProjectWorkbookAnalysis {
  parserVersion: string;
  fileName: string;
  fileSize: number;
  sheets: ProjectWorkbookSheetAnalysis[];
  modules: ProjectWorkbookModuleSummary[];
  summary: {
    totalSheets: number;
    includedSheets: number;
    referenceSheets: number;
    excludedSheets: number;
    reviewSheets: number;
    overriddenSheets: number;
    budgetItems: number;
    materials: number;
    scheduleItems: number;
    payrollItems: number;
    equipmentItems: number;
    estimatedDirectCost: number;
    sourceDirectCost?: number;
    reconciliationGap: number;
    automatedCoveragePercent: number;
    payrollCost: number;
    equipmentCost: number;
  };
  suggestions: ProjectWorkbookSuggestions;
  quality: ProjectWorkbookQualityGate;
  warnings: string[];
  errors: string[];
}

export interface ProjectWorkbookSheetOverride {
  role?: ProjectWorkbookSheetRole;
  enabled?: boolean;
}

export type ProjectWorkbookSheetOverrides = Record<string, ProjectWorkbookSheetOverride>;

export interface ProjectWorkbookOptions {
  startsAt?: string | Date;
  sheetOverrides?: ProjectWorkbookSheetOverrides;
}

interface SheetData {
  name: string;
  worksheet: XLSX.WorkSheet;
  rows: unknown[][];
  detectedRole: ProjectWorkbookSheetRole;
  role: ProjectWorkbookSheetRole;
  enabled: boolean;
  overridden: boolean;
  confidence: number;
  reason: string;
  formulaCells: number;
  hiddenRows: number;
}

interface BuildResult {
  preview: ImportPreview;
  analysis: ProjectWorkbookAnalysis;
  specialized: boolean;
}

interface ParsedSheetItems {
  budgetItems: ImportBudgetItem[];
  materials: ImportMaterial[];
  scheduleItems: ImportScheduleItem[];
  headerRow: number | null;
  columns: ImportSheetMapping["columns"];
}

const roleLabels: Record<ProjectWorkbookModuleId, string> = {
  budget: "ВОР и бюджет",
  materials: "Материалы и снабжение",
  schedule: "Сводный график",
  payroll: "ФОТ и трудовые ресурсы",
  equipment: "Машины и механизмы",
  procurement: "Закупки и потребность",
  cashflow: "Cashflow и расходный план",
  intelligence: "Project Intelligence",
  source_control: "Сверка и источники"
};

const sheetRoles: ProjectWorkbookSheetRole[] = ["works", "materials", "schedule", "payroll", "equipment", "summary", "reference", "control", "unknown"];

export function parseProjectWorkbookSheetOverrides(value: unknown): ProjectWorkbookSheetOverrides {
  if (value === undefined || value === null || value === "") return {};
  if (typeof value !== "string") throw new Error("Карта листов должна быть передана в JSON.");

  let parsed: unknown;
  try {
    parsed = JSON.parse(value);
  } catch {
    throw new Error("Карта листов содержит некорректный JSON.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Карта листов должна быть объектом.");

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length > 200) throw new Error("Карта листов содержит слишком много записей.");
  const result: ProjectWorkbookSheetOverrides = {};
  for (const [sheetName, rawOverride] of entries) {
    if (!sheetName.trim() || sheetName.length > 128 || !rawOverride || typeof rawOverride !== "object" || Array.isArray(rawOverride)) {
      throw new Error("Карта листов содержит некорректную запись.");
    }
    const candidate = rawOverride as Record<string, unknown>;
    const role = candidate.role;
    const enabled = candidate.enabled;
    if (role !== undefined && (typeof role !== "string" || !sheetRoles.includes(role as ProjectWorkbookSheetRole))) {
      throw new Error(`Недопустимая роль листа «${sheetName}».`);
    }
    if (enabled !== undefined && typeof enabled !== "boolean") throw new Error(`Некорректный флаг листа «${sheetName}».`);
    result[sheetName] = {
      ...(role === undefined ? {} : { role: role as ProjectWorkbookSheetRole }),
      ...(enabled === undefined ? {} : { enabled })
    };
  }
  return result;
}

export function analyzeProjectWorkbookBuffer(buffer: Buffer, fileName: string, projectId = "onboarding-preview", options: ProjectWorkbookOptions = {}) {
  return buildProjectWorkbook(buffer, fileName, projectId, options).analysis;
}

export function parseProjectWorkbookBuffer(buffer: Buffer, fileName: string, projectId: string, options: ProjectWorkbookOptions = {}) {
  const result = buildProjectWorkbook(buffer, fileName, projectId, options);
  return result.specialized || Object.keys(options.sheetOverrides ?? {}).length > 0 ? result.preview : parseExcelBuffer(buffer, fileName, projectId);
}

function buildProjectWorkbook(buffer: Buffer, fileName: string, projectId: string, options: ProjectWorkbookOptions): BuildResult {
  const validationError = validateExcelFile(fileName, buffer.byteLength);
  if (validationError) return failedResult(fileName, buffer.byteLength, projectId, validationError);

  let workbook: XLSX.WorkBook;
  try {
    workbook = readWorkbook(buffer);
  } catch {
    return failedResult(fileName, buffer.byteLength, projectId, "Excel-файл не удалось прочитать. Проверьте формат и целостность файла.");
  }

  const sheetData = workbook.SheetNames.map((name) => buildSheetData(name, workbook.Sheets[name], options.sheetOverrides?.[name]));
  const enabledSheetData = sheetData.filter((sheet) => sheet.enabled);
  const budgetItems: ImportBudgetItem[] = [];
  const materials: ImportMaterial[] = [];
  const scheduleItems: ImportScheduleItem[] = [];
  const mappings: ImportSheetMapping[] = [];
  const sheets: ProjectWorkbookSheetAnalysis[] = [];
  const warnings: string[] = [];
  const startsAt = extractWorkbookStartDate(sheetData) ?? safeDate(options.startsAt) ?? new Date();
  const vatPercent = extractVatPercent(enabledSheetData) ?? 0;

  for (const sheet of sheetData) {
    const parsed = sheet.enabled ? parseSheet(sheet, startsAt, vatPercent) : emptyParsedSheet();
    budgetItems.push(...parsed.budgetItems);
    materials.push(...parsed.materials);
    scheduleItems.push(...parsed.scheduleItems);
    const importedRows = parsed.budgetItems.length + parsed.scheduleItems.length;
    const included = importedRows > 0;

    sheets.push({
      sheetName: sheet.name,
      detectedRole: sheet.detectedRole,
      role: sheet.role,
      enabled: sheet.enabled,
      overridden: sheet.overridden,
      included,
      confidence: sheet.confidence,
      rows: sheet.rows.length,
      importedRows,
      formulaCells: sheet.formulaCells,
      hiddenRows: sheet.hiddenRows,
      reason: sheet.enabled ? sheet.reason : "Лист исключен пользователем из анализа и импорта."
    });
    mappings.push({
      sheetName: sheet.name,
      headerRow: parsed.headerRow,
      columns: parsed.columns,
      included,
      detectedType: detectedType(sheet.role),
      confidence: sheet.confidence,
      sampleRows: sampleRows(sheet.rows),
      columnDetails: [],
      rows: sheet.rows.length,
      parsedRows: importedRows,
      hiddenRows: sheet.hiddenRows,
      formulaCells: sheet.formulaCells,
      warnings: included
        ? []
        : [
            !sheet.enabled
              ? "Лист исключен пользователем."
              : sheet.role === "summary" || sheet.role === "reference" || sheet.role === "control"
                ? "Лист используется для сверки и не переносится как рабочие строки."
                : "Импортируемые строки не найдены."
          ]
    });
    if (sheet.enabled && sheet.overridden && ["works", "materials", "schedule", "payroll", "equipment"].includes(sheet.role) && !included) {
      warnings.push(`Лист «${sheet.name}» назначен как «${sheet.role}», но рабочие строки не распознаны. Проверьте заголовки или исключите лист.`);
    }
  }

  const uniqueMaterials = dedupeMaterials(materials);
  const selectedMaterialRows = new Set(uniqueMaterials.map((item) => rowKey(item.sheetName, item.rowNumber)));
  const selectedBudgetItems = budgetItems.filter((item) => item.kind !== "material" || selectedMaterialRows.has(rowKey(item.sheetName, item.rowNumber)));
  let uniqueBudgetItems = dedupeBudgetItems(selectedBudgetItems);
  const duplicateRows = selectedBudgetItems.length - uniqueBudgetItems.length;
  const sourceDirectCost = extractDirectCost(enabledSheetData);
  const parsedDirectCost = sumCost(uniqueBudgetItems);
  const reconciliationGap = sourceDirectCost ? sourceDirectCost - parsedDirectCost : 0;
  if (sourceDirectCost && reconciliationGap > Math.max(1, sourceDirectCost * 0.01)) {
    const sourceSheet = enabledSheetData.find((sheet) => sheet.role === "summary")?.name ?? "ССР";
    uniqueBudgetItems = [
      ...uniqueBudgetItems,
      {
        section: "Сверка / нераспределено",
        code: "RECONCILIATION-GAP",
        name: "Нераспределенная часть прямых затрат по ССР",
        unit: "компл.",
        qty: 1,
        plannedUnitPrice: reconciliationGap,
        actualUnitPrice: 0,
        forecastUnitPrice: reconciliationGap,
        kind: "overhead",
        source: `Project workbook · ${sourceSheet}`,
        comment: "Сводная сумма превышает автоматически распределенную детализацию. Требуется разнести остаток по рабочим позициям после проверки источников.",
        sheetName: sourceSheet,
        rowNumber: 1
      }
    ];
    warnings.push(`По ССР осталось нераспределено ${Math.round(reconciliationGap)} ₽. Остаток добавлен отдельной контрольной строкой и требует проверки.`);
  } else if (sourceDirectCost && reconciliationGap < -Math.max(1, sourceDirectCost * 0.01)) {
    warnings.push(`Распознанная детализация превышает свод прямых затрат на ${Math.round(Math.abs(reconciliationGap))} ₽. Автоматическое уменьшение строк не выполнялось.`);
  }
  const uniqueSections = Array.from(new Set(uniqueBudgetItems.map((item) => item.section))).map((name) => {
    const source = uniqueBudgetItems.find((item) => item.section === name)!;
    return { name, sheetName: source.sheetName, rowNumber: Math.max(1, source.rowNumber - 1) };
  });
  if (duplicateRows > 0) warnings.push(`Исключено возможных дублей рабочих строк: ${duplicateRows}.`);
  if (enabledSheetData.some((sheet) => sheet.role === "summary")) {
    warnings.push("Сводные листы используются только для сверки итогов: рабочий бюджет собирается из детальных листов без двойного учета.");
  }
  warnings.push("Формулы Excel не выполняются на сервере; используются сохраненные значения ячеек.");
  const excludedSheets = sheetData.filter((sheet) => !sheet.enabled).length;
  if (excludedSheets) warnings.push(`Пользователь исключил листов из анализа и импорта: ${excludedSheets}.`);

  const errors: string[] = [];
  if (!uniqueBudgetItems.length && !uniqueMaterials.length && !scheduleItems.length) {
    errors.push("Файл прочитан, но рабочие данные для автоматического распределения не распознаны.");
  }
  const previewRows = buildPreviewRows(uniqueBudgetItems, uniqueMaterials, scheduleItems);
  const totalRows = sheetData.reduce((sum, sheet) => sum + sheet.rows.length, 0);
  const parsedRows = uniqueBudgetItems.length + scheduleItems.length;
  const estimatedDirectCost = sumCost(uniqueBudgetItems);
  const suggestions = extractSuggestions(enabledSheetData, startsAt, scheduleItems, uniqueBudgetItems);
  const preview: ImportPreview = {
    projectId,
    fileName,
    fileSize: buffer.byteLength,
    parserVersion: PROJECT_WORKBOOK_PARSER_VERSION,
    sheets: workbook.SheetNames,
    mapping: mappings,
    summary: {
      totalRows,
      parsedRows,
      readyRows: previewRows.length,
      warningRows: 0,
      errorRows: errors.length,
      skippedRows: Math.max(0, totalRows - parsedRows),
      ignoredRows: Math.max(0, totalRows - parsedRows),
      sections: uniqueSections.length,
      budgetItems: uniqueBudgetItems.length,
      materials: uniqueMaterials.length,
      scheduleItems: scheduleItems.length,
      workRows: uniqueBudgetItems.filter((item) => item.kind === "work").length,
      materialRows: uniqueMaterials.length,
      unknownRows: 0,
      duplicateRows,
      hiddenRows: mappings.reduce((sum, item) => sum + item.hiddenRows, 0),
      formulaCells: mappings.reduce((sum, item) => sum + item.formulaCells, 0),
      estimatedTotalAmount: estimatedDirectCost,
      errors: errors.length,
      warnings: warnings.length
    },
    sections: uniqueSections,
    budgetItems: uniqueBudgetItems,
    materials: uniqueMaterials,
    scheduleItems,
    unknownRows: [],
    previewRows,
    warnings,
    errors
  };

  const specializedRoles = new Set(enabledSheetData.filter((sheet) => sheet.role !== "unknown" && sheet.role !== "control" && sheet.role !== "reference").map((sheet) => sheet.role));
  const specialized = workbook.SheetNames.length >= 3 && specializedRoles.size >= 2 && parsedRows > 0;
  const analysis = buildAnalysis(fileName, buffer.byteLength, sheets, uniqueBudgetItems, uniqueMaterials, scheduleItems, suggestions, warnings, errors, duplicateRows, sourceDirectCost, reconciliationGap);
  return { preview, analysis, specialized };
}

function buildSheetData(name: string, worksheet: XLSX.WorkSheet, override?: ProjectWorkbookSheetOverride): SheetData {
  const rows = XLSX.utils.sheet_to_json<unknown[]>(worksheet, { header: 1, defval: "", raw: true, blankrows: true });
  const classification = classifySheet(name, rows);
  let formulaCells = 0;
  for (const [address, cell] of Object.entries(worksheet)) {
    if (!address.startsWith("!") && typeof (cell as XLSX.CellObject).f === "string") formulaCells += 1;
  }
  const hiddenRows = worksheet["!rows"]?.filter((row) => row?.hidden).length ?? 0;
  const role = override?.role ?? classification.role;
  const enabled = override?.enabled ?? true;
  const overridden = override?.role !== undefined || override?.enabled !== undefined;
  const reason = override?.role && override.role !== classification.role
    ? `Роль изменена пользователем. Автоматически: ${classification.role}. ${classification.reason}`
    : classification.reason;
  return { name, worksheet, rows, detectedRole: classification.role, role, enabled, overridden, confidence: classification.confidence, reason, formulaCells, hiddenRows };
}

function classifySheet(name: string, rows: unknown[][]): Pick<SheetData, "role" | "confidence" | "reason"> {
  const normalizedName = normalizeHeader(name);
  const sample = rows.slice(0, 16).flat().map(normalizeHeader).join(" ");
  const monthColumns = rows.slice(0, 12).reduce((max, row) => Math.max(max, row.map(normalizeHeader).filter((value) => /^[mм]\d{1,2}$/.test(value)).length), 0);
  if (/фот|оплат.*труд|зарплат/.test(normalizedName) || (/должност|професси/.test(sample) && /чел.*мес|месячн.*зарплат|фот/.test(sample))) {
    return { role: "payroll", confidence: 0.99, reason: "Распознаны должности, месячная ставка и трудовая загрузка/ФОТ." };
  }
  if (/машин|механизм|техник/.test(normalizedName) && /смен|расцен/.test(sample)) {
    return { role: "equipment", confidence: 0.98, reason: "Распознаны техника, смены и стоимость эксплуатации." };
  }
  if ((/график|календар/.test(normalizedName) || /график/.test(sample)) && monthColumns >= 3) {
    return { role: "schedule", confidence: 0.97, reason: "Распознан помесячный календарный график." };
  }
  if (/материал/.test(normalizedName) && /позици|наименован/.test(sample) && /кол.*во|количество|объем/.test(sample)) {
    return { role: "materials", confidence: 0.94, reason: "Распознана детализация материалов, количества и цены." };
  }
  if (/расценк|ставк.*мск/.test(normalizedName)) {
    return { role: "reference", confidence: 0.92, reason: "Справочник расценок используется как источник, но не импортируется повторно поверх детальных ВОР." };
  }
  if (/^р\d{1,2}/.test(normalizedName) || (/наименован.*работ/.test(sample) && /ставк|стоимост.*работ/.test(sample))) {
    return { role: "works", confidence: 0.96, reason: "Распознан детальный ВОР/пакет работ." };
  }
  if (/сср|итог|свод/.test(normalizedName) || /итого.*прям.*затрат|итогов.*цена/.test(sample)) {
    return { role: "summary", confidence: 0.9, reason: "Сводный лист используется для сверки итогов, но не для повторного импорта." };
  }
  if (/источник|ставк|методик|раздел/.test(normalizedName)) {
    return { role: "reference", confidence: 0.86, reason: "Справочный лист/источник ставок." };
  }
  if (/контрол|проверк|исключ|желт|дорасчет/.test(normalizedName)) {
    return { role: "control", confidence: 0.86, reason: "Контрольный лист сохранен как источник, но не создает рабочие строки." };
  }
  return { role: "unknown", confidence: 0.35, reason: "Назначение листа не определено автоматически." };
}

function parseSheet(sheet: SheetData, startsAt: Date, vatPercent: number): ParsedSheetItems {
  if (sheet.role === "works") return parseWorks(sheet, startsAt);
  if (sheet.role === "materials") return parseMaterials(sheet, startsAt, vatPercent);
  if (sheet.role === "payroll") return parsePayroll(sheet);
  if (sheet.role === "equipment") return parseEquipment(sheet);
  if (sheet.role === "schedule") return parseSchedule(sheet, startsAt);
  return { budgetItems: [], materials: [], scheduleItems: [], headerRow: null, columns: {} };
}

function emptyParsedSheet(): ParsedSheetItems {
  return { budgetItems: [], materials: [], scheduleItems: [], headerRow: null, columns: {} };
}

function parseWorks(sheet: SheetData, startsAt: Date): ParsedSheetItems {
  const headerIndex = findHeader(sheet.rows, [["наименование работ", "вид работ", "позиция"], ["ед", "единица"], ["кол во", "количество", "объем"], ["ставка", "расценка", "цена", "стоимость работ"]]);
  if (headerIndex < 0) return emptyParsed();
  const headers = sheet.rows[headerIndex].map(normalizeHeader);
  const nameCol = findColumn(headers, ["наименование работ", "вид работ", "позиция"]);
  const unitCol = findColumn(headers, ["ед", "единица"]);
  const qtyCol = findColumn(headers, ["кол во", "количество", "объем"]);
  const priceCol = findColumn(headers, ["ставка без ндс", "расценка без ндс", "ставка", "расценка", "цена"]);
  const totalCol = findColumn(headers, ["стоимость работ без ндс", "итого без ндс", "стоимость"]);
  const codeCol = findColumn(headers, ["№", "номер", "код"]);
  const noteCol = findColumn(headers, ["примечание", "комментарий"]);
  const sourceCol = findColumn(headers, ["источник группа", "источник"]);
  const section = sectionTitle(sheet);
  const budgetItems: ImportBudgetItem[] = [];
  const materials: ImportMaterial[] = [];
  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (budgetItems.length && row.some((value) => /итого работы|материалы \/ оборудование/i.test(normalizeText(value)))) break;
    const name = textAt(row, nameCol);
    const unit = textAt(row, unitCol);
    const qty = numberAt(row, qtyCol);
    const price = moneyAt(row, priceCol);
    const total = moneyAt(row, totalCol);
    if (!name || !unit || !qty || qty <= 0 || (!price && !total) || isTotal(name)) continue;
    const unitPrice = total && total > 0 ? total / qty : price ?? 0;
    const source = textAt(row, sourceCol);
    const kind: ImportBudgetItem["kind"] = /^материал/i.test(source) ? "material" : "work";
    budgetItems.push({
      section,
      code: textAt(row, codeCol) || `${index + 1}`,
      name,
      unit,
      qty,
      plannedUnitPrice: unitPrice,
      actualUnitPrice: 0,
      forecastUnitPrice: unitPrice,
      kind,
      source: `Project workbook · ${source || sheet.name}`,
      comment: joinComment(textAt(row, noteCol), total ? `Сумма источника: ${Math.round(total)} ₽` : ""),
      sheetName: sheet.name,
      rowNumber: index + 1
    });
    if (kind === "material") {
      materials.push({
        name,
        unit,
        requiredQty: qty,
        orderedQty: 0,
        deliveredQty: 0,
        consumedQty: 0,
        plannedUnitPrice: unitPrice,
        actualUnitPrice: 0,
        supplier: "Не выбран",
        neededAt: startsAt.toISOString().slice(0, 10),
        status: "required",
        sheetName: sheet.name,
        rowNumber: index + 1
      });
    }
  }
  return { budgetItems, materials, scheduleItems: [], headerRow: headerIndex + 1, columns: columnMap({ nameCol, unitCol, qtyCol, priceCol, totalCol, codeCol, noteCol }) };
}

function parseMaterials(sheet: SheetData, startsAt: Date, vatPercent: number): ParsedSheetItems {
  const headerIndex = findHeader(sheet.rows, [["позиция", "наименование", "материал"], ["ед мат", "ед", "единица"], ["кол во мат", "кол во", "количество", "объем"]]);
  if (headerIndex < 0) return emptyParsed();
  const headers = sheet.rows[headerIndex].map(normalizeHeader);
  const nameCol = findColumn(headers, ["позиция", "наименование материала", "материал", "наименование"]);
  const unitCol = findColumn(headers, ["ед мат", "единица", "ед"]);
  const qtyCol = findColumn(headers, ["кол во мат", "количество материала", "кол во", "количество", "объем"]);
  const priceCol = findColumn(headers, ["цена без ндс", "цена струкова", "цена", "стоимость единицы"]);
  const totalCol = findColumn(headers, ["стоимость без ндс", "стоимость по струкова с ндс", "стоимость исходная", "стоимость"]);
  const priceIncludesVat = priceCol >= 0 && /с ндс/.test(headers[priceCol]) && !/без ндс/.test(headers[priceCol]);
  const totalIncludesVat = totalCol >= 0 && /с ндс/.test(headers[totalCol]) && !/без ндс/.test(headers[totalCol]);
  const sectionCol = findColumn(headers, ["раздел", "подраздел", "система"]);
  const codeCol = findColumn(headers, ["№", "номер", "код"]);
  const noteCol = findColumn(headers, ["источник основание", "примечание", "комментарий", "источник"]);
  const budgetItems: ImportBudgetItem[] = [];
  const materials: ImportMaterial[] = [];
  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    const name = textAt(row, nameCol);
    const unit = textAt(row, unitCol);
    const qty = numberAt(row, qtyCol);
    const price = moneyAt(row, priceCol);
    const total = moneyAt(row, totalCol);
    if (!name || !unit || !qty || qty <= 0 || (!price && !total) || isTotal(name)) continue;
    const vatFactor = vatPercent > 0 ? 1 + vatPercent / 100 : 1;
    const normalizedTotal = total && total > 0 ? total / (totalIncludesVat ? vatFactor : 1) : 0;
    const normalizedPrice = price && price > 0 ? price / (priceIncludesVat ? vatFactor : 1) : 0;
    const unitPrice = normalizedTotal > 0 ? normalizedTotal / qty : normalizedPrice;
    const section = textAt(row, sectionCol) || "Материалы";
    const budgetItem: ImportBudgetItem = {
      section,
      code: textAt(row, codeCol) || `M-${index + 1}`,
      name,
      unit,
      qty,
      plannedUnitPrice: unitPrice,
      actualUnitPrice: 0,
      forecastUnitPrice: unitPrice,
      kind: "material",
      source: `Project workbook · ${sheet.name}`,
      comment: textAt(row, noteCol) || undefined,
      sheetName: sheet.name,
      rowNumber: index + 1
    };
    budgetItems.push(budgetItem);
    materials.push({
      name,
      unit,
      requiredQty: qty,
      orderedQty: 0,
      deliveredQty: 0,
      consumedQty: 0,
      plannedUnitPrice: unitPrice,
      actualUnitPrice: 0,
      supplier: "Не выбран",
      neededAt: startsAt.toISOString().slice(0, 10),
      status: "required",
      sheetName: sheet.name,
      rowNumber: index + 1
    });
  }
  return { budgetItems, materials, scheduleItems: [], headerRow: headerIndex + 1, columns: columnMap({ nameCol, unitCol, qtyCol, priceCol, totalCol, codeCol, noteCol, sectionCol }) };
}

function parsePayroll(sheet: SheetData): ParsedSheetItems {
  const headerIndex = findHeader(sheet.rows, [["должность", "профессия", "бригада", "категория"], ["фот 1 ед мес", "месячная зарплата", "зарплата", "оклад", "ставка"], ["чел мес всего", "человеко месяц", "итого фот", "норма выработки"]]);
  if (headerIndex < 0) return emptyParsed();
  const headers = sheet.rows[headerIndex].map(normalizeHeader);
  const nameCol = findColumn(headers, ["должность", "профессия", "бригада", "категория"]);
  const salaryCol = findColumn(headers, ["фот 1 ед мес", "месячная зарплата", "зарплата", "оклад", "ставка"]);
  const personMonthsCol = findColumn(headers, ["чел мес всего", "человеко месяцев", "человеко месяц", "чел мес"]);
  const totalCol = findColumn(headers, ["итого фот без ндс", "фот без ндс", "итого без ндс", "стоимость без ндс", "итого"]);
  const headcountCol = findColumn(headers, ["численность", "кол во чел", "количество человек"]);
  const normCol = findColumn(headers, ["норма выработки", "выработка в месяц", "месячная выработка"]);
  const volumeCol = findColumn(headers, ["объем работ", "объем", "количество работ"]);
  const noteCol = findColumn(headers, ["примечание", "комментарий"]);
  const monthCols = headers.map((header, index) => (/^[mм]\d{1,2}$/.test(header) ? { index, label: header.toUpperCase() } : null)).filter(Boolean) as Array<{ index: number; label: string }>;
  const budgetItems: ImportBudgetItem[] = [];
  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (budgetItems.length && row.some((value) => /^итого$/i.test(normalizeText(value)) || /^итого фот/i.test(normalizeText(value)))) break;
    const name = textAt(row, nameCol);
    const salary = moneyAt(row, salaryCol);
    if (!name || !salary || salary <= 0 || isTotal(name)) continue;
    const monthly = monthCols.map((column) => ({ label: column.label, value: numberAt(row, column.index) ?? 0 }));
    const monthlyPersonMonths = monthly.reduce((sum, item) => sum + item.value, 0);
    const total = moneyAt(row, totalCol);
    const norm = numberAt(row, normCol);
    const volume = numberAt(row, volumeCol);
    const headcount = numberAt(row, headcountCol);
    const directPersonMonths = numberAt(row, personMonthsCol);
    const personMonths = directPersonMonths && directPersonMonths > 0
      ? directPersonMonths
      : monthlyPersonMonths > 0
        ? monthlyPersonMonths
        : total && total > 0
          ? total / salary
          : norm && norm > 0 && volume && volume > 0
            ? volume / norm
            : headcount && headcount > 0
              ? headcount
              : 0;
    if (personMonths <= 0) continue;
    const unitPrice = total && total > 0 ? total / personMonths : salary;
    const monthlyNote = monthly.filter((item) => item.value > 0).map((item) => `${item.label}: ${item.value}`).join("; ");
    budgetItems.push({
      section: /итр|управлен/.test(normalizeHeader(sheet.name)) ? "ИТР / ФОТ" : "Рабочие / ФОТ",
      code: `FOT-${index + 1}`,
      name,
      unit: "чел.-мес.",
      qty: personMonths,
      plannedUnitPrice: unitPrice,
      actualUnitPrice: 0,
      forecastUnitPrice: unitPrice,
      kind: "payroll",
      source: `Project workbook · ${sheet.name}`,
      comment: joinComment(
        `Месячная ставка: ${Math.round(salary)} ₽`,
        headcount ? `Численность: ${headcount}` : "",
        norm ? `Норма выработки: ${norm}` : "",
        volume ? `Объем для расчета: ${volume}` : "",
        monthlyNote,
        textAt(row, noteCol)
      ),
      sheetName: sheet.name,
      rowNumber: index + 1
    });
  }
  return { budgetItems, materials: [], scheduleItems: [], headerRow: headerIndex + 1, columns: columnMap({ nameCol, qtyCol: personMonthsCol, priceCol: salaryCol, totalCol, noteCol }) };
}

function parseEquipment(sheet: SheetData): ParsedSheetItems {
  const headerIndex = findHeader(sheet.rows, [["техника механизм", "техника", "механизм"], ["смен всего", "маш смен", "количество смен"], ["расценка без ндс", "ставка без ндс", "расценка"], ["итого без ндс", "стоимость без ндс"]]);
  if (headerIndex < 0) return emptyParsed();
  const headers = sheet.rows[headerIndex].map(normalizeHeader);
  const nameCol = findColumn(headers, ["техника механизм", "техника", "механизм"]);
  const unitCol = findColumn(headers, ["ед", "единица"]);
  const qtyCol = findColumn(headers, ["смен всего", "маш смен", "количество смен"]);
  const priceCol = findColumn(headers, ["расценка без ндс", "ставка без ндс", "расценка"]);
  const totalCol = findColumn(headers, ["итого без ндс", "стоимость без ндс", "итого"]);
  const countCol = findColumn(headers, ["кол во ед", "количество единиц"]);
  const noteCol = findColumn(headers, ["примечание", "комментарий"]);
  const stageCol = findColumn(headers, ["вид работ этап", "этап", "вид работ"]);
  const monthCols = headers.map((header, index) => (/^[mм]\d{1,2}$/.test(header) ? { index, label: header.toUpperCase() } : null)).filter(Boolean) as Array<{ index: number; label: string }>;
  const budgetItems: ImportBudgetItem[] = [];
  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    if (budgetItems.length && row.some((value) => /^итого$/i.test(normalizeText(value)) || /^итого.*маш/i.test(normalizeText(value)))) break;
    const name = textAt(row, nameCol);
    const qty = numberAt(row, qtyCol);
    const price = moneyAt(row, priceCol);
    const total = moneyAt(row, totalCol);
    if (!name || !qty || qty <= 0 || (!price && !total) || isTotal(name)) continue;
    const unitPrice = total && total > 0 ? total / qty : price ?? 0;
    const monthly = monthCols.map((column) => `${column.label}: ${numberAt(row, column.index) ?? 0}`).join("; ");
    budgetItems.push({
      section: "Машины и механизмы",
      code: `EQ-${index + 1}`,
      name,
      unit: textAt(row, unitCol) || "смена",
      qty,
      plannedUnitPrice: unitPrice,
      actualUnitPrice: 0,
      forecastUnitPrice: unitPrice,
      kind: "equipment",
      source: `Project workbook · ${sheet.name}`,
      comment: joinComment(textAt(row, stageCol), numberAt(row, countCol) ? `Единиц техники: ${numberAt(row, countCol)}` : "", monthly, textAt(row, noteCol)),
      sheetName: sheet.name,
      rowNumber: index + 1
    });
  }
  return { budgetItems, materials: [], scheduleItems: [], headerRow: headerIndex + 1, columns: columnMap({ nameCol, unitCol, qtyCol, priceCol, totalCol, noteCol }) };
}

function parseSchedule(sheet: SheetData, startsAt: Date): ParsedSheetItems {
  const headerIndex = findHeader(sheet.rows, [["раздел", "этап", "наименование"], ["м1", "m1"], ["м2", "m2"]]);
  if (headerIndex < 0) return emptyParsed();
  const headers = sheet.rows[headerIndex].map(normalizeHeader);
  const nameCol = findColumn(headers, ["раздел", "этап", "наименование"]);
  const codeCol = findColumn(headers, ["код", "№", "номер"]);
  const stageCol = findColumn(headers, ["этап"]);
  const monthCols = headers.map((header, index) => {
    const match = header.match(/^[mм](\d{1,2})$/);
    return match ? { index, month: Number(match[1]), label: header.toUpperCase() } : null;
  }).filter(Boolean) as Array<{ index: number; month: number; label: string }>;
  const scheduleItems: ImportScheduleItem[] = [];
  for (let index = headerIndex + 1; index < sheet.rows.length; index += 1) {
    const row = sheet.rows[index];
    const name = textAt(row, nameCol);
    if (!name || isTotal(name)) continue;
    const allocations = monthCols.map((column) => ({ ...column, value: moneyAt(row, column.index) ?? 0 })).filter((item) => item.value > 0);
    if (!allocations.length) continue;
    const firstMonth = allocations[0].month;
    const lastMonth = allocations[allocations.length - 1].month;
    const itemStart = addMonths(startsAt, firstMonth - 1);
    const itemEnd = endOfMonth(addMonths(startsAt, lastMonth - 1));
    scheduleItems.push({
      name: textAt(row, codeCol) ? `${textAt(row, codeCol)} ${name}` : name,
      owner: "РП",
      startsAt: itemStart.toISOString().slice(0, 10),
      endsAt: itemEnd.toISOString().slice(0, 10),
      plannedQty: 1,
      actualQty: 0,
      status: "not_started",
      dependency: joinComment(textAt(row, stageCol), `Помесячная стоимость: ${allocations.map((item) => `${item.label} ${Math.round(item.value)} ₽`).join("; ")}`),
      sheetName: sheet.name,
      rowNumber: index + 1
    });
  }
  return { budgetItems: [], materials: [], scheduleItems, headerRow: headerIndex + 1, columns: columnMap({ nameCol, codeCol }) };
}

function buildAnalysis(
  fileName: string,
  fileSize: number,
  sheets: ProjectWorkbookSheetAnalysis[],
  budgetItems: ImportBudgetItem[],
  materials: ImportMaterial[],
  scheduleItems: ImportScheduleItem[],
  suggestions: ProjectWorkbookAnalysis["suggestions"],
  warnings: string[],
  errors: string[],
  duplicateRows: number,
  sourceDirectCost?: number,
  reconciliationGap = 0
): ProjectWorkbookAnalysis {
  const payrollItems = budgetItems.filter((item) => item.kind === "payroll");
  const equipmentItems = budgetItems.filter((item) => item.kind === "equipment");
  const moduleRows = (roles: ProjectWorkbookSheetRole[]) => sheets.filter((sheet) => sheet.enabled && roles.includes(sheet.role));
  const modules: ProjectWorkbookModuleSummary[] = [
    moduleSummary("budget", moduleRows(["works"]), budgetItems.filter((item) => item.kind === "work" || item.kind === "overhead" || item.kind === "other"), "Детальные работы и явный остаток сверки без повторного импорта сводных итогов."),
    moduleSummary("materials", moduleRows(["materials"]), materials, "Потребность, плановые цены и будущий контур закупок."),
    moduleSummary("schedule", moduleRows(["schedule"]), scheduleItems, "Помесячные этапы преобразованы в календарные задачи."),
    moduleSummary("payroll", moduleRows(["payroll"]), payrollItems, "ФОТ попадает в расходную часть как payroll: ставка × человеко-месяцы или объем ÷ норма."),
    moduleSummary("equipment", moduleRows(["equipment"]), equipmentItems, "Смены техники и ставки попадают в бюджет отдельным видом equipment."),
    derivedModuleSummary("procurement", materials.length > 0, materials.length, "Материалы станут потребностью снабжения; заявки остаются отдельным подтверждаемым действием."),
    derivedModuleSummary("cashflow", budgetItems.length > 0 || scheduleItems.length > 0, scheduleItems.length || budgetItems.length, "Расходный план строится из бюджета, ФОТ, техники и календарного распределения."),
    derivedModuleSummary("intelligence", budgetItems.length > 0 || materials.length > 0 || scheduleItems.length > 0, budgetItems.length + materials.length + scheduleItems.length, "Command Center, риски, КС и executive-контур получат стартовый расчетный baseline."),
    {
      id: "source_control",
      label: roleLabels.source_control,
      sheets: moduleRows(["summary", "reference", "control", "unknown"]).map((sheet) => sheet.sheetName),
      rows: 0,
      amount: 0,
      status: "reference",
      detail: "Своды, ставки, источники и контрольные листы остаются доказательной базой и не дублируют бюджет."
    }
  ];
  const estimatedDirectCost = sumCost(budgetItems);
  const quality = buildProjectWorkbookQualityGate({
    errors,
    warnings,
    sheets,
    budgetItems: budgetItems.length,
    materials: materials.length,
    scheduleItems: scheduleItems.length,
    payrollItems: payrollItems.length,
    equipmentItems: equipmentItems.length,
    estimatedDirectCost,
    sourceDirectCost,
    reconciliationGap,
    duplicateRows
  });
  return {
    parserVersion: PROJECT_WORKBOOK_PARSER_VERSION,
    fileName,
    fileSize,
    sheets,
    modules,
    summary: {
      totalSheets: sheets.length,
      includedSheets: sheets.filter((sheet) => sheet.included).length,
      referenceSheets: sheets.filter((sheet) => sheet.enabled && !sheet.included).length,
      excludedSheets: sheets.filter((sheet) => !sheet.enabled).length,
      reviewSheets: sheets.filter((sheet) => sheet.enabled && !sheet.overridden && (sheet.role === "unknown" || sheet.confidence < 0.8)).length,
      overriddenSheets: sheets.filter((sheet) => sheet.overridden).length,
      budgetItems: budgetItems.length,
      materials: materials.length,
      scheduleItems: scheduleItems.length,
      payrollItems: payrollItems.length,
      equipmentItems: equipmentItems.length,
      estimatedDirectCost,
      sourceDirectCost,
      reconciliationGap: sourceDirectCost ? Math.max(0, reconciliationGap) : 0,
      automatedCoveragePercent: sourceDirectCost ? Math.min(100, Math.round(((sourceDirectCost - Math.max(0, reconciliationGap)) / sourceDirectCost) * 100)) : 100,
      payrollCost: sumCost(payrollItems),
      equipmentCost: sumCost(equipmentItems)
    },
    suggestions,
    quality,
    warnings,
    errors
  };
}

function derivedModuleSummary(id: Extract<ProjectWorkbookModuleId, "procurement" | "cashflow" | "intelligence">, ready: boolean, rows: number, detail: string): ProjectWorkbookModuleSummary {
  return {
    id,
    label: roleLabels[id],
    sheets: [],
    rows,
    amount: 0,
    status: ready ? "derived" : "not_found",
    detail
  };
}

type MetadataValues = Omit<ProjectWorkbookSuggestions, "selectedModules" | "confidenceByField" | "evidenceByField" | "missingFields" | "durationMonths">;

function extractProjectMetadata(sheetData: SheetData[], budgetItems: ImportBudgetItem[]) {
  const values: MetadataValues = {};
  const confidenceByField: ProjectWorkbookSuggestions["confidenceByField"] = {};
  const evidenceByField: ProjectWorkbookSuggestions["evidenceByField"] = {};
  const metadataSheets = sheetData.filter((sheet) => ["summary", "reference", "control", "unknown"].includes(sheet.role));
  const sourceSheets = metadataSheets.length ? metadataSheets : sheetData.slice(0, 3);
  const assign = <K extends ProjectWorkbookSuggestionField>(
    field: K,
    value: MetadataValues[K] | undefined,
    confidence: ProjectWorkbookSuggestionConfidence,
    evidence?: string
  ) => {
    if (value === undefined || value === "") return;
    values[field] = value;
    confidenceByField[field] = confidence;
    if (evidence) evidenceByField[field] = evidence.slice(0, 220);
  };

  const labeled = (patterns: RegExp[]) => findLabeledWorkbookValue(sourceSheets, patterns);
  const projectName = labeled([/^наименование проекта$/, /^название проекта$/, /^проект$/]);
  const objectName = labeled([/^наименование объекта$/, /^объект строительства$/, /^объект работ$/, /^объект$/]);
  const title = projectName ?? objectName ?? findWorkbookTitle(sourceSheets);
  const normalizedTitle = title ? cleanProjectTitle(title.value) : "";
  assign("name", normalizedTitle || projectName?.value || objectName?.value, projectName || objectName ? "high" : "medium", title?.evidence);
  assign("object", objectName?.value || normalizedTitle, objectName ? "high" : "medium", (objectName ?? title)?.evidence);

  const code = labeled([/^код проекта$/, /^шифр проекта$/, /^номер проекта$/, /^№ проекта$/]);
  assign("code", code?.value, "high", code?.evidence);
  const customer = labeled([/^заказчик$/, /^наименование заказчика$/, /^генеральный заказчик$/]);
  assign("customer", customer?.value, "high", customer?.evidence);
  const address = labeled([/^адрес объекта$/, /^место выполнения работ$/, /^местонахождение объекта$/, /^адрес строительства$/]);
  assign("address", address?.value, "high", address?.evidence);
  const manager = labeled([/^руководитель проекта$/, /^рп$/, /^ответственный за проект$/]);
  assign("manager", manager?.value, "medium", manager?.evidence);

  const start = labeled([/^дата начала$/, /^начало работ$/, /^начало строительства$/]);
  const finish = labeled([/^дата окончания$/, /^окончание работ$/, /^завершение работ$/, /^срок завершения$/]);
  assign("startsAt", start ? normalizeDate(start.rawValue) ?? normalizeDate(start.value) ?? undefined : undefined, "high", start?.evidence);
  assign("endsAt", finish ? normalizeDate(finish.rawValue) ?? normalizeDate(finish.value) ?? undefined : undefined, "high", finish?.evidence);

  const payment = labeled([/^условия оплаты$/, /^порядок оплаты$/, /^оплата$/]);
  assign("paymentNotes", payment?.value, "medium", payment?.evidence);

  const corpus = sourceSheets
    .flatMap((sheet) => sheet.rows.slice(0, 40).flatMap((row) => row.slice(0, 12).map(normalizeText)))
    .filter(Boolean)
    .join(" ");
  const titleCorpus = [title?.value, ...sourceSheets.map((sheet) => sheet.name)].filter(Boolean).join(" ");
  const inferred = inferWorkbookProjectShape(titleCorpus, corpus);
  assign("objectType", inferred.objectType, "medium", inferred.evidence);
  assign("templateId", inferred.templateId, "medium", inferred.evidence);
  assign("tenderSource", inferred.tenderSource, "medium", inferred.sourceEvidence);
  assign("volumeChangeMode", inferred.volumeChangeMode, "medium", inferred.volumeEvidence);

  const sections = Array.from(new Set(budgetItems.map((item) => normalizeText(item.section)).filter((item) => item && !/сверк|нераспредел/i.test(item)))).slice(0, 6);
  if (sections.length) assign("description", `Основные разделы из Excel: ${sections.join(", ")}.`, "medium", "Рабочие листы · распознанные разделы ВОР/затрат");

  return { values, confidenceByField, evidenceByField };
}

function findLabeledWorkbookValue(sheets: SheetData[], patterns: RegExp[]) {
  for (const sheet of sheets) {
    for (let rowIndex = 0; rowIndex < Math.min(sheet.rows.length, 60); rowIndex += 1) {
      const row = sheet.rows[rowIndex];
      for (let columnIndex = 0; columnIndex < Math.min(row.length, 16); columnIndex += 1) {
        const rawLabel = normalizeText(row[columnIndex]);
        const normalizedLabel = normalizeHeader(rawLabel.replace(/[:：]\s*.*$/, ""));
        if (!patterns.some((pattern) => pattern.test(normalizedLabel))) continue;
        const inlineValue = rawLabel.includes(":") ? normalizeText(rawLabel.slice(rawLabel.indexOf(":") + 1)) : "";
        const nextValue = row.slice(columnIndex + 1).map(normalizeText).find(Boolean) ?? "";
        const value = inlineValue || nextValue;
        if (!value || value.length > 300 || normalizeHeader(value) === normalizedLabel) continue;
        const rawValue = inlineValue ? inlineValue : row[row.findIndex((cell, index) => index > columnIndex && normalizeText(cell) === nextValue)];
        return {
          value,
          rawValue,
          evidence: `${sheet.name} · строка ${rowIndex + 1}: ${rawLabel}${inlineValue ? "" : ` → ${value}`}`
        };
      }
    }
  }
  return undefined;
}

function extractWorkbookStartDate(sheetData: SheetData[]) {
  const metadataSheets = sheetData.filter((sheet) => ["summary", "reference", "control", "unknown"].includes(sheet.role));
  const start = findLabeledWorkbookValue(metadataSheets.length ? metadataSheets : sheetData.slice(0, 3), [/^дата начала$/, /^начало работ$/, /^начало строительства$/]);
  const normalized = start ? normalizeDate(start.rawValue) ?? normalizeDate(start.value) : null;
  return normalized ? safeDate(normalized) : undefined;
}

function findWorkbookTitle(sheets: SheetData[]) {
  const generic = /^(итог|свод|сводная стоимость проекта|сср|кп|вор|контроль|проверка|материалы|график|обновлено|принято|источник|файл содержит|примечание)/i;
  for (const sheet of sheets) {
    for (let rowIndex = 0; rowIndex < Math.min(sheet.rows.length, 8); rowIndex += 1) {
      const values = sheet.rows[rowIndex].map(normalizeText).filter(Boolean);
      const candidate = values.find((value) => value.length >= 4 && value.length <= 180 && !generic.test(value));
      if (candidate) return { value: candidate, evidence: `${sheet.name} · строка ${rowIndex + 1}: ${candidate}` };
    }
  }
  return undefined;
}

function cleanProjectTitle(value: string) {
  return normalizeText(value)
    .replace(/^проект\s*[:：-]?\s*/i, "")
    .replace(/\s*[—–-]\s*(?:сср|смет|кп|цена|генподряд).*$/i, "")
    .replace(/\s*\/\s*(?:сср|кп|генподряд).*$/i, "")
    .trim()
    .slice(0, 160);
}

function inferWorkbookProjectShape(titleCorpus: string, corpus: string): Pick<MetadataValues, "objectType" | "templateId" | "tenderSource" | "volumeChangeMode"> & { evidence?: string; sourceEvidence?: string; volumeEvidence?: string } {
  const title = normalizeHeader(titleCorpus);
  const all = normalizeHeader(corpus);
  let objectType: MetadataValues["objectType"];
  let templateId: MetadataValues["templateId"];
  if (/кровл/.test(title)) {
    objectType = "roofing_facade";
    templateId = "roofing";
  } else if (/фасад/.test(title)) {
    objectType = "roofing_facade";
    templateId = "facade";
  } else if (/отделк|fit out|ремонт помещ/.test(title)) {
    objectType = "interior";
    templateId = "fit_out";
  } else if (/инженерк|инженерн.*сет|наружн.*сет|внутренн.*сет|(?:^|\s)(?:итп|ов|вк|эом|апс|соуэ)(?:\s|$)/.test(title)) {
    objectType = "engineering";
    templateId = "engineering_networks";
  } else if (/реконструк|капитальн.*ремонт|капремонт/.test(title)) {
    objectType = "reconstruction";
    templateId = "general_construction";
  } else if (/монолит|железобетон|жб|фундамент/.test(title)) {
    objectType = "commercial";
    templateId = "concrete";
  } else if (/жил|мкд|квартир|дом/.test(title)) {
    objectType = "residential";
    templateId = "general_construction";
  }
  const tenderSource: MetadataValues["tenderSource"] = /тендер|конкурс|закупк/.test(title) ? "tender" : /(^|\s)кп(\s|$)|коммерческ.*предлож/.test(title) ? "commercial_offer" : /договор/.test(title) ? "contract" : undefined;
  const volumeChangeMode: MetadataValues["volumeChangeMode"] = /предварительн|объем.*уточн|может.*измен/.test(all) ? "can_change" : /фиксированн.*объем|тверд.*цен/.test(all) ? "fixed_scope" : /фактическ.*объем/.test(all) ? "fact_based" : undefined;
  return {
    objectType,
    templateId,
    tenderSource,
    volumeChangeMode,
    evidence: objectType ? `Название книги/листов: ${titleCorpus.slice(0, 160)}` : undefined,
    sourceEvidence: tenderSource ? `Название книги/листов: ${titleCorpus.slice(0, 160)}` : undefined,
    volumeEvidence: volumeChangeMode ? "Служебные строки книги · условия объема/цены" : undefined
  };
}

function moduleSummary(
  id: Exclude<ProjectWorkbookModuleId, "source_control">,
  sheets: ProjectWorkbookSheetAnalysis[],
  items: Array<ImportBudgetItem | ImportMaterial | ImportScheduleItem>,
  detail: string
): ProjectWorkbookModuleSummary {
  return {
    id,
    label: roleLabels[id],
    sheets: sheets.map((sheet) => sheet.sheetName),
    rows: items.length,
    amount: items.every(isBudgetItem) ? sumCost(items as ImportBudgetItem[]) : items.every(isMaterial) ? (items as ImportMaterial[]).reduce((sum, item) => sum + item.requiredQty * item.plannedUnitPrice, 0) : 0,
    status: items.length ? "ready" : "not_found",
    detail
  };
}

function extractSuggestions(
  sheetData: SheetData[],
  startsAt: Date,
  scheduleItems: ImportScheduleItem[],
  budgetItems: ImportBudgetItem[]
): ProjectWorkbookAnalysis["suggestions"] {
  let contractAmount: number | undefined;
  const vatPercent = extractVatPercent(sheetData);
  for (const sheet of sheetData.filter((item) => item.role === "summary")) {
    for (const row of sheet.rows) {
      const text = row.map(normalizeHeader).join(" ");
      const numbers = row.map((value) => parseMoney(value)).filter((value): value is number => value !== null && value > 0);
      if (/итогов.*цена|цена генподряда|договорн.*стоимост/.test(text) && numbers.length) contractAmount = Math.max(contractAmount ?? 0, ...numbers);
    }
  }
  const lastEnd = scheduleItems.map((item) => safeDate(item.endsAt)?.getTime() ?? 0).reduce((max, value) => Math.max(max, value), 0);
  const durationMonths = lastEnd ? Math.max(1, monthDifference(startsAt, new Date(lastEnd))) : undefined;
  const selectedModules: ProjectWorkbookAnalysis["suggestions"]["selectedModules"] = ["documents"];
  if (sheetData.some((sheet) => ["works", "payroll", "equipment"].includes(sheet.role))) selectedModules.push("vor");
  if (sheetData.some((sheet) => sheet.role === "materials")) selectedModules.push("materials");
  if (scheduleItems.length) selectedModules.push("schedule");
  if (budgetItems.length || scheduleItems.length) selectedModules.push("acceptance", "risks", "reports");
  if (contractAmount || vatPercent) selectedModules.push("contract");

  const metadata = extractProjectMetadata(sheetData, budgetItems);
  const suggestions: ProjectWorkbookAnalysis["suggestions"] = {
    ...metadata.values,
    contractAmount,
    vatPercent,
    vatMode: vatPercent ? "including_vat" : metadata.values.vatMode,
    durationMonths,
    endsAt: metadata.values.endsAt ?? (lastEnd ? new Date(lastEnd).toISOString().slice(0, 10) : undefined),
    selectedModules: Array.from(new Set(selectedModules)),
    confidenceByField: { ...metadata.confidenceByField },
    evidenceByField: { ...metadata.evidenceByField },
    missingFields: []
  };
  if (contractAmount !== undefined) {
    suggestions.confidenceByField.contractAmount = "high";
    suggestions.evidenceByField.contractAmount = "Сводный лист · итоговая/договорная стоимость";
  }
  if (vatPercent !== undefined) {
    suggestions.confidenceByField.vatPercent = "high";
    suggestions.confidenceByField.vatMode = "medium";
    suggestions.evidenceByField.vatPercent = "Сводный лист · ставка НДС";
    suggestions.evidenceByField.vatMode = "Сводный лист · цена и ставка НДС";
  }
  if (!suggestions.endsAt && durationMonths) {
    const finish = new Date(startsAt);
    finish.setUTCMonth(finish.getUTCMonth() + durationMonths);
    suggestions.endsAt = finish.toISOString().slice(0, 10);
  }
  if (suggestions.endsAt && !suggestions.evidenceByField.endsAt) {
    suggestions.confidenceByField.endsAt = "medium";
    suggestions.evidenceByField.endsAt = "Сводный график · последняя активная задача";
  }
  suggestions.missingFields = [
    ["name", "название проекта"],
    ["customer", "заказчик"],
    ["object", "объект"],
    ["address", "адрес"],
    ["manager", "руководитель проекта"],
    ["startsAt", "дата начала"]
  ].filter(([field]) => !suggestions[field as ProjectWorkbookSuggestionField]).map(([, label]) => label);
  return suggestions;
}

function extractVatPercent(sheetData: SheetData[]) {
  for (const sheet of sheetData.filter((item) => item.role === "summary")) {
    for (const row of sheet.rows) {
      const text = row.map(normalizeHeader).join(" ");
      if (!/ставка ндс|ндс.*%/.test(text)) continue;
      const numbers = row.map((value) => parseMoney(value)).filter((value): value is number => value !== null && value > 0 && value <= 100);
      const raw = numbers[0];
      if (raw !== undefined) return raw <= 1 ? raw * 100 : raw;
    }
  }
  return undefined;
}

function extractDirectCost(sheetData: SheetData[]) {
  for (const sheet of sheetData.filter((item) => item.role === "summary")) {
    const headerIndex = sheet.rows.findIndex((row) => row.map(normalizeHeader).some((value) => value.includes("итого без ндс")));
    if (headerIndex < 0) continue;
    const headers = sheet.rows[headerIndex].map(normalizeHeader);
    const totalWithoutVatCol = headers.findIndex((value) => value.includes("итого без ндс"));
    if (totalWithoutVatCol < 0) continue;
    const totalRow = sheet.rows.find((row) => row.map(normalizeHeader).join(" ").includes("итого прямые затраты"));
    const value = totalRow ? parseMoney(totalRow[totalWithoutVatCol]) : null;
    if (value && value > 0) return value;
  }
  return undefined;
}

function buildPreviewRows(budgetItems: ImportBudgetItem[], materials: ImportMaterial[], scheduleItems: ImportScheduleItem[]): ImportPreviewRow[] {
  const materialKeys = new Set(materials.map((item) => rowKey(item.sheetName, item.rowNumber)));
  const budgetRows: ImportPreviewRow[] = budgetItems.map((item) => ({
    id: rowKey(item.sheetName, item.rowNumber),
    sheetName: item.sheetName,
    sourceRowNumber: item.rowNumber,
    originalNumber: item.code,
    normalizedNumber: item.code,
    rowKind: item.kind === "material" ? "material_item" : item.kind === "equipment" ? "equipment_item" : item.kind === "payroll" ? "labor_item" : "work_item",
    confidence: 0.94,
    status: "ready",
    entityType: materialKeys.has(rowKey(item.sheetName, item.rowNumber)) ? "material" : "budgetItem",
    section: item.section,
    name: item.name,
    unit: item.unit,
    quantity: item.qty,
    unitPrice: item.plannedUnitPrice,
    totalAmount: item.qty * item.plannedUnitPrice,
    normalizedJson: { kind: item.kind, source: item.source, comment: item.comment },
    warnings: [],
    errors: [],
    suspiciousFlags: []
  }));
  const scheduleRows: ImportPreviewRow[] = scheduleItems.map((item) => ({
    id: rowKey(item.sheetName, item.rowNumber),
    sheetName: item.sheetName,
    sourceRowNumber: item.rowNumber,
    rowKind: "stage",
    confidence: 0.92,
    status: "ready",
    entityType: "scheduleItem",
    name: item.name,
    quantity: item.plannedQty,
    normalizedJson: { startsAt: item.startsAt, endsAt: item.endsAt, dependency: item.dependency },
    warnings: [],
    errors: [],
    suspiciousFlags: []
  }));
  return [...budgetRows, ...scheduleRows];
}

function dedupeBudgetItems(items: ImportBudgetItem[]) {
  const result = new Map<string, ImportBudgetItem>();
  for (const item of items) {
    const key = item.kind === "material"
      ? `material|${normalizeHeader(item.name)}|${normalizeHeader(item.unit)}`
      : `${item.sheetName}|${item.rowNumber}`;
    const current = result.get(key);
    if (!current || preferredMaterialSource(item.sheetName, current.sheetName)) result.set(key, item);
  }
  return Array.from(result.values());
}

function dedupeMaterials(items: ImportMaterial[]) {
  const result = new Map<string, ImportMaterial>();
  for (const item of items) {
    const key = `${normalizeHeader(item.name)}|${normalizeHeader(item.unit)}`;
    const current = result.get(key);
    if (!current || preferredMaterialSource(item.sheetName, current.sheetName)) result.set(key, item);
  }
  return Array.from(result.values());
}

function preferredMaterialSource(candidate: string, current: string) {
  const score = (sheetName: string) => (/струков|обновлен|принят/i.test(sheetName) ? 3 : /желт|контрол/i.test(sheetName) ? 1 : 2);
  return score(candidate) > score(current);
}

function failedResult(fileName: string, fileSize: number, projectId: string, error: string): BuildResult {
  const analysis: ProjectWorkbookAnalysis = {
    parserVersion: PROJECT_WORKBOOK_PARSER_VERSION,
    fileName,
    fileSize,
    sheets: [],
    modules: [],
    summary: { totalSheets: 0, includedSheets: 0, referenceSheets: 0, excludedSheets: 0, reviewSheets: 0, overriddenSheets: 0, budgetItems: 0, materials: 0, scheduleItems: 0, payrollItems: 0, equipmentItems: 0, estimatedDirectCost: 0, reconciliationGap: 0, automatedCoveragePercent: 0, payrollCost: 0, equipmentCost: 0 },
    suggestions: { selectedModules: ["documents"], confidenceByField: {}, evidenceByField: {}, missingFields: ["название проекта", "заказчик", "объект", "адрес", "руководитель проекта", "дата начала"] },
    quality: failedProjectWorkbookQualityGate(error),
    warnings: [],
    errors: [error]
  };
  return {
    specialized: true,
    analysis,
    preview: {
      projectId,
      fileName,
      fileSize,
      parserVersion: PROJECT_WORKBOOK_PARSER_VERSION,
      sheets: [],
      mapping: [],
      summary: { totalRows: 0, parsedRows: 0, readyRows: 0, warningRows: 0, errorRows: 1, skippedRows: 0, ignoredRows: 0, sections: 0, budgetItems: 0, materials: 0, scheduleItems: 0, workRows: 0, materialRows: 0, unknownRows: 0, duplicateRows: 0, hiddenRows: 0, formulaCells: 0, estimatedTotalAmount: 0, errors: 1, warnings: 0 },
      sections: [], budgetItems: [], materials: [], scheduleItems: [], unknownRows: [], previewRows: [], warnings: [], errors: [error]
    }
  };
}

function findHeader(rows: unknown[][], groups: string[][]) {
  let best = -1;
  let bestScore = 0;
  rows.slice(0, 45).forEach((row, index) => {
    const headers = row.map(normalizeHeader);
    const score = groups.filter((aliases) => headers.some((header) => aliases.some((alias) => header === normalizeHeader(alias) || header.includes(normalizeHeader(alias))))).length;
    if (score > bestScore) {
      best = index;
      bestScore = score;
    }
  });
  return bestScore >= Math.min(3, groups.length) ? best : -1;
}

function findColumn(headers: string[], aliases: string[]) {
  const normalized = aliases.map(normalizeHeader);
  const exact = headers.findIndex((header) => normalized.includes(header));
  if (exact >= 0) return exact;
  return headers.findIndex((header) => normalized.some((alias) => header.includes(alias)));
}

function columnMap(input: { nameCol?: number; unitCol?: number; qtyCol?: number; priceCol?: number; totalCol?: number; codeCol?: number; noteCol?: number; sectionCol?: number }) {
  return cleanColumns({
    name: input.nameCol,
    unit: input.unitCol,
    qty: input.qtyCol,
    unitPrice: input.priceCol,
    total: input.totalCol,
    index: input.codeCol,
    note: input.noteCol,
    section: input.sectionCol
  });
}

function cleanColumns(columns: Record<string, number | undefined>) {
  return Object.fromEntries(Object.entries(columns).filter(([, value]) => value !== undefined && value >= 0));
}

function emptyParsed(): ParsedSheetItems {
  return { budgetItems: [], materials: [], scheduleItems: [], headerRow: null, columns: {} };
}

function textAt(row: unknown[], index: number | undefined) {
  return index === undefined || index < 0 ? "" : normalizeText(row[index]);
}

function numberAt(row: unknown[], index: number | undefined) {
  return index === undefined || index < 0 ? null : parseQuantity(row[index]);
}

function moneyAt(row: unknown[], index: number | undefined) {
  return index === undefined || index < 0 ? null : parseMoney(row[index]);
}

function sectionTitle(sheet: SheetData) {
  const title = sheet.rows.slice(0, 3).flat().map(normalizeText).find((value) => value.length > 4);
  return title ?? sheet.name.replace(/^Р\d+[_\s-]*/i, "").replace(/_/g, " ");
}

function detectedType(role: ProjectWorkbookSheetRole): ImportSheetDetectedType {
  if (role === "works" || role === "payroll" || role === "equipment") return "works";
  if (role === "materials") return "materials";
  if (role === "schedule") return "schedule";
  return "unknown";
}

function sampleRows(rows: unknown[][]) {
  return rows.filter((row) => row.some((value) => normalizeText(value))).slice(0, 3).map((row) => row.slice(0, 10).map(normalizeText));
}

function isTotal(value: string) {
  return /^(итого|всего|итоговая|сметная стоимость)/i.test(value.trim());
}

function joinComment(...parts: Array<string | undefined>) {
  const value = parts.map((part) => part?.trim()).filter(Boolean).join(" · ");
  return value || undefined;
}

function safeDate(value: string | Date | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(`${value}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

function addMonths(date: Date, months: number) {
  const result = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

function endOfMonth(date: Date) {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0));
}

function monthDifference(start: Date, end: Date) {
  return (end.getUTCFullYear() - start.getUTCFullYear()) * 12 + end.getUTCMonth() - start.getUTCMonth() + 1;
}

function sumCost(items: ImportBudgetItem[]) {
  return items.reduce((sum, item) => sum + item.qty * item.plannedUnitPrice, 0);
}

function rowKey(sheetName: string, rowNumber: number) {
  return `${sheetName}:${rowNumber}`;
}

function isBudgetItem(item: ImportBudgetItem | ImportMaterial | ImportScheduleItem): item is ImportBudgetItem {
  return "qty" in item && "plannedUnitPrice" in item;
}

function isMaterial(item: ImportBudgetItem | ImportMaterial | ImportScheduleItem): item is ImportMaterial {
  return "requiredQty" in item;
}
