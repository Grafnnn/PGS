import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CostToCompleteWorkspace } from "@/components/cost-to-complete-workspace";

describe("CostToCompleteWorkspace", () => {
  it("renders the forecast workspace without invoking a provider", () => {
    const html = renderToStaticMarkup(createElement(CostToCompleteWorkspace, {
      project: { id: "p", name: "Проект", contractAmount: 1_000_000 },
      budgetItems: [],
      scheduleItems: [],
      materials: [],
      procurementRequests: [],
      payments: [],
      risks: [],
      onNavigate: () => undefined
    }));
    expect(html).toContain("Cost-to-Complete &amp; Margin Forecast");
    expect(html).toContain("Прогноз затрат до завершения и маржи");
    expect(html).toContain("ВОР пока не загружен");
  });
});
