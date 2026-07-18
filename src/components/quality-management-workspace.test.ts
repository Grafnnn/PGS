import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { QualityManagementWorkspace } from "@/components/quality-management-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("QualityManagementWorkspace", () => {
  it("renders the managed register without provider or API calls during render", () => {
    const bundle = getProjectBundle("project-smoke");
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const html = renderToStaticMarkup(createElement(QualityManagementWorkspace, {
      projectId: bundle.project.id,
      scheduleItems: bundle.scheduleItems,
      dailyReports: bundle.dailyReports,
      documents: [],
      canEdit: true,
      canApprove: true,
      onNavigate: vi.fn()
    }));

    expect(html).toContain("Quality Management v2");
    expect(html).toContain("Инспекции, NCR и Punch List");
    expect(html).toContain("Открытые NCR / Punch");
    expect(html).toContain("Инспекции");
    expect(html).toContain("Замечание");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");

    vi.unstubAllGlobals();
  });

  it("keeps mutation controls hidden for viewers", () => {
    const bundle = getProjectBundle("project-smoke");
    const html = renderToStaticMarkup(createElement(QualityManagementWorkspace, {
      projectId: bundle.project.id,
      scheduleItems: bundle.scheduleItems,
      dailyReports: bundle.dailyReports,
      documents: [],
      canEdit: false,
      canApprove: false,
      onNavigate: vi.fn()
    }));

    expect(html).toContain("Quality Management v2");
    expect(html).not.toContain("<button class=\"button primary compact-button\"");
  });
});
