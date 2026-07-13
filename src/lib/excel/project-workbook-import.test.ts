import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { analyzeProjectWorkbookBuffer, parseProjectWorkbookBuffer } from "./project-workbook-import";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Сводная стоимость проекта"],
    ["Раздел", "Итого без НДС, ₽", "НДС, ₽", "Итого с НДС, ₽"],
    ["ИТОГО прямые затраты", 4200, 924, 5124],
    ["ИТОГОВАЯ ЦЕНА ГЕНПОДРЯДА", 5000],
    ["Ставка НДС", 0.22]
  ]), "01_ССР_КП");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["01. Земляные работы"],
    [],
    ["Источник / группа", "№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽", "Стоимость работ без НДС, ₽", "Примечание"],
    ["ВОР", 1, "Разработка грунта", "м3", 2, 100, 200, ""],
    ["", "", "", "", "", "Итого работы/надбавки без НДС:", 200]
  ]), "Р01_Земляные работы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Материалы"],
    ["Раздел", "№", "Позиция", "Ед. мат.", "Кол-во мат.", "Цена с НДС", "Стоимость с НДС", "Источник/основание"],
    ["Земляные работы", 1, "Песок", "м3", 10, 122, 1220, "КП"]
  ]), "05_Материалы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Календарный график"],
    ["Код", "Раздел", "Этап", "M1", "M2", "M3"],
    [1, "Земляные работы", "Физика СМР", 100, 100, 0]
  ]), "13_Календарь_3мес");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ИТР и управление — ФОТ"],
    ["№", "Должность", "Функция", "ФОТ 1 ед./мес, ₽", "Чел-Мес всего", "Итого ФОТ без НДС, ₽", "M1", "M2", "Примечание"],
    [1, "Руководитель проекта", "Управление", 1000, 2, 2000, 1, 1, ""],
    ["ИТОГО", "", "", "", 2, 2000]
  ]), "23_ИТР_ФОТ");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Машины и механизмы"],
    ["№", "Техника / механизм", "Вид работ / этап", "Ед.", "Кол-во ед.", "Смен всего", "Расценка без НДС, ₽/смена", "Итого без НДС, ₽", "M1", "M2"],
    [1, "Экскаватор", "Котлован", "смена", 1, 2, 500, 1000, 2, 0],
    ["ИТОГО", "", "", "", "", 2, "", 1000]
  ]), "22_Машины_механизмы");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Проверка", "Комментарий"], ["ok", "reference only"]]), "18_Контроль");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("project workbook import", () => {
  it("classifies a multi-sheet project workbook and reconciles modules without summary duplication", () => {
    const analysis = analyzeProjectWorkbookBuffer(workbookBuffer(), "project.xlsx", "preview", { startsAt: "2026-07-01" });

    expect(analysis.errors).toEqual([]);
    expect(analysis.suggestions).toMatchObject({ contractAmount: 5000, vatPercent: 22, durationMonths: 2 });
    expect(analysis.summary).toMatchObject({ budgetItems: 4, materials: 1, scheduleItems: 1, payrollItems: 1, equipmentItems: 1, sourceDirectCost: 4200, reconciliationGap: 0, automatedCoveragePercent: 100 });
    expect(analysis.summary.estimatedDirectCost).toBeCloseTo(4200);
    expect(analysis.modules.find((module) => module.id === "source_control")?.sheets).toContain("01_ССР_КП");
    expect(analysis.sheets.find((sheet) => sheet.sheetName === "01_ССР_КП")).toMatchObject({ role: "summary", included: false });
  });

  it("creates payroll expense from volume and monthly output norm", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["ФОТ привлеченных рабочих"],
      ["Профессия", "Месячная зарплата", "Норма выработки", "Объем работ"],
      ["Монтажник", 120000, 50, 200],
      ["ИТОГО"]
    ]), "ФОТ рабочих");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Календарный график"],
      ["Раздел", "M1", "M2"],
      ["Монтаж", 1, 1]
    ]), "График");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([["Итог"], ["справочно"]]), "Итог");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseProjectWorkbookBuffer(buffer, "labor.xlsx", "project", { startsAt: "2026-07-01" });
    const payroll = preview.budgetItems.find((item) => item.kind === "payroll");

    expect(payroll).toMatchObject({ name: "Монтажник", unit: "чел.-мес.", qty: 4, plannedUnitPrice: 120000, actualUnitPrice: 0 });
    expect(payroll?.comment).toContain("Норма выработки: 50");
    expect(payroll?.comment).toContain("Объем для расчета: 200");
  });
});
