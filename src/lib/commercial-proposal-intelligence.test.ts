import { describe, expect, it } from "vitest";
import { buildCommercialProposalIntelligence } from "@/lib/commercial-proposal-intelligence";
import type { BudgetItem, ProjectDocument, ScheduleItem } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "b-work",
    projectId: "project-smoke",
    section: "Монолит",
    code: "1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 6000,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  },
  {
    id: "b-material",
    projectId: "project-smoke",
    section: "Материалы",
    code: "2",
    name: "Бетон B25",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 4200,
    actualUnitPrice: 0,
    forecastUnitPrice: 4200,
    kind: "material",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s-1",
    projectId: "project-smoke",
    budgetItemId: "b-work",
    name: "Монолит плиты",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-05",
    plannedQty: 100,
    actualQty: 40,
    status: "in_progress"
  }
];

const documents: ProjectDocument[] = [
  {
    id: "doc-contract",
    projectId: "project-smoke",
    category: "договор",
    title: "Договор ТЗ ВОР график реквизиты НДС 20%",
    filePath: "/dev/null",
    fileName: "contract-vor-schedule-vat-20.pdf",
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01T00:00:00.000Z"
  }
];

describe("commercial proposal intelligence", () => {
  it("does not claim customer-ready state for an empty project", () => {
    const model = buildCommercialProposalIntelligence({ project: { id: "empty" } });

    expect(model.readiness.status).toBe("no_data");
    expect(model.readiness.canSendToCustomer).toBe(false);
    expect(model.customerProposalDraft.copyText).toContain("Состав работ не подтвержден");
    expect(model.internalApprovalMemo.decision).toBe("not_ready");
  });

  it("builds deterministic price, scope, and VAT sections from project data", () => {
    const model = buildCommercialProposalIntelligence({
      project: {
        id: "project-smoke",
        name: "БЦ Север",
        customer: "ООО Заказчик",
        object: "Офисный центр",
        address: "Москва",
        contractAmount: 1_500_000,
        vatMode: "vat",
        startsAt: "2026-07-01",
        endsAt: "2026-08-01"
      },
      budgetItems,
      scheduleItems,
      documents
    });

    expect(model.priceSummary.totalAmount).toBe(1_500_000);
    expect(model.priceSummary.vatMode).toBe("included");
    expect(model.priceSummary.vatPercent).toBe(20);
    expect(model.scopeSummary.included).toContain("Монолит");
    expect(model.customerProposalDraft.copyText).toContain("Коммерческое предложение");
  });

  it("surfaces unpriced rows and missing submission documents as blockers", () => {
    const model = buildCommercialProposalIntelligence({
      project: { id: "project-smoke", name: "Объект", contractAmount: 100_000 },
      budgetItems: [{ ...budgetItems[0], id: "unpriced", qty: 0, plannedUnitPrice: 0, forecastUnitPrice: 0 }],
      scheduleItems: []
    });

    expect(model.readiness.status).toBe("needs_prices");
    expect(model.readiness.blockers.join(" ")).toContain("строк без цены");
    expect(model.workMaterialSplit.unpricedRows).toHaveLength(1);
    expect(model.submissionChecklist.missingCount).toBeGreaterThan(0);
  });

  it("keeps internal risk notes out of the customer-facing risk section when possible", () => {
    const model = buildCommercialProposalIntelligence({
      project: { id: "project-smoke", name: "Объект", contractAmount: 1_000_000, vatMode: "vat" },
      budgetItems,
      scheduleItems,
      documents,
      risks: [
        {
          id: "r-1",
          projectId: "project-smoke",
          title: "Штрафы по договору",
          reason: "Не согласованы лимиты ответственности",
          priority: "high",
          owner: "РП",
          dueAt: "2026-07-15",
          status: "open"
        }
      ]
    });

    expect(model.internalApprovalMemo.contractRisks.length).toBeGreaterThan(0);
    expect(model.customerProposalDraft.copyText).toContain("Черновик не является финальной офертой");
  });
});
