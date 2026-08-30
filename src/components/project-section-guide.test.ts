import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectSectionGuide, projectSectionGuides } from "@/components/project-section-guide";
import { projectTabs } from "@/components/project-module-menu";

describe("ProjectSectionGuide", () => {
  it("defines a concise decision frame for every project section", () => {
    expect(Object.keys(projectSectionGuides)).toHaveLength(projectTabs.length);
    for (const tab of projectTabs) {
      const guide = projectSectionGuides[tab];
      expect(guide.objective.length).toBeGreaterThan(20);
      expect(guide.question.endsWith("?")).toBe(true);
      expect(guide.signalKeys).toHaveLength(3);
      expect(guide.relatedTabs).toHaveLength(2);
    }
  });

  it("renders signals and keeps supporting context collapsed by default", () => {
    const html = renderToStaticMarkup(createElement(ProjectSectionGuide, {
      activeTab: "График",
      signals: [
        { key: "completion", label: "Готовность", value: "54%", tone: "info" },
        { key: "delayed", label: "Просрочено", value: "2", tone: "bad" },
        { key: "materialDeficit", label: "Дефициты", value: "1", tone: "warn" }
      ],
      priorities: ["Разобрать просроченный этап"],
      lastEvent: "Сегодня обновлен производственный рапорт",
      onNavigate: () => undefined
    }));

    expect(html).toContain("Задача раздела");
    expect(html).toContain("Ключевые сигналы раздела");
    expect(html).toContain("Контекст и следующие действия");
    expect(html).not.toContain("<details open");
    expect(html).toContain("Материалы");
    expect(html).toContain("Рапорты");
  });
});
