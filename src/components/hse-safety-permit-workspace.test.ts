import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { HseSafetyPermitWorkspace } from "@/components/hse-safety-permit-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("HseSafetyPermitWorkspace", () => {
  it("renders the read-only HSE workspace without provider calls", () => {
    const bundle = getProjectBundle("project-smoke");
    const html = renderToStaticMarkup(createElement(HseSafetyPermitWorkspace, { project: bundle.project, scheduleItems: bundle.scheduleItems, dailyReports: bundle.dailyReports, risks: bundle.risks, documents: [], documentChecklist: [], onNavigate: vi.fn() }));
    expect(html).toContain("HSE / Safety &amp; Permit Compliance");
    expect(html).toContain("ОТиПБ / Допуски");
    expect(html).toContain("HSE signal register");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
