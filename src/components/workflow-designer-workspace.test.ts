import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { WorkflowDesignerWorkspace } from "./workflow-designer-workspace";

describe("WorkflowDesignerWorkspace", () => {
  it("renders the explicit workflow controls without mutating on render", () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({ ok: true, json: async () => ({ templates: [], runs: [], summary: {} }) } as Response);
    const html = renderToStaticMarkup(React.createElement(WorkflowDesignerWorkspace, { projectId: "project-test", role: "OWNER", onNavigate: () => undefined }));
    expect(html).toContain("Конструктор процессов и матрица согласования");
    expect(html).toContain("Новый шаблон");
    expect(html).toContain("На чьей стороне действие");
    expect(html).toContain("Явный запуск");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
