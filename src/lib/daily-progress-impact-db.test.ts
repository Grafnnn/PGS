import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  applyDailyProgressImpact,
  DailyProgressImpactError,
  loadDailyProgressImpact
} from "@/lib/daily-progress-impact-db";

const mocks = vi.hoisted(() => ({
  reportFind: vi.fn(),
  reportClaim: vi.fn(),
  reportUpdate: vi.fn(),
  scheduleFind: vi.fn(),
  scheduleUpdate: vi.fn(),
  materialFind: vi.fn(),
  materialUpdate: vi.fn(),
  progressCreateMany: vi.fn(),
  actionCreate: vi.fn(),
  audit: vi.fn()
}));

vi.mock("@/lib/prisma", () => {
  const client = {
    dailyReport: {
      findUnique: mocks.reportFind,
      updateMany: mocks.reportClaim,
      update: mocks.reportUpdate
    },
    scheduleItem: {
      findMany: mocks.scheduleFind,
      update: mocks.scheduleUpdate
    },
    material: {
      findMany: mocks.materialFind,
      update: mocks.materialUpdate
    },
    workProgressEntry: { createMany: mocks.progressCreateMany },
    projectActionItem: { create: mocks.actionCreate }
  };
  return {
    prisma: {
      ...client,
      $transaction: vi.fn(async (callback: (transaction: typeof client) => unknown) => callback(client))
    }
  };
});
vi.mock("@/lib/audit", () => ({ writeAudit: mocks.audit }));

const date = new Date("2026-07-30T12:00:00.000Z");
const baseReport = {
  id: "report-1",
  organizationId: "org-1",
  projectId: "project-1",
  date,
  author: "Прораб",
  weather: "Ясно",
  workers: 6,
  engineers: 1,
  equipment: "Кран",
  completedWorks: "Кладка стен",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "Ожидание поставки",
  issues: "",
  workOutputs: [{
    profession: "Каменщик",
    workName: "Кладка стен",
    quantity: 20,
    unit: "м²",
    laborHours: 32,
    scheduleItemId: "schedule-1"
  }],
  materialActuals: [{ materialId: "material-1", kind: "consumed", quantity: 100, unit: "шт" }],
  equipmentActuals: [{ name: "Кран", quantity: 1, hours: 7, downtimeHours: 1 }],
  status: "approved",
  impactStatus: "pending",
  impactAppliedAt: null,
  impactAppliedBy: null,
  impactSummary: null,
  createdBy: "manager-1",
  createdAt: date,
  updatedAt: date
};
const schedule = {
  id: "schedule-1",
  organizationId: "org-1",
  projectId: "project-1",
  costCodeId: null,
  budgetItemId: "budget-1",
  name: "Кладка стен",
  owner: "Прораб",
  startsAt: date,
  endsAt: date,
  plannedQty: 100,
  actualQty: 70,
  status: "in_progress",
  dependency: null,
  createdBy: "manager-1",
  createdAt: date,
  updatedAt: date
};
const material = {
  id: "material-1",
  organizationId: "org-1",
  projectId: "project-1",
  costCodeId: null,
  name: "Кирпич",
  unit: "шт",
  requiredQty: 1000,
  orderedQty: 1000,
  deliveredQty: 600,
  consumedQty: 500,
  plannedUnitPrice: 10,
  actualUnitPrice: 11,
  supplier: "Поставщик",
  neededAt: date,
  status: "in_transit",
  createdBy: "manager-1",
  createdAt: date,
  updatedAt: date
};
const user = { id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER" as const, authenticated: true };

describe("daily progress impact DB commit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.reportFind.mockResolvedValue(baseReport);
    mocks.reportClaim.mockResolvedValue({ count: 1 });
    mocks.reportUpdate.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...baseReport, ...data, updatedAt: date }));
    mocks.scheduleFind.mockResolvedValue([schedule]);
    mocks.materialFind.mockResolvedValue([material]);
    mocks.scheduleUpdate.mockResolvedValue(schedule);
    mocks.materialUpdate.mockResolvedValue(material);
    mocks.progressCreateMany.mockResolvedValue({ count: 1 });
    mocks.actionCreate.mockResolvedValue({ id: "action-1" });
    mocks.audit.mockResolvedValue({});
  });

  it("claims and applies an approved report atomically with source traceability", async () => {
    const loaded = await loadDailyProgressImpact("report-1");
    const result = await applyDailyProgressImpact("report-1", user, loaded!.fingerprint);

    expect(result.alreadyApplied).toBe(false);
    expect(mocks.reportClaim).toHaveBeenCalledWith({
      where: { id: "report-1", impactStatus: "pending" },
      data: { impactStatus: "applying" }
    });
    expect(mocks.progressCreateMany).toHaveBeenCalledWith({
      data: [expect.objectContaining({
        sourceDailyReportId: "report-1",
        sourceOutputIndex: 0,
        scheduleItemId: "schedule-1",
        status: "approved"
      })]
    });
    expect(mocks.scheduleUpdate).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: "schedule-1" },
      data: expect.objectContaining({ actualQty: { increment: expect.anything() } })
    }));
    expect(mocks.materialUpdate).toHaveBeenCalled();
    expect(mocks.actionCreate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ sourceModule: "daily-progress", targetTab: "Риски" })
    }));
    expect(mocks.reportUpdate).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ impactStatus: "applied", impactAppliedBy: "manager-1" })
    }));
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      entity: "daily_report_impact",
      action: "accept"
    }));
  });

  it("returns an already-applied result without duplicating facts", async () => {
    mocks.reportFind.mockResolvedValue({
      ...baseReport,
      impactStatus: "applied",
      impactAppliedAt: date,
      impactSummary: {
        scheduleItemCount: 1,
        progressEntryCount: 1,
        materialUpdateCount: 1,
        linkedWorkOutputCount: 1,
        unlinkedWorkOutputCount: 0,
        laborHours: 32,
        equipmentHours: 7,
        acceptanceCandidateCount: 1,
        actionId: "action-1"
      }
    });

    const result = await applyDailyProgressImpact("report-1", user, "stale-retry");
    expect(result.alreadyApplied).toBe(true);
    expect(result.actionId).toBe("action-1");
    expect(mocks.reportClaim).not.toHaveBeenCalled();
    expect(mocks.progressCreateMany).not.toHaveBeenCalled();
    expect(mocks.materialUpdate).not.toHaveBeenCalled();
  });

  it("does not retroactively apply legacy approved reports", async () => {
    mocks.reportFind.mockResolvedValue({ ...baseReport, impactStatus: "not_applicable" });
    await expect(applyDailyProgressImpact("report-1", user, "legacy")).rejects.toEqual(
      expect.objectContaining<Partial<DailyProgressImpactError>>({ status: 409 })
    );
    expect(mocks.reportClaim).not.toHaveBeenCalled();
  });

  it("rejects a stale preview before claiming or writing facts", async () => {
    const loaded = await loadDailyProgressImpact("report-1");
    mocks.scheduleFind.mockResolvedValue([{ ...schedule, actualQty: 75 }]);

    await expect(applyDailyProgressImpact("report-1", user, loaded!.fingerprint)).rejects.toEqual(
      expect.objectContaining<Partial<DailyProgressImpactError>>({ status: 409 })
    );
    expect(mocks.reportClaim).not.toHaveBeenCalled();
    expect(mocks.progressCreateMany).not.toHaveBeenCalled();
  });
});
