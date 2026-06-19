import { describe, expect, it } from "vitest";
import { classifyRow } from "./import-classifier";
import { buildPreview } from "./import-parser";
import { detectColumns, normalizeNumber } from "./import-normalizer";

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
    expect(normalizeNumber("")).toBeNull();
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

    expect(section.kind).toBe("section");
    expect(item.kind).toBe("budget_item");
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
  });
});
