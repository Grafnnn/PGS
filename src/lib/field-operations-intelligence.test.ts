import { describe, expect, it } from "vitest";
import { buildFieldOperationsIntelligence } from "@/lib/field-operations-intelligence";
import type { DailyReport, Material, Risk, ScheduleItem } from "@/lib/types";

const reports: DailyReport[] = [
  {
    id: "report-1",
    projectId: "project-smoke",
    date: "2026-07-10",
    author: "Прораб",
    weather: "Дождь",
    workers: 14,
    engineers: 2,
    equipment: "Кран, экскаватор",
    completedWorks: "Монтаж каркаса выполнен частично",
    materialsReceived: "Металл",
    materialsConsumed: "Металл",
    downtime: "Простой крана 2 часа из-за дождя",
    issues: "Не хватает металла на следующий фронт",
    status: "submitted"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "schedule-1",
    projectId: "project-smoke",
    name: "Монтаж каркаса",
    owner: "ООО Монтаж",
    startsAt: "2026-07-09",
    endsAt: "2026-07-12",
    plannedQty: 10,
    actualQty: 4,
    status: "delayed"
  }
];

const materials: Material[] = [
  {
    id: "mat-1",
    projectId: "project-smoke",
    name: "Металл",
    unit: "т",
    requiredQty: 10,
    orderedQty: 6,
    deliveredQty: 4,
    consumedQty: 3,
    plannedUnitPrice: 100000,
    actualUnitPrice: 100000,
    status: "required",
    neededAt: "2026-07-11",
    supplier: "Не выбран"
  }
];

const risks: Risk[] = [
  {
    id: "risk-1",
    projectId: "project-smoke",
    title: "Простой техники на площадке",
    reason: "Кран недоступен",
    priority: "high",
    owner: "РП",
    dueAt: "2026-07-10",
    status: "open"
  }
];

describe("field operations intelligence", () => {
  it("does not claim green site operations when there are no reports", () => {
    const model = buildFieldOperationsIntelligence({ project: { id: "empty" } });

    expect(model.summary.status).toBe("no_reports");
    expect(model.summary.tone).toBe("info");
    expect(model.actions[0].title).toContain("Создать");
    expect(model.handoff.copyText).toContain("Нет рапортов");
  });

  it("surfaces downtime, issues, workforce, schedule links, and material signals", () => {
    const model = buildFieldOperationsIntelligence({
      project: { id: "project-smoke", name: "Smoke project" },
      dailyReports: reports,
      scheduleItems,
      materials,
      risks,
      documentChecklist: [
        {
          key: "photo",
          title: "Фотофиксация скрытых работ",
          status: "missing",
          categoryHints: ["фото"],
          documentIds: [],
          evidence: [],
          suggestedNextStep: "Загрузить фотофиксацию"
        }
      ]
    });

    expect(model.summary.status).toBe("blocked");
    expect(model.summary.totalWorkers).toBe(14);
    expect(model.summary.totalEngineers).toBe(2);
    expect(model.summary.downtimeReports).toBe(1);
    expect(model.summary.issueReports).toBe(1);
    expect(model.summary.linkedScheduleItems).toBe(1);
    expect(model.summary.materialSignals).toBe(1);
    expect(model.signals.some((signal) => signal.targetTab === "График")).toBe(true);
    expect(model.signals.some((signal) => signal.targetTab === "Материалы")).toBe(true);
    expect(model.actions.some((action) => action.targetTab === "КС")).toBe(true);
  });

  it("builds a management handoff without leaking secrets", () => {
    const model = buildFieldOperationsIntelligence({
      project: { id: "project-smoke", name: "Smoke project" },
      dailyReports: reports,
      scheduleItems,
      materials
    });

    expect(model.handoff.copyText).toContain("Field operations");
    expect(model.handoff.copyText).toContain("Smoke project");
    expect(model.handoff.copyText).not.toContain("DATABASE_URL");
    expect(model.handoff.copyText).not.toContain("OPENAI_API_KEY");
  });
});
