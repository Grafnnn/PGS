import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { DailyReportWorkOutputEditor } from "@/components/daily-report-work-output-editor";
import type { DailyReportCrewMember, ScheduleItem } from "@/lib/types";

const crew: DailyReportCrewMember[] = [
  { resourceId: "worker-1", name: "Иван Петров", profession: "Кровельщик", kind: "worker", headcount: 1 },
  { resourceId: "worker-2", name: "Пётр Сидоров", profession: "Монтажник", kind: "worker", headcount: 1 },
  { resourceId: "engineer-1", name: "Анна Волкова", profession: "Инженер ПТО", kind: "engineer", headcount: 1 }
];

const scheduleItem: ScheduleItem = {
  id: "schedule-1",
  projectId: "project-1",
  name: "Монтаж кровельной мембраны",
  owner: "Прораб",
  startsAt: "2026-09-01T00:00:00.000Z",
  endsAt: "2026-09-10T00:00:00.000Z",
  plannedQty: 120,
  actualQty: 40,
  unit: "м²",
  status: "in_progress"
};

describe("DailyReportWorkOutputEditor", () => {
  it("shows a compact schedule closeout with derived professions and labor", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewMembers: crew,
      scheduleItems: [scheduleItem],
      shiftHours: 8,
      outputs: [{
        scheduleItemId: "schedule-1",
        crewResourceIds: ["worker-1", "worker-2"],
        profession: "Кровельщик, Монтажник",
        workName: scheduleItem.name,
        quantity: 20,
        unit: "м²",
        workerCount: 2,
        hoursPerWorker: 8,
        laborHours: 16,
        laborAllocationMode: "auto"
      }],
      onChange: vi.fn(),
      onShiftHoursChange: vi.fn()
    }));

    expect(html).toContain("Работы за смену");
    expect(html).toContain("Всего: 120 м² · выполнено ранее: 40 · осталось: 80");
    expect(html).toContain("2 чел. × 8 ч");
    expect(html).toContain("Кровельщик, Монтажник");
    expect(html).toContain("16 чел.-ч");
    expect(html).toContain("Назначено: Иван Петров, Пётр Сидоров");
    expect(html).not.toContain("Профессия<input");
  });

  it("marks only the fields the foreman must still complete", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewMembers: crew,
      outputs: [{
        crewResourceIds: ["worker-1"],
        profession: "",
        workName: "Дополнительная работа",
        quantity: 0,
        unit: "м²",
        laborHours: 0
      }],
      onChange: vi.fn()
    }));

    expect(html).toContain("требуют заполнения: 1");
    expect(html).toContain("aria-invalid=\"true\"");
    expect(html).toContain("Объём должен быть больше нуля");
    expect(html).not.toContain("Укажите профессию");
  });

  it("keeps engineers out of work allocation and defaults the shift to eight hours", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewMembers: crew,
      outputs: [{
        crewResourceIds: ["worker-1"],
        profession: "Кровельщик",
        workName: "Монтаж мембраны",
        quantity: 20,
        unit: "м²",
        workerCount: 1,
        hoursPerWorker: 8,
        laborHours: 8
      }],
      onChange: vi.fn()
    }));

    expect(html).toContain("Рабочие</small><strong>2 чел.");
    expect(html).toContain("value=\"8\"");
    expect(html).toContain("Иван Петров");
    expect(html).toContain("Пётр Сидоров");
    expect(html).not.toContain("Анна Волкова");
  });

  it("renders the unit from the current schedule as reference instead of an input", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewMembers: crew,
      scheduleItems: [scheduleItem],
      outputs: [{
        scheduleItemId: "schedule-1",
        crewResourceIds: ["worker-1"],
        profession: "Кровельщик",
        workName: scheduleItem.name,
        quantity: 10,
        unit: "м²",
        workerCount: 1,
        hoursPerWorker: 8,
        laborHours: 8
      }],
      onChange: vi.fn()
    }));

    expect(html).toContain("<b>м²</b>");
    expect(html).not.toContain("aria-label=\"Единица работы 1\"");
  });

  it("shows the resolved estimate unit when the schedule still contains a generic unit", () => {
    const html = renderToStaticMarkup(createElement(DailyReportWorkOutputEditor, {
      crewMembers: crew,
      scheduleItems: [{ ...scheduleItem, unit: "ед." }],
      scheduleUnits: new Map([["schedule-1", "м²"]]),
      outputs: [{
        scheduleItemId: "schedule-1",
        crewResourceIds: ["worker-1"],
        profession: "Кровельщик",
        workName: scheduleItem.name,
        quantity: 10,
        unit: "м²",
        workerCount: 1,
        hoursPerWorker: 8,
        laborHours: 8
      }],
      onChange: vi.fn()
    }));

    expect(html).toContain("Всего: 120 м² · выполнено ранее: 40 · осталось: 80");
    expect(html).toContain("<b>м²</b>");
    expect(html).not.toContain("Всего: 120 ед.");
  });
});
