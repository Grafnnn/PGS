import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectModuleMenu, projectTabGroups, projectTabs } from "@/components/project-module-menu";

describe("ProjectModuleMenu", () => {
  it("shows every project section in the expanded mega-menu", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "Документы",
        defaultOpen: true,
        onSelect: () => undefined
      })
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Все разделы");
    expect(html).toContain("23 рабочие зоны");
    expect(html).not.toContain("<select");
    for (const tab of projectTabs) expect(html).toContain(tab);
  });

  it("keeps the grouped menu exhaustive and free of duplicate sections", () => {
    const groupedTabs = projectTabGroups.flatMap((group) => group.tabs);

    expect(groupedTabs).toHaveLength(projectTabs.length);
    expect(new Set(groupedTabs).size).toBe(projectTabs.length);
    expect(new Set(groupedTabs)).toEqual(new Set(projectTabs));
  });
});
