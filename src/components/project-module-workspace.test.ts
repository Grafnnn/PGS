import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectModuleWorkspace } from "@/components/project-module-workspace";

describe("ProjectModuleWorkspace", () => {
  it("renders one selected task view while keeping the local navigation available", () => {
    const html = renderToStaticMarkup(createElement(ProjectModuleWorkspace, {
      moduleKey: "budget",
      title: "Бюджет и ВОР",
      icon: createElement("span", null, "icon"),
      initialView: "register",
      views: [
        { id: "summary", label: "Сводка", content: createElement("p", null, "summary-content") },
        { id: "register", label: "Реестр ВОР", content: createElement("p", null, "register-content") },
        { id: "import", label: "Импорт Excel", content: createElement("p", null, "import-content") }
      ]
    }));

    expect(html).toContain("Сводка");
    expect(html).toContain("Реестр ВОР");
    expect(html).toContain("Импорт Excel");
    expect(html).toContain("register-content");
    expect(html).not.toContain("summary-content");
    expect(html).not.toContain("import-content");
    expect(html).toContain('aria-pressed="true"');
  });
});
