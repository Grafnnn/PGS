import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MaterialSupplyWorkspace } from "./material-supply-workspace";
import type { Material, ProcurementRequest } from "@/lib/types";

const material: Material = {
  id: "material-1", projectId: "project-1", name: "Мембрана кровельная", unit: "м2", requiredQty: 100, orderedQty: 0,
  deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 500, actualUnitPrice: 0, supplier: "Не выбран", neededAt: "2026-09-10", status: "required"
};

describe("MaterialSupplyWorkspace", () => {
  it("renders a compact four-stage supply workflow without triggering mutations", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const html = renderToStaticMarkup(createElement(MaterialSupplyWorkspace, {
      projectId: "project-1",
      projectName: "Троицк",
      materials: [material],
      scheduleItems: [],
      requests: [] satisfies ProcurementRequest[],
      draft: null,
      pipelineLoading: "",
      canEdit: true,
      canApprove: true,
      onPreview,
      onCommit,
      onRequestUpdated: vi.fn(),
      onMaterialsUpdated: vi.fn(),
      onNavigate: vi.fn()
    }));
    expect(html).toContain("От графика работ до приёмки на склад");
    expect(html).toContain("План 14 дней");
    expect(html).toContain("Подтверждение");
    expect(html).toContain("Ожидается");
    expect(html).toContain("Склад");
    expect(html).toContain("Дата формирования = дата потребности минус 14 дней");
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });
});
