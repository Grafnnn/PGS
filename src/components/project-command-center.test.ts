import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectCommandCenter } from "@/components/project-command-center";
import { getProjectBundle } from "@/lib/demo-data";

describe("ProjectCommandCenter", () => {
  it("renders a command-center overview from project data without making AI calls", () => {
    const bundle = getProjectBundle("project-demo");
    const runAiSummary = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ProjectCommandCenter, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        readiness: null,
        documentChecklist: [],
        intelligence: null,
        aiInsight: null,
        onNavigate: vi.fn(),
        onRunAiSummary: runAiSummary
      })
    );

    expect(html).toContain("Project command center");
    expect(html).toContain("Что требует внимания по объекту");
    expect(html).toContain("Остальные показатели");
    expect(html).toContain("Статус по модулям");
    expect(html).toContain("Action center");
    expect((html.match(/class="command-ai-bullet"/g) ?? [])).toHaveLength(4);
    expect(html).toContain("КП / подача");
    expect(html).toContain("Подрядчики / исполнение");
    expect(html).toContain("Площадка / рапорты");
    expect(html).toContain("Люди / техника");
    expect(html).toContain("Фото / evidence");
    expect(html).toContain("Сформировать AI-сводку");
    expect(runAiSummary).not.toHaveBeenCalled();
  });

  it("renders a stable degraded AI state for missing project data", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectCommandCenter, {
        project: { id: "empty-project" },
        budgetItems: [],
        scheduleItems: [],
        materials: [],
        procurementRequests: [],
        payments: [],
        dailyReports: [],
        risks: [],
        readiness: null,
        documentChecklist: [],
        intelligence: null,
        aiInsight: { subject: "Локальная сводка", summary: "Данных пока недостаточно.", provider: "degraded" },
        onNavigate: vi.fn(),
        onRunAiSummary: vi.fn()
      })
    );

    expect(html).toContain("Проект без названия");
    expect(html).toContain("Локальная сводка");
    expect(html).toContain("degraded");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
