import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const outputPath = process.argv.filter((arg) => arg !== "--").at(2) ?? "/tmp/pgs-budget-import-demo.xlsx";
const rows = [
  ["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена за ед.", "Сумма", "Дата начала", "Дата окончания", "Примечание"],
  ["1", "Земляные работы", "", "", "", "", "", "", ""],
  ["1.1", "Разработка котлована", "м3", 320, 650, 208000, "", "", "Работа"],
  ["2", "Материалы", "", "", "", "", "", "", ""],
  ["2.1", "Бетон В25", "м3", 75, 6200, 465000, "", "", "Материал"],
  ["2.2", "Арматура А500С Ø12", "т", 12, 76000, 912000, "", "", "Материал"],
  ["3", "График", "", "", "", "", "", "", ""],
  ["3.1", "Бетонирование ростверка", "м3", 75, "", "", "2026-07-01", "2026-07-12", "Работа графика"],
  ["?", "Строка для ручной проверки без объема", "м2", "", "", "", "", "", "Должна попасть в unknown"]
];

const workbook = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(rows), "ВОР");

fs.mkdirSync(path.dirname(outputPath), { recursive: true });
XLSX.writeFile(workbook, outputPath);
console.log(`Demo Excel generated: ${outputPath}`);
