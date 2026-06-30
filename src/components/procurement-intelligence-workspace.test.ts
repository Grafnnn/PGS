import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProcurementIntelligenceWorkspace } from "@/components/procurement-intelligence-workspace";
import type { ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import type { Material, ProcurementRequest } from "@/lib/types";

const materials: Material[] = [
  {
    id: "mat-1",
    projectId: "project-demo",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 12,
    orderedQty: 2,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-07-10",
    status: "required"
  }
];

const importHistory: ProcurementImportHistoryItem[] = [
  {
    id: "batch-1",
    fileName: "vor.xlsx",
    status: "committed",
    committedAt: "2026-07-01T10:00:00.000Z",
    preview: {
      summary: {
        totalRows: 1,
        parsedRows: 1,
        readyRows: 1,
        warningRows: 0,
        errorRows: 0,
        skippedRows: 0,
        ignoredRows: 0,
        sections: 1,
        budgetItems: 0,
        materials: 1,
        scheduleItems: 0,
        workRows: 0,
        materialRows: 1,
        unknownRows: 0,
        duplicateRows: 0,
        hiddenRows: 0,
        formulaCells: 0,
        errors: 0,
        warnings: 0
      },
      unknownRows: [],
      previewRows: [
        {
          id: "row-1",
          sheetName: "ВОР",
          sourceRowNumber: 4,
          status: "ready",
          entityType: "material",
          section: "Монолит",
          name: "Бетон В25",
          unit: "м3",
          quantity: 12,
          unitPrice: 6200,
          totalAmount: 74_400,
          normalizedJson: {},
          warnings: [],
          errors: [],
          suspiciousFlags: []
        }
      ]
    }
  }
];

describe("ProcurementIntelligenceWorkspace", () => {
  it("renders procurement candidates and draft copy without auto-running actions", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ProcurementIntelligenceWorkspace, {
        projectName: "Demo",
        materials,
        procurementRequests: [] satisfies ProcurementRequest[],
        importHistory,
        draft: null,
        loading: "",
        onPreview,
        onCommit,
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Procurement &amp; Materials Intelligence");
    expect(html).toContain("Материалы из ВОР");
    expect(html).toContain("Кандидаты в заявку");
    expect(html).toContain("Черновик заявки снабжению");
    expect(html).toContain("Заявка снабжению по проекту: Demo");
    expect(html).toContain("Preview заявок");
    expect(html).toContain("Создать черновики");
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("shows empty/review state safely without leaking secret-like strings", () => {
    const html = renderToStaticMarkup(
      createElement(ProcurementIntelligenceWorkspace, {
        projectName: "Empty",
        materials: [],
        procurementRequests: [],
        importHistory: [],
        draft: null,
        loading: "",
        onPreview: vi.fn(),
        onCommit: vi.fn(),
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Нужен импорт");
    expect(html).toContain("Нет валидных строк для заявки");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("sk-");
  });
});
