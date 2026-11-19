import * as XLSX from "xlsx";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { ProductionJournalDay, ProductionJournalFilters } from "@/lib/work-production-journal";

function appendTable(
  workbook: XLSX.WorkBook,
  name: string,
  headers: string[],
  rows: Array<Array<string | number>>,
  widths: number[]
) {
  const sheet = XLSX.utils.aoa_to_sheet([headers, ...rows]);
  sheet["!cols"] = widths.map((wch) => ({ wch }));
  if (rows.length) {
    sheet["!autofilter"] = { ref: XLSX.utils.encode_range({ s: { r: 0, c: 0 }, e: { r: rows.length, c: headers.length - 1 } }) };
  }
  XLSX.utils.book_append_sheet(workbook, sheet, name);
}

export function buildWorkProductionJournalWorkbook(
  projectName: string,
  days: readonly ProductionJournalDay[],
  filters: ProductionJournalFilters
) {
  const shifts = days.flatMap(({ date, reports }) => reports.map((report) => ({ date, report })));
  const journalRows = shifts.map(({ date, report }) => [
    date,
    report.workScopes?.length ? report.workScopes.map((scope) => scope.workName).join("\n") : report.workCategory ?? "",
    report.completedWorks,
    report.author,
    dailyReportStatusLabel(report.status),
    report.workers,
    report.engineers,
    report.shiftHours ?? "",
    report.weather,
    report.equipment,
    report.materialsReceived,
    report.materialsConsumed,
    report.downtime,
    report.issues,
    report.id
  ]);
  const outputRows = shifts.flatMap(({ date, report }) => (report.workOutputs ?? []).map((output) => [
    date,
    output.workName,
    output.quantity,
    output.unit,
    output.laborHours,
    output.profession,
    report.author,
    report.id
  ]));

  const workbook = XLSX.utils.book_new();
  appendTable(workbook, "Журнал", [
    "Дата", "Виды работ", "Выполненные работы", "Автор рапорта", "Статус рапорта",
    "Рабочие, чел.", "ИТР, чел.", "Смена, ч", "Погода", "Техника",
    "Материалы получены", "Материалы израсходованы", "Простои", "Замечания", "ID рапорта"
  ], journalRows, [14, 32, 62, 28, 18, 15, 12, 12, 27, 32, 38, 38, 36, 38, 28]);
  appendTable(workbook, "Выработка", [
    "Дата", "Работа", "Объём", "Ед. изм.", "Трудозатраты, чел.-ч", "Профессия", "Автор рапорта", "ID рапорта"
  ], outputRows, [14, 56, 12, 12, 24, 25, 28, 28]);

  const summary = XLSX.utils.aoa_to_sheet([
    ["Журнал производства работ", projectName],
    ["Период с", filters.from ?? "Без ограничения"],
    ["Период по", filters.to ?? "Без ограничения"],
    ...(filters.query ? [["Поиск", filters.query]] : []),
    ["Дней с записями", days.length],
    ["Рапортов", shifts.length]
  ]);
  summary["!cols"] = [{ wch: 34 }, { wch: 64 }];
  XLSX.utils.book_append_sheet(workbook, summary, "Сводка");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}
