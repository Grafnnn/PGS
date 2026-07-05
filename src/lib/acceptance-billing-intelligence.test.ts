import { describe, expect, it } from "vitest";
import { buildAcceptanceBillingIntelligence } from "@/lib/acceptance-billing-intelligence";
import type { BudgetItem, Material, Payment, Project, ProjectDocument, ScheduleItem } from "@/lib/types";

const project: Partial<Project> = {
  id: "project-smoke",
  name: "Smoke object",
  contractAmount: 50_000_000,
  startsAt: "2026-07-01",
  endsAt: "2026-10-01"
};

const budgetItems: BudgetItem[] = [
  {
    id: "b-structure",
    projectId: "project-smoke",
    section: "Монолитные работы",
    code: "2.1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  },
  {
    id: "b-no-fact",
    projectId: "project-smoke",
    section: "Отделочные работы",
    code: "5.1",
    name: "Штукатурка стен",
    unit: "м2",
    qty: 300,
    plannedUnitPrice: 900,
    actualUnitPrice: 0,
    forecastUnitPrice: 900,
    kind: "work",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s-structure",
    projectId: "project-smoke",
    budgetItemId: "b-structure",
    name: "Монолит плиты",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-07",
    plannedQty: 100,
    actualQty: 30,
    status: "in_progress"
  }
];

const documents: ProjectDocument[] = [
  {
    id: "doc-all",
    projectId: "project-smoke",
    category: "исполнительная",
    title: "Договор ВОР график финансирования акт скрытых работ исполнительная схема сертификат фото КС",
    filePath: "/dev/null",
    fileName: "contract-vor-schedule-hidden-works-executive-scheme-certificate-photo-ks.pdf",
    mimeType: "application/pdf",
    sizeBytes: 1000,
    version: 1,
    author: "ПТО",
    createdAt: "2026-07-01T00:00:00.000Z"
  }
];

const materials: Material[] = [
  {
    id: "m-concrete",
    projectId: "project-smoke",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 30,
    orderedQty: 30,
    deliveredQty: 30,
    consumedQty: 30,
    plannedUnitPrice: 6200,
    actualUnitPrice: 6200,
    supplier: "Бетон",
    neededAt: "2026-07-01",
    status: "delivered"
  }
];

const payments: Payment[] = [
  {
    id: "pay-customer-plan",
    projectId: "project-smoke",
    title: "План оплаты заказчика",
    counterparty: "Заказчик",
    direction: "incoming",
    plannedAt: "2026-07-15",
    amount: 200_000,
    status: "planned",
    category: "customer"
  }
];

describe("acceptance billing intelligence", () => {
  it("does not create a false ready state without project data", () => {
    const model = buildAcceptanceBillingIntelligence({ project: { id: "empty" } });

    expect(model.summary.status).toBe("no_data");
    expect(model.summary.readyAmount).toBe(0);
    expect(model.summary.candidateItems).toBe(0);
    expect(model.packageDraft.limitations.join(" ")).toContain("Официальные печатные формы");
  });

  it("calculates ready-to-bill amount only from confirmed fact and keeps no-fact rows blocked", () => {
    const model = buildAcceptanceBillingIntelligence({ project, budgetItems, scheduleItems, materials, payments, documents });

    expect(model.summary.readyItems).toBe(1);
    expect(model.summary.readyAmount).toBe(186_000);
    expect(model.packageDraft.readyItems[0]?.title).toBe("Монолит плиты");
    expect(model.items.find((item) => item.sourceId === "b-no-fact")?.status).toBe("needs_fact");
    expect(model.cashflowImpact.readyToInvoice).toBe(186_000);
  });

  it("blocks billing when closeout documents are missing even if fact exists", () => {
    const model = buildAcceptanceBillingIntelligence({ project, budgetItems: budgetItems.slice(0, 1), scheduleItems, materials });

    expect(model.summary.readyItems).toBe(0);
    expect(model.summary.blockedAmount).toBe(186_000);
    expect(model.summary.documentBlockers).toBeGreaterThan(0);
    expect(model.risks.some((risk) => risk.id === "acceptance:document-blockers")).toBe(true);
  });
});
