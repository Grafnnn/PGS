import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { classifyRow } from "./import-classifier";
import { buildCommitPlan, buildPreview, detectSheets, parseExcelBuffer, remapImportPreview, validateRows } from "./import-parser";
import { detectColumns, detectHeaderRow, normalizeNumber, parseMoney } from "./import-normalizer";
import { importPreviewCommitSchema } from "./import-types";

describe("excel budget import", () => {
  it("detects common Russian column names", () => {
    const map = detectColumns(["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена за ед.", "Сумма", "Примечание"]);

    expect(map.index).toBe(0);
    expect(map.name).toBe(1);
    expect(map.unit).toBe(2);
    expect(map.qty).toBe(3);
    expect(map.unitPrice).toBe(4);
    expect(map.total).toBe(5);
    expect(map.note).toBe(6);
  });

  it("normalizes localized numbers", () => {
    expect(normalizeNumber("1 250,50")).toBe(1250.5);
    expect(normalizeNumber("6 100 руб.")).toBe(6100);
    expect(parseMoney("1.234.567,89 ₽")).toBe(1234567.89);
    expect(parseMoney("1,234.56")).toBe(1234.56);
    expect(normalizeNumber("")).toBeNull();
  });

  it("finds header rows below title blocks", () => {
    const rows = [
      ["Локальная смета"],
      ["Объект: административное здание"],
      ["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена за ед.", "Сумма"]
    ];

    expect(detectHeaderRow(rows)).toBe(2);
  });

  it("classifies empty rows as ignored", () => {
    expect(
      classifyRow(
        { sheetName: "Лист1", rowNumber: 2, values: ["", "", ""] },
        { name: 1, unit: 2, qty: 3 },
        { currentSection: "Без раздела" }
      ).kind
    ).toBe("ignored");
  });

  it("classifies section and budget rows", () => {
    const state = { currentSection: "Без раздела" };
    const columns = detectColumns(["№", "Наименование", "Ед. изм.", "Количество", "Цена", "Сумма"]);

    const section = classifyRow({ sheetName: "Лист1", rowNumber: 2, values: ["1", "Монолитные работы", "", "", "", ""] }, columns, state);
    const item = classifyRow({ sheetName: "Лист1", rowNumber: 3, values: ["1.1", "Устройство опалубки", "м2", 120, 900, 108000] }, columns, state);
    const total = classifyRow({ sheetName: "Лист1", rowNumber: 4, values: ["", "Итого по разделу", "", "", "", 108000] }, columns, state);

    expect(section.kind).toBe("section");
    expect(item.kind).toBe("budget_item");
    expect(total.kind).toBe("ignored");
    if (item.kind === "budget_item") {
      expect(item.budgetItem.section).toBe("Монолитные работы");
      expect(item.budgetItem.kind).toBe("work");
    }
  });

  it("classifies material rows and unknown rows", () => {
    const columns = detectColumns(["№", "Название", "Единица", "Кол-во", "Стоимость"]);
    const state = { currentSection: "Материалы" };

    const material = classifyRow({ sheetName: "Лист1", rowNumber: 4, values: ["2.1", "Бетон В25", "м3", 50, 300000] }, columns, state);
    const unknown = classifyRow({ sheetName: "Лист1", rowNumber: 5, values: ["", "строка без объема", "м2", "", ""] }, columns, state);

    expect(material.kind).toBe("material");
    expect(unknown.kind).toBe("unknown");
  });

  it("builds preview summary", () => {
    const preview = buildPreview({
      projectId: "project-demo",
      fileName: "вор.xlsx",
      sheets: ["ВОР"],
      sections: [{ name: "Раздел", sheetName: "ВОР", rowNumber: 2 }],
      budgetItems: [],
      materials: [],
      scheduleItems: [],
      unknownRows: [{ sheetName: "ВОР", rowNumber: 3, reason: "test", values: ["x"] }],
      warnings: ["warn"],
      errors: []
    });

    expect(preview.summary.sections).toBe(1);
    expect(preview.summary.unknownRows).toBe(1);
    expect(preview.summary.warnings).toBe(1);
    expect(preview.parserVersion).toBe("excel_import_v1");
  });

  it("parses workbook fixtures with hidden rows, totals and preview row statuses", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["Локальная смета"],
      ["Раздел 1. Земляные работы"],
      ["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена за ед.", "Сумма"],
      ["1.1", "Разработка котлована", "м3", "1 000,5", "650", "650 325"],
      ["1.2", "Скрытая строка", "м3", 1, 1, 1],
      ["", "Итого по разделу", "", "", "", "650 325"]
    ]);
    worksheet["!rows"] = [{}, {}, {}, {}, { hidden: true }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ВОР");
    const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;

    const preview = parseExcelBuffer(buffer, "synthetic.xlsx", "project-demo");

    expect(preview.summary.budgetItems).toBeGreaterThanOrEqual(1);
    expect(preview.summary.skippedRows).toBeGreaterThanOrEqual(1);
    expect(preview.previewRows?.some((row) => row.suspiciousFlags.includes("skippedTotalRow"))).toBe(true);
    expect(preview.sourceRows?.length).toBeGreaterThan(0);
  });

  it("detects hidden rows from workbook metadata before import", () => {
    const worksheet = XLSX.utils.aoa_to_sheet([
      ["№", "Наименование", "Ед.", "Кол-во", "Цена"],
      ["1", "Скрытая строка", "м3", 1, 1]
    ]);
    worksheet["!rows"] = [{}, { hidden: true }];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "ВОР");

    const [sheet] = detectSheets(workbook);

    expect(sheet.hiddenRows.has(2)).toBe(true);
  });

  it("warns about duplicate budget rows", () => {
    const preview = buildPreview({
      projectId: "project-demo",
      fileName: "вор.xlsx",
      sheets: ["ВОР"],
      sections: [],
      budgetItems: [
        {
          section: "Раздел",
          code: "1.1",
          name: "Бетонирование",
          unit: "м3",
          qty: 10,
          plannedUnitPrice: 5000,
          actualUnitPrice: 5000,
          forecastUnitPrice: 5000,
          kind: "work",
          source: "Excel import",
          sheetName: "ВОР",
          rowNumber: 2
        },
        {
          section: "Раздел",
          code: "1.1",
          name: "Бетонирование",
          unit: "м3",
          qty: 10,
          plannedUnitPrice: 5000,
          actualUnitPrice: 5000,
          forecastUnitPrice: 5000,
          kind: "work",
          source: "Excel import",
          sheetName: "ВОР",
          rowNumber: 3
        }
      ],
      materials: [],
      scheduleItems: [],
      unknownRows: [],
      warnings: [],
      errors: []
    });

    const validation = validateRows(preview);

    expect(validation.duplicateRows).toBe(1);
    expect(validation.warnings[0]).toContain("Возможный дубль");
  });

  it("remaps a stored preview from server-side source rows", () => {
    const preview = buildPreview({
      projectId: "project-demo",
      fileName: "messy.xlsx",
      sheets: ["ВОР"],
      mapping: [
        {
          sheetName: "ВОР",
          headerRow: 1,
          columns: { name: 0, unit: 1, qty: 2, unitPrice: 3 },
          rows: 2,
          parsedRows: 0,
          hiddenRows: 0,
          formulaCells: 0,
          warnings: []
        }
      ],
      sourceRows: [
        { sheetName: "ВОР", rowNumber: 1, values: ["Ед.", "Наименование", "Цена", "Кол-во"] },
        { sheetName: "ВОР", rowNumber: 2, values: ["м3", "Бетон В25", "6100", "10"] }
      ],
      sections: [],
      budgetItems: [],
      materials: [],
      scheduleItems: [],
      unknownRows: [],
      warnings: [],
      errors: []
    });

    const remapped = remapImportPreview(preview, [
      {
        sheetName: "ВОР",
        headerRow: 1,
        included: true,
        columns: { unit: 0, name: 1, unitPrice: 2, qty: 3 }
      }
    ]);

    expect(remapped.summary.budgetItems).toBe(1);
    expect(remapped.budgetItems[0].name).toBe("Бетон В25");
    expect(remapped.budgetItems[0].qty).toBe(10);
  });

  it("builds commit plans only for clean previews", () => {
    const clean = buildPreview({
      projectId: "project-demo",
      fileName: "вор.xlsx",
      sheets: ["ВОР"],
      sections: [],
      budgetItems: [
        {
          section: "Земляные работы",
          code: "1.1",
          name: "Разработка котлована",
          unit: "м3",
          qty: 100,
          plannedUnitPrice: 650,
          actualUnitPrice: 650,
          forecastUnitPrice: 650,
          kind: "work",
          source: "Excel import",
          sheetName: "ВОР",
          rowNumber: 3
        }
      ],
      materials: [],
      scheduleItems: [],
      unknownRows: [],
      warnings: [],
      errors: []
    });
    const withError = buildPreview({ ...clean, errors: ["Ошибка"] });

    expect(buildCommitPlan(clean, "append").budgetItems).toHaveLength(1);
    expect(() => buildCommitPlan(withError, "append")).toThrow("Нельзя сохранить импорт");
  });

  it("validates commit payloads", () => {
    const parsed = importPreviewCommitSchema.parse({
      mode: "append",
      sections: [{ name: "Земляные работы", sheetName: "ВОР", rowNumber: 2 }],
      budgetItems: [
        {
          section: "Земляные работы",
          code: "1.1",
          name: "Разработка котлована",
          unit: "м3",
          qty: 100,
          plannedUnitPrice: 650,
          actualUnitPrice: 650,
          forecastUnitPrice: 650,
          kind: "work",
          source: "Excel import",
          sheetName: "ВОР",
          rowNumber: 3
        }
      ],
      materials: [],
      scheduleItems: []
    });

    expect(parsed.mode).toBe("append");
    expect(parsed.budgetItems).toHaveLength(1);
  });
});
