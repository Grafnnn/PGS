import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { countNoun, ProjectModuleMenu, projectTabGroups, projectTabs } from "@/components/project-module-menu";

describe("ProjectModuleMenu", () => {
  it("shows every project section through six work domains and one service domain", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "Документы",
        defaultOpen: true,
        onSelect: () => undefined
      })
    );

    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain("Рабочие контуры");
    expect(html).toContain(`${projectTabs.length} модулей доступны через 6 рабочих контуров`);
    expect(html).toContain("Центр управления");
    expect(html).toContain("Производство");
    expect(html).toContain("Ресурсы");
    expect(html).toContain("Экономика");
    expect(html).toContain("Документы и контроль");
    expect(html).toContain("Приёмка");
    expect(html).toContain("Система проекта");
    expect(html).not.toContain("<select");
    for (const tab of projectTabs) expect(html).toContain(tab);
  });

  it("keeps the grouped menu exhaustive and free of duplicate sections", () => {
    const groupedTabs = projectTabGroups.flatMap((group) => group.tabs);

    expect(groupedTabs).toHaveLength(projectTabs.length);
    expect(new Set(groupedTabs).size).toBe(projectTabs.length);
    expect(new Set(groupedTabs)).toEqual(new Set(projectTabs));
  });

  it("uses correct Russian count forms", () => {
    expect(countNoun(1, ["раздел", "раздела", "разделов"])).toBe("раздел");
    expect(countNoun(4, ["раздел", "раздела", "разделов"])).toBe("раздела");
    expect(countNoun(11, ["раздел", "раздела", "разделов"])).toBe("разделов");
    expect(countNoun(25, ["раздел", "раздела", "разделов"])).toBe("разделов");
  });
});
