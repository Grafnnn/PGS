import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ScheduleCashflowWorkspace } from "@/components/schedule-cashflow-workspace";
import type { BudgetItem, Material } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "budget-1",
    projectId: "project-demo",
    section: "Монолитные работы",
    code: "M-1",
    name: "Бетонирование",
    unit: "м3",
    qty: 10,
    plannedUnitPrice: 7000,
    actualUnitPrice: 0,
    forecastUnitPrice: 7000,
    kind: "work",
    source: "test"
  }
];

const materials: Material[] = [
  {
    id: "mat-1",
    projectId: "project-demo",
    name: "Бетон В25",
    unit: "м3",
    requiredQty: 10,
    orderedQty: 0,
    deliveredQty: 0,
    consumedQty: 0,
    plannedUnitPrice: 6500,
    actualUnitPrice: 0,
    supplier: "Не выбран",
    neededAt: "2026-07-10",
    status: "required"
  }
];

describe("ScheduleCashflowWorkspace", () => {
  it("renders work packages, cashflow, and manual draft actions without auto-running handlers", () => {
    const onSchedulePreview = vi.fn();
    const onScheduleCommit = vi.fn();
    const onCashflowPreview = vi.fn();
    const onCashflowCommit = vi.fn();

    const html = renderToStaticMarkup(
      createElement(ScheduleCashflowWorkspace, {
        projectName: "Demo",
        projectStartsAt: "2026-07-01",
        projectEndsAt: "2026-10-01",
        contractAmount: 1_000_000,
        budgetItems,
        scheduleItems: [],
        materials,
        procurementRequests: [],
        payments: [],
        importHistory: [],
        draft: null,
        loading: "",
        onSchedulePreview,
        onScheduleCommit,
        onCashflowPreview,
        onCashflowCommit,
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Schedule &amp; Cashflow Intelligence");
    expect(html).toContain("График работ");
    expect(html).toContain("Пакеты работ");
    expect(html).toContain("Недельный график");
    expect(html).toContain("Cashflow по неделям");
    expect(html).toContain("Executive weekly plan");
    expect(html).toContain("Preview графика");
    expect(html).toContain("Preview cashflow");
    expect(onSchedulePreview).not.toHaveBeenCalled();
    expect(onScheduleCommit).not.toHaveBeenCalled();
    expect(onCashflowPreview).not.toHaveBeenCalled();
    expect(onCashflowCommit).not.toHaveBeenCalled();
  });

  it("renders empty state safely and does not leak secret-like strings", () => {
    const html = renderToStaticMarkup(
      createElement(ScheduleCashflowWorkspace, {
        projectName: "Empty",
        contractAmount: 0,
        budgetItems: [],
        scheduleItems: [],
        materials: [],
        procurementRequests: [],
        payments: [],
        importHistory: [],
        draft: null,
        loading: "",
        onSchedulePreview: vi.fn(),
        onScheduleCommit: vi.fn(),
        onCashflowPreview: vi.fn(),
        onCashflowCommit: vi.fn(),
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Нужен ВОР");
    expect(html).toContain("Нет пакетов");
    expect(html).toContain("Cashflow появится");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toMatch(/sk-(proj|live|test|[A-Za-z0-9]{12,})/);
  });
});
