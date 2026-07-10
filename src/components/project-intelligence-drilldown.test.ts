import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectIntelligenceDrilldown } from "@/components/project-intelligence-drilldown";
import { getProjectBundle } from "@/lib/demo-data";

describe("ProjectIntelligenceDrilldown", () => {
  it("renders all major drill-down panels without making AI calls", () => {
    const bundle = getProjectBundle("project-demo");
    const runAiScenario = vi.fn();
    const html = renderToStaticMarkup(
      createElement(ProjectIntelligenceDrilldown, {
        ...bundle,
        readiness: null,
        documentChecklist: [],
        intelligence: null,
        aiResults: {},
        aiErrors: {},
        aiLoading: null,
        onNavigate: vi.fn(),
        onRunAiScenario: runAiScenario
      })
    );

    expect(html).toContain("Project Intelligence");
    expect(html).toContain("Baseline / Onboarding Intelligence");
    expect(html).toContain("Documents Intelligence");
    expect(html).toContain("КС readiness");
    expect(html).toContain("Executive package");
    expect(html).toContain("Risk Intelligence");
    expect(html).toContain("Schedule / График Intelligence");
    expect(html).toContain("ВОР / Finance Intelligence");
    expect(html).toContain("Commercial Proposal / КП Submission");
    expect(html).toContain("Acceptance &amp; Billing / КС Intelligence");
    expect(html).toContain("Subcontractor / Execution Control");
    expect(html).toContain("Field Operations / Daily Reports");
    expect(html).toContain("Procurement / Снабжение Intelligence");
    expect(html).toContain("Reports / Executive Output");
    expect(html).toContain("AI Recommendations Drill-down");
    expect(html).toContain("Открыть документы");
    expect(html).toContain("Executive report");
    expect(runAiScenario).not.toHaveBeenCalled();
  });

  it("renders safe empty and degraded AI states without leaking raw secrets", () => {
    const html = renderToStaticMarkup(
      createElement(ProjectIntelligenceDrilldown, {
        project: { id: "empty" },
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
        aiResults: {
          "executive-report": {
            title: "Executive",
            scenario: "executive-report",
            summary: "Provider fallback summary.",
            subject: "Сводка",
            findings: [],
            recommendedActions: [],
            recommendedAttachments: ["ВОР", "Риски"],
            dataUsed: [],
            dataLimitations: ["Нет live ответа"],
            generatedAt: "2026-06-25T00:00:00.000Z",
            provider: "degraded"
          }
        },
        aiErrors: { "risk-review": "raw provider stack should not be shown" },
        aiLoading: null,
        onNavigate: vi.fn(),
        onRunAiScenario: vi.fn()
      })
    );

    expect(html).toContain("Нет достаточных данных");
    expect(html).toContain("Provider fallback summary.");
    expect(html).toContain("AI-сценарий сейчас недоступен");
    expect(html).not.toContain("raw provider stack");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
