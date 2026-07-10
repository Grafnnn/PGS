import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FieldOperationsWorkspace } from "@/components/field-operations-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("FieldOperationsWorkspace", () => {
  it("renders field operations without provider calls or mutations", () => {
    const bundle = getProjectBundle("project-demo");
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(FieldOperationsWorkspace, {
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
        onNavigate
      })
    );

    expect(html).toContain("Field Operations &amp; Daily Reports");
    expect(html).toContain("Площадка / Рапорты");
    expect(html).toContain("Daily report snapshots");
    expect(html).toContain("Field signals");
    expect(html).toContain("Action register");
    expect(html).toContain("Weekly field handoff");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
