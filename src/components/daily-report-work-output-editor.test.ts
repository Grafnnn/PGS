import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DailyReportWorkOutputEditor } from "@/components/daily-report-work-output-editor";

describe("DailyReportWorkOutputEditor", () => {
  it("shows the calculated actual norm without mutating data", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      outputs: [{
        profession: "Каменщик",
        workName: "Кладка стен",
        quantity: 20,
        unit: "м2",
        laborHours: 32
      }],
      onChange: vi.fn()
    }));

    expect(html).toContain("Фактическая выработка смены");
    expect(html).toContain("100 м2/чел.-мес.");
    expect(html).toContain("32 чел.-ч");
    expect(html).toContain("данные готовы к сохранению");
    expect(html).toContain("После утверждения рапорта");
  });

  it("marks an unfinished output row before the report is saved", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      outputs: [{ profession: "", workName: "", quantity: 0, unit: "", laborHours: 0 }],
      onChange: vi.fn()
    }));

    expect(html).toContain("незавершённых строк: 1");
    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("Укажите профессию");
    expect(html).toContain("Удалить строку выработки 1");
  });

  it("shows crew-based shift capacity and explicit labor allocation controls", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewHeadcount: 12,
      shiftHours: 8,
      outputs: [{
        profession: "Кровельщик",
        workName: "Монтаж мембраны",
        quantity: 120,
        unit: "м²",
        workerCount: 6,
        hoursPerWorker: 8,
        laborHours: 48,
        laborAllocationMode: "auto"
      }],
      onChange: vi.fn(),
      onShiftHoursChange: vi.fn()
    }));

    expect(html).toContain("Состав смены");
    expect(html).toContain("12 чел.");
    expect(html).toContain("Фонд смены");
    expect(html).toContain("96 чел.-ч");
    expect(html).toContain("Людей");
    expect(html).toContain("Часов на человека");
    expect(html).toContain("Распределить");
    expect(html).toContain("распределено автоматически");
  });
});
