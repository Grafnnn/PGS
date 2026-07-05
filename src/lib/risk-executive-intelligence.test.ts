import { describe, expect, it } from "vitest";
import {
  buildActionRegister,
  buildDecisionRegister,
  buildExecutiveWeeklyReport,
  buildProjectRiskRegister,
  buildRiskExecutiveIntelligence,
  buildRiskSignalsFromAcceptance,
  buildRiskSignalsFromCashflow,
  buildRiskSignalsFromDocuments,
  buildRiskSignalsFromImport,
  buildRiskSignalsFromProcurement,
  buildRiskSignalsFromSchedule,
  buildRiskSummary,
  type RiskExecutiveImportHistoryItem
} from "@/lib/risk-executive-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, Risk, ScheduleItem } from "@/lib/types";

const project: Partial<Project> = {
  id: "project-smoke",
  name: "Административное здание",
  contractAmount: 50_000_000,
  startsAt: "2026-07-01",
  endsAt: "2026-10-01"
};

const budgetItems: BudgetItem[] = [
  {
    id: "b-1",
    projectId: "project-smoke",
    section: "Монолит",
    code: "1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 0,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  },
  {
    id: "b-2",
    projectId: "project-smoke",
    section: "Монолит",
    code: "2",
    name: "Арматура",
    unit: "т",
    qty: 12,
    plannedUnitPrice: 0,
    actualUnitPrice: 0,
    forecastUnitPrice: 0,
    kind: "material",
    source: "test"
  }
];

const materials: Material[] = [
  {
    id: "m-1",
    projectId: "project-smoke",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 50,
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
    name: "Монолит плиты",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-07",
    plannedQty: 100,
    actualQty: 20,
    status: "delayed"
  }
];

const payments: Payment[] = [
  {
    id: "p-1",
    projectId: "project-smoke",
    title: "Оплата бетона",
    counterparty: "Поставщик",
    direction: "outgoing",
    plannedAt: "2026-07-08",
    amount: 1_200_000,
    status: "overdue",
    category: "supplier"
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
        totalRows: 4,
        parsedRows: 3,
        readyRows: 1,
        warningRows: 2,
        errorRows: 0,
        skippedRows: 1,
        ignoredRows: 0,
        sections: 1,
        budgetItems: 2,
        materials: 1,
        scheduleItems: 0,
        workRows: 1,
        materialRows: 1,
        unknownRows: 1,
        duplicateRows: 0,
        hiddenRows: 0,
        formulaCells: 0,
        errors: 0,
        warnings: 2
      },
      unknownRows: [{ sheetName: "ВОР", rowNumber: 10, reason: "unknown", values: ["???"] }],
      previewRows: [
        {
          id: "r-1",
          sheetName: "ВОР",
          sourceRowNumber: 5,
          status: "warning",
          entityType: "budgetItem",
          section: "Монолит",
          name: "Бетонирование",
          unit: "м3",
          quantity: 0,
          unitPrice: 6200,
          totalAmount: 0,
          normalizedJson: {},
          warnings: ["Нет количества"],
          errors: [],
          suspiciousFlags: ["missingQuantity"]
        },
        {
          id: "r-2",
          sheetName: "ВОР",
          sourceRowNumber: 6,
          status: "skipped",
          entityType: "section",
          section: "Итого",
          normalizedJson: {},
          warnings: [],
          errors: [],
          suspiciousFlags: ["skippedTotalRow"]
        }
      ]
    }
  }
];

