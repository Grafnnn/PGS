import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { AiRunJournal } from "./ai-run-journal";

describe("AiRunJournal", () => {
  it("renders the controlled history surface without running AI or mutations", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    const html = renderToStaticMarkup(
      createElement(AiRunJournal, {
        projectId: "project-1",
        refreshToken: 0,
        canCreateActions: true
      })
    );

    expect(html).toContain("Журнал AI-решений");
    expect(html).toContain("Контроль и воспроизводимость");
    expect(html).toContain("Загружаю историю запусков");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
