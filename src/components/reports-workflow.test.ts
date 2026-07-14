import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportsWorkflow } from "@/components/reports-workflow";

describe("ReportsWorkflow", () => {
  it("renders an explicit daily-report workflow without creating records on render", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).toContain("Daily report workflow");
    expect(html).toContain("Новый рапорт");
    expect(html).toContain("Versioned executive reporting");
    expect(html).toContain("Формирование выполняется только по явной команде");
    expect(html).not.toContain("18 рабочих");
    expect(html).not.toContain("Кран, самосвалы");
  });

  it("keeps write controls hidden for viewers", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      currentUser: { authenticated: true, role: "VIEWER" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).not.toContain("Новый рапорт");
    expect(html).not.toContain("Сформировать версию");
  });
});
