import { describe, expect, it } from "vitest";
import { buildSubcontractorExecutionIntelligence } from "@/lib/subcontractor-execution-intelligence";
import type { BudgetItem, Payment, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "sub-1",
    projectId: "project-smoke",
    section: "Монтаж",
    code: "1",
    name: "Монтаж металлоконструкций",
    unit: "т",
    qty: 20,
    plannedUnitPrice: 120_000,
    actualUnitPrice: 0,
    forecastUnitPrice: 125_000,
    kind: "subcontract",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "front-1",
    projectId: "project-smoke",
    budgetItemId: "sub-1",
    name: "Монтаж каркаса",
    owner: "ООО Монтаж",
    startsAt: "2026-07-01",
    endsAt: "2026-07-10",
    plannedQty: 20,
    actualQty: 6,
    status: "delayed"
  },
  {
    id: "front-2",
    projectId: "project-smoke",
    name: "Пусконаладка",
    owner: "",
    startsAt: "2026-07-11",
    endsAt: "2026-07-12",
    plannedQty: 1,
    actualQty: 0,
    status: "not_started"
  }
];

const payments: Payment[] = [
  {
    id: "pay-1",
    projectId: "project-smoke",
    title: "Аванс подрядчику",
    counterparty: "ООО Монтаж",
    direction: "outgoing",
    plannedAt: "2026-07-05",
    amount: 500_000,
    status: "overdue",
    category: "subcontractor"
  }
];

const documents: ProjectDocument[] = [
  {
    id: "doc-1",
    projectId: "project-smoke",
    category: "договор",
    title: "Договор подряда ООО Монтаж",
    filePath: "/dev/null",
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01T00:00:00.000Z"
  }
];

const risks: Risk[] = [
  {
    id: "risk-1",
    projectId: "project-smoke",
    title: "Срыв фронта подрядчиком",
    reason: "Бригада не вышла на объект.",
    priority: "high",
    owner: "ООО Монтаж",
    dueAt: "2026-07-08",
    status: "open"
  }
];

describe("subcontractor execution intelligence", () => {
  it("does not claim green execution when there is no execution data", () => {
    const model = buildSubcontractorExecutionIntelligence({ project: { id: "empty" } });

    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
    expect(model.actions[0].title).toContain("Назначить");
    expect(model.handoff.copyText).toContain("Нет данных исполнения");
  });

  it("surfaces delayed fronts, unassigned owners, overdue payments, and document blockers", () => {
    const model = buildSubcontractorExecutionIntelligence({
      project: { id: "project-smoke", name: "Smoke project" },
      budgetItems,
      scheduleItems,
      payments,
      risks,
      documents,
      documentChecklist: [
        {
          key: "act",
          title: "Акт выполненных работ подрядчика",
          status: "missing",
          categoryHints: ["акт"],
          documentIds: [],
          evidence: [],
          suggestedNextStep: "Получить акт от подрядчика"
        }
      ]
    });

    expect(model.summary.status).toBe("needs_assignment");
    expect(model.summary.unassignedItems).toBe(1);
    expect(model.summary.delayedFronts).toBe(1);
    expect(model.summary.overduePayments).toBe(500_000);
    expect(model.summary.documentBlockers).toBe(1);
    expect(model.contractors[0].name).toBe("ООО Монтаж");
    expect(model.contractors[0].tone).toBe("bad");
    expect(model.fronts[0].blockers.join(" ")).toContain("просрочке");
    expect(model.actions.some((action) => action.targetTab === "Документы")).toBe(true);
  });

  it("builds a management handoff without leaking internal secrets", () => {
    const model = buildSubcontractorExecutionIntelligence({
      project: { id: "project-smoke", name: "Smoke project" },
      budgetItems,
      scheduleItems: scheduleItems.slice(0, 1),
      payments,
      documents
    });

    expect(model.handoff.copyText).toContain("Execution control");
    expect(model.handoff.copyText).toContain("ООО Монтаж");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
    expect(model.handoff.copyText).not.toContain("OPENAI_API_KEY");
  });
});
