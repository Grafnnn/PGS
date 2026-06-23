import type { ColumnMap } from "./import-types";

const headerAliases: Record<keyof ColumnMap, string[]> = {
  index: ["no", "n", "номер", "п п", "пп", "№"],
  name: ["наименование", "наименование работ", "название", "работы", "материалы", "позиция", "вид работ", "ресурс"],
  unit: ["ед изм", "единица", "единица измерения", "ед", "изм", "е изм"],
  qty: ["кол во", "количество", "объем", "обьем", "qty", "кол-во", "объём"],
  unitPrice: ["цена за ед", "цена ед", "цена", "расценка", "стоимость ед", "цена единицы", "стоимость единицы"],
  total: ["сумма", "стоимость", "итого", "всего", "стоимость всего"],
  section: ["раздел", "глава", "этап", "категория"],
  note: ["примечание", "комментарий", "источник", "note"],
  startsAt: ["начало", "дата начала", "старт"],
  endsAt: ["окончание", "дата окончания", "финиш", "срок"]
};

const punctuationRegex = /[().,:;"/\\_-]/g;
const currencyRegex = /(рублей|рубля|руб\.?|р\.?|₽)/gi;
const emptyNumberValues = new Set(["", "-", "—", "–", "нет", "н/д", "na", "n/a"]);

export function normalizeHeader(value: unknown) {
  return normalizeCellValue(value)
    .trim()
    .toLowerCase()
    .replace(punctuationRegex, " ")
    .replace(/\s+/g, " ");
}

export function normalizeText(value: unknown) {
  return normalizeCellValue(value).trim().replace(/\s+/g, " ");
}

export function normalizeCellValue(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString().slice(0, 10);
  if (typeof value === "number") return String(value);
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "object") {
    const maybeCell = value as { w?: unknown; v?: unknown; text?: unknown };
    if (maybeCell.w !== undefined) return String(maybeCell.w);
    if (maybeCell.text !== undefined) return String(maybeCell.text);
    if (maybeCell.v !== undefined) return String(maybeCell.v);
  }
  return String(value);
}

export function normalizeNumber(value: unknown) {
  return parseQuantity(value);
}

export function parseQuantity(value: unknown) {
  return parseLocalizedNumber(value);
}

export function parseMoney(value: unknown) {
  return parseLocalizedNumber(normalizeCellValue(value).replace(currencyRegex, ""));
}

function parseLocalizedNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeText(value)
    .replace(/\u00a0/g, " ")
    .replace(currencyRegex, "")
    .replace(/%/g, "")
    .trim()
    .toLowerCase();
  if (emptyNumberValues.has(text)) return null;

  const negative = /^\(.*\)$/.test(text) || text.startsWith("-");
  const compact = text.replace(/[()]/g, "").replace(/\s+/g, "").replace(/[^\d,.-]/g, "");
  if (!compact || compact === "-" || compact === "." || compact === ",") return null;

  const normalized = normalizeNumberSeparators(compact);
  const parsed = Number(normalized.replace(/(?!^)-/g, ""));
  if (!Number.isFinite(parsed)) return null;
  return negative && parsed > 0 ? -parsed : parsed;
}

function normalizeNumberSeparators(value: string) {
  const unsigned = value.replace(/^-/, "");
  const commaCount = (unsigned.match(/,/g) ?? []).length;
  const dotCount = (unsigned.match(/\./g) ?? []).length;

  if (commaCount > 0 && dotCount > 0) {
    const decimalSeparator = unsigned.lastIndexOf(",") > unsigned.lastIndexOf(".") ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    return value.replace(new RegExp(`\\${thousandsSeparator}`, "g"), "").replace(decimalSeparator, ".");
  }

  if (commaCount > 1) return value.replace(/,/g, "");
  if (dotCount > 1) return value.replace(/\./g, "");

  const separator = commaCount === 1 ? "," : dotCount === 1 ? "." : "";
  if (!separator) return value;

  const [, fraction = ""] = unsigned.split(separator);
  if (fraction.length === 3) return value.replace(separator, "");
  return value.replace(separator, ".");
}

export function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  if (typeof value === "number" && Number.isFinite(value)) {
    const epoch = new Date(Date.UTC(1899, 11, 30));
    const date = new Date(epoch.getTime() + value * 24 * 60 * 60 * 1000);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (!text) return null;
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (match) {
    const year = match[3].length === 2 ? `20${match[3]}` : match[3];
    const date = new Date(`${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const isoMatch = text.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (isoMatch) {
    const date = new Date(`${isoMatch[1]}-${isoMatch[2].padStart(2, "0")}-${isoMatch[3].padStart(2, "0")}T00:00:00Z`);
    return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
  }
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return null;
}

export function detectColumns(headerRow: unknown[]): ColumnMap {
  const map: ColumnMap = {};
  const normalized = headerRow.map(normalizeHeader);

  for (const [key, aliases] of Object.entries(headerAliases) as Array<[keyof ColumnMap, string[]]>) {
    const index = normalized.findIndex((header) => aliases.some((alias) => header === alias || header.includes(alias)));
    if (index >= 0) map[key] = index;
  }

  return map;
}

export function looksLikeHeader(row: unknown[]) {
  return headerScore(row) >= 3;
}

export function headerScore(row: unknown[]) {
  const map = detectColumns(row);
  return Object.values(map).filter((value) => value !== undefined).length;
}

export function detectHeaderRow(rows: unknown[][], maxScanRows = 40) {
  let bestIndex = -1;
  let bestScore = 0;
  rows.slice(0, maxScanRows).forEach((row, index) => {
    const score = headerScore(row);
    const columns = detectColumns(row);
    const hasRequired = columns.name !== undefined && (columns.qty !== undefined || columns.unit !== undefined || columns.total !== undefined);
    if (hasRequired && score > bestScore) {
      bestIndex = index;
      bestScore = score;
    }
  });
  return bestIndex;
}

export function cell(row: unknown[], index: number | undefined) {
  return index === undefined ? "" : row[index];
}

export function isEmptyRow(row: unknown[]) {
  return row.every((value) => normalizeText(value) === "");
}
