import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CostCodeWorkspace } from "./cost-code-workspace";

describe("CostCodeWorkspace", () => {
  it("renders the guarded dry-run and mapping workspace without adding navigation", () => {
    const html = renderToStaticMarkup(createElement(CostCodeWorkspace, { projectId: "project-1", canEdit: true, canManage: true }));
    expect(html).toContain("Cost Codes / CBS-WBS v1");
    expect(html).toContain("Построить dry-run");
    expect(html).toContain("Baseline из ВОР");
    expect(html).toContain("Ручной код");
    expect(html).toContain("Покрытие модулей");
    expect(html).toContain("ВОР");
    expect(html).toContain("Платежи");
  });

  it("disables write controls for a viewer", () => {
    const html = renderToStaticMarkup(createElement(CostCodeWorkspace, { projectId: "project-1", canEdit: false, canManage: false }));
    expect(html).toContain("disabled");
    expect(html).not.toContain("Удалить неиспользуемый код");
  });
});
