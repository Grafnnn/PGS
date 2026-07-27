import type { ProjectPayrollPolicy } from "@/lib/types";

export type WorkforcePayrollSmokeAssertions = {
  resourceCreated: boolean;
  demandCreated: boolean;
  resourceListed: boolean;
  demandListed: boolean;
  payrollCalculated: boolean;
  contributionsCalculated: boolean;
  personalIncomeTaxCalculated: boolean;
  capacityChanged: boolean;
  profitabilityChanged: boolean;
  cleanupPassed: boolean;
  roleRestored: boolean;
};

export function buildWorkforcePayrollSmokeFixture(
  runKey: string,
  demandGrossPayroll: number,
  grossMonthlySalary = 120_000
) {
  const marker = `SMOKE-WORKFORCE-${runKey}`;
  const salary = Math.max(1, Math.min(1_000_000_000, grossMonthlySalary));
  const personMonths = Math.ceil(demandGrossPayroll / salary * 1000) / 1000;
  const headcount = Math.max(1, Math.min(10_000, personMonths));

  return {
    marker,
    resource: {
      kind: "engineer" as const,
      name: `${marker} employee`,
      profession: "Инженер ПТО (synthetic smoke)",
      employmentType: "staff" as const,
      headcount: 1,
      capacityHoursPerMonth: 160,
      productivityNorm: 1,
      productivityUnit: "комплект/мес",
      monthlyCost: salary,
      grossMonthlySalary: salary,
      hourlyCost: salary / 160,
      certifications: [],
      status: "active" as const,
      notes: `${marker}: disposable staging payroll lifecycle`,
      assignment: {
        startsAt: "2026-07-01",
        endsAt: "2026-07-30",
        allocationPercent: 100,
        plannedHours: 160,
        plannedOutput: 1,
        status: "planned" as const,
        notes: `${marker}: disposable project assignment`
      }
    },
    demand: {
      category: "engineer" as const,
      profession: "Инженер ПТО (synthetic smoke)",
      function: "Disposable staging workforce demand",
      grossMonthlySalary: salary,
      peakHeadcount: headcount,
      personMonths,
      plannedHours: personMonths * 160,
      productivityNorm: 1,
      productivityUnit: "комплект/мес",
      startsAt: "2026-07-01",
      endsAt: "2026-07-30",
      monthlyProfile: [{ month: 1, label: "M1", headcount }],
      source: marker,
      confidence: 1,
      notes: `${marker}: disposable staging labor demand`
    }
  };
}

export function expectedPayrollAmounts(grossPayroll: number, policy: ProjectPayrollPolicy) {
  const insuranceContributions = grossPayroll * policy.insuranceContributionRate / 100;
  const accidentContributions = grossPayroll * policy.accidentContributionRate / 100;
  const withheldPersonalIncomeTax = grossPayroll * policy.personalIncomeTaxRate / 100;

  return {
    grossPayroll,
    insuranceContributions,
    accidentContributions,
    employerContributions: insuranceContributions + accidentContributions,
    withheldPersonalIncomeTax,
    netPayroll: grossPayroll - withheldPersonalIncomeTax,
    totalEmployerCost: grossPayroll + insuranceContributions + accidentContributions
  };
}

export function workforcePayrollSmokePassed(assertions: WorkforcePayrollSmokeAssertions) {
  return Object.values(assertions).every(Boolean);
}
