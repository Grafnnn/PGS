import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import { buildCommitPlan, parseExcelBuffer } from "./import-parser";
import { buildCashflowDraft, buildPipelineSnapshotFromData, buildProcurementDraft, buildScheduleDraft, type PipelineData } from "@/lib/project-pipeline";
import type { Material } from "@/lib/types";

function buildSyntheticVorWorkbook() {
  const worksheet = XLSX.utils.aoa_to_sheet([
    ["Ведомость объемов работ"],
    ["Объект: тестовый импорт"],
    ["№ п/п", "Наименование работ и затрат", "Единицы измерения", "Объем работ", "Расценка", "Общая стоимость"],
    ["", "Раздел 1. Монолитные работы", "", "", "", ""],
    ["1", "Устройство опалубки стен", "м2", "120", "900", "108000"],
    ["1.1", "Поставка бетон В25", "м3", "35", "6400", "224000"],
    ["1.2", "Поставка арматура А500С", "т", "4,5", "", ""],
    ["", "Итого по разделу", "", "", "", "332000"],
    ["№ п/п", "Наименование работ и затрат", "Единицы измерения", "Объем работ", "Расценка", "Общая стоимость"],
    ["2", "Неясная строка без количества", "компл.", "", "", ""]
  ]);
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, worksheet, "ВОР");
  return XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }) as Buffer;
}

describe("authenticated ImportPanel VOR-to-intelligence data flow", () => {
  it("keeps a synthetic Excel import connected to procurement, schedule, cashflow and intelligence outputs", () => {
    const preview = parseExcelBuffer(buildSyntheticVorWorkbook(), "synthetic-vor.xlsx", "project-flow");
    const plan = buildCommitPlan(preview, "append");
    const previewRows = preview.previewRows ?? [];

    expect(preview.errors).toHaveLength(0);
    expect(preview.summary.budgetItems).toBeGreaterThanOrEqual(3);
    expect(preview.summary.materials).toBeGreaterThanOrEqual(2);
    expect(preview.summary.unknownRows).toBeGreaterThanOrEqual(1);
    expect(previewRows.some((row) => row.status === "skipped" && row.warnings.some((warning) => warning.includes("Повторная строка заголовков")))).toBe(true);
    expect(previewRows.some((row) => row.entityType === "material" && row.suspiciousFlags.includes("missingPrice"))).toBe(true);

    const budgetItems = plan.budgetItems.map((item, index) => ({
      id: `budget-${index + 1}`,
      projectId: "project-flow",
      section: item.section,
      code: item.code,
      name: item.name,
      unit: item.unit,
      qty: item.qty,
      plannedUnitPrice: item.plannedUnitPrice,
      actualUnitPrice: item.actualUnitPrice,
      forecastUnitPrice: item.forecastUnitPrice,
      kind: item.kind,
      source: item.source
    }));
    const materials = plan.materials.map((item, index) => ({
      id: `material-${index + 1}`,
      projectId: "project-flow",
      name: item.name,
      unit: item.unit,
      requiredQty: item.requiredQty,
      orderedQty: 0,
      deliveredQty: 0,
      consumedQty: 0,
      plannedUnitPrice: item.plannedUnitPrice,
      actualUnitPrice: item.actualUnitPrice,
      supplier: item.supplier,
      neededAt: item.neededAt,
      status: item.status as Material["status"]
    }));
    const pipelineData: PipelineData = {
      project: {
        id: "project-flow",
        organizationId: "org-demo",
        contractAmount: 1_500_000,
        startsAt: "2026-07-01",
        endsAt: "2026-10-01",
        name: "Synthetic Import Flow"
      },
      budgetItems,
      materials,
      scheduleItems: [],
      procurementRequests: [],
      payments: [],
      cashflowPeriods: [],
      documents: [{ id: "doc-vor", category: "вор", title: "synthetic-vor.xlsx", fileName: "synthetic-vor.xlsx" }],
      importBatches: [
        {
          id: "batch-flow",
          fileName: "synthetic-vor.xlsx",
          status: "committed",
          mode: "append",
          createdAt: "2026-07-01T00:00:00.000Z",
          committedAt: "2026-07-01T00:05:00.000Z",
          preview,
          commitResult: { budgetItems: budgetItems.length, materials: materials.length }
        }
      ]
    };

    const procurementDraft = buildProcurementDraft(pipelineData);
    const scheduleDraft = buildScheduleDraft(pipelineData);
    const cashflowDraft = buildCashflowDraft(pipelineData);
    const snapshot = buildPipelineSnapshotFromData(pipelineData);

    expect(procurementDraft.canCommit).toBe(true);
    expect(procurementDraft.items.map((item) => item.material)).toEqual(expect.arrayContaining(["Поставка бетон В25", "Поставка арматура А500С"]));
    expect(procurementDraft.items[0].evidence[0]).toMatchObject({ importBatchId: "batch-flow" });
    expect(scheduleDraft.canCommit).toBe(true);
    expect(scheduleDraft.items[0]).toMatchObject({ stage: "Раздел 1. Монолитные работы", status: "needs_dates" });
    expect(cashflowDraft.canCommit).toBe(true);
    expect(cashflowDraft.summary.missingPrices).toBeGreaterThanOrEqual(1);
    expect(snapshot.documentChecklist.find((item) => item.key === "estimate")).toMatchObject({ status: "present" });
    expect(snapshot.readiness.counts.committedImports).toBe(1);
    expect(snapshot.readiness.counts.importedWarnings).toBeGreaterThanOrEqual(1);
    expect(snapshot.intelligence.nextActions.map((item) => item.id)).toEqual(expect.arrayContaining(["draft-procurement", "draft-schedule", "draft-cashflow"]));
    expect(snapshot.intelligence.quickActions.some((item) => item.title === "Сводка для руководства")).toBe(true);
  });
});
