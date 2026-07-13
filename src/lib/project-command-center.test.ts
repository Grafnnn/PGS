import { describe, expect, it } from "vitest";
import { getProjectBundle } from "@/lib/demo-data";
import { buildProjectCommandCenterModel } from "@/lib/project-command-center";

describe("project command center model", () => {
  it("builds executive KPIs and action state from a populated project bundle", () => {
    const bundle = getProjectBundle("project-demo");
    const model = buildProjectCommandCenterModel({
      ...bundle,
      readiness: {
        status: "ready",
        score: 82,
        summary: "Данные проекта готовы к управленческому обзору.",
        checks: [],
        counts: {
          committedImports: 1,
          importedBudgetItems: bundle.budgetItems.length,
          importedMaterials: bundle.materials.length,
          importedWarnings: 0,
          budgetItems: bundle.budgetItems.length,
          materials: bundle.materials.length,
          procurementRequests: bundle.procurementRequests.length,
          scheduleItems: bundle.scheduleItems.length,
          cashflowPeriods: 0,
          documents: 2,
          calculatedRisks: bundle.risks.length
        }
      },
      documentChecklist: [
        { key: "contract", title: "Договор", status: "present", categoryHints: [], documentIds: ["doc-1"], evidence: [], suggestedNextStep: "Ок" },
        { key: "estimate", title: "ВОР", status: "present", categoryHints: [], documentIds: ["doc-2"], evidence: [], suggestedNextStep: "Ок" },
        { key: "executive", title: "Исполнительная", status: "missing", categoryHints: [], documentIds: [], evidence: [], suggestedNextStep: "Собрать пакет" }
      ],
      intelligence: {
        completenessScore: 82,
        summary: "Есть управляемый проектный срез.",
        topRisks: [],
        nextActions: [
          {
            id: "risk",
            category: "risks",
            actionType: "review",
            title: "Проверить риски",
            description: "Есть открытые вопросы",
            suggestedNextStep: "Назначить владельца",
            priority: "medium",
            evidence: []
          }
        ],
        missingData: []
      },
      aiInsight: {
        title: "AI summary",
        subject: "Сводка руководителя",
        summary: "Работы идут с отклонениями. Требуется проверить снабжение.",
        recommendedActions: [{ title: "Обновить заявки" }],
        provider: "openai"
      }
    });

    expect(model.project.name).toContain("Демо объект");
    expect(model.kpis).toHaveLength(15);
    expect(model.kpis.find((kpi) => kpi.key === "baseline")).toMatchObject({ label: "Baseline" });
    expect(model.kpis.some((kpi) => kpi.key === "decisions")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "contract")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "proposal")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "acceptance")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "execution")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "fieldOps")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "evidence")).toBe(true);
    expect(model.kpis.some((kpi) => kpi.key === "quality")).toBe(true);
    expect(model.aiSummary.empty).toBe(false);
    expect(model.aiSummary.degraded).toBe(false);
    expect(model.aiSummary.bullets[0]).toContain("Работы идут");
    expect(model.progress.find((item) => item.key === "documents")).toMatchObject({ value: 67 });
    expect(model.progress.find((item) => item.key === "baseline")?.detail).toContain("Общестрой");
    expect(model.statusBoard.find((item) => item.key === "baseline")?.detail).toBeTruthy();
    expect(model.nextActions.some((action) => action.tab === "AI-помощник")).toBe(true);
  });

  it("renders null-safe degraded state for an empty project", () => {
    const model = buildProjectCommandCenterModel({ project: { id: "empty-project" } });

    expect(model.project.name).toBe("Проект без названия");
    expect(model.health.score).toBeGreaterThanOrEqual(0);
    expect(model.health.score).toBeLessThanOrEqual(100);
    expect(model.aiSummary.empty).toBe(true);
    expect(model.aiSummary.degraded).toBe(true);
    expect(model.aiSummary.bullets.length).toBeGreaterThan(0);
    expect(model.statusBoard.find((item) => item.key === "ai")).toMatchObject({ value: "по запросу" });
    expect(model.statusBoard.find((item) => item.key === "baseline")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "executive")).toMatchObject({ value: "no_data" });
    expect(model.statusBoard.find((item) => item.key === "proposal")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "execution")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "fieldOps")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "evidence")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "quality")).toBeTruthy();
    expect(model.statusBoard.find((item) => item.key === "hse")).toBeTruthy();
  });

  it("keeps degraded AI insight readable without leaking raw provider state", () => {
    const model = buildProjectCommandCenterModel({
      project: { id: "p1", name: "Объект" },
      aiInsight: {
        subject: "Fallback summary",
        summary: "Provider недоступен, показана локальная сводка.",
        provider: "degraded",
        dataLimitations: ["Нет live ответа"]
      }
    });

    expect(model.aiSummary.degraded).toBe(true);
    expect(model.aiSummary.empty).toBe(false);
    expect(model.aiSummary.provider).toBe("degraded");
    expect(model.aiSummary.bullets.join(" ")).toContain("Provider недоступен");
  });
});
