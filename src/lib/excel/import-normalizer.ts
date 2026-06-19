import type { ColumnMap } from "./import-types";

const headerAliases: Record<keyof ColumnMap, string[]> = {
  index: ["no", "n", "номер", "пп", "№"],
  name: ["наименование", "наименование работ", "название", "работы", "материалы", "позиция", "вид работ"],
  unit: ["ед изм", "единица", "единица измерения", "ед", "изм"],
  qty: ["кол во", "количество", "объем", "обьем", "qty"],
  unitPrice: ["цена за ед", "цена", "расценка", "стоимость ед", "цена единицы"],
  total: ["сумма", "стоимость", "итого", "всего"],
  section: ["раздел", "глава", "этап", "категория"],
  note: ["примечание", "комментарий", "источник", "note"],
  startsAt: ["начало", "дата начала", "старт"],
  endsAt: ["окончание", "дата окончания", "финиш", "срок"]
};

export function normalizeHeader(value: unknown) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/[().,:;"/-]/g, " ")
    .replace(/\s+/g, " ");
}

export function normalizeText(value: unknown) {
  return String(value ?? "").trim().replace(/\s+/g, " ");
}

export function normalizeNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const text = normalizeText(value)
    .replace(/\u00a0/g, " ")
    .replace(/[₽рруб]/gi, "")
    .replace(/\s+/g, "")
    .replace(",", ".");
  if (!text) return null;
  const parsed = Number(text);
  return Number.isFinite(parsed) ? parsed : null;
}

export function normalizeDate(value: unknown) {
  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    return value.toISOString().slice(0, 10);
  }
  const text = normalizeText(value);
  if (!text) return null;
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  const match = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/);
  if (!match) return null;
  const year = match[3].length === 2 ? `20${match[3]}` : match[3];
  const date = new Date(`${year}-${match[2].padStart(2, "0")}-${match[1].padStart(2, "0")}T00:00:00Z`);
  return Number.isNaN(date.getTime()) ? null : date.toISOString().slice(0, 10);
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
  const map = detectColumns(row);
  return Boolean(map.name !== undefined && (map.qty !== undefined || map.unit !== undefined || map.total !== undefined));
}

export function cell(row: unknown[], index: number | undefined) {
  return index === undefined ? "" : row[index];
}

export function isEmptyRow(row: unknown[]) {
  return row.every((value) => normalizeText(value) === "");
}
