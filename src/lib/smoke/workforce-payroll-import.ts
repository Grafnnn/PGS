import * as XLSX from "xlsx";
import type { ImportPreview } from "@/lib/excel/import-types";

export type WorkforcePayrollImportSmokeAssertions = {
  previewRecognized: boolean;
  commitCreated: boolean;
  demandListed: boolean;
  allocationLinked: boolean;
  payrollCalculated: boolean;
  taxesCalculated: boolean;
  economicsCalculated: boolean;
  cleanupPassed: boolean;
  roleRestored: boolean;
};

export function buildWorkforcePayrollImportSmokeWorkbook(runKey: string) {
  const marker = `SMOKE-FOT-IMPORT-${runKey}`;
  const profession = `${marker} Монтажник`;
  const workCode = `${marker}-WORK`;
  const workName = `${marker} Монтаж металлоконструкций`;
  const sectionName = `${marker} Монтажные работы`;
  const grossMonthlySalary = 120_000;
  const productivityNorm = 50;
  const workQuantity = 200;
  const expectedPersonMonths = workQuantity / productivityNorm;
  const expectedPlannedHours = expectedPersonMonths * 160;
  const workbook = XLSX.utils.book_new();

  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["ФОТ привлеченных рабочих"],
    ["Профессия", "Месячная зарплата", "Норма выработки", "Объем работ"],
    [profession, grossMonthlySalary, productivityNorm, workQuantity],
    ["ИТОГО"]
  ]), "ФОТ рабочих");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    [sectionName],
    ["№", "Наименование работ", "Ед.", "Кол-во", "Ставка без НДС, ₽"],
    [workCode, workName, "т", workQuantity, 1_000]
  ]), "ВОР Монтаж");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Календарный график"],
    ["Раздел", "M1", "M2"],
    [sectionName, 1, 1]
  ]), "График");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ["Итог"],
    [`${marker} synthetic staging fixture`]
  ]), "Итог");

  return {
    bytes: XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer,
    fileName: `${marker}.xlsx`,
    marker,
    profession,
    workCode,
    workName,
    sectionName,
    grossMonthlySalary,
    expectedPersonMonths,
    expectedPlannedHours,
    expectedGrossPayroll: grossMonthlySalary * expectedPersonMonths
  };
}

export function inspectWorkforcePayrollImportPreview(
  preview: ImportPreview,
  fixture: ReturnType<typeof buildWorkforcePayrollImportSmokeWorkbook>
) {
  const payrollItem = preview.budgetItems.find(
    (item) => item.kind === "payroll" && item.name === fixture.profession
  );
  const workItem = preview.budgetItems.find(
    (item) => item.name === fixture.workName
  );
  const demand = (preview.laborDemands ?? []).find(
    (item) => item.profession === fixture.profession
  );
  const allocations = demand?.allocations ?? [];
  const allocationSharePercent = allocations.reduce((sum, item) => sum + item.sharePercent, 0);
  const workAllocation = allocations.find((item) => item.budgetName === fixture.workName);

  return {
    payrollItem,
    workItem,
    demand,
    workAllocation,
    allocationSharePercent,
    recognized:
      Boolean(preview.importBatchId) &&
      Boolean(payrollItem) &&
      Boolean(workItem) &&
      Boolean(demand) &&
      Boolean(workAllocation) &&
      Math.abs(allocationSharePercent - 100) <= 0.001 &&
      Math.abs((demand?.personMonths ?? 0) - fixture.expectedPersonMonths) <= 0.001 &&
      Math.abs((demand?.plannedHours ?? 0) - fixture.expectedPlannedHours) <= 0.01
  };
}

export function workforcePayrollImportSmokePassed(assertions: WorkforcePayrollImportSmokeAssertions) {
  return Object.values(assertions).every(Boolean);
}
