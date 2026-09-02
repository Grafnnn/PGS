import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { MaterialSupplyWorkspace } from "./material-supply-workspace";
import type { Material, ProcurementRequest } from "@/lib/types";

function material(overrides: Partial<Material> = {}): Material {
  return {
    id: "material-1", projectId: "project-1", name: "[МЗ-05] Мембрана кровельная", unit: "м2", requiredQty: 100, orderedQty: 0,
    deliveredQty: 0, consumedQty: 0, plannedUnitPrice: 500, actualUnitPrice: 0, supplier: "Не выбран", neededAt: "2099-09-10", orderByAt: "2099-08-27", status: "required",
    ...overrides
  };
}

describe("MaterialSupplyWorkspace", () => {
  it("renders a compact four-stage supply workflow without triggering mutations", () => {
    const onPreview = vi.fn();
    const onCommit = vi.fn();
    const html = renderToStaticMarkup(createElement(MaterialSupplyWorkspace, {
      projectId: "project-1",
      projectName: "Троицк",
      materials: [
        material(),
        material({ id: "material-2", name: "[МЗ-05] Вторая позиция" }),
        material({ id: "material-3", name: "[МЗ-06] Количество уточняется", requiredQty: 0 })
      ],
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
    expect(html).toContain("Сверка с итоговой заявкой");
    expect(html).toContain("2 к заказу · 1 на уточнение · 2 пакета МЗ");
    expect(html).toContain("3 поз.");
    expect(html).toContain("Дата формирования берётся из «Заказать до»");
    expect(html).toContain("Будущие пакеты: 1 · 2 поз.");
    expect(html).toContain("На уточнение: 1 поз.");
    expect(onPreview).not.toHaveBeenCalled();
    expect(onCommit).not.toHaveBeenCalled();
  });

  it("allows an explicit commit when the live plan has due groups but the saved preview is stale", () => {
    const html = renderToStaticMarkup(createElement(MaterialSupplyWorkspace, {
      projectId: "project-1",
      projectName: "Троицк",
      materials: [material({ neededAt: "2000-01-15", orderByAt: "2000-01-01" })],
      scheduleItems: [],
      requests: [] satisfies ProcurementRequest[],
      draft: { kind: "procurement", mode: "preview", draft: { summary: {}, items: [] } },
      pipelineLoading: "",
      canEdit: true,
      canApprove: true,
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onRequestUpdated: vi.fn(),
      onMaterialsUpdated: vi.fn(),
      onNavigate: vi.fn()
    }));

    const createButton = html.match(/<button[^>]*aria-label="Создать черновики заявок из актуального плана"[^>]*>/)?.[0] ?? "";
    expect(createButton).not.toContain("disabled");
    expect(html).toContain("Создать 1 чернов.");
    expect(html).toContain("План изменился · пересчитается при создании");
  });

  it("keeps creation disabled when no request group is due", () => {
    const html = renderToStaticMarkup(createElement(MaterialSupplyWorkspace, {
      projectId: "project-1",
      projectName: "Троицк",
      materials: [material()],
      scheduleItems: [],
      requests: [] satisfies ProcurementRequest[],
      draft: null,
      pipelineLoading: "",
      canEdit: true,
      canApprove: true,
      onPreview: vi.fn(),
      onCommit: vi.fn(),
      onRequestUpdated: vi.fn(),
      onMaterialsUpdated: vi.fn(),
      onNavigate: vi.fn()
    }));

    const createButton = html.match(/<button[^>]*aria-label="Создать черновики заявок из актуального плана"[^>]*>/)?.[0] ?? "";
    expect(createButton).toContain("disabled");
  });
});
