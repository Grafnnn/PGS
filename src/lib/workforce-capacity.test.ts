import { describe, expect, it } from "vitest";
import { buildWorkforceCapacitySummary, serializeWorkforceResource, workforceResourceCreateSchema } from "@/lib/workforce-capacity";

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
});
