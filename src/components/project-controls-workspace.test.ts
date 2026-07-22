import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ProjectControlsWorkspace } from "@/components/project-controls-workspace";

describe("ProjectControlsWorkspace", () => {
  it("renders the compact control workflow without fetching during render", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const html = renderToStaticMarkup(React.createElement(ProjectControlsWorkspace, { projectId: "project-1", role: "OWNER", onNavigate: () => undefined }));
    expect(html).toContain("Project Controls &amp; Earned Value");
    expect(html).toContain("Зафиксировать baseline");
    expect(html).toContain("Выпустить отчётный период");
    expect(html).toContain("Нет опубликованного периода");
    expect(fetchMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
