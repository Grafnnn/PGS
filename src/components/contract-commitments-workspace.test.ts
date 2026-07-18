import React, { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ContractCommitmentsWorkspace } from "./contract-commitments-workspace";

describe("ContractCommitmentsWorkspace", () => {
  it("renders the controlled commitment and payment workflow without fetching during server render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const html = renderToStaticMarkup(createElement(ContractCommitmentsWorkspace, {
      projectId: "project-1",
      budgetItems: [],
      procurementRequests: [],
      payments: [],
      documents: [],
      canEdit: true,
      canApprove: true,
      onNavigate: () => undefined
    }));
    expect(html).toContain("Contract Commitments v1");
    expect(html).toContain("Договорные обязательства");
    expect(html).toContain("Обязательство");
    expect(html).toContain("Система не создаёт платежи");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("does not expose mutation controls to a viewer", () => {
    const html = renderToStaticMarkup(createElement(ContractCommitmentsWorkspace, {
      projectId: "project-1",
      budgetItems: [],
      procurementRequests: [],
      payments: [],
      documents: [],
      canEdit: false,
      canApprove: false,
      onNavigate: () => undefined
    }));
    expect(html).not.toContain(">Обязательство</button>");
  });
});
