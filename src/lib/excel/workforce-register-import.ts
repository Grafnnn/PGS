import * as XLSX from "xlsx";
import { normalizeHeader, normalizeText, parseMoney } from "@/lib/excel/import-normalizer";
import type { ResourceEmploymentType, ResourceKind } from "@/lib/types";

export const WORKFORCE_REGISTER_PARSER_VERSION = "workforce_register_v1";

export type WorkforceRegisterRow = {
  key: string;
  sheetName: string;
  sourceRow: number;
  section: string;
  name: string;
  profession: string;
  kind: Exclude<ResourceKind, "equipment">;
  employmentType: Exclude<ResourceEmploymentType, "owned" | "rented">;
  netMonthlySalary: number;
  employerMonthlyCost: number;
  notes: string;
  duplicateInFile: boolean;
};

export type WorkforceRegisterPreview = {
  parserVersion: string;
  fileName: string;
  sheets: string[];
  rows: WorkforceRegisterRow[];
  warnings: string[];
  skippedRows: number;
};

const nameAliases = ["фио", "ф и о", "сотрудник", "работник"];
const professionAliases = ["наименование должности", "должность", "профессия", "специальность"];
const netSalaryAliases = ["заработная плата на руки", "зарплата на руки", "на руки"];
const employerCostAliases = ["заработная плата с учетом налогов", "зарплата с налогами", "с учетом налогов", "стоимость работодателя"];
const notesAliases = ["примечание", "комментарий"];

function clean(value: unknown) {
  return normalizeText(value).replace(/\s+/g, " ").trim();
}

function headerIndex(row: unknown[], aliases: string[]) {
  return row.findIndex((cell) => {
    const header = normalizeHeader(cell);
    return aliases.some((alias) => header === alias || header.includes(alias));
  });
}

function findHeader(rows: unknown[][]) {
  for (let index = 0; index < Math.min(rows.length, 80); index += 1) {
    const row = rows[index] ?? [];
    const name = headerIndex(row, nameAliases);
    const profession = headerIndex(row, professionAliases);
    if (name >= 0 && profession >= 0) {
      return {
        rowIndex: index,
        name,
        profession,
        netSalary: headerIndex(row, netSalaryAliases),
        employerCost: headerIndex(row, employerCostAliases),
        notes: headerIndex(row, notesAliases)
      };
    }
  }
  return null;
}

function inferKind(profession: string): WorkforceRegisterRow["kind"] {
  const value = normalizeHeader(profession);
  if (/руковод|директор|начальник|прораб|мастер|инженер|пто|снабжен|бухгалтер|юрист|делопроизвод|менеджер|геодез|лаборант/.test(value)) {
    return "engineer";
  }
  if (/бригада|звено/.test(value)) return "crew";
  return "worker";
}

function inferEmployment(section: string, profession: string): WorkforceRegisterRow["employmentType"] {
  const value = normalizeHeader(`${section} ${profession}`);
  if (/субподряд/.test(value)) return "subcontract";
  if (/штат/.test(value)) return "staff";
  return "hired";
}

function sectionBefore(rows: unknown[][], rowIndex: number) {
  for (let index = rowIndex - 1; index >= Math.max(0, rowIndex - 12); index -= 1) {
    const text = clean((rows[index] ?? []).find((cell) => clean(cell).length > 2));
    if (/сотрудник|штат|бригада|рабоч/i.test(text)) return text;
  }
  return "Сотрудники";
}

function isSummaryRow(name: string, profession: string) {
  const value = normalizeHeader(`${name} ${profession}`);
  return !name || !profession || /итого|всего|офис$|содержание офиса/.test(value);
}

export function normalizeWorkforceIdentity(value: string) {
  return normalizeHeader(value).replace(/[^a-zа-яё0-9]+/gi, " ").trim();
}

export function parseWorkforceRegister(buffer: Buffer, fileName: string): WorkforceRegisterPreview {
  const workbook = XLSX.read(buffer, { type: "buffer", cellDates: true, cellFormula: true });
  const rows: WorkforceRegisterRow[] = [];
  const warnings: string[] = [];
  let skippedRows = 0;

  for (const sheetName of workbook.SheetNames) {
    const sheet = workbook.Sheets[sheetName];
    if (!sheet) continue;
    const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: "", raw: true, blankrows: true });
    const header = findHeader(matrix);
    if (!header) continue;
    let section = sectionBefore(matrix, header.rowIndex);

    for (let rowIndex = header.rowIndex + 1; rowIndex < matrix.length; rowIndex += 1) {
      const row = matrix[rowIndex] ?? [];
      const rowText = clean(row.find((cell) => clean(cell).length > 2));
      if (/сотрудник|штат|бригада/i.test(rowText) && !clean(row[header.name])) section = rowText;

      const name = clean(row[header.name]);
      const profession = clean(row[header.profession]);
      if (isSummaryRow(name, profession)) {
        if (name || profession) skippedRows += 1;
        continue;
      }

      const netMonthlySalary = header.netSalary >= 0 ? Math.max(0, parseMoney(row[header.netSalary]) ?? 0) : 0;
      const employerMonthlyCost = header.employerCost >= 0 ? Math.max(0, parseMoney(row[header.employerCost]) ?? 0) : 0;
      rows.push({
        key: `${sheetName}:${rowIndex + 1}`,
        sheetName,
        sourceRow: rowIndex + 1,
        section,
        name,
        profession,
        kind: inferKind(profession),
        employmentType: inferEmployment(section, profession),
        netMonthlySalary,
        employerMonthlyCost,
        notes: header.notes >= 0 ? clean(row[header.notes]) : "",
        duplicateInFile: false
      });
    }
  }

  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${normalizeWorkforceIdentity(row.name)}:${normalizeWorkforceIdentity(row.profession)}`;
    row.duplicateInFile = seen.has(key);
    seen.add(key);
  }

  if (!rows.length) warnings.push("Не найден лист со столбцами «ФИО» и «Должность / профессия».");
  if (rows.some((row) => !row.netMonthlySalary && !row.employerMonthlyCost)) {
    warnings.push("У части сотрудников не указана зарплата. Они будут импортированы с нулевой ставкой для последующего уточнения.");
  }
  if (rows.some((row) => row.duplicateInFile)) warnings.push("В книге есть повторяющиеся ФИО и должности. Повторы будут пропущены при сохранении.");

  return {
    parserVersion: WORKFORCE_REGISTER_PARSER_VERSION,
    fileName,
    sheets: workbook.SheetNames,
    rows,
    warnings,
    skippedRows
  };
}

export function grossSalaryFromRegisterRow(
  row: Pick<WorkforceRegisterRow, "netMonthlySalary" | "employerMonthlyCost">,
  policy: { insuranceContributionRate: number; accidentContributionRate: number; personalIncomeTaxRate: number }
) {
  const contributionRate = Math.max(0, policy.insuranceContributionRate + policy.accidentContributionRate) / 100;
  const incomeTaxRate = Math.min(0.95, Math.max(0, policy.personalIncomeTaxRate) / 100);
  if (row.employerMonthlyCost > 0) return Math.round(row.employerMonthlyCost / (1 + contributionRate) * 100) / 100;
  if (row.netMonthlySalary > 0) return Math.round(row.netMonthlySalary / (1 - incomeTaxRate) * 100) / 100;
  return 0;
}
