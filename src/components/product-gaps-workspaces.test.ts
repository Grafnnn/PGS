import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CostForecastByCodeWorkspace } from "@/components/cost-forecast-by-code-workspace";
import { ExternalCollaborationWorkspace } from "@/components/external-collaboration-workspace";
import { InvoiceReconciliationWorkspace } from "@/components/invoice-reconciliation-workspace";

describe("product gap workspaces", () => {
  it("renders scoped external collaboration for administrators only", () => {
    const ownerHtml = renderToStaticMarkup(createElement(ExternalCollaborationWorkspace, { projectId: "project-1", canManage: true }));
    expect(ownerHtml).toContain("Внешние согласования");
    expect(ownerHtml).toContain("Одноразовая ссылка");
    const viewerHtml = renderToStaticMarkup(createElement(ExternalCollaborationWorkspace, { projectId: "project-1", canManage: false }));
    expect(viewerHtml).toBe("");
  });

  it("renders the cost-code forecast as read-only intelligence", () => {
    const html = renderToStaticMarkup(createElement(CostForecastByCodeWorkspace, { projectId: "project-1" }));
    expect(html).toContain("Прогноз затрат по кодам");
    expect(html).toContain("не создаёт финансовых операций");
  });

  it("renders AP and AR reconciliation without an automatic payment action", () => {
    const html = renderToStaticMarkup(createElement(InvoiceReconciliationWorkspace, { projectId: "project-1", canEdit: true, canDelete: true }));
    expect(html).toContain("Счета и сверка AP / AR");
    expect(html).toContain("Платежи автоматически не создаются");
    expect(html).not.toContain("Создать платёж");
  });
});
