import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ScheduleItem } from "@/lib/types";
import { ProjectCalendarShiftControl } from "./project-calendar-shift-control";

describe("ProjectCalendarShiftControl", () => {
  it("renders an explicit preview and confirmation flow for an owner", () => {
    const scheduleItems = [{ startsAt: "2026-09-07", endsAt: "2026-09-19" }] as ScheduleItem[];
    const html = renderToStaticMarkup(createElement(ProjectCalendarShiftControl, {
      projectId: "project-1",
      scheduleItems,
      canShift: true
    }));

    expect(html).toContain("Перенести календарь");
    expect(html).toContain("Новое начало работ");
    expect(html).toContain("Проверить перенос");
    expect(html).toContain("Сдвигает график и плановые сроки заказа материалов");
    expect(html).not.toContain("Применить перенос");
  });

  it("is not rendered for users without calendar management permission", () => {
    const html = renderToStaticMarkup(createElement(ProjectCalendarShiftControl, {
      projectId: "project-1",
      scheduleItems: [],
      canShift: false
    }));

    expect(html).toBe("");
  });
});
