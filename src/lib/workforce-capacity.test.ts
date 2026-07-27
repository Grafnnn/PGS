import { describe, expect, it } from "vitest";
import {
  buildWorkforceCapacitySummary,
  buildWorkforceEconomics,
  serializeWorkforceResource,
  workforceResourceCreateSchema
} from "@/lib/workforce-capacity";
import type { BudgetItem, ProjectLaborDemand, ProjectPayrollPolicy } from "@/lib/types";

const resource = {
  id: "resource-1",
  kind: "crew",
  name: "Бригада монолитчиков",
  profession: "Бетонщик",
  employmentType: "hired",
  headcount: 8,
  capacityHoursPerMonth: 160,
  productivityNorm: 18,
  productivityUnit: "м3/смена",
  monthlyCost: 960000,
  hourlyCost: 750,
  certifications: ["Охрана труда"],
  status: "active",
  notes: null
};

const assignment = {
  id: "assignment-1",
  projectId: "project-1",
  resourceId: "resource-1",
  startsAt: new Date("2026-07-01T00:00:00.000Z"),
  endsAt: new Date("2026-08-31T00:00:00.000Z"),
  allocationPercent: 70,
  plannedHours: 1000,
  plannedOutput: 300,
  status: "active",
  notes: null
};

describe("workforce capacity", () => {
  it("detects cross-project overallocation without exposing other project details", () => {
    const item = serializeWorkforceResource(resource, assignment, [
      assignment,
      { ...assignment, id: "assignment-2", projectId: "project-2", allocationPercent: 50 }
    ]);
    expect(item.allocation).toEqual({
      currentProjectPercent: 70,
      otherProjectsPercent: 50,
      totalPercent: 120,
      overlappingProjects: 1,
      overloaded: true
    });
  });

  it("calculates payroll and capacity shortage from explicit assignments", () => {
    const item = serializeWorkforceResource(resource, assignment, [assignment]);
    const summary = buildWorkforceCapacitySummary([item]);
    expect(summary.headcount).toBe(8);
    expect(summary.payroll).toBe(672000);
    expect(summary.allocatedCapacityHours).toBe(896);
    expect(summary.shortageHours).toBe(104);
    expect(summary.status).toBe("attention");
  });

  it("rejects invalid assignment dates", () => {
    const parsed = workforceResourceCreateSchema.safeParse({
      ...resource,
      certifications: [],
      assignment: {
        startsAt: "2026-08-01",
        endsAt: "2026-07-01",
        allocationPercent: 100,
        plannedHours: 0,
        plannedOutput: 0,
        status: "planned"
      }
    });
    expect(parsed.success).toBe(false);
  });

  it("calculates employer contributions without counting withheld NDFL as an extra project cost", () => {
    const item = serializeWorkforceResource(resource, assignment, [assignment]);
    const demand: ProjectLaborDemand = {
      id: "demand-1",
      projectId: "project-1",
      category: "crew",
      profession: "Бетонщики",
      grossMonthlySalary: 120000,
      peakHeadcount: 8,
      personMonths: 16,
      plannedHours: 2560,
      productivityNorm: 18,
      productivityUnit: "м3/смена",
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
      monthlyProfile: [{ month: 1, label: "M1", headcount: 8 }, { month: 2, label: "M2", headcount: 8 }],
      source: "ФОТ рабочих",
      confidence: 1,
      allocations: []
    };
    const policy: ProjectPayrollPolicy = {
      projectId: "project-1",
      insuranceContributionRate: 30,
      accidentContributionRate: 0.4,
      personalIncomeTaxRate: 13,
      workingHoursPerMonth: 160,
      sourceYear: 2026
    };
    const payrollBudget: BudgetItem = {
      id: "budget-payroll",
      projectId: "project-1",
      section: "ФОТ",
      code: "PAY-1",
      name: "Бетонщики",
      unit: "чел.-мес.",
      qty: 16,
      plannedUnitPrice: 120000,
      actualUnitPrice: 0,
      forecastUnitPrice: 120000,
      kind: "payroll",
      source: "import"
    };

    const economics = buildWorkforceEconomics({
      resources: [item],
      demands: [demand],
      policy,
      budgetItems: [payrollBudget],
      contractAmount: 3_000_000
    });

    expect(economics.grossPayroll).toBe(1_920_000);
    expect(economics.withheldPersonalIncomeTax).toBe(249_600);
    expect(economics.employerContributions).toBe(583_680);
    expect(economics.totalEmployerCost).toBe(2_503_680);
    expect(economics.uncoveredEmployerCost).toBe(583_680);
    expect(economics.adjustedForecastCost).toBe(2_503_680);
  });

  it("uses the summed monthly peak when Excel provides a workforce profile", () => {
    const demand = (profession: string, headcount: number): ProjectLaborDemand => ({
      id: profession,
      projectId: "project-1",
      category: "worker",
      profession,
      grossMonthlySalary: 100000,
      peakHeadcount: headcount,
      personMonths: headcount * 2,
      plannedHours: headcount * 320,
      productivityNorm: 0,
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
      monthlyProfile: [{ month: 1, label: "M1", headcount }, { month: 2, label: "M2", headcount }],
      source: "Excel",
      confidence: 0.9,
      allocations: []
    });
    const summary = buildWorkforceCapacitySummary([], [demand("Монтажники", 5), demand("Сварщики", 3)]);

    expect(summary.demandHeadcount).toBe(8);
    expect(summary.demandHours).toBe(1280);
    expect(summary.shortageHeadcount).toBe(8);
  });

  it("does not treat a subcontract crew contract as employee payroll tax base", () => {
    const subcontract = serializeWorkforceResource(
      { ...resource, employmentType: "subcontract", grossMonthlySalary: 120000 },
      assignment,
      [assignment]
    );
    const economics = buildWorkforceEconomics({
      resources: [subcontract],
      demands: [],
      budgetItems: [],
      contractAmount: 3_000_000
    });

    expect(subcontract.grossMonthlySalary).toBe(120000);
    expect(economics.grossPayroll).toBe(0);
    expect(economics.employerContributions).toBe(0);
  });
});
