import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AcceptanceBillingWorkspace } from "@/components/acceptance-billing-workspace";
import type { BudgetItem, ProjectDocument, ScheduleItem } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "b-1",
    projectId: "project-smoke",
    section: "Монолит",
    code: "1",
    name: "Бетонирование плиты",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 6200,
    actualUnitPrice: 0,
    forecastUnitPrice: 6200,
    kind: "work",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "s-1",
    projectId: "project-smoke",
    budgetItemId: "b-1",
    name: "Монолит плиты",
    owner: "РП",
    startsAt: "2026-07-01",
    endsAt: "2026-07-05",
    plannedQty: 100,
    actualQty: 25,
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

describe("AcceptanceBillingWorkspace", () => {
  it("renders acceptance and billing workflow without provider calls", () => {
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(AcceptanceBillingWorkspace, {
        project: { id: "project-smoke", name: "Smoke project" },
        budgetItems,
        scheduleItems,
        materials: [],
        procurementRequests: [],
        payments: [],
        risks: [],
        documents,
        documentChecklist: [],
        importHistory: [],
        onNavigate
      })
    );

    expect(html).toContain("Acceptance &amp; Billing Workflow");
    expect(html).toContain("КС package draft");
    expect(html).toContain("Ready to bill");
    expect(html).toContain("Billing cashflow impact");
    expect(html).toContain("Acceptance risks");
    expect(html).toContain("Next actions");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders no-data state without claiming ready package", () => {
    const html = renderToStaticMarkup(
      createElement(AcceptanceBillingWorkspace, {
        project: { id: "empty" },
        budgetItems: [],
        scheduleItems: [],
        materials: [],
        procurementRequests: [],
        payments: [],
        risks: [],
        documents: [],
        documentChecklist: [],
        importHistory: [],
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("status: no_data");
    expect(html).toContain("Нет строк для КС");
    expect(html).not.toContain("status: ready_for_review");
  });
});
