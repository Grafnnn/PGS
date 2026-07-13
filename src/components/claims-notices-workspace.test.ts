import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ClaimsNoticesWorkspace } from "@/components/claims-notices-workspace";

describe("ClaimsNoticesWorkspace", () => {
  it("renders a review-only notices workspace", () => {
    const html = renderToStaticMarkup(createElement(ClaimsNoticesWorkspace, { project: { id: "p", name: "Проект", contractAmount: 1_000_000 }, budgetItems: [], scheduleItems: [], materials: [], procurementRequests: [], payments: [], risks: [], documents: [], documentChecklist: [], onNavigate: () => undefined }));
    expect(html).toContain("Claims &amp; Notices");
    expect(html).toContain("Уведомления, претензии и договорные сроки");
    expect(html).toContain("Notice register");
  });
});
