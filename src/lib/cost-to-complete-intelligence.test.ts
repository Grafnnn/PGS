import { describe, expect, it } from "vitest";
import { buildCostToCompleteIntelligence } from "@/lib/cost-to-complete-intelligence";

describe("buildCostToCompleteIntelligence", () => {
  it("does not claim a healthy forecast without contract and budget data", () => {
    const model = buildCostToCompleteIntelligence({});
    expect(model.summary.status).toBe("no_data");
    expect(model.summary.tone).toBe("info");
  });

  it("surfaces margin, cash, material and schedule signals from existing project data", () => {
    const model = buildCostToCompleteIntelligence({
      project: { contractAmount: 1_000_000 },
      budgetItems: [{ id: "b1", projectId: "p1", section: "Монолит", code: "", name: "Работы", unit: "шт", qty: 1, plannedUnitPrice: 800_000, actualUnitPrice: 200_000, forecastUnitPrice: 1_020_000, kind: "work", source: "test" }],
      scheduleItems: [{ id: "s1", projectId: "p1", name: "Монолит", owner: "ПТО", startsAt: "2026-01-01", endsAt: "2026-01-10", plannedQty: 10, actualQty: 2, status: "delayed" }],
      materials: [{ id: "m1", projectId: "p1", name: "Бетон", unit: "м3", requiredQty: 10, orderedQty: 0, deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 1, actualUnitPrice: 0, supplier: "", neededAt: "2026-01-10", status: "required" }],
      payments: [{ id: "pay1", projectId: "p1", title: "Поставка", counterparty: "Поставщик", direction: "outgoing", plannedAt: "2026-01-10", amount: 2_000_000, status: "approved", category: "supplier" }]
    });
    expect(model.summary.status).toBe("critical");
    expect(model.summary.costToComplete).toBe(820_000);
    expect(model.signals.map((item) => item.id)).toEqual(expect.arrayContaining(["forecast-overrun", "margin-threshold", "cash-gap", "material-deficit", "schedule-delay"]));
    expect(model.actions).toHaveLength(4);
  });

  it("combines approved report progress, estimate value, expenses and report payroll without double counting", () => {
    const model = buildCostToCompleteIntelligence({
      project: { contractAmount: 500_000 },
      budgetItems: [{
        id: "b1", projectId: "p1", section: "Кровля", code: "10", name: "Демонтаж покрытия", unit: "м²",
        qty: 100, plannedUnitPrice: 1_000, actualUnitPrice: 0, forecastUnitPrice: 1_100, kind: "work", source: "test"
      }],
      scheduleItems: [{
        id: "s1", projectId: "p1", budgetItemId: "b1", name: "10 Демонтаж покрытия", owner: "ПТО",
        startsAt: "2026-08-01", endsAt: "2026-09-01", plannedQty: 100, actualQty: 25, status: "in_progress"
      }],
      dailyReports: [{
        id: "r1", projectId: "p1", date: "2026-08-31", author: "Прораб", weather: "Ясно", workers: 4, engineers: 0,
        equipment: "", completedWorks: "Демонтаж", materialsReceived: "", materialsConsumed: "", downtime: "", issues: "",
        phase: "closed", shiftHours: 8, status: "approved",
        crewMembers: [{ resourceId: "w1", name: "Бригада", profession: "Кровельщик", kind: "worker", headcount: 4 }],
        workOutputs: [{ scheduleItemId: "s1", profession: "Кровельщик", workName: "10 Демонтаж покрытия", quantity: 25, unit: "м2", laborHours: 40 }]
      }],
      workforceResources: [{
        id: "w1", kind: "worker", name: "Бригада", profession: "Кровельщик", employmentType: "staff", headcount: 4,
        capacityHoursPerMonth: 160, productivityNorm: 0, productivityUnit: null, monthlyCost: 0, grossMonthlySalary: 160_000,
        hourlyCost: 0, certifications: [], status: "active", notes: null,
        assignment: { id: "a1", projectId: "p1", resourceId: "w1", startsAt: "2026-08-01", endsAt: "2026-09-30", allocationPercent: 100, plannedHours: 0, plannedOutput: 0, status: "completed", notes: null },
        allocation: { currentProjectPercent: 100, otherProjectsPercent: 0, totalPercent: 100, overlappingProjects: 0, overloaded: false }
      }],
      payrollPolicy: { projectId: "p1", insuranceContributionRate: 30, accidentContributionRate: 0, personalIncomeTaxRate: 13, workingHoursPerMonth: 160, sourceYear: 2026 },
      expenseSummary: { count: 2, grossAmount: 30_000, taxAmount: 0, receipts: 1, withoutReceipt: 1, byCategory: { labor: 10_000, tax: 0, materials: 20_000 } },
      payments: [{ id: "pay1", projectId: "p1", title: "Оплата", counterparty: "Поставщик", direction: "outgoing", plannedAt: "2026-08-31", paidAt: "2026-08-31", amount: 80_000, status: "paid", category: "supplier" }]
    });

    expect(model.reportProgress).toMatchObject({
      approvedReports: 1,
      outputRows: 1,
      matchedRows: 1,
      completionPercent: 25,
      matchedEstimateCost: 100_000,
      earnedEstimateCost: 25_000,
      laborHours: 40
    });
    expect(model.reportProgress.works[0]).toMatchObject({ reportedQty: 25, plannedQty: 100, completionPercent: 25 });
    expect(model.spending).toMatchObject({
      expenseRegisterCost: 30_000,
      reportPayrollCost: 52_000,
      payrollAlreadyRegistered: 10_000,
      unregisteredPayrollCost: 42_000,
      totalSpent: 72_000,
      paidOutgoingActual: 80_000
    });
    expect(model.summary.actualCost).toBe(72_000);
    expect(model.summary.costToComplete).toBe(38_000);
    expect(model.summary.earnedContractValue).toBe(25_000);
    expect(model.summary.liquidityBalance).toBe(-47_000);
  });

  it("prices numbered schedule outputs from matching contract VOR rows", () => {
    const model = buildCostToCompleteIntelligence({
      budgetItems: [
        { id: "b1", projectId: "p1", section: "Демонтаж", code: "1", name: "Демонтаж рулонной гидроизоляции", unit: "м2", qty: 1765.81, plannedUnitPrice: 190, actualUnitPrice: 0, forecastUnitPrice: 190, kind: "work", source: "КП" },
        { id: "b2", projectId: "p1", section: "Демонтаж", code: "2", name: "Демонтаж цементно-песчанной стяжки толщиной 200 мм", unit: "м2", qty: 1765.81, plannedUnitPrice: 475, actualUnitPrice: 0, forecastUnitPrice: 475, kind: "work", source: "КП" }
      ],
      scheduleItems: [
        { id: "s1", projectId: "p1", name: "10 Демонтаж рулонной гидроизоляции", owner: "ПТО", startsAt: "2026-09-07", endsAt: "2026-09-19", plannedQty: 1765.81, actualQty: 200, status: "in_progress" },
        { id: "s2", projectId: "p1", name: "11 Демонтаж цементно-песчанной стяжки толщиной 200 мм", owner: "ПТО", startsAt: "2026-09-07", endsAt: "2026-09-19", plannedQty: 1765.81, actualQty: 20, status: "in_progress" }
      ],
      dailyReports: [{
        id: "r1", projectId: "p1", date: "2026-08-31", author: "Прораб", weather: "", workers: 12, engineers: 0,
        equipment: "", completedWorks: "Демонтаж", materialsReceived: "", materialsConsumed: "", downtime: "", issues: "",
        phase: "closed", status: "approved", workOutputs: [
          { scheduleItemId: "s1", profession: "Мастер", workName: "10 Демонтаж рулонной гидроизоляции", quantity: 200, unit: "м²", laborHours: 8 },
          { scheduleItemId: "s2", profession: "Мастер", workName: "11 Демонтаж цементно-песчанной стяжки толщиной 200 мм", quantity: 20, unit: "м²", laborHours: 8 }
        ]
      }],
      expenseSummary: { count: 10, grossAmount: 301_001, taxAmount: 0, receipts: 1, withoutReceipt: 9, byCategory: {} }
    });

    expect(model.reportProgress).toMatchObject({
      matchedRows: 2,
      unmatchedRows: 0,
      matchedEstimateCost: 1_174_263.65,
      earnedEstimateCost: 47_500,
      completionPercent: 4.05
    });
    expect(model.summary.liquidityBalance).toBe(-253_501);
    expect(model.reportProgress.works).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "Демонтаж рулонной гидроизоляции", contractUnitPrice: 190, earnedEstimateCost: 38_000 }),
      expect.objectContaining({ name: "Демонтаж цементно-песчанной стяжки толщиной 200 мм", contractUnitPrice: 475, earnedEstimateCost: 9_500 })
    ]));
  });

  it("does not count draft reports as confirmed progress or payroll fact", () => {
    const model = buildCostToCompleteIntelligence({
      dailyReports: [{
        id: "draft", projectId: "p1", date: "2026-08-31", author: "Прораб", weather: "", workers: 2, engineers: 0,
        equipment: "", completedWorks: "Работа", materialsReceived: "", materialsConsumed: "", downtime: "", issues: "",
        phase: "closed", status: "draft", workOutputs: [{ profession: "Рабочий", workName: "Работа", quantity: 10, unit: "м²", laborHours: 16 }]
      }]
    });
    expect(model.reportProgress.approvedReports).toBe(0);
    expect(model.reportProgress.outputRows).toBe(0);
    expect(model.spending.reportPayrollCost).toBe(0);
  });
});
