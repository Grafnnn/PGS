import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { buildScheduleWorkSuggestions, ReportsWorkflow, ScheduleWorkPicker } from "@/components/reports-workflow";
import type { ScheduleItem } from "@/lib/types";

describe("ReportsWorkflow", () => {
  it("keeps the crew checkbox compact so employee names retain readable width", () => {
    const styles = readFileSync(new URL("../app/globals.css", import.meta.url), "utf8");
    const checkboxRule = styles.match(/\.daily-crew-grid label > input\[type="checkbox"\]\s*\{([^}]*)\}/)?.[1];
    const contentRule = styles.match(/\.daily-crew-grid label span\s*\{([^}]*)\}/)?.[1];
    const mobileSearchRules = [...styles.matchAll(/\.daily-crew-tools > label\s*\{([^}]*)\}/g)];
    const mobileSearchRule = mobileSearchRules.at(-1)?.[1];

    expect(checkboxRule).toContain("flex: 0 0 18px");
    expect(checkboxRule).toContain("width: 18px");
    expect(contentRule).toContain("flex: 1 1 auto");
    expect(contentRule).toContain("min-width: 0");
    expect(mobileSearchRule).toContain("flex: 0 0 auto");
    expect(mobileSearchRule).toContain("width: 100%");
  });

  it("renders an explicit daily-report workflow without creating records on render", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      scheduleItems: [],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).toContain("Смена и рапорт прораба");
    expect(html).toContain("Открыть смену");
    expect(html).toContain("Обновить");
    expect(html).toContain("Версионная управленческая отчетность");
    expect(html).toContain("Формирование выполняется только по явной команде");
    expect(html).not.toContain("18 рабочих");
    expect(html).not.toContain("Кран, самосвалы");
  });

  it("keeps write controls hidden for viewers", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      reports: [],
      scheduleItems: [],
      currentUser: { authenticated: true, role: "VIEWER" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).not.toContain("Открыть смену");
    expect(html).not.toContain("Сформировать версию");
  });

  it("shows approved measurable output and its normalized monthly productivity", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      scheduleItems: [],
      reports: [{
        id: "report-1",
        projectId: "project-1",
        date: "2026-07-28",
        author: "Прораб",
        weather: "Ясно",
        workers: 4,
        engineers: 1,
        equipment: "",
        completedWorks: "Кладка стен",
        materialsReceived: "",
        materialsConsumed: "",
        downtime: "",
        issues: "",
        workOutputs: [{ profession: "Каменщик", workName: "Кладка стен", quantity: 20, unit: "м²", laborHours: 32 }],
        status: "approved"
      }],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).toContain("Каменщик");
    expect(html).toContain("100 м²/чел.-мес.");
  });

  it("shows an open shift as a plan that can be closed with actual facts", () => {
    const html = renderToStaticMarkup(createElement(ReportsWorkflow, {
      projectId: "project-1",
      scheduleItems: [],
      reports: [{
        id: "report-open",
        projectId: "project-1",
        date: "2026-08-31",
        author: "Прораб",
        weather: "Ясно",
        workers: 1,
        engineers: 0,
        equipment: "",
        completedWorks: "",
        materialsReceived: "",
        materialsConsumed: "",
        downtime: "",
        issues: "",
        phase: "open",
        workCategory: "Кровельные работы",
        plannedWorks: "Монтаж мембраны",
        crewMembers: [{ resourceId: "resource-1", name: "Сотрудник 1", profession: "Кровельщик", kind: "worker", headcount: 1 }],
        status: "draft"
      }],
      currentUser: { authenticated: true, role: "MANAGER", name: "РП" },
      currentUserLoaded: true,
      onReportsChange: () => undefined
    }));
    expect(html).toContain("Смена открыта");
    expect(html).toContain("Монтаж мембраны");
    expect(html).toContain("Сотрудник 1");
    expect(html).toContain("Внести факт");
    expect(html).not.toContain("Отправить");
  });

  it("offers project schedule works as a compact quick picker", () => {
    const scheduleItems: ScheduleItem[] = [{
      id: "schedule-active",
      projectId: "project-1",
      name: "Монтаж кровельной мембраны",
      owner: "Прораб кровли",
      startsAt: "2026-08-30T00:00:00.000Z",
      endsAt: "2026-09-03T00:00:00.000Z",
      plannedQty: 120,
      actualQty: 40,
      status: "in_progress"
    }];
    const html = renderToStaticMarkup(createElement(ScheduleWorkPicker, {
      items: scheduleItems,
      shiftDate: "2026-08-31",
      selectedValue: "",
      onSelect: () => undefined
    }));

    expect(html).toContain("Из графика");
    expect(html).toContain("Монтаж кровельной мембраны");
    expect(html).toContain("Прораб кровли");
    expect(html).toContain("В работе");
  });

  it("ranks current schedule work before future and completed items", () => {
    const base: Omit<ScheduleItem, "id" | "name" | "startsAt" | "endsAt" | "status"> = {
      projectId: "project-1",
      owner: "",
      plannedQty: 1,
      actualQty: 0
    };
    const suggestions = buildScheduleWorkSuggestions([
      { ...base, id: "done", name: "Завершённая работа", startsAt: "2026-08-01", endsAt: "2026-08-10", status: "done" },
      { ...base, id: "future", name: "Будущая работа", startsAt: "2026-09-05", endsAt: "2026-09-10", status: "not_started" },
      { ...base, id: "active", name: "Текущая работа", startsAt: "2026-08-30", endsAt: "2026-09-02", status: "in_progress" }
    ], "2026-08-31");

    expect(suggestions.map((item) => item.id)).toEqual(["active", "future", "done"]);
    expect(buildScheduleWorkSuggestions(suggestions, "2026-08-31", "будущая")).toHaveLength(1);
  });
});
