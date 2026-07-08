import { describe, expect, it } from "vitest";
import {
  buildOnboardingPlanFromTemplate,
  buildProjectBaselineFromTemplate,
  buildTemplateAcceptanceBaseline,
  buildTemplateContractTenderBaseline,
  buildTemplateDocumentChecklist,
  buildTemplateProcurementBaseline,
  buildTemplateRiskBaseline,
  buildTemplateScheduleBaseline,
  getProjectTemplateById,
  getProjectTemplates,
  inferProjectTemplateId,
  validateProjectTemplateSelection
} from "@/lib/project-templates";

describe("project templates", () => {
  it("exposes the required deterministic construction templates", () => {
    const ids = getProjectTemplates().map((template) => template.id);

    expect(ids).toEqual([
      "general_construction",
      "engineering_networks",
      "fit_out",
      "roofing",
      "concrete",
      "facade",
      "tender",
      "empty"
    ]);
  });

  it("builds a useful baseline without DB, network or provider inputs", () => {
    const baseline = buildProjectBaselineFromTemplate("engineering_networks");

    expect(baseline.templateTitle).toBe("Инженерные сети");
    expect(baseline.modulesEnabled).toContain("materials");
    expect(baseline.documentBaseline).toContain("Акты скрытых работ");
    expect(baseline.procurementBaseline).toContain("трубы/фитинги");
    expect(baseline.scheduleBaseline).toContain("испытания");
    expect(baseline.riskBaseline).toContain("коллизии трасс");
    expect(baseline.acceptanceBaseline).toContain("протоколы испытаний");
    expect(baseline.contractTenderBaseline).toContain("границы подключения");
    expect(baseline.firstActions.length).toBeGreaterThan(0);
    expect(baseline.limitations.join(" ")).toContain("не выдумывает");
  });

  it("keeps helper outputs cloned and null-safe", () => {
    const templates = getProjectTemplates();
    templates[0].documentChecklist.push("mutated");

    expect(getProjectTemplates()[0].documentChecklist).not.toContain("mutated");
    expect(validateProjectTemplateSelection("unknown")).toBe("general_construction");
    expect(getProjectTemplateById(null).id).toBe("general_construction");
    expect(buildTemplateDocumentChecklist("roofing")).toContain("Пирог кровли");
    expect(buildTemplateProcurementBaseline("concrete")).toContain("бетон");
    expect(buildTemplateScheduleBaseline("facade")).toContain("облицовка");
    expect(buildTemplateRiskBaseline("fit_out")).toContain("несогласованные материалы");
    expect(buildTemplateAcceptanceBaseline("tender")).toContain("условия приемки");
    expect(buildTemplateContractTenderBaseline("tender")).toContain("штрафы");
    expect(buildOnboardingPlanFromTemplate("empty")).toContain("выбрать рабочие модули вручную");
  });

  it("infers templates from project text without claiming factual execution", () => {
    expect(inferProjectTemplateId({ object: "Наружные инженерные сети" })).toBe("engineering_networks");
    expect(inferProjectTemplateId({ name: "Монолитный каркас" })).toBe("concrete");
    expect(inferProjectTemplateId({ description: "тендер и проект договора" })).toBe("tender");
    expect(inferProjectTemplateId({ description: "" })).toBeNull();
    expect(buildProjectBaselineFromTemplate("empty").warnings[0]).toContain("ручная");
  });
});
