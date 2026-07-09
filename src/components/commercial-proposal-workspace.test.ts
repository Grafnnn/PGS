import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { CommercialProposalWorkspace } from "@/components/commercial-proposal-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("CommercialProposalWorkspace", () => {
  it("renders proposal, memo, and tender checklist without provider calls", () => {
    const bundle = getProjectBundle("project-demo");
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(CommercialProposalWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        documents: [],
        readiness: null,
        documentChecklist: [],
        importHistory: [],
        onNavigate
      })
    );

    expect(html).toContain("Commercial Proposal &amp; Tender Submission");
    expect(html).toContain("КП / Подача");
    expect(html).toContain("Proposal readiness");
    expect(html).toContain("Price structure");
    expect(html).toContain("Work/material split");
    expect(html).toContain("Customer-facing proposal draft");
    expect(html).toContain("Internal approval memo");
    expect(html).toContain("Tender submission checklist");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
