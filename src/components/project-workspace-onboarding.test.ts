import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectWorkspace } from "@/components/project-workspace";

const emptyBundle = {
  project: {
    id: "project-new",
    name: "Новый объект",
    customer: "Заказчик",
    object: "Административное здание",
    address: "Москва",
    contractAmount: 1000000,
    startsAt: "2026-07-01",
    endsAt: "2026-09-01",
    manager: "РП"
  },
  budgetItems: [],
  scheduleItems: [],
  materials: [],
  procurementRequests: [],
  payments: [],
  dailyReports: [],
  risks: []
};

describe("ProjectWorkspace onboarding panel", () => {
  it("renders setup baseline for a newly created empty project without runtime calls", () => {
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(React.createElement(ProjectWorkspace, { initialBundle: emptyBundle, createdFromOnboarding: true }));

    expect(html).toContain("Project created");
    expect(html).toContain("Запустите рабочий контур проекта");
    expect(html).toContain("Импортировать ВОР");
    expect(html).toContain("Договор / Тендер");
    expect(html).toContain("КС / acceptance billing");
    expect(html).toContain("Project command center");
    expect(fetchMock).not.toHaveBeenCalled();
    fetchMock.mockRestore();
  });
});
