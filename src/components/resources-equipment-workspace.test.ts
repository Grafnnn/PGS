import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResourcesEquipmentWorkspace } from "@/components/resources-equipment-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("ResourcesEquipmentWorkspace", () => {
  it("renders the read-only resources workspace without provider calls", () => {
    const bundle = getProjectBundle("project-smoke");
    const html = renderToStaticMarkup(createElement(ResourcesEquipmentWorkspace, { project: bundle.project, dailyReports: bundle.dailyReports, scheduleItems: bundle.scheduleItems, onNavigate: vi.fn() }));
    expect(html).toContain("Resources &amp; Equipment Intelligence");
    expect(html).toContain("Люди / Техника / Простои");
    expect(html).toContain("Equipment register");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
