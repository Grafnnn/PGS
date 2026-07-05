import { describe, expect, it } from "vitest";
import { buildContractTenderIntelligence } from "@/lib/contract-tender-intelligence";
import type { BudgetItem, ProjectDocument, ScheduleItem } from "@/lib/types";

const project = {
  id: "project-smoke",
  name: "Административное здание",
  contractAmount: 50_000_000,
  vatMode: "vat" as const,
  startsAt: "2026-07-01",
  endsAt: "2026-11-01"
};

const budgetItems: BudgetItem[] = [
  {
    id: "b1",
    projectId: "project-smoke",
    section: "Монолит",
    code: "M-1",
    name: "Бетонирование",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 180_000,
    actualUnitPrice: 180_000,
    forecastUnitPrice: 180_000,
    kind: "work",
    source: "fixture"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s1",
    projectId: "project-smoke",
    budgetItemId: "b1",
    name: "Монолитные работы",
    owner: "ПТО",
    startsAt: "2026-07-10",
    endsAt: "2026-08-10",
    plannedQty: 100,
    actualQty: 20,
    status: "in_progress"
  }
];

const documents: ProjectDocument[] = [
  {
    id: "doc-contract",
    projectId: "project-smoke",
    category: "договор",
    title: "Договор подряда",
    filePath: "/safe/contract.pdf",
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01"
  },
  {
    id: "doc-vor",
    projectId: "project-smoke",
    category: "смета",
    title: "ВОР и смета",
    filePath: "/safe/vor.xlsx",
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01"
  },
  {
    id: "doc-tt",
    projectId: "project-smoke",
    category: "тз",
    title: "Техническое задание",
    filePath: "/safe/tz.pdf",
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01"
  },
  {
    id: "doc-payment",
    projectId: "project-smoke",
    category: "оплата",
    title: "График оплат и аванс",
    filePath: "/safe/payment.pdf",
    version: 1,
    author: "Финансы",
    createdAt: "2026-07-01"
  }
];

describe("contract tender intelligence", () => {
  it("does not produce false green when source contract data is missing", () => {
    const model = buildContractTenderIntelligence({ project });

    expect(model.summary.readiness).toBe("missing_source");
    expect(model.summary.decision).toBe("insufficient_data");
    expect(model.summary.tone).toBe("bad");
    expect(model.risks.some((risk) => risk.id === "contract:missing-source")).toBe(true);
    expect(model.summary.dataLimitations.join(" ")).toContain("Не передан текст");
  });

  it("extracts payment, acceptance, penalties, scope and document signals from contract package", () => {
    const model = buildContractTenderIntelligence({
      project,
      budgetItems,
      scheduleItems,
      documents,
      contractText:
        "Договор предусматривает аванс 20%, оплату после подписания КС-2 и КС-3 в течение 10 рабочих дней. " +
        "Приемка выполняется актом, заказчик направляет мотивированный отказ с замечаниями. " +
        "Изменение объемов оформляется дополнительным соглашением. НДС включен. Неустойка не более 5% от цены договора."
    });

    expect(model.summary.readiness).toMatch(/ready/);
    expect(model.summary.criticalRisks).toBe(0);
    expect(model.terms.find((term) => term.key === "payment")).toMatchObject({ tone: "info" });
    expect(model.terms.find((term) => term.key === "acceptance")).toMatchObject({ tone: "good" });
    expect(model.terms.find((term) => term.key === "scope-change")).toMatchObject({ tone: "good" });
    expect(model.requiredDocuments.find((document) => document.key === "contract")).toMatchObject({ status: "present" });
    expect(model.managementMemo.copyText).toContain("Оплата и приемка");
  });

  it("flags uncapped penalties, missing change order and weak acceptance as management risks", () => {
    const model = buildContractTenderIntelligence({
      project,
      budgetItems,
      scheduleItems,
      documents: documents.slice(0, 2),
      contractText:
        "Оплата после подписания актов выполненных работ. За нарушение сроков подрядчик уплачивает пеню и штраф. " +
        "Срок выполнения указан календарным графиком."
    });

    expect(model.summary.readiness).toBe("risky");
    expect(model.risks.map((risk) => risk.id)).toEqual(
      expect.arrayContaining(["contract:uncapped-penalty", "contract:no-change-order", "contract:missing-critical-docs"])
    );
    expect(model.tenderReadiness.blockers.length).toBeGreaterThan(0);
    expect(model.actions.some((action) => action.ownerRole === "executive")).toBe(true);
  });

  it("flags negative margin before recommending a tender decision", () => {
    const expensiveBudget: BudgetItem[] = [
      { ...budgetItems[0], plannedUnitPrice: 600_000, forecastUnitPrice: 600_000 }
    ];
    const model = buildContractTenderIntelligence({
      project,
      budgetItems: expensiveBudget,
      scheduleItems,
      documents,
      contractText:
        "Договор с авансом и оплатой по КС-2/КС-3. Приемка с мотивированным отказом. Изменение объемов по дополнительному соглашению."
    });

    expect(model.summary.forecastProfit).toBeLessThan(0);
    expect(model.risks.some((risk) => risk.id === "contract:negative-margin" && risk.severity === "critical")).toBe(true);
    expect(model.summary.decision).toBe("do_not_sign_yet");
  });
});
