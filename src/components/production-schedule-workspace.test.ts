import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import {
  buildScheduleGroups,
  buildWeeklyControl,
  ProductionScheduleWorkspace
} from "@/components/production-schedule-workspace";
import type { BudgetItem, ScheduleItem } from "@/lib/types";

const budgetItems: BudgetItem[] = [
  {
    id: "budget-1",
    projectId: "project-1",
    section: "Монолитные работы",
    code: "M-1",
    name: "Плита перекрытия",
    unit: "м3",
    qty: 100,
    plannedUnitPrice: 7_000,
    actualUnitPrice: 0,
    forecastUnitPrice: 7_000,
    kind: "work",
    source: "test"
  }
];

const scheduleItems: ScheduleItem[] = [
  {
    id: "schedule-1",
    projectId: "project-1",
    budgetItemId: "budget-1",
    name: "Армирование плиты",
    owner: "Прораб Иванов",
    startsAt: "2026-08-24",
    endsAt: "2026-08-28",
    plannedQty: 100,
    actualQty: 40,
    status: "in_progress",
    dependency: "Приёмка опалубки"
  },
  {
    id: "schedule-2",
    projectId: "project-1",
    budgetItemId: "budget-1",
    name: "Монтаж опалубки",
    owner: "Мастер Петров",
    startsAt: "2026-08-17",
    endsAt: "2026-08-21",
    plannedQty: 80,
    actualQty: 80,
    status: "done"
  },
  {
    id: "schedule-3",
    projectId: "project-1",
    name: "Подготовить исполнительную схему",
    owner: "Инженер ПТО",
    startsAt: "2026-08-31",
    endsAt: "2026-09-02",
    plannedQty: 1,
    actualQty: 0,
    status: "not_started"
  }
];

function workspaceProps() {
  return {
    projectName: "Жилой комплекс",
    projectStartsAt: "2026-08-01",
    projectEndsAt: "2026-12-31",
    contractAmount: 10_000_000,
    budgetItems,
    scheduleItems,
    materials: [],
    procurementRequests: [],
    payments: [],
    importHistory: [],
    draft: null,
    loading: "",
    busy: false,
    canEdit: true,
    onCreate: vi.fn(),
    onUpdate: vi.fn(),
    onDelete: vi.fn(),
    onSchedulePreview: vi.fn(),
    onScheduleCommit: vi.fn(),
    onCashflowPreview: vi.fn(),
    onCashflowCommit: vi.fn(),
    onNavigate: vi.fn()
  };
}

describe("ProductionScheduleWorkspace", () => {
  it("groups confirmed VOR links and keeps unlinked work visibly unassigned", () => {
    const groups = buildScheduleGroups(scheduleItems, budgetItems, new Date(2026, 7, 26, 12).getTime());

    expect(groups.map((group) => group.title)).toEqual(["Монолитные работы", "Без этапа"]);
    expect(groups[0]?.progress).toBe(50);
    expect(groups[0]?.done).toBe(1);
    expect(groups[1]?.items[0]?.name).toBe("Подготовить исполнительную схему");
  });

  it("groups imported schedule rows by the section marker when a direct VOR link is absent", () => {
    const importedItem: ScheduleItem = {
      ...scheduleItems[2],
      id: "schedule-imported",
      dependency: "Раздел 7. Устройство кровли · Профиль ГПР: G07 · Недельный план КС: Н1 1000 ₽"
    };

    const groups = buildScheduleGroups([importedItem], budgetItems, new Date(2026, 7, 26, 12).getTime());

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("Раздел 7. Устройство кровли");
    expect(groups[0]?.items[0]?.id).toBe("schedule-imported");
  });

  it("groups approved aggregate GPR rows by their stage marker", () => {
    const approvedItem: ScheduleItem = {
      ...scheduleItems[2],
      id: "schedule-gpr",
      name: "G02 · Захватка 1 · Демонтаж кровли",
      dependency: "Этап ГПР: 1. Демонтаж · Фронт: Захватка 1 · Предшественник/допуск: G01"
    };

    const groups = buildScheduleGroups([approvedItem], budgetItems, new Date(2026, 7, 26, 12).getTime());

    expect(groups).toHaveLength(1);
    expect(groups[0]?.title).toBe("1. Демонтаж");
    expect(groups[0]?.items[0]?.id).toBe("schedule-gpr");
  });

  it("builds the weekly PTO control from confirmed schedule dates", () => {
    const rows = buildWeeklyControl(scheduleItems, new Date(2026, 7, 26, 12).getTime());

    expect(rows.find((row) => row.id === "current")?.items.map((item) => item.id)).toEqual(["schedule-1"]);
    expect(rows.find((row) => row.id === "finishing")?.items.map((item) => item.id)).toEqual(["schedule-1"]);
    expect(rows.find((row) => row.id === "next")?.items.map((item) => item.id)).toEqual(["schedule-3"]);
  });

  it("renders a compact disclosure-based schedule without firing mutations", () => {
    const props = workspaceProps();
    const html = renderToStaticMarkup(createElement(ProductionScheduleWorkspace, props));

    expect(html).toContain("График производства работ");
    expect(html).toContain("Монолитные работы");
    expect(html).toContain("Без этапа");
    expect(html).toContain("2 работы");
    expect(html).toContain("1 работа");
    expect(html).toContain("Армирование плиты");
    expect(html).toContain("План / факт");
    expect(html).toContain("Недельный контроль");
    expect(html).toContain("Риски и зависимости");
    expect(html).toContain("Расчётная финансовая нагрузка");
    expect(html).toContain("Автопланирование из ВОР");
    expect(html).toContain("Новая работа");
    expect(props.onCreate).not.toHaveBeenCalled();
    expect(props.onUpdate).not.toHaveBeenCalled();
    expect(props.onDelete).not.toHaveBeenCalled();
    expect(props.onSchedulePreview).not.toHaveBeenCalled();
    expect(props.onCashflowPreview).not.toHaveBeenCalled();
  });

  it("renders a visual gantt with expandable phases and nested work bars", () => {
    const html = renderToStaticMarkup(createElement(ProductionScheduleWorkspace, workspaceProps()));
    const trackCount = html.match(/production-gantt-track/g)?.length ?? 0;

    expect(html).toContain("production-gantt-axis");
    expect(html).toContain("production-gantt-viewport");
    expect(html).toContain("production-phase tone-");
    expect(html).toContain("production-work-row tone-");
    expect(html).toContain("role=\"img\"");
    expect(html).toContain("aria-label=\"Управление диаграммой\"");
    expect(html).toContain("aria-label=\"Плотность диаграммы\"");
    expect(html).toContain("data-density=\"compact\"");
    expect(html).toContain("production-gantt-track is-phase");
    expect(html).toContain("production-gantt-track is-work");
    expect(html).toContain("--atlas-gantt-columns:6");
    expect(html).toContain("aria-label=\"Увеличить масштаб\"");
    expect(html).toContain("Раскрыть этапы");
    expect(html).toContain("Сегодня");
    expect(html).toContain("Период:");
    expect(trackCount).toBeGreaterThanOrEqual(5);
    expect(html).not.toContain("NaN%");
  });

  it("renders a safe empty state without false progress or secret-like values", () => {
    const html = renderToStaticMarkup(createElement(ProductionScheduleWorkspace, {
      ...workspaceProps(),
      budgetItems: [],
      scheduleItems: []
    }));

    expect(html).toContain("График пока пуст");
    expect(html).toContain("Нет данных");
    expect(html).not.toContain("DATABASE_URL");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toMatch(/sk-(proj|live|test|[A-Za-z0-9]{12,})/);
  });
});
