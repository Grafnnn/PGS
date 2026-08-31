import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DailyPhotoAiWorkspace } from "@/components/daily-photo-ai-workspace";
import type { DailyReport } from "@/lib/types";

const report: DailyReport = {
  id: "report-1",
  projectId: "project-1",
  date: "2026-08-31",
  author: "Прораб",
  weather: "Ясно",
  workers: 4,
  engineers: 1,
  equipment: "",
  completedWorks: "Монтаж кровельной мембраны",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "",
  issues: "",
  workCategory: "Кровельные работы",
  status: "draft",
  evidenceDocuments: [{
    id: "photo-1",
    projectId: "project-1",
    category: "Фотофиксация",
    title: "Примыкание мембраны",
    filePath: "/uploads/photo.jpg",
    fileName: "photo.jpg",
    mimeType: "image/jpeg",
    previewAvailable: true,
    version: 1,
    author: "Прораб",
    createdAt: "2026-08-31T15:00:00.000Z"
  }]
};

describe("DailyPhotoAiWorkspace", () => {
  it("renders a separate report photo analysis workspace without calling AI on render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const html = renderToStaticMarkup(createElement(DailyPhotoAiWorkspace, {
      projectId: "project-1",
      reports: [report],
      currentUser: { authenticated: true, role: "MANAGER" },
      currentUserLoaded: true
    }));

    expect(html).toContain("Вопрос по фото AI");
    expect(html).toContain("Рапорт с фотографиями");
    expect(html).toContain("Примыкание мембраны");
    expect(html).toContain("Быстрый вопрос");
    expect(html).toContain("Спросить AI");
    expect(html).toContain("Фото передаются AI только после нажатия кнопки");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("shows a useful empty state when reports have no attached photos", () => {
    const html = renderToStaticMarkup(createElement(DailyPhotoAiWorkspace, {
      projectId: "project-1",
      reports: [{ ...report, evidenceDocuments: [] }],
      currentUser: { authenticated: true, role: "MANAGER" },
      currentUserLoaded: true
    }));

    expect(html).toContain("В рапортах пока нет фотографий");
    expect(html).toContain("прикрепите фото");
  });

  it("keeps AI action unavailable to a viewer", () => {
    const html = renderToStaticMarkup(createElement(DailyPhotoAiWorkspace, {
      projectId: "project-1",
      reports: [report],
      currentUser: { authenticated: true, role: "VIEWER" },
      currentUserLoaded: true
    }));

    expect(html).toContain("AI-анализ доступен владельцу");
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*class="button primary daily-photo-ai-submit"|<button[^>]*class="button primary daily-photo-ai-submit"[^>]*disabled=""/);
  });
});
