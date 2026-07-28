import { describe, expect, it } from "vitest";
import {
  buildProductivityFeedbackSmokeFixture,
  expectedProductivityFeedbackNorm,
  productivityFeedbackSmokePassed
} from "./productivity-feedback";

describe("productivity feedback staging smoke helpers", () => {
  it("builds two bounded synthetic actual observations", () => {
    const fixture = buildProductivityFeedbackSmokeFixture("run-123");

    expect(fixture.marker).toBe("SMOKE-PRODUCTIVITY-run-123");
    expect(fixture.reports).toEqual([
      { quantity: 20, laborHours: 32 },
      { quantity: 24, laborHours: 32 }
    ]);
    expect(expectedProductivityFeedbackNorm(fixture, 160)).toBe(110);
    expect(JSON.stringify(fixture)).not.toMatch(/password|database_url|access_token|cookie|session/i);
  });

  it("uses the current project working-hours policy", () => {
    const fixture = buildProductivityFeedbackSmokeFixture("policy");

    expect(expectedProductivityFeedbackNorm(fixture, 176)).toBe(121);
  });

  it("passes only after the full approval, benchmark, cleanup, and role lifecycle", () => {
    const complete = {
      baselineClean: true,
      reportsCreated: true,
      reportsSubmitted: true,
      reportsChecked: true,
      reportsApproved: true,
      benchmarkFound: true,
      benchmarkActual: true,
      sampleCountCorrect: true,
      normCalculated: true,
      autoApplicable: true,
      cleanupPassed: true,
      benchmarkCleared: true,
      roleRestored: true
    };

    expect(productivityFeedbackSmokePassed(complete)).toBe(true);
    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(productivityFeedbackSmokePassed({ ...complete, [key]: false })).toBe(false);
    }
  });
});
