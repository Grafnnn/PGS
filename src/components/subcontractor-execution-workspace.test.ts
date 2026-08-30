import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SubcontractorExecutionWorkspace } from "@/components/subcontractor-execution-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("SubcontractorExecutionWorkspace", () => {
  it("renders execution control without provider calls or mutations", () => {
    const bundle = getProjectBundle("project-demo");
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(SubcontractorExecutionWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        payments: bundle.payments,
        procurementRequests: bundle.procurementRequests,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        documents: [],
        documentChecklist: [],
        onNavigate
      })
    );

    expect(html).toContain("Подрядчики и контроль исполнения");
    expect(html).toContain("Подрядчики / Исполнение");
    expect(html).toContain("Подрядчики и ответственные");
    expect(html).toContain("Фронты работ");
    expect(html).toContain("Реестр действий");
    expect(html).toContain("Execution handoff");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