describe("risk executive intelligence", () => {
  it("handles empty/null data without false green status", () => {
    const model = buildRiskExecutiveIntelligence({ project: { id: "empty" } });

    expect(model.summary.missingSources).toEqual(expect.arrayContaining(["ВОР", "Documents", "Procurement", "Schedule", "Cashflow"]));
    expect(model.executiveReport.status).toBe("unknown");
    expect(model.executiveReport.reportReadiness).toBe("no_data");
    expect(model.executiveReport.copyText).toContain("Недостаточно");
    expect(model.risks.some((risk) => risk.title.includes("Нет ВОР"))).toBe(true);
  });

  it("turns import unknown rows, missing quantities and missing prices into data-quality risks", () => {
    const risks = buildRiskSignalsFromImport({ project, budgetItems, importHistory });

    expect(risks.map((risk) => risk.id)).toEqual(expect.arrayContaining(["import:unknown-rows", "import:missing-quantities", "import:missing-prices", "import:warning-rows"]));
    expect(risks.find((risk) => risk.id === "import:missing-prices")?.decisionRequired).toBe(true);
    expect(risks.find((risk) => risk.id === "import:warning-rows")?.evidence.join(" ")).toContain("subtotal/skipped rows ignored");
  });

  it("builds procurement risks without treating warning rows as ready materials", () => {
    const risks = buildRiskSignalsFromProcurement({ project, materials, procurementRequests: [], importHistory });

    expect(risks.some((risk) => risk.id === "procurement:deficit-candidates")).toBe(true);
    expect(risks.some((risk) => risk.ownerRole === "procurement")).toBe(true);
  });

  it("builds schedule risks from delayed work and blocked packages without inventing dates", () => {
    const risks = buildRiskSignalsFromSchedule({ project, budgetItems, scheduleItems, materials, procurementRequests: [], importHistory });

    expect(risks.map((risk) => risk.id)).toEqual(expect.arrayContaining(["schedule:delayed-work", "schedule:blocked-packages"]));
    expect(risks.find((risk) => risk.id === "schedule:delayed-work")?.decisionText).toContain("восстановительный план");
  });

  it("builds cashflow risks only from supported amounts and overdue payments", () => {
    const risks = buildRiskSignalsFromCashflow({ project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });

    expect(risks.map((risk) => risk.id)).toContain("cashflow:overdue-payments");
    expect(risks.find((risk) => risk.id === "cashflow:overdue-payments")?.evidence.join(" ")).toContain("1,2 млн");
  });

  it("uses missing required documents for report readiness", () => {
    const risks = buildRiskSignalsFromDocuments({
      documentChecklist: [
        { key: "contract", title: "Договор", status: "missing", categoryHints: ["договор"], documentIds: [], evidence: [], suggestedNextStep: "Загрузить договор" },
        { key: "estimate", title: "Смета / ВОР", status: "present", categoryHints: ["вор"], documentIds: ["doc-1"], evidence: [], suggestedNextStep: "Ок" }
      ]
    });

    expect(risks[0].severity).toBe("high");
    expect(risks[0].decisionRequired).toBe(true);
  });

  it("adds acceptance and billing blockers to risk register", () => {
    const risks = buildRiskSignalsFromAcceptance({ project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });

    expect(risks.map((risk) => risk.id)).toEqual(expect.arrayContaining(["acceptance:missing-fact", "acceptance:document-blockers"]));
    expect(risks.some((risk) => risk.sourceArea === "Acceptance")).toBe(true);
  });

  it("creates decision and action registers with generic roles and no invented people", () => {
    const risks = buildProjectRiskRegister({ project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });
    const summary = buildRiskSummary(risks, { project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });
    const decisions = buildDecisionRegister(risks);
    const actions = buildActionRegister(risks, decisions);

    expect(summary.decisionRequired).toBeGreaterThan(0);
    expect(decisions[0].decisionOwnerRole).not.toMatch(/Иван|Петр|Сидор/i);
    expect(decisions[0].requiredBy).toMatch(/before/);
    expect(actions.some((action) => action.linkedRiskId && action.linkedDecisionId)).toBe(true);
  });

  it("builds deterministic Russian executive report with explicit limitations", () => {
    const risks = buildProjectRiskRegister({ project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });
    const summary = buildRiskSummary(risks, { project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory });
    const decisions = buildDecisionRegister(risks);
    const actions = buildActionRegister(risks, decisions);
    const report = buildExecutiveWeeklyReport({ project, budgetItems, scheduleItems, materials, procurementRequests: [], payments, importHistory }, risks, summary, decisions, actions);

    expect(report.copyText).toContain("Статус проекта");
    expect(report.copyText).toContain("Снабжение");
    expect(report.copyText).toContain("Финансы / cashflow");
    expect(report.copyText).toContain("Решения руководства");
    expect(report.copyText).not.toContain("undefined");
    expect(report.copyText).not.toContain("DATABASE_URL");
  });

  it("keeps existing manual risks and marks high manual risks as decisions", () => {
    const manualRisks: Risk[] = [
      { id: "risk-1", projectId: "project-smoke", title: "Неподписанный акт", reason: "Заказчик не подписал акт.", priority: "high", owner: "РП", dueAt: "2026-07-05", status: "open" }
    ];
    const model = buildRiskExecutiveIntelligence({ project, risks: manualRisks, budgetItems });

    expect(model.risks.some((risk) => risk.id === "manual:risk-1")).toBe(true);
    expect(model.decisions.some((decision) => decision.sourceRiskId === "manual:risk-1")).toBe(true);
  });
});
