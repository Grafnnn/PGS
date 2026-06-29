import type { ColumnMap, ImportBudgetItem, ImportMaterial, ImportScheduleItem, ImportSection, RawSheetRow, UnknownImportRow } from "./import-types";
import { cell, isEmptyRow, normalizeDate, normalizeText, parseMoney, parseQuantity } from "./import-normalizer";

const materialKeywords = [
  "бетон",
  "арматур",
  "песок",
  "щеб",
  "труба",
  "кабель",
  "гидроизоляц",
  "цемент",
  "кирпич",
  "краск",
  "смесь",
  "плита",
  "профиль",
  "лист",
  "утепл",
  "расходник",
  "поставка",
  "поставк",
  "закладн",
  "метизы",
  "праймер",
  "штукатур",
  "шпатлев",
  "герметик",
  "клей"
];

const equipmentKeywords = ["экскаватор", "кран", "самосвал", "техника", "механизм", "машино", "оборудование", "агрегат", "подъемник", "погрузчик"];
const overheadKeywords = ["наклад", "управление", "администр", "охрана", "бытов"];
const payrollKeywords = ["фот", "зарплат", "рабоч", "персонал", "трудозатрат", "чел час", "человеко"];

export interface ClassificationState {
  currentSection: string;
}

export type ClassifiedRow =
  | { kind: "ignored" }
  | { kind: "section"; section: ImportSection }
  | { kind: "budget_item"; budgetItem: ImportBudgetItem }
  | { kind: "material"; budgetItem: ImportBudgetItem; material: ImportMaterial }
  | { kind: "schedule_item"; scheduleItem: ImportScheduleItem }
  | { kind: "unknown"; unknown: UnknownImportRow };

export function classifyRow(raw: RawSheetRow, columns: ColumnMap, state: ClassificationState): ClassifiedRow {
  if (isEmptyRow(raw.values)) return { kind: "ignored" };
  if (raw.hidden) return { kind: "ignored" };

  const explicitSection = normalizeText(cell(raw.values, columns.section));
  const name = normalizeText(cell(raw.values, columns.name)) || explicitSection || firstTextCell(raw.values);
  const unit = normalizeText(cell(raw.values, columns.unit));
  const qty = parseQuantity(cell(raw.values, columns.qty));
  const unitPrice = parseMoney(cell(raw.values, columns.unitPrice));
  const total = parseMoney(cell(raw.values, columns.total));
  const startsAt = normalizeDate(cell(raw.values, columns.startsAt));
  const endsAt = normalizeDate(cell(raw.values, columns.endsAt));

  if (!name) return { kind: "ignored" };
  if (isLikelyTotalRow(name)) return { kind: "ignored" };

  const hasMoney = unitPrice !== null || total !== null;
  const hasQty = qty !== null && qty > 0;
  const hasUnit = Boolean(unit);
  const nonEmptyCells = raw.values.filter((value) => normalizeText(value) !== "");

  if ((explicitSection && !hasMoney && !hasQty) || (!hasMoney && !hasQty && !hasUnit && nonEmptyCells.length <= 2 && name.length > 2)) {
    state.currentSection = name;
    return {
      kind: "section",
      section: {
        name,
        sheetName: raw.sheetName,
        rowNumber: raw.rowNumber
      }
    };
  }

  if (startsAt || endsAt) {
    const start = startsAt ?? new Date().toISOString().slice(0, 10);
    return {
      kind: "schedule_item",
      scheduleItem: {
        name,
        owner: "РП",
        startsAt: start,
        endsAt: endsAt ?? start,
        plannedQty: qty ?? 1,
        actualQty: 0,
        status: "not_started",
        sheetName: raw.sheetName,
        rowNumber: raw.rowNumber
      }
    };
  }

  if (hasUnit && hasQty) {
    const plannedUnitPrice = unitPrice ?? (total && qty ? total / qty : 0);
    const kind = inferBudgetKind(name, unit);
    const budgetItem: ImportBudgetItem = {
      section: state.currentSection || explicitSection || "Без раздела",
      code: normalizeText(cell(raw.values, columns.index)) || `${raw.rowNumber}`,
      name,
      unit,
      qty: qty ?? 0,
      plannedUnitPrice,
      actualUnitPrice: plannedUnitPrice,
      forecastUnitPrice: plannedUnitPrice,
      kind,
      source: "Excel import",
      comment: normalizeText(cell(raw.values, columns.note)) || undefined,
      sheetName: raw.sheetName,
      rowNumber: raw.rowNumber
    };

    if (kind === "material") {
      const today = new Date().toISOString().slice(0, 10);
      return {
        kind: "material",
        budgetItem,
        material: {
          name,
          unit,
          requiredQty: qty ?? 0,
          orderedQty: 0,
          deliveredQty: 0,
          consumedQty: 0,
          plannedUnitPrice,
          actualUnitPrice: 0,
          supplier: "Не выбран",
          neededAt: today,
          status: "required",
          sheetName: raw.sheetName,
          rowNumber: raw.rowNumber
        }
      };
    }

    return { kind: "budget_item", budgetItem };
  }

  return {
    kind: "unknown",
    unknown: {
      sheetName: raw.sheetName,
      rowNumber: raw.rowNumber,
      reason: unknownReason({ unit, qty, unitPrice, total, startsAt, endsAt }),
      values: raw.values.map((value) => normalizeText(value)).filter(Boolean)
    }
  };
}

export function inferBudgetKind(name: string, unit: string): ImportBudgetItem["kind"] {
  const text = `${name} ${unit}`.toLowerCase();
  if (materialKeywords.some((keyword) => text.includes(keyword))) return "material";
  if (equipmentKeywords.some((keyword) => text.includes(keyword))) return "equipment";
  if (overheadKeywords.some((keyword) => text.includes(keyword))) return "overhead";
  if (payrollKeywords.some((keyword) => text.includes(keyword))) return "payroll";
  return "work";
}

function isLikelyTotalRow(name: string) {
  const text = name.toLowerCase();
  return /^(итого|всего|сметная стоимость|накладные расходы итого|общая стоимость)/.test(text) || text.includes("итого по");
}

function unknownReason(input: {
  unit: string;
  qty: number | null;
  unitPrice: number | null;
  total: number | null;
  startsAt: string | null;
  endsAt: string | null;
}) {
  if (!input.unit && input.qty !== null) return "Есть количество, но не указана единица измерения.";
  if (input.unit && (input.qty === null || input.qty <= 0)) return "Есть единица измерения, но не указано положительное количество.";
  if (input.unit && input.qty !== null && input.unitPrice === null && input.total === null) return "Есть объем, но не указана цена или сумма.";
  if ((input.startsAt || input.endsAt) && !input.unit && input.qty === null) return "Есть дата графика, но не хватает объема или наименования работы.";
  return "Не удалось определить тип строки: недостаточно признаков количества, цены, единицы или дат.";
}

function firstTextCell(row: unknown[]) {
  const value = row.find((cellValue) => normalizeText(cellValue).length > 0);
  return normalizeText(value);
}
