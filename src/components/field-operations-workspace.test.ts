import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { FieldOperationsWorkspace } from "@/components/field-operations-workspace";
import { getProjectBundle } from "@/lib/demo-data";

describe("FieldOperationsWorkspace", () => {
  it("renders field operations without provider calls or mutations", () => {
    const bundle = getProjectBundle("project-demo");
    const onNavigate = vi.fn();
    const html = renderToStaticMarkup(
      createElement(FieldOperationsWorkspace, {
        project: bundle.project,
        budgetItems: bundle.budgetItems,
        scheduleItems: bundle.scheduleItems,
        materials: bundle.materials,
        procurementRequests: bundle.procurementRequests,
        payments: bundle.payments,
        dailyReports: bundle.dailyReports,
        risks: bundle.risks,
        documents: [],
        documentChecklist: [],
        onNavigate
      })
    );

    expect(html).toContain("Сводка по утверждённым рапортам");
    expect(html).toContain("Контроль площадки");
    expect(html).toContain("Сводки ежедневных рапортов");
    expect(html).toContain("утверждено");
    expect(html).toContain("Проверка рапортов");
    expect(html).toContain("Сигналы стройплощадки");
    expect(html).toContain("Реестр действий");
    expect(html).toContain("Weekly field handoff");
    expect(html).toContain("Фото сохраняются с привязкой к конкретному рапорту");
    expect(html).toContain("Открыть рапорты");
    expect(html).toContain("Открыть документы площадки");
    expect(html).not.toContain("OPENAI_API_KEY");
    expect(html).not.toContain("DATABASE_URL");
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
