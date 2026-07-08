import { describe, expect, it } from "vitest";
import {
  buildInitialProjectReadiness,
  buildOnboardingModuleSetup,
  buildProjectCreationSummary,
  buildProjectOnboardingPlan,
  defaultOnboardingModules,
  projectCreationPayloadFromDraft,
  validateProjectCreationDraft,
  type ProjectCreationDraft
} from "@/lib/project-onboarding-intelligence";

const readyDraft: ProjectCreationDraft = {
  name: "PGS smoke onboarding",
  customer: "Демо заказчик",
  object: "Административное здание",
  objectType: "commercial",
  address: "Москва, тестовая площадка",
  contractAmount: "12500000",
  vatMode: "including_vat",
  vatPercent: "22",
  startsAt: "2026-07-01",
  endsAt: "2026-10-01",
  manager: "Руководитель проекта",
  status: "planning",
  tenderSource: "contract",
  volumeChangeMode: "fact_based",
  selectedModules: defaultOnboardingModules
};

describe("project onboarding intelligence", () => {
  it("flags missing required fields and does not return false ready state", () => {
    const plan = buildProjectOnboardingPlan({});

    expect(plan.status).toBe("needs_required_fields");
    expect(plan.score).toBeLessThan(75);
    expect(plan.issues.map((issue) => issue.field)).toContain("name");
    expect(plan.summary).toContain("обязательные поля");
  });

  it("validates amount, dates and VAT mode deterministically", () => {
    const issues = validateProjectCreationDraft({
      ...readyDraft,
      contractAmount: "-1",
      startsAt: "2026-10-02",
      endsAt: "2026-10-01",
      vatMode: "including_vat",
      vatPercent: ""
    });

    expect(issues.some((issue) => issue.field === "contractAmount")).toBe(true);
    expect(issues.some((issue) => issue.field === "endsAt")).toBe(true);
    expect(issues.some((issue) => issue.field === "vatPercent")).toBe(true);
  });

  it("builds a ready draft with selected module setup and first workflow", () => {
    const plan = buildProjectOnboardingPlan(readyDraft);

    expect(plan.status).toBe("ready_to_create");
    expect(plan.template.title).toBe("Общестрой");
    expect(plan.baseline.documentBaseline).toContain("Договор/проект договора");
    expect(plan.recommendedFirstWorkflow).toBe("Бюджет / ВОР");
    expect(plan.modules.filter((module) => module.status === "selected_pending")).toHaveLength(defaultOnboardingModules.length);
    expect(plan.nextActions.some((action) => action.includes("Импортировать ВОР"))).toBe(true);
    expect(plan.commandCenterSignals.join(" ")).toContain("AI не запускается автоматически");
  });

  it("marks a created empty project as setup-incomplete rather than green", () => {
    const plan = buildInitialProjectReadiness({
      id: "project-new",
      name: "Новый объект",
      customer: "Заказчик",
      object: "Объект",
      address: "Адрес",
      contractAmount: 1000000,
      startsAt: "2026-07-01",
      endsAt: "2026-09-01",
      manager: "РП",
      status: "planning"
    });

    expect(plan.status).toBe("created_needs_setup");
    expect(plan.template.title).toBe("Общестрой");
    expect(plan.baseline.limitations.join(" ")).toContain("не выдумывает");
    expect(plan.missingData).toContain("загруженный ВОР");
    expect(plan.projectIntelligenceBaseline.join(" ")).toContain("Риски не считаются закрытыми");
  });

  it("summarizes creation draft without inventing legal/payment facts", () => {
    const summary = buildProjectCreationSummary({ ...readyDraft, tenderSource: "unknown", vatMode: "unknown" });

    expect(summary.vatLabel).toBe("НДС не определен");
    expect(summary.tenderSourceLabel).toBe("unknown");
    expect(summary.amountLabel).toContain("12 500 000");
    expect(summary.templateLabel).toBe("Общестрой");
  });

  it("returns only supported Project API payload fields", () => {
    const payload = projectCreationPayloadFromDraft({ ...readyDraft, description: "Не должно уйти в API", paymentNotes: "Аванс" });

    expect(payload).toEqual({
      name: "PGS smoke onboarding",
      customer: "Демо заказчик",
      object: "Административное здание",
      address: "Москва, тестовая площадка",
      contractAmount: 12500000,
      vatMode: "vat",
      startsAt: "2026-07-01",
      endsAt: "2026-10-01",
      manager: "Руководитель проекта",
      status: "planning"
    });
    expect("description" in payload).toBe(false);
    expect("paymentNotes" in payload).toBe(false);
  });

  it("keeps module defaults stable for onboarding smoke flow", () => {
    const modules = buildOnboardingModuleSetup({});

    expect(modules.find((module) => module.id === "vor")).toMatchObject({ tab: "Бюджет / ВОР", status: "selected_pending" });
    expect(modules.find((module) => module.id === "reports")).toMatchObject({ status: "selected_pending" });
  });

  it("allows an empty/manual template without selected modules", () => {
    const plan = buildProjectOnboardingPlan({ ...readyDraft, templateId: "empty", selectedModules: [] });

    expect(plan.status).toBe("ready_to_create");
    expect(plan.template.title).toBe("Пустой проект");
    expect(plan.baseline.readiness).toBe("no_data");
    expect(plan.modules.every((module) => module.status === "not_selected")).toBe(true);
  });
});
