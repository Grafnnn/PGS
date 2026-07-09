import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectCreationWizard } from "@/components/projects-index";

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    refresh: vi.fn()
  })
}));

describe("ProjectCreationWizard", () => {
  it("renders onboarding wizard without calling create API or AI on render", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch" as never);
    const html = renderToStaticMarkup(React.createElement(ProjectCreationWizard));

    expect(html).toContain("Project Creation &amp; Onboarding");
    expect(html).toContain("Создать проект и запустить baseline");
    expect(html).toContain("позволяет приложить стартовые документы");
    expect(html).toContain("Шаблон проекта");
    expect(html).toContain("Загрузить договор для автозаполнения");
    expect(html).toContain("Выбрать договор");
    expect(html).toContain("TXT/Markdown preview без AI");
    expect(html).toContain("PDF/DOCX можно приложить как стартовый документ");
    expect(html).toContain("Общестрой");
    expect(html).toContain("Инженерные сети");
    expect(html).toContain("Проект");
    expect(html).toContain("Договор");
    expect(html).toContain("Контур");
    expect(html).toContain("Onboarding baseline");
    expect(html).toContain("Выбранный шаблон");
    expect(html).toContain("Бюджет / ВОР");
    expect(html).toContain("Название проекта");
    expect(html).toContain("нужно заполнить");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
