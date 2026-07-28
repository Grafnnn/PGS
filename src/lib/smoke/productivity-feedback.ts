export type ProductivityFeedbackSmokeFixture = {
  marker: string;
  profession: string;
  workName: string;
  unit: string;
  reports: Array<{
    quantity: number;
    laborHours: number;
  }>;
};

type ProductivityFeedbackSmokeChecks = {
  baselineClean: boolean;
  reportsCreated: boolean;
  reportsSubmitted: boolean;
  reportsChecked: boolean;
  reportsApproved: boolean;
  benchmarkFound: boolean;
  benchmarkActual: boolean;
  sampleCountCorrect: boolean;
  normCalculated: boolean;
  autoApplicable: boolean;
  cleanupPassed: boolean;
  benchmarkCleared: boolean;
  roleRestored: boolean;
};

export function buildProductivityFeedbackSmokeFixture(runKey: string): ProductivityFeedbackSmokeFixture {
  const safeRunKey = runKey.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 18) || "run";
  const marker = `SMOKE-PRODUCTIVITY-${safeRunKey}`;

  return {
    marker,
    profession: `Каменщик ${marker}`,
    workName: `Кладка ${marker}`,
    unit: "м²",
    reports: [
      { quantity: 20, laborHours: 32 },
      { quantity: 24, laborHours: 32 }
    ]
  };
}

export function expectedProductivityFeedbackNorm(
  fixture: ProductivityFeedbackSmokeFixture,
  workingHoursPerMonth: number
) {
  const norms = fixture.reports.map((item) => item.quantity * workingHoursPerMonth / item.laborHours);
  return Math.round(norms.reduce((sum, item) => sum + item, 0) / norms.length * 1000) / 1000;
}

export function productivityFeedbackSmokePassed(checks: ProductivityFeedbackSmokeChecks) {
  return Object.values(checks).every(Boolean);
}
