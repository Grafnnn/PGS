import { describe, expect, it } from "vitest";
import {
  buildWorkforcePayrollSmokeFixture,
  expectedPayrollAmounts,
  workforcePayrollSmokePassed
} from "./workforce-payroll";

const policy = {
  projectId: "project-smoke",
  insuranceContributionRate: 30,
  accidentContributionRate: 0.2,
  personalIncomeTaxRate: 13,
  workingHoursPerMonth: 160,
  sourceYear: 2026,
  notes: null
};

describe("workforce payroll staging smoke helpers", () => {
  it("builds a bounded synthetic employee and labor demand without sensitive values", () => {
    const fixture = buildWorkforcePayrollSmokeFixture("run-123", 600_000);

    expect(fixture.marker).toBe("SMOKE-WORKFORCE-run-123");
    expect(fixture.resource.grossMonthlySalary).toBe(120_000);
    expect(fixture.demand.personMonths).toBe(5);
    expect(fixture.demand.plannedHours).toBe(800);
    expect(JSON.stringify(fixture)).not.toMatch(/password|database_url|access_token|cookie|session/i);
  });

  it("calculates employer contributions and withheld personal income tax separately", () => {
    const amounts = expectedPayrollAmounts(600_000, policy);

    expect(amounts.insuranceContributions).toBe(180_000);
    expect(amounts.accidentContributions).toBeCloseTo(1_200);
    expect(amounts.employerContributions).toBeCloseTo(181_200);
    expect(amounts.withheldPersonalIncomeTax).toBe(78_000);
    expect(amounts.netPayroll).toBe(522_000);
    expect(amounts.totalEmployerCost).toBeCloseTo(781_200);
  });

  it("passes only when the full lifecycle, calculations, cleanup, and role restoration pass", () => {
    const complete = {
      resourceCreated: true,
      demandCreated: true,
      resourceListed: true,
      demandListed: true,
      payrollCalculated: true,
      contributionsCalculated: true,
      personalIncomeTaxCalculated: true,
      capacityChanged: true,
      profitabilityChanged: true,
      cleanupPassed: true,
      roleRestored: true
    };

    expect(workforcePayrollSmokePassed(complete)).toBe(true);
    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(workforcePayrollSmokePassed({ ...complete, [key]: false })).toBe(false);
    }
  });
});
