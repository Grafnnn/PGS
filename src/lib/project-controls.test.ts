import { describe, expect, it } from "vitest";
import {
  buildProjectControlBaselinePreview,
  buildProjectControlPeriodPreview,
  projectControlBaselineRequestSchema,
  projectControlPeriodRequestSchema
} from "@/lib/project-controls";
import type { BudgetItem, Payment, Project, ScheduleItem } from "@/lib/types";

const project = {
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-11T00:00:00.000Z"
} as Pick<Project, "startsAt" | "endsAt">;

const budgetItems: BudgetItem[] = [{
  id: "budget-1",
  projectId: "project-1",
  costCodeId: "cc-1",
  section: "Монолит",
  code: "01-001",
  name: "Бетонирование",
  unit: "м3",
  qty: 10,
  plannedUnitPrice: 100,
  actualUnitPrice: 110,
  forecastUnitPrice: 115,
  kind: "work",
  source: "test"
}];

const scheduleItems: ScheduleItem[] = [{
  id: "schedule-1",
  projectId: "project-1",
  budgetItemId: "budget-1",
  costCodeId: "cc-1",
  name: "Бетонирование секции 1",
  owner: "ПТО",
  startsAt: "2026-01-01T00:00:00.000Z",
  endsAt: "2026-01-11T00:00:00.000Z",
  plannedQty: 10,
  actualQty: 4,
  status: "in_progress"
}];

const payments: Payment[] = [{
  id: "payment-1",
  projectId: "project-1",
  costCodeId: "cc-1",
  title: "Факт затрат",
  counterparty: "Подрядчик",
  direction: "outgoing",
  plannedAt: "2026-01-04T00:00:00.000Z",
  paidAt: "2026-01-05T00:00:00.000Z",
  amount: 250,
  status: "paid",
  category: "subcontractor"
}];

