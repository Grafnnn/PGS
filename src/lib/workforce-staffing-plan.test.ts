import { describe, expect, it } from "vitest";
import { buildWorkforceStaffingPlan, workforceProfessionMatchScore } from "@/lib/workforce-staffing-plan";
import type {
  AvailableWorkforceResource,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  WorkforceResource
} from "@/lib/types";

const policy: ProjectPayrollPolicy = {
  projectId: "project-1",
  insuranceContributionRate: 30,
  accidentContributionRate: 0,
  personalIncomeTaxRate: 13,
  workingHoursPerMonth: 160,
  sourceYear: 2026
};

function demand(overrides: Partial<ProjectLaborDemand> = {}): ProjectLaborDemand {
  return {
    id: "demand-1",
    projectId: "project-1",
    category: "worker",
    profession: "Монтажники",
    grossMonthlySalary: 100_000,
    peakHeadcount: 4,
    personMonths: 8,
    plannedHours: 1280,
    productivityNorm: 0,
    startsAt: "2026-07-01T00:00:00.000Z",
    endsAt: "2026-08-31T00:00:00.000Z",
    monthlyProfile: [
      { month: 1, label: "M1", headcount: 4 },
      { month: 2, label: "M2", headcount: 4 }
    ],
    source: "Excel · ФОТ",
    confidence: 0.95,
    allocations: [],
    ...overrides
  };
}

function assigned(overrides: Partial<WorkforceResource> = {}): WorkforceResource {
  return {
    id: "resource-1",
    kind: "crew",
    name: "Бригада монтажников",
    profession: "Монтажник",
    employmentType: "staff",
    headcount: 3,
    capacityHoursPerMonth: 160,
    productivityNorm: 0,
    monthlyCost: 300_000,
    grossMonthlySalary: 100_000,
    hourlyCost: 0,
    certifications: [],
    status: "active",
    assignment: {
      id: "assignment-1",
      projectId: "project-1",
      resourceId: "resource-1",
      startsAt: "2026-07-01T00:00:00.000Z",
      endsAt: "2026-08-31T00:00:00.000Z",
      allocationPercent: 100,
      plannedHours: 960,
      plannedOutput: 0,
      status: "active"
    },
    allocation: {
      currentProjectPercent: 100,
      otherProjectsPercent: 0,
      totalPercent: 100,
      overlappingProjects: 0,
      overloaded: false
    },
    ...overrides
  };
}

function candidate(overrides: Partial<AvailableWorkforceResource> = {}): AvailableWorkforceResource {
  return {
    id: "candidate-1",
    kind: "worker",
    name: "Монтажник Иванов",
    profession: "Монтажник",
    employmentType: "staff",
    headcount: 1,
    capacityHoursPerMonth: 160,
    grossMonthlySalary: 95_000,
    monthlyCost: 95_000,
    status: "active",
    commitments: [],
    ...overrides
  };
}

describe("workforce staffing plan", () => {
  it("matches Russian singular/plural professions and builds a monthly gap", () => {
    expect(workforceProfessionMatchScore("worker", "Монтажники", "crew", "Монтажник")).toBeGreaterThan(0.7);
    const plan = buildWorkforceStaffingPlan({
      resources: [assigned()],
      demands: [demand()],
      availableResources: [candidate()],
      policy
    });

    expect(plan.summary).toMatchObject({
      status: "attention",
      coveragePercent: 75,
      peakRequiredHeadcount: 4,
      peakGapHeadcount: 1,
      professionsWithGap: 1,
      matchedAvailableResources: 1
    });
    expect(plan.months).toHaveLength(2);
    expect(plan.months[0].rows[0]).toMatchObject({
      profession: "Монтажники",
      requiredHeadcount: 4,
      assignedHeadcount: 3,
      gapHeadcount: 1,
      coveragePercent: 75,
      estimatedEmployerCost: 130_000,
      action: "assign-existing"
    });
  });

  it("reduces candidate capacity by commitments on other projects", () => {
    const plan = buildWorkforceStaffingPlan({
      resources: [],
      demands: [demand({ monthlyProfile: [{ month: 1, label: "M1", headcount: 2 }] })],
      availableResources: [candidate({
        headcount: 2,
        commitments: [{
          startsAt: "2026-07-01T00:00:00.000Z",
          endsAt: "2026-07-31T00:00:00.000Z",
          allocationPercent: 50
        }]
      })],
      policy
    });

    expect(plan.rows[0].candidates[0]).toMatchObject({
      availablePercent: 50,
      availableHeadcount: 1
    });
    expect(plan.rows[0].action).toBe("combine");
  });

  it("does not double-count one assigned resource across similar demand groups", () => {
    const plan = buildWorkforceStaffingPlan({
      resources: [assigned({ headcount: 2 })],
      demands: [
        demand({ id: "demand-a", profession: "Монтажники", monthlyProfile: [{ month: 1, label: "M1", headcount: 2 }] }),
        demand({ id: "demand-b", profession: "Монтажники вентиляции", monthlyProfile: [{ month: 1, label: "M1", headcount: 2 }] })
      ],
      policy
    });

    expect(plan.months[0].rows.reduce((sum, item) => sum + item.assignedHeadcount, 0)).toBe(2);
    expect(plan.months[0].gapHeadcount).toBe(2);
  });

  it("uses a non-green no-data status when no workforce demand exists", () => {
    const plan = buildWorkforceStaffingPlan({ resources: [assigned()], demands: [], policy });

    expect(plan.summary.status).toBe("no_data");
    expect(plan.summary.coveragePercent).toBe(0);
    expect(plan.months).toEqual([]);
  });

  it("falls back to the demand period when a monthly profile is missing", () => {
    const plan = buildWorkforceStaffingPlan({
      resources: [],
      demands: [demand({ monthlyProfile: [], peakHeadcount: 2, personMonths: 4 })],
      policy
    });

    expect(plan.months.map((item) => item.key)).toEqual(["2026-07", "2026-08"]);
    expect(plan.summary.requiredPersonMonths).toBe(4);
    expect(plan.summary.shortageHours).toBe(640);
  });
});
