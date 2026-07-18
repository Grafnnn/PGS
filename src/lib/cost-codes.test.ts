import { describe, expect, it } from "vitest";
import { buildCostCodeBaseline, costCodeAssignmentSchema, costCodeBaselineSchema, costCodeCoverage } from "./cost-codes";

describe("cost codes CBS-WBS model", () => {
  it("builds a stable hierarchy and assignments from VOR sections", () => {
    const input = [
      { id: "b-3", section: "Фасад", subsection: "Утепление", kind: "material", name: "Минвата" },
      { id: "b-1", section: "Земляные работы", subsection: "Котлован", kind: "work", name: "Разработка грунта" },
      { id: "b-2", section: "Фасад", subsection: "Утепление", kind: "work", name: "Монтаж утеплителя" }
    ];

    const first = buildCostCodeBaseline(input);
    const second = buildCostCodeBaseline([...input].reverse());

    expect(second).toEqual(first);
    expect(first.summary).toEqual({ budgetItems: 3, sections: 2, codes: 7, leafCodes: 3, assignments: 3 });
    expect(first.nodes.map((item) => `${item.code}:${item.name}`)).toEqual([
      "01:Земляные работы",
      "01.01:Котлован",
      "01.01.01:Работы",
      "02:Фасад",
      "02.01:Утепление",
      "02.01.01:Материалы",
      "02.01.02:Работы"
    ]);
    expect(first.assignments.find((item) => item.entityId === "b-3")).toMatchObject({ code: "02.01.01" });
  });

  it("uses safe fallback groups for incomplete VOR data", () => {
    const result = buildCostCodeBaseline([{ id: "b-1", section: "", subsection: null, kind: "", name: "Неизвестная строка" }]);
    expect(result.nodes.map((item) => item.name)).toEqual(["Без раздела", "Основной объём", "Прочие затраты"]);
    expect(result.assignments).toHaveLength(1);
  });

  it("requires explicit confirmation for baseline commit", () => {
    expect(costCodeBaselineSchema.safeParse({ mode: "preview" }).success).toBe(true);
    expect(costCodeBaselineSchema.safeParse({ mode: "commit", confirm: false }).success).toBe(false);
    expect(costCodeBaselineSchema.safeParse({ mode: "commit", confirm: true }).success).toBe(true);
  });

  it("allows unlinking an entity without inventing a replacement code", () => {
    expect(costCodeAssignmentSchema.parse({ entityType: "payment", entityId: "payment-1", costCodeId: null })).toEqual({
      entityType: "payment", entityId: "payment-1", costCodeId: null
    });
  });

  it("calculates module coverage without false green on empty data", () => {
    const result = costCodeCoverage({
      codes: [{ id: "c-1", code: "01", name: "Работы", segment: "cost", costType: "expense", status: "active", source: "manual", sortOrder: 0 }],
      budgetItems: [{ costCodeId: "c-1" }, { costCodeId: null }],
      scheduleItems: [{ costCodeId: "c-1" }],
      materials: [],
      procurementItems: [],
      payments: [{ costCodeId: null }],
      changeOrderItems: []
    });
    expect(result).toMatchObject({ activeCodes: 1, total: 4, linked: 2, percent: 50 });
    expect(result.categories.materials).toEqual({ total: 0, linked: 0 });
  });
});
