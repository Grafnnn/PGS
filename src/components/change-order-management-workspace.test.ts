import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ChangeOrderManagementWorkspace } from "@/components/change-order-management-workspace";

describe("ChangeOrderManagementWorkspace", () => {
  it("renders the controlled register without fetching during server render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(createElement(ChangeOrderManagementWorkspace, { projectId: "project-1", project: { id: "project-1", name: "Проект", contractAmount: 1_000_000 }, budgetItems: [], scheduleItems: [], materials: [], procurementRequests: [], payments: [], risks: [], documents: [], canEdit: true, canApprove: true, onNavigate: () => undefined }));
    expect(html).toContain("Change Order Management v2");
    expect(html).toContain("Стоимостные позиции");
    expect(html).toContain("Матрица согласования");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
