import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ProjectActionCenter } from "@/components/project-action-center";

describe("ProjectActionCenter", () => {
  it("renders the persistent workflow surface and edit form for managers", () => {
    const html = renderToStaticMarkup(React.createElement(ProjectActionCenter, { projectId: "project-1", canEdit: true, onNavigate: () => undefined }));
    expect(html).toContain("Центр действий");
    expect(html).toContain("Новое действие");
    expect(html).toContain("Требуется отдельное согласование");
    expect(html).toContain("Ответственный");
  });

  it("keeps the register read-only for viewers", () => {
    const html = renderToStaticMarkup(React.createElement(ProjectActionCenter, { projectId: "project-1", canEdit: false, onNavigate: () => undefined }));
    expect(html).toContain("Центр действий");
    expect(html).not.toContain("Новое действие");
    expect(html).toContain("Загрузка реестра действий");
  });

  it("shows deterministic recommendations as explicit form preparation actions", () => {
    const html = renderToStaticMarkup(React.createElement(ProjectActionCenter, {
      projectId: "project-1",
      canEdit: true,
      onNavigate: () => undefined,
      suggestions: [{ id: "suggestion-1", title: "Закрыть дефицит", description: "Создать заявку", sourceModule: "materials", targetTab: "Материалы", priority: "high" }]
    }));
    expect(html).toContain("Рекомендации системы");
    expect(html).toContain("Закрыть дефицит");
    expect(html).toContain("затем подтвердите сохранение");
  });
});
