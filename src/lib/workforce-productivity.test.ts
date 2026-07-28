import { describe, expect, it } from "vitest";
import {
  buildProductivityNormBenchmarks,
  enrichLaborDemandsWithAverageProductivity,
  recommendProductivityNorm,
  type ProductivityNormSample
} from "@/lib/workforce-productivity";

function sample(norm: number, overrides: Partial<ProductivityNormSample> = {}): ProductivityNormSample {
  return {
    category: "worker",
    profession: "Монтажник металлоконструкций",
    function: "Монтаж металлоконструкций",
    norm,
    unit: "т/чел.-мес.",
    weight: 1,
    source: "labor-demand",
    ...overrides
  };
}

describe("workforce productivity norms", () => {
  it("builds a transparent average for comparable professions", () => {
    const benchmarks = buildProductivityNormBenchmarks([sample(40), sample(50), sample(60)]);
    expect(benchmarks).toEqual([expect.objectContaining({
      norm: 50,
      unit: "т/чел.-мес.",
      sampleCount: 3,
      confidence: "medium",
      autoApplicable: true
    })]);

    const recommendation = recommendProductivityNorm({
      category: "worker",
      profession: "Монтажник металлоконструкций",
      benchmarks
    });
    expect(recommendation).toMatchObject({
      norm: 50,
      match: "profession",
      autoApplicable: true
    });
  });

  it("trims an extreme outlier before calculating the average", () => {
    const benchmarks = buildProductivityNormBenchmarks([
      sample(40),
      sample(42),
      sample(44),
      sample(46),
      sample(400)
    ]);
    expect(benchmarks[0]).toMatchObject({
      norm: 43,
      minimum: 40,
      maximum: 46,
      sampleCount: 4,
      confidence: "high"
    });
  });

  it("never mixes incompatible productivity units", () => {
    const benchmarks = buildProductivityNormBenchmarks([
      sample(50),
      sample(60),
      sample(8, { unit: "т/смена" }),
      sample(10, { unit: "т/смена" })
    ]);
    expect(benchmarks).toHaveLength(2);
    expect(recommendProductivityNorm({
      category: "worker",
      profession: "Монтажник металлоконструкций",
      unit: "т/смена",
      benchmarks
    })).toMatchObject({ norm: 9, unit: "т/смена" });
  });

  it("shows one observation as an orientation but does not auto-apply it", () => {
    const benchmarks = buildProductivityNormBenchmarks([sample(50)]);
    expect(recommendProductivityNorm({
      category: "worker",
      profession: "Монтажник металлоконструкций",
      benchmarks
    })).toMatchObject({ norm: 50, confidence: "low", autoApplicable: false });
  });

  it("prefers two approved actual observations over accumulated plan estimates", () => {
    const benchmarks = buildProductivityNormBenchmarks([
      sample(100, { source: "labor-demand" }),
      sample(120, { source: "resource" }),
      sample(48, { source: "daily-report" }),
      sample(52, { source: "daily-report" })
    ]);

    expect(benchmarks[0]).toMatchObject({
      norm: 50,
      sampleCount: 2,
      sources: ["daily-report"],
      basis: "actual",
      autoApplicable: true
    });
    expect(recommendProductivityNorm({
      category: "worker",
      profession: "Монтажник металлоконструкций",
      benchmarks
    })?.explanation).toContain("подтвержденному факту");
  });

  it("fills a missing workbook norm only when a comparable average is reliable enough", () => {
    const base = {
      id: "demand",
      projectId: "project",
      importBatchId: null,
      category: "worker" as const,
      profession: "Каменщик",
      function: "Кладка стен",
      grossMonthlySalary: 100000,
      peakHeadcount: 2,
      personMonths: 2,
      plannedHours: 320,
      productivityUnit: "м2/чел.-мес.",
      startsAt: "2026-08-01",
      endsAt: "2026-08-31",
      monthlyProfile: [],
      source: "Workbook",
      sourceSheet: "ФОТ",
      sourceRow: 2,
      confidence: 0.9,
      notes: null,
      allocations: []
    };
    const result = enrichLaborDemandsWithAverageProductivity([
      { ...base, id: "a", sourceRow: 2, productivityNorm: 90 },
      { ...base, id: "b", sourceRow: 3, productivityNorm: 110 },
      { ...base, id: "c", sourceRow: 4, productivityNorm: 0 }
    ]);

    expect(result.applied).toBe(1);
    expect(result.items[2]).toMatchObject({
      productivityNorm: 100,
      productivityUnit: "м2/чел.-мес.",
      confidence: 0.75
    });
    expect(result.items[2].notes).toContain("Автонорма");
    expect(result.items[0].productivityNorm).toBe(90);
  });
});
