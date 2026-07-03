import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { RiskExecutiveWorkspace } from "@/components/risk-executive-workspace";
import type { RiskExecutiveImportHistoryItem } from "@/lib/risk-executive-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, Risk, ScheduleItem } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "b-1",
    projectId: "project-smoke",
    section: "Монолит",
    code: "1",
    name: "Бетонирование",
    unit: "м3",
    qty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  }
];

const materials: Material[] = [
  {
    id: "m-1",
    projectId: "project-smoke",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 20,
    orderedQty: 0,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-07-10",
    status: "required"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s-1",
    projectId: "project-smoke",
    name: "Монолит",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-05",
    plannedQty: 100,
    actualQty: 10,
    status: "delayed"
  }
];

const importHistory: RiskExecutiveImportHistoryItem[] = [
  {
    id: "batch-1",
    fileName: "vor.xlsx",
    status: "committed",
    committedAt: "2026-07-01T10:00:00.000Z",
    preview: {
      summary: {
        totalRows: 2,
        parsedRows: 1,
        readyRows: 0,
        warningRows: 1,
        errorRows: 0,
        skippedRows: 0,
        ignoredRows: 0,
        sections: 1,
        budgetItems: 1,
        materials: 0,
        scheduleItems: 0,
        workRows: 1,
        materialRows: 0,
        unknownRows: 1,
        duplicateRows: 0,
        hiddenRows: 0,
        formulaCells: 0,
        errors: 0,
        warnings: 1
      },
      unknownRows: [{ sheetName: "ВОР", rowNumber: 9, reason: "unknown", values: ["?"] }],
      previewRows: []
    }
  }
];

describe("RiskExecutiveWorkspace", () => {
  it("renders risk register, decisions, actions and copyable executive report without auto AI calls", () => {
    const onRunExecutiveAi = vi.fn();
    const html = renderToStaticMarkup(
      createElement(RiskExecutiveWorkspace, {
        project: { id: "project-smoke", name: "Smoke project", startsAt: "2026-07-01", contractAmount: 50_000_000 },
        budgetItems,
        scheduleItems,
        materials,
        procurementRequests: [] satisfies ProcurementRequest[],
        payments: [] satisfies Payment[],
        dailyReports: [],
        risks: [] satisfies Risk[],
        readiness: null,
        documentChecklist: [],
        intelligence: null,
        importHistory,
        onNavigate: vi.fn(),
        onRunExecutiveAi
      })
    );

    expect(html).toContain("Risks &amp; Executive Reports");
    expect(html).toContain("Risk Register");
    expect(html).toContain("Decision Register");
    expect(html).toContain("Recommended Actions");
    expect(html).toContain("Executive Weekly Report");
    expect(html).toContain("Copyable report text");
    expect(html).toContain("не вызывается при рендере");
    expect(html).toContain("Есть нераспознанные строки ВОР");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(onRunExecutiveAi).not.toHaveBeenCalled();
  });

  it("renders useful empty/degraded state without claiming risk-free certainty", () => {
    const html = renderToStaticMarkup(
      createElement(RiskExecutiveWorkspace, {
        project: { id: "empty" },
        budgetItems: [],
        scheduleItems: [],
        materials: [],
        procurementRequests: [],
        payments: [],
        dailyReports: [],
        risks: [],
        readiness: null,
        documentChecklist: [],
        intelligence: null,
        importHistory: [],
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Нет ВОР / сметы");
    expect(html).toContain("Report readiness");
    expect(html).toContain("Недостаточно");
    expect(html).not.toContain("Проект без рисков");
  });
});
