import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DocumentComplianceWorkspace } from "@/components/document-compliance-workspace";
import type { BudgetItem, Material, ProcurementRequest, ScheduleItem } from "@/lib/types";

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
    actualQty: 20,
    status: "delayed"
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
    neededAt: "2026-07-04",
    status: "required"
  }
];

describe("DocumentComplianceWorkspace", () => {
  it("renders compliance panels without making AI/provider calls", () => {
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(DocumentComplianceWorkspace, {
        project: { id: "project-smoke", name: "Smoke project" },
        budgetItems,
        scheduleItems,
        materials,
        procurementRequests: [] satisfies ProcurementRequest[],
        payments: [],
        risks: [],
        documents: [],
        documentChecklist: [],
        importHistory: [],
        onNavigate
      })
    );

    expect(html).toContain("Documents &amp; Executive Compliance");
    expect(html).toContain("Required Documents Checklist");
    expect(html).toContain("Missing Documents");
    expect(html).toContain("Work Package Document Map");
    expect(html).toContain("КС / Closeout Readiness");
    expect(html).toContain("Executive Document Package");
    expect(html).toContain("Weekly Document Collection Plan");
    expect(html).toContain("Compliance Risks");
    expect(html).toContain("Акт освидетельствования скрытых работ");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });

  it("renders no-data state without false ready claim", () => {
    const html = renderToStaticMarkup(
      createElement(DocumentComplianceWorkspace, {
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

    expect(html).toContain("readiness: no_data");
    expect(html).toContain("Нет исходных данных");
    expect(html).not.toContain("readiness: ready");
  });
});
