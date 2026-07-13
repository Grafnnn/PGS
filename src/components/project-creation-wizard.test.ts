import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectCreationWizard, WorkbookQualityGatePanel, projectWorkbookCreationBlockReason } from "@/components/projects-index";
import { buildProjectWorkbookQualityGate } from "@/lib/excel/project-workbook-quality";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

describe("ProjectCreationWizard", () => {
  it("renders onboarding wizard without calling create API or AI on render", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never);
    const html = renderToStaticMarkup(React.createElement(ProjectCreationWizard));

    expect(html).toContain("Project Creation &amp; Onboarding");
    expect(html).toContain("Создать проект и запустить baseline");
    expect(html).toContain("Загрузите единый Excel проекта");
    expect(html).toContain("Единый Excel проекта");
    expect(html).toContain("Выбрать Excel проекта");
    expect(html).toContain("ВОР, ССР, материалы, графики, машины, ФОТ");
    expect(html).toContain("Шаблон проекта");
    expect(html).toContain("Загрузить договор для автозаполнения");
    expect(html).toContain("Выбрать договор");
    expect(html).toContain("TXT/Markdown preview без AI");
    expect(html).toContain("PDF/DOCX можно приложить как стартовый документ");
    expect(html).toContain("Общестрой");
    expect(html).toContain("Инженерные сети");
    expect(html).toContain("Проект");
    expect(html).toContain("Договор");
    expect(html).toContain("Контур");
    expect(html).toContain("Onboarding baseline");
    expect(html).toContain("Выбранный шаблон");
    expect(html).toContain("Бюджет / ВОР");
    expect(html).toContain("Название проекта");
    expect(html).toContain("нужно заполнить");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });

  it("blocks creation until mapping and quality warnings are explicitly resolved", () => {
    const analysis = {
      quality: {
        status: "review_required" as const,
        acknowledgementRequired: true
      }
    };

    expect(projectWorkbookCreationBlockReason({ analysis, mappingDirty: true, qualityConfirmed: false })).toContain("Пересчитайте");
    expect(projectWorkbookCreationBlockReason({ analysis, mappingDirty: false, qualityConfirmed: false })).toContain("Подтвердите");
    expect(projectWorkbookCreationBlockReason({ analysis, mappingDirty: false, qualityConfirmed: true })).toBeNull();
    expect(projectWorkbookCreationBlockReason({
      analysis: { quality: { status: "blocked", acknowledgementRequired: false } },
      mappingDirty: false,
      qualityConfirmed: false
    })).toContain("quality gate");
  });

  it("renders the workbook quality score, issues and acknowledgement without provider calls", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never);
    const quality = buildProjectWorkbookQualityGate({
      errors: [],
      warnings: [],
      sheets: [
        { sheetName: "ВОР", role: "works", enabled: true, overridden: false, confidence: 0.98, importedRows: 10, formulaCells: 4, hiddenRows: 0 },
        { sheetName: "Укрупн", role: "unknown", enabled: true, overridden: false, confidence: 0.35, importedRows: 0, formulaCells: 0, hiddenRows: 0 }
      ],
      budgetItems: 10,
      materials: 2,
      scheduleItems: 0,
      payrollItems: 0,
      equipmentItems: 0,
      estimatedDirectCost: 800,
      sourceDirectCost: 1000,
      reconciliationGap: 200,
      duplicateRows: 0
    });
    const html = renderToStaticMarkup(React.createElement(WorkbookQualityGatePanel, {
      quality,
      qualityConfirmed: false,
      mappingDirty: false,
      onConfirm: vi.fn()
    }));

    expect(html).toContain("Workbook import quality gate");
    expect(html).toContain("Проверка качества перед созданием проекта");
    expect(html).toContain("Есть разрыв со сводом прямых затрат");
    expect(html).toContain("Я проверил предупреждения");
    expect(html).toContain(`${quality.score}`);
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