describe("Project Controls and Earned Value", () => {
  it("builds a versionable baseline from linked VOR and schedule data", () => {
    const preview = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems });
    expect(preview.summary).toMatchObject({
      status: "ready",
      budgetAtCompletion: 1000,
      linkedBudgetValue: 1000,
      scheduleCoveragePercent: 100,
      canActivate: true
    });
    expect(preview.lines).toHaveLength(1);
    expect(preview.lines[0]).toMatchObject({ budget: 1000, weight: 1, sourceQuality: "linked", scheduleItemId: "schedule-1" });
  });

  it("derives the baseline window from the captured schedule", () => {
    const preview = buildProjectControlBaselinePreview({
      project,
      budgetItems,
      scheduleItems: [{
        ...scheduleItems[0],
        startsAt: "2025-12-20T00:00:00.000Z",
        endsAt: "2026-02-01T00:00:00.000Z"
      }]
    });

    expect(preview.summary.plannedStart).toBe("2025-12-20T00:00:00.000Z");
    expect(preview.summary.plannedFinish).toBe("2026-02-01T00:00:00.000Z");
  });

  it("does not claim a usable baseline when schedule data is missing", () => {
    const preview = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems: [] });
    expect(preview.summary.status).toBe("blocked");
    expect(preview.summary.canActivate).toBe(false);
    expect(preview.summary.scheduleCoveragePercent).toBe(0);
    expect(preview.lines[0].sourceQuality).toBe("inferred_project_window");
    expect(preview.limitations.join(" ")).toContain("График отсутствует");
  });

  it("calculates PV, EV, AC, CPI, SPI and forecast from the reporting cut-off", () => {
    const baseline = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems });
    const preview = buildProjectControlPeriodPreview({
      baseline: {
        budgetAtCompletion: baseline.summary.budgetAtCompletion,
        plannedStart: baseline.summary.plannedStart,
        plannedFinish: baseline.summary.plannedFinish,
        scheduleCoveragePercent: baseline.summary.scheduleCoveragePercent,
        limitations: []
      },
      lines: baseline.lines.map((line) => ({ ...line, id: `line-${line.sequence}` })),
      scheduleItems,
      progressEntries: [{ scheduleItemId: "schedule-1", date: "2026-01-05T00:00:00.000Z", qty: 3, status: "approved" }],
      payments,
      dataDate: "2026-01-06T00:00:00.000Z"
    });
    expect(preview.summary).toMatchObject({
      status: "critical",
      budgetAtCompletion: 1000,
      plannedValue: 500,
      earnedValue: 300,
      actualCost: 250,
      costVariance: 50,
      scheduleVariance: -200,
      costPerformanceIndex: 1.2,
      schedulePerformanceIndex: 0.6,
      estimateAtCompletion: 833.33
    });
    expect(preview.coverage).toMatchObject({
      scheduleCoveragePercent: 100,
      earnedValueCoveragePercent: 100,
      actualCostCoveragePercent: 100,
      progressEntryCount: 1,
      scheduleActualFallbackCount: 0
    });
    expect(preview.lines[0]).toMatchObject({ plannedProgress: 50, earnedProgress: 30, status: "behind" });
  });

  it("keeps unallocated actual cost visible instead of inventing line attribution", () => {
    const baseline = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems });
    const preview = buildProjectControlPeriodPreview({
      baseline: { budgetAtCompletion: 1000, plannedStart: project.startsAt, plannedFinish: project.endsAt, scheduleCoveragePercent: 100 },
      lines: baseline.lines.map((line) => ({ ...line, id: `line-${line.sequence}` })),
      scheduleItems,
      progressEntries: [],
      payments: [{ ...payments[0], costCodeId: null }],
      dataDate: "2026-01-06T00:00:00.000Z"
    });
    expect(preview.summary.actualCost).toBe(250);
    expect(preview.summary.actualCostAllocated).toBe(0);
    expect(preview.coverage.unallocatedActualCost).toBe(250);
    expect(preview.lines[0].actualCost).toBe(0);
    expect(preview.limitations.join(" ")).toContain("не распределены по cost code");
  });

  it("does not claim controlled performance when work exists without actual cost", () => {
    const baseline = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems });
    const preview = buildProjectControlPeriodPreview({
      baseline: {
        budgetAtCompletion: baseline.summary.budgetAtCompletion,
        plannedStart: baseline.summary.plannedStart,
        plannedFinish: baseline.summary.plannedFinish,
        scheduleCoveragePercent: baseline.summary.scheduleCoveragePercent
      },
      lines: baseline.lines.map((line) => ({ ...line, id: `line-${line.sequence}` })),
      scheduleItems,
      progressEntries: [{ scheduleItemId: "schedule-1", date: "2026-01-06T00:00:00.000Z", qty: 5, status: "approved" }],
      payments: [],
      dataDate: "2026-01-06T00:00:00.000Z"
    });

    expect(preview.summary).toMatchObject({ status: "limited", plannedValue: 500, earnedValue: 500, actualCost: 0 });
    expect(preview.limitations.join(" ")).toContain("факт затрат отсутствует");
  });

  it("reports a pre-baseline data date as not started instead of controlled", () => {
    const baseline = buildProjectControlBaselinePreview({ project, budgetItems, scheduleItems });
    const preview = buildProjectControlPeriodPreview({
      baseline: {
        budgetAtCompletion: baseline.summary.budgetAtCompletion,
        plannedStart: baseline.summary.plannedStart,
        plannedFinish: baseline.summary.plannedFinish,
        scheduleCoveragePercent: baseline.summary.scheduleCoveragePercent
      },
      lines: baseline.lines.map((line) => ({ ...line, id: `line-${line.sequence}` })),
      scheduleItems,
      progressEntries: [],
      payments: [],
      dataDate: "2025-12-20T00:00:00.000Z"
    });

    expect(preview.summary).toMatchObject({
      status: "not_started",
      plannedValue: 0,
      earnedValue: 0,
      actualCost: 0
    });
    expect(preview.summary.headline).toContain("ещё не началось");
  });

  it("requires explicit confirmation before persistent actions", () => {
    expect(() => projectControlBaselineRequestSchema.parse({ mode: "create", dataDate: "2026-01-01", confirm: false })).toThrow();
    expect(() => projectControlPeriodRequestSchema.parse({ mode: "publish", baselineId: "base-1", dataDate: "2026-01-01", confirm: false })).toThrow();
  });
});
