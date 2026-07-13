import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QualityIssuesWorkspace } from "@/components/quality-issues-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("QualityIssuesWorkspace", () => {
  it("renders the quality register without provider calls or write actions", () => {
    const bundle = getProjectBundle("project-smoke");
    const html = renderToStaticMarkup(
      createElement(QualityIssuesWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        documents: [],
        documentChecklist: [],
        onNavigate: vi.fn()
      })
    );

    expect(html).toContain("Quality / Issues &amp; Punch List");
    expect(html).toContain("Качество / Замечания");
    expect(html).toContain("Issue register");
    expect(html).toContain("Punch actions");
    expect(html).toContain("Quality handoff");
    expect(html).toContain("Ограничения v1");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
