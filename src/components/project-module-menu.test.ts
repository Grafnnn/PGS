import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  countNoun,
  getMenuArrowTarget,
  ProjectModuleMenu,
  projectDomainGroups,
  projectTabLabel,
  projectTabGroups,
  projectTabs
} from "@/components/project-module-menu";

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
    expect(html).toContain("Рабочие контуры проекта");
    expect(html).toContain(`${projectTabs.length} модулей · быстрый переход`);
    expect(html).toContain("Все модули");
    expect(html).toContain("Карта проекта");
    expect(html).toContain('data-project-all-modules="true"');
    expect(html).toContain('data-project-mobile-switcher="true"');
    expect(html).toContain("Центр управления");
    expect(html).toContain("Производство");
    expect(html).toContain("Ресурсы");
    expect(html).toContain("Экономика");
    expect(html).toContain("Документы и контроль");
    expect(html).toContain("Приёмка");
    expect(html).toContain("Система проекта");
    expect(html).not.toContain("<select");
    for (const tab of projectTabs) expect(html).toContain(projectTabLabel(tab));
    expect(html).toContain("Полевой режим");
    expect(html).toContain("Offline-запись и синхронизация");
    expect(html).toContain("Факт, фото и прогресс графика");
  });

  it("exposes six domain menu triggers with stable semantics", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "График",
        onSelect: () => undefined
      })
    );

    expect(projectDomainGroups).toHaveLength(6);
    expect(html.match(/data-project-domain-trigger="true"/g)).toHaveLength(6);
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(6);
    expect(html).toContain('data-project-domain-id="production"');
    expect(html).toContain('id="project-domain-trigger-production"');
    expect(html).toContain('aria-controls="project-domain-menu-production"');
    expect(html).toContain('data-project-navigation-state="closed"');
  });

  it("renders a bounded domain popover with the current module marked", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "Документы",
        defaultOpen: "documents",
        onSelect: () => undefined
      })
    );

    expect(html).toContain('data-project-navigation-state="domain"');
    expect(html).toContain('data-project-domain-popover="true"');
    expect(html).toContain('data-bounded="true"');
    expect(html).toContain('role="menu"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(4);
    expect(html).toContain('data-project-module="Документы"');
    expect(html).toContain('data-current="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('data-project-all-modules="true"');
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

  it("wraps domain menu focus for Arrow keys and supports Home/End", () => {
    expect(getMenuArrowTarget("ArrowDown", 0, 4)).toBe(1);
    expect(getMenuArrowTarget("ArrowDown", 3, 4)).toBe(0);
    expect(getMenuArrowTarget("ArrowUp", 0, 4)).toBe(3);
    expect(getMenuArrowTarget("ArrowUp", 2, 4)).toBe(1);
    expect(getMenuArrowTarget("Home", 3, 4)).toBe(0);
    expect(getMenuArrowTarget("End", 0, 4)).toBe(3);
    expect(getMenuArrowTarget("Escape", 0, 4)).toBeNull();
    expect(getMenuArrowTarget("ArrowDown", 0, 0)).toBeNull();
  });
});
