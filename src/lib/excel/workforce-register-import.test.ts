import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { grossSalaryFromRegisterRow, parseWorkforceRegister } from "./workforce-register-import";

function workbookBuffer() {
  const workbook = XLSX.utils.book_new();
  const sheet = XLSX.utils.aoa_to_sheet([
    ["Сотрудники в штате АН (ТРОИЦК)"],
    [],
    ["п/п", "Наименование должности", "ФИО", "Заработная плата (на руки)", "Заработная плата (с учетом налогов)", "Примечание"],
    [1, "Руководитель ПТО", "Иванов И.И.", 100000, 137000, "полный день"],
    [2, "Кровельщик", "Петров П.П.", 80000, 109600, "допуск высота"],
    ["ИТОГО", "", "", "", 246600, ""]
  ]);
  XLSX.utils.book_append_sheet(workbook, sheet, "ФОТ");
  return Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }));
}

describe("workforce register import", () => {
  it("recognizes the Troitsk FOT column structure without hardcoded people", () => {
    const preview = parseWorkforceRegister(workbookBuffer(), "troitsk.xlsx");
    expect(preview.rows).toHaveLength(2);
    expect(preview.rows[0]).toMatchObject({
      key: "ФОТ:4",
      name: "Иванов И.И.",
      profession: "Руководитель ПТО",
      kind: "engineer",
      employmentType: "staff",
      netMonthlySalary: 100000,
      employerMonthlyCost: 137000
    });
    expect(preview.rows[1]).toMatchObject({ name: "Петров П.П.", kind: "worker" });
  });

  it("does not silently treat blank names or totals as employees", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Должность", "ФИО", "На руки"],
      ["Прораб", "", 100000],
      ["ИТОГО", "ИТОГО", 100000]
    ]), "Список");
    const preview = parseWorkforceRegister(Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), "list.xlsx");
    expect(preview.rows).toEqual([]);
    expect(preview.warnings[0]).toContain("Не найден");
  });

  it("keeps the first occurrence selectable and marks only repeated rows as duplicates", () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
      ["Должность", "ФИО", "На руки"],
      ["Кровельщик", "Работник Тестовый", 80000],
      ["Кровельщик", "Работник Тестовый", 80000]
    ]), "ФОТ");
    const preview = parseWorkforceRegister(Buffer.from(XLSX.write(workbook, { type: "buffer", bookType: "xlsx" })), "list.xlsx");
    expect(preview.rows.map((row) => row.duplicateInFile)).toEqual([false, true]);
    expect(preview.warnings).toContain("В книге есть повторяющиеся ФИО и должности. Повторы будут пропущены при сохранении.");
  });

  it("derives gross salary from employer cost first and net salary as fallback", () => {
    const policy = { insuranceContributionRate: 30, accidentContributionRate: 0, personalIncomeTaxRate: 13 };
    expect(grossSalaryFromRegisterRow({ netMonthlySalary: 100000, employerMonthlyCost: 130000 }, policy)).toBe(100000);
    expect(grossSalaryFromRegisterRow({ netMonthlySalary: 87000, employerMonthlyCost: 0 }, policy)).toBe(100000);
  });
});
