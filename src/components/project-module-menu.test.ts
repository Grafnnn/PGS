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
  projectTabs,
  resolveProjectTab
} from "@/components/project-module-menu";

describe("ProjectModuleMenu", () => {
  it("restores overview for bare project URLs and invalid history entries", () => {
    expect(resolveProjectTab(null)).toBe("Обзор");
    expect(resolveProjectTab(undefined)).toBe("Обзор");
    expect(resolveProjectTab("")).toBe("Обзор");
    expect(resolveProjectTab("missing")).toBe("Обзор");
    for (const tab of projectTabs) expect(resolveProjectTab(tab)).toBe(tab);
  });
  it("keeps every project section and its descriptive category in the complete catalogue", () => {
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
    expect(html).toContain("Все разделы");
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

  it("exposes five compact domain menu triggers with stable semantics", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "График",
        onSelect: () => undefined
      })
    );

    expect(projectDomainGroups.map((group) => group.label)).toEqual(["Управление", "Работы", "Ресурсы", "Экономика", "Документы"]);
    expect(html.match(/data-project-domain-trigger="true"/g)).toHaveLength(5);
    expect(html.match(/aria-haspopup="menu"/g)).toHaveLength(5);
    expect(html).toContain('data-project-domain-id="production"');
    expect(html).toContain('id="project-domain-trigger-production"');
    expect(html).toContain('aria-controls="project-domain-menu-production"');
    expect(html).toContain('data-project-navigation-state="closed"');
  });

  it("groups documents and acceptance in a wide menu with the current module marked", () => {
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
    expect(html.match(/role="menuitem"/g)).toHaveLength(6);
    expect(html).toContain('class="project-domain-popover-columns"');
    expect(html).toContain("Приёмка");
    expect(html).toContain('data-project-module="КС"');
    expect(html).toContain('data-project-module="Сдача / Гарантия"');
    expect(html).toContain('data-project-module="Документы"');
    expect(html).toContain('data-current="true"');
    expect(html).toContain('aria-current="page"');
    expect(html).not.toContain('data-project-all-modules="true"');
  });

  it("adds the project 3D model to the control menu when the model is available", () => {
    const domainHtml = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "Обзор",
        defaultOpen: "control",
        onOpenProjectModel: () => undefined,
        onSelect: () => undefined
      })
    );
    const allModulesHtml = renderToStaticMarkup(
      createElement(ProjectModuleMenu, {
        activeTab: "Обзор",
        defaultOpen: true,
        onOpenProjectModel: () => undefined,
        onSelect: () => undefined
      })
    );

    expect(domainHtml).toContain('data-project-model-action="true"');
    expect(domainHtml).toContain("3D-модель");
    expect(domainHtml).toContain("Координационная модель проекта");
    expect(domainHtml.match(/role="menuitem"/g)).toHaveLength(projectDomainGroups[0].tabs.length + 1);
    expect(allModulesHtml).toContain('data-project-model-action="true"');
  });

  it("includes the project service modules in management and marks their domain active", () => {
    const html = renderToStaticMarkup(createElement(ProjectModuleMenu, {
      activeTab: "Настройки", defaultOpen: "control", onSelect: () => undefined
    }));
    const control = projectDomainGroups.find((group) => group.id === "control")!;

    expect(control.tabs).toContain("Настройки");
    expect(html.match(/role="menuitem"/g)).toHaveLength(9);
    for (const tab of ["Участники", "Процессы", "История", "Настройки"]) expect(html).toContain(`data-project-module="${tab}"`);
    expect(html).toContain('data-project-module="Настройки"');
    expect(html).toContain('data-current="true"');
    expect(html).not.toContain('data-project-model-action="true"');
  });

  it("keeps 3D discoverable with an honest hint when the project has no attached model", () => {
    const html = renderToStaticMarkup(createElement(ProjectModuleMenu, {
      activeTab: "Обзор",
      defaultOpen: true,
      onOpenProjectModel: () => undefined,
      projectModelHint: "Модель пока не подключена",
      onSelect: () => undefined
    }));
    expect(html).not.toContain('data-project-model-shortcut="true"');
    expect(html).not.toContain('aria-label="Открыть 3D"');
    expect(html).toContain('data-project-model-action="true"');
    expect(html).toContain("Модель пока не подключена");
    expect(html).not.toContain("Координационная модель проекта");
    expect(html).toContain('aria-label="Поиск по разделам"');
    expect(html).toContain('aria-controls="project-module-search" aria-expanded="false"');
    expect(html).not.toContain('type="search"');
  });

  it("preserves legacy acceptance menu opening within the document group", () => {
    const html = renderToStaticMarkup(createElement(ProjectModuleMenu, {
      activeTab: "КС", defaultOpen: "acceptance", onSelect: () => undefined
    }));

    expect(html).toContain('id="project-domain-menu-documents"');
    expect(html).toContain('data-project-module="КС"');
    expect(html).toContain('data-current="true"');
    expect(html.match(/role="menuitem"/g)).toHaveLength(6);
  });

  it("keeps the grouped menu exhaustive and free of duplicate sections", () => {
    const groupedTabs = projectTabGroups.flatMap((group) => group.tabs);

    expect(groupedTabs).toHaveLength(projectTabs.length);
    expect(new Set(groupedTabs).size).toBe(projectTabs.length);
    expect(new Set(groupedTabs)).toEqual(new Set(projectTabs));
    const navigationTabs = projectDomainGroups.flatMap((group) => group.tabs);
    expect(navigationTabs).toHaveLength(26);
    expect(new Set(navigationTabs)).toEqual(new Set(projectTabs));
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
    expect(getMenuArrowTarget("ArrowUp", -1, 4)).toBe(3);
    expect(getMenuArrowTarget("Home", 3, 4)).toBe(0);
    expect(getMenuArrowTarget("End", 0, 4)).toBe(3);
    expect(getMenuArrowTarget("Escape", 0, 4)).toBeNull();
    expect(getMenuArrowTarget("ArrowDown", 0, 0)).toBeNull();
  });
});
