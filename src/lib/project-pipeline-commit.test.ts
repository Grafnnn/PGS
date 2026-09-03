import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";

const mocks = vi.hoisted(() => ({ transaction: vi.fn() }));

vi.mock("@/lib/prisma", () => ({ prisma: { $transaction: mocks.transaction } }));

describe("project pipeline commits", () => {
  beforeEach(() => vi.clearAllMocks());

  it("stores generated schedule stages as 100 percent milestones", async () => {
    const create = vi.fn().mockImplementation(async ({ data }) => ({
      id: "schedule-1",
      ...data,
      startsAt: new Date(data.startsAt),
      endsAt: new Date(data.endsAt),
      plannedQty: new Prisma.Decimal(data.plannedQty),
      actualQty: new Prisma.Decimal(data.actualQty),
      manualActualQty: new Prisma.Decimal(data.manualActualQty),
      reportActualQty: new Prisma.Decimal(data.reportActualQty),
      createdAt: new Date(),
      updatedAt: new Date(),
      costCodeId: null,
      budgetItemId: null,
      supersededAt: null
    }));
    const tx = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: "project-1" }]),
      project: { findUnique: vi.fn().mockResolvedValue({
        id: "project-1",
        organizationId: "org-1",
        name: "Проект",
        contractAmount: new Prisma.Decimal(1_000_000),
        startsAt: new Date("2026-09-01T00:00:00.000Z"),
        endsAt: new Date("2026-12-31T00:00:00.000Z"),
        budgetItems: [{
          id: "budget-1", organizationId: "org-1", projectId: "project-1", section: "Кровля", code: "1",
          name: "Монтаж покрытия", unit: "м2", qty: new Prisma.Decimal(10), plannedUnitPrice: new Prisma.Decimal(100),
          actualUnitPrice: new Prisma.Decimal(0), forecastUnitPrice: new Prisma.Decimal(100), kind: "work", source: "manual",
          comment: null, costCodeId: null, createdBy: "user-1", createdAt: new Date(), updatedAt: new Date()
        }],
        materials: [], scheduleItems: [], procurementRequests: [], payments: [], cashflowPeriods: [], documents: [], importBatches: []
      }) },
      scheduleItem: {
        aggregate: vi.fn().mockResolvedValue({ _max: { revision: null } }),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
        create
      }
    };
    mocks.transaction.mockImplementation(async (callback: (client: typeof tx) => unknown) => callback(tx));

    const { commitScheduleDraft } = await import("./project-pipeline");
    const result = await commitScheduleDraft("project-1", "user-1");

    expect(result?.created).toHaveLength(1);
    expect(create).toHaveBeenCalledWith({ data: expect.objectContaining({ plannedQty: new Prisma.Decimal(100), unit: "%", progressMode: "milestone" }) });
  });
});
