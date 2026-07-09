import { describe, expect, it } from "vitest";
import { getProjectBundle } from "@/lib/demo-data";
import { buildProjectIntelligenceDrilldownModel, drilldownAiScenarios } from "@/lib/project-intelligence-drilldown";

describe("project intelligence drill-down model", () => {
  it("builds drill-down sections from project data", () => {
    const bundle = getProjectBundle("project-demo");
    const model = buildProjectIntelligenceDrilldownModel({
      ...bundle,
      readiness: {
        status: "ready",
        score: 85,
        summary: "Pipeline ready.",
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
        { key: "contract", title: "Договор", status: "present", categoryHints: ["договор"], documentIds: ["doc-1"], evidence: [], suggestedNextStep: "Проверить версию." },
        { key: "estimate", title: "Смета / ВОР", status: "missing", categoryHints: ["смета"], documentIds: [], evidence: [], suggestedNextStep: "Загрузить ВОР." }
      ],
      intelligence: {
        completenessScore: 85,
        summary: "Ready",
        topRisks: [],
        nextActions: [],
        missingData: ["Нет КС"],
        quickActions: [{ title: "Проверить риски", prompt: "risk", deterministicAnswer: "Есть риски." }]
      }
    });

    expect(model.nav.map((item) => item.id)).toEqual(["baseline", "documents", "risks", "schedule", "finance-vor", "contract-tender", "proposal-submission", "acceptance-billing", "execution-control", "procurement", "reports", "ai-recommendations"]);
    expect(model.baseline.templateTitle).toBe("Общестрой");
    expect(model.baseline.firstActions).toContain("Импортировать ВОР");
    expect(model.documents).toMatchObject({ present: 1, total: 2, ctaTab: "Документы" });
    expect(model.documents.complianceReadiness).toBeTruthy();
    expect(model.documents.ksReadiness).toBeTruthy();
    expect(model.documents.executivePackageReadiness).toBeTruthy();
    expect(model.risks.total).toBeGreaterThan(0);
    expect(model.schedule.ctaTab).toBe("График");
    expect(model.schedule.packageCount).toBeGreaterThan(0);
    expect(model.schedule.readinessLabel).toBeTruthy();
    expect(model.financeVor.financeTab).toBe("Финансы");
    expect(model.financeVor.cashflowStatus).toBeTruthy();
    expect(model.financeVor.peakCashNeed).toContain("₽");
    expect(model.procurement.requestTab).toBe("Заявки");
    expect(model.procurement.candidateCount).toBeGreaterThanOrEqual(0);
    expect(model.procurement.readinessLabel).toBeTruthy();
    expect(model.procurement.estimatedDraftTotal).toContain("₽");
    expect(model.contractTender.ctaTab).toBe("Договор / Тендер");
    expect(model.contractTender.decision).toBeTruthy();
    expect(model.proposal.ctaTab).toBe("КП / Подача");
    expect(model.proposal.readiness).toBeTruthy();
    expect(model.acceptanceBilling.ctaTab).toBe("КС");
    expect(model.acceptanceBilling.readyAmount).toContain("₽");
    expect(model.executionControl.ctaTab).toBe("Исполнение");
    expect(model.executionControl.headline).toBeTruthy();
    expect(model.reports.executiveScenario).toBe("executive-report");
    expect(model.ai.scenarios).toHaveLength(drilldownAiScenarios.length);
    expect(model.ai.limitations).toContain("Нет КС");
  });

  it("is null-safe for an empty project", () => {
    const model = buildProjectIntelligenceDrilldownModel({ project: { id: "empty" } });

    expect(model.documents.empty).toBe(false);
    expect(model.baseline.templateTitle).toBe("Общестрой");
    expect(model.baseline.limitations.join(" ")).toContain("не выдумывает");
    expect(model.documents.complianceReadiness).toBe("no_data");
    expect(model.documents.ksReadiness).toBe("unknown");
    expect(model.risks.empty).toBe(false);
    expect(model.risks.reportReadiness).toBe("no_data");
    expect(model.schedule.empty).toBe(true);
    expect(model.financeVor.empty).toBe(true);
    expect(model.procurement.empty).toBe(true);
    expect(model.contractTender.empty).toBe(true);
    expect(model.proposal.empty).toBe(true);
    expect(model.acceptanceBilling.empty).toBe(true);
    expect(model.executionControl.empty).toBe(true);
    expect(model.reports.empty).toBe(true);
    expect(model.ai.scenarios.some((scenario) => scenario.scenario === "executive-report")).toBe(true);
    expect(model.ai.scenarios.some((scenario) => scenario.scenario === "contract-review")).toBe(true);
  });
});
