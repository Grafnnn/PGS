import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ReportsWorkflow } from "@/components/reports-workflow";

describe("ReportsWorkflow", () => {
  it("renders an explicit daily-report workflow without creating records on render", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      scheduleItems: [],
      materials: [],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined,
      onScheduleItemsChange: () => undefined,
      onMaterialsChange: () => undefined
    }));
    expect(html).toContain("Daily report workflow");
    expect(html).toContain("Новый рапорт");
    expect(html).toContain("Обновить");
    expect(html).toContain("Versioned executive reporting");
    expect(html).toContain("Формирование выполняется только по явной команде");
    expect(html).not.toContain("18 рабочих");
    expect(html).not.toContain("Кран, самосвалы");
  });

  it("keeps write controls hidden for viewers", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      scheduleItems: [],
      materials: [],
      currentUser: { authenticated: true, role: "VIEWER" },
      currentUserLoaded: true,
      onReportsChange: () => undefined,
      onScheduleItemsChange: () => undefined,
      onMaterialsChange: () => undefined
    }));
    expect(html).not.toContain("Новый рапорт");
    expect(html).not.toContain("Сформировать версию");
  });

  it("shows approved measurable output and its normalized monthly productivity", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      scheduleItems: [],
      materials: [],
      reports: [{
        id: "report-1",
        projectId: "project-1",
        date: "2026-07-28",
        author: "Прораб",
        weather: "Ясно",
        workers: 4,
        engineers: 1,
        equipment: "",
        completedWorks: "Кладка стен",
        materialsReceived: "",
        materialsConsumed: "",
        downtime: "",
        issues: "",
        workOutputs: [{ profession: "Каменщик", workName: "Кладка стен", quantity: 20, unit: "м²", laborHours: 32 }],
        status: "approved"
      }],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined,
      onScheduleItemsChange: () => undefined,
      onMaterialsChange: () => undefined
    }));
    expect(html).toContain("Каменщик");
    expect(html).toContain("100 м²/чел.-мес.");
  });
});
