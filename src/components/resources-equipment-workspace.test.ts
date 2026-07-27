import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResourcesEquipmentWorkspace } from "@/components/resources-equipment-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("ResourcesEquipmentWorkspace", () => {
  it("renders the read-only resources workspace without provider calls", () => {
    const bundle = getProjectBundle("project-smoke");
    const html = renderToStaticMarkup(createElement(ResourcesEquipmentWorkspace, { projectId: bundle.project.id, project: bundle.project, dailyReports: bundle.dailyReports, scheduleItems: bundle.scheduleItems, onNavigate: vi.fn() }));
    expect(html).toContain("Workforce, ФОТ &amp; Equipment Capacity");
    expect(html).toContain("Ресурсный план проекта");
    expect(html).toContain("Сигналы из рапортов");
    expect(html).not.toContain("OPENAI_API_KEY");
  });
});
