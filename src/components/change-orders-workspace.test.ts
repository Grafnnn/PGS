import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChangeOrdersWorkspace } from "@/components/change-orders-workspace";

describe("ChangeOrdersWorkspace", () => {
  it("renders a read-only variation register", () => {
    const html = renderToStaticMarkup(createElement(ChangeOrdersWorkspace, { project: { id: "p", name: "Проект", contractAmount: 1_000_000 }, budgetItems: [], scheduleItems: [], materials: [], procurementRequests: [], payments: [], risks: [], onNavigate: () => undefined }));
    expect(html).toContain("Change Orders &amp; Variations");
    expect(html).toContain("Допработы, изменения ВОР и влияние на проект");
    expect(html).toContain("Variation register");
  });
});
