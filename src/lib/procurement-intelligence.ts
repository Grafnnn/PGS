import type { ImportPreview, ImportPreviewRow } from "@/lib/excel/import-types";
import type { Material, ProcurementRequest } from "@/lib/types";

export type ProcurementReadinessStatus = "not_started" | "needs_import" | "needs_review" | "ready_to_commit" | "committed" | "partial" | "blocked";
export type ProcurementTone = "good" | "warn" | "bad" | "info" | "neutral";

export type ProcurementImportHistoryItem = {
  id: string;
  fileName: string;
  status: string;
  committedAt: string | null;
  preview?: Pick<ImportPreview, "previewRows" | "unknownRows" | "summary">;
};

export type MaterialNeedView = {
  id: string;
  materialId?: string;
  sourceSection: string;
  sourceRow: string;
  sourceFile: string;
  name: string;
  unit: string;
  quantity: number;
  orderedQty: number;
  deliveredQty: number;
  deficitQty: number;
  estimatedUnitPrice: number;
  estimatedTotal: number;
  category: string;
  status: "missing_data" | "needs_review" | "ready" | "requested" | "ordered" | "delivered" | "closed";
  confidence: number;
  warnings: string[];
};

export type ProcurementCandidateView = MaterialNeedView & {
  alreadyRequested: boolean;
  suggestedAction: string;
};

export type ProcurementGroupView = {
  key: string;
  label: string;
  count: number;
  estimatedTotal: number;
  deficitQty: number;
  items: ProcurementCandidateView[];
};

export type SupplyRequestDraftItem = {
  name: string;
  unit: string;
  quantity: number;
  requiredBy: string;
  category: string;
  source: string;
  comment: string;
  estimatedTotal: number;
  status: "draft";
};

export type ProcurementIntelligenceModel = {
  status: ProcurementReadinessStatus;
  tone: ProcurementTone;
  summary: {
    materials: number;
    candidates: number;
    committedRequests: number;
    activeRequests: number;
    warnings: number;
    missingRows: number;
    estimatedTotal: number;
    deficitTotal: number;
  };
  materialNeeds: MaterialNeedView[];
  candidates: ProcurementCandidateView[];
  groupsBySection: ProcurementGroupView[];
  groupsByCategory: ProcurementGroupView[];
  missingRows: Array<{ source: string; name: string; reason: string; warnings: string[] }>;
  warnings: string[];
  supplyRequestDraft: {
    projectName: string;
    date: string;
    status: "empty" | "draft_ready";
    items: SupplyRequestDraftItem[];
    estimatedTotal: number;
    copyText: string;
  };
  readiness: {
    label: string;
    nextStep: string;
    blockers: string[];
  };
};

export type ProcurementIntelligenceInput = {
  projectName: string;
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  importHistory?: ProcurementImportHistoryItem[];
  today?: string;
};

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function materialKey(name: string, unit: string) {
  return `${normalize(name)}|${normalize(unit)}`;
}

function rounded(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

function latestCommittedImport(importHistory: ProcurementImportHistoryItem[] = []) {
  return importHistory.find((item) => item.status === "committed" && item.preview) ?? importHistory.find((item) => item.preview);
}

function rowConfidence(row: ImportPreviewRow | undefined, warnings: string[]) {
  if (!row) return warnings.length ? 0.55 : 0.75;
  if (row.status === "ready" && !warnings.length) return 0.95;
  if (row.status === "warning" || warnings.length) return 0.65;
  if (row.status === "error") return 0.2;
  return 0.5;
}

export function materialCategory(name: string) {
  const value = normalize(name);
  if (/бетон|раствор|цемент|песок|щеб/.test(value)) return "Бетон и инертные";
  if (/армат|металл|швеллер|уголок|сталь/.test(value)) return "Металл";
  if (/кабель|щит|автомат|электр|свет/.test(value)) return "Электрика";
  if (/труба|пнд|канал|вод|фитинг|запор/.test(value)) return "Инженерные сети";
  if (/гидро|мембран|утепл|кров/.test(value)) return "Кровля и изоляция";
  if (/краск|грунт|плитк|гкл|смес|отдел/.test(value)) return "Отделка";
  return "Прочее";
}

function rowWarnings(material: Material, row: ImportPreviewRow | undefined) {
  const warnings = new Set<string>();
  if (!material.name.trim()) warnings.add("Нет наименования");
  if (!material.unit.trim()) warnings.add("Нет единицы измерения");
  if (material.requiredQty <= 0) warnings.add("Нет количества");
  if (material.plannedUnitPrice <= 0) warnings.add("Нет плановой цены");
  if (!material.supplier || material.supplier === "Не выбран") warnings.add("Нужен поставщик или КП");
  if (row?.warnings?.length) row.warnings.forEach((warning) => warnings.add(warning));
  if (row?.suspiciousFlags?.includes("missingQuantity")) warnings.add("В исходной строке нет количества");
  if (row?.suspiciousFlags?.includes("missingPrice")) warnings.add("В исходной строке нет цены");
  return Array.from(warnings);
}

function statusForMaterial(material: Material, warnings: string[], alreadyRequested: boolean): MaterialNeedView["status"] {
  if (material.status === "closed" || material.status === "cancelled") return "closed";
  if (material.deliveredQty >= material.requiredQty && material.requiredQty > 0) return "delivered";
  if (material.status === "ordered" || material.status === "in_transit") return "ordered";
  if (alreadyRequested || material.status === "requested" || material.status === "approving") return "requested";
  if (warnings.some((warning) => /наименования|единицы|количества/i.test(warning))) return "missing_data";
  if (warnings.length) return "needs_review";
  return "ready";
}

function statusTone(status: ProcurementReadinessStatus): ProcurementTone {
  if (status === "committed") return "good";
  if (status === "ready_to_commit" || status === "partial" || status === "needs_review") return "warn";
  if (status === "blocked") return "bad";
  if (status === "needs_import") return "info";
  return "neutral";
}

function groupCandidates(candidates: ProcurementCandidateView[], keyFn: (item: ProcurementCandidateView) => string, labelFn: (item: ProcurementCandidateView) => string): ProcurementGroupView[] {
  const groups = new Map<string, ProcurementGroupView>();
  for (const item of candidates) {
    const key = keyFn(item);
    const existing =
      groups.get(key) ??
      ({
        key,
        label: labelFn(item),
        count: 0,
        estimatedTotal: 0,
        deficitQty: 0,
        items: []
      } satisfies ProcurementGroupView);
    existing.count += 1;
    existing.estimatedTotal += item.estimatedTotal;
    existing.deficitQty += item.deficitQty;
    existing.items.push(item);
    groups.set(key, existing);
  }
  return Array.from(groups.values())
    .map((group) => ({ ...group, estimatedTotal: rounded(group.estimatedTotal), deficitQty: rounded(group.deficitQty) }))
    .sort((left, right) => right.estimatedTotal - left.estimatedTotal || left.label.localeCompare(right.label, "ru"));
}

function buildSupplyCopy(projectName: string, date: string, items: SupplyRequestDraftItem[]) {
  if (!items.length) return "Нет валидных позиций для заявки снабжения.";
  return [
    `Заявка снабжению по проекту: ${projectName}`,
    `Дата: ${date}`,
    "",
    ...items.map((item, index) => `${index + 1}. ${item.name} — ${item.quantity} ${item.unit}; категория: ${item.category}; нужно к: ${item.requiredBy}; источник: ${item.source}. ${item.comment}`)
  ].join("\n");
}

export function buildProcurementIntelligenceModel(input: ProcurementIntelligenceInput): ProcurementIntelligenceModel {
  const today = input.today ?? new Date().toISOString().slice(0, 10);
  const latestImport = latestCommittedImport(input.importHistory);
  const materialRows = latestImport?.preview?.previewRows?.filter((row) => row.entityType === "material") ?? [];
  const rowByKey = new Map(materialRows.map((row) => [materialKey(row.name ?? "", row.unit ?? ""), row]));
  const activeRequests = input.procurementRequests.filter((request) => !["closed", "rejected"].includes(request.status));
  const activeMaterialIds = new Set(activeRequests.flatMap((request) => request.items.map((item) => item.materialId).filter(Boolean)));
  const activeMaterialKeys = new Set(activeRequests.flatMap((request) => request.items.map((item) => materialKey(item.name, item.unit))));

  const materialNeeds = input.materials.map((material) => {
    const row = rowByKey.get(materialKey(material.name, material.unit));
    const warnings = rowWarnings(material, row);
    const alreadyRequested = activeMaterialIds.has(material.id) || activeMaterialKeys.has(materialKey(material.name, material.unit));
    const deficitQty = Math.max(material.requiredQty - Math.max(material.orderedQty, material.deliveredQty), 0);
    const estimatedQty = deficitQty > 0 ? deficitQty : material.requiredQty;
    const sourceRow = row ? `${row.sheetName}:${row.sourceRowNumber}` : "project-material";
    const sourceSection = row?.section ?? materialCategory(material.name);
    return {
      id: material.id,
      materialId: material.id,
      sourceSection,
      sourceRow,
      sourceFile: latestImport?.fileName ?? "Материалы проекта",
      name: material.name,
      unit: material.unit,
      quantity: material.requiredQty,
      orderedQty: material.orderedQty,
      deliveredQty: material.deliveredQty,
      deficitQty: rounded(deficitQty),
      estimatedUnitPrice: material.plannedUnitPrice,
      estimatedTotal: rounded(estimatedQty * material.plannedUnitPrice),
      category: materialCategory(material.name),
      status: statusForMaterial(material, warnings, alreadyRequested),
      confidence: rowConfidence(row, warnings),
      warnings
    } satisfies MaterialNeedView;
  });

  const candidates = materialNeeds
    .filter((item) => item.deficitQty > 0 && item.status !== "missing_data" && item.status !== "requested" && item.status !== "ordered" && item.status !== "delivered" && item.status !== "closed")
    .map((item) => ({
      ...item,
      alreadyRequested: false,
      suggestedAction: item.warnings.length ? "Проверить данные и запросить КП" : "Добавить в черновик заявки снабжения"
    }));

  const unknownRows = latestImport?.preview?.unknownRows ?? [];
  const previewUnknownRows = latestImport?.preview?.previewRows?.filter((row) => row.entityType === "unknown") ?? [];
  const missingRows = [
    ...materialNeeds
      .filter((item) => item.status === "missing_data" || item.warnings.length)
      .map((item) => ({
        source: `${item.sourceFile} · ${item.sourceRow}`,
        name: item.name,
        reason: item.status === "missing_data" ? "Не хватает обязательных данных для закупки." : "Требуется управленческая проверка перед заявкой.",
        warnings: item.warnings
      })),
    ...unknownRows.map((row) => ({
      source: `${row.sheetName}:${row.rowNumber}`,
      name: row.values.join(" · ").slice(0, 120) || "Неизвестная строка",
      reason: "Строка не распознана как материал и не включается в заявку автоматически.",
      warnings: ["unknown"]
    })),
    ...previewUnknownRows.map((row) => ({
      source: `${row.sheetName}:${row.sourceRowNumber}`,
      name: row.name ?? "Неизвестная строка",
      reason: "Preview row осталась unknown и требует ручной проверки.",
      warnings: row.warnings.length ? row.warnings : ["unknown"]
    }))
  ];

  const validDraftItems = candidates.filter((item) => item.name && item.unit && item.deficitQty > 0);
  const supplyItems = validDraftItems.map((item) => ({
    name: item.name,
    unit: item.unit,
    quantity: item.deficitQty,
    requiredBy: input.materials.find((material) => material.id === item.materialId)?.neededAt ?? today,
    category: item.category,
    source: `${item.sourceSection} · ${item.sourceRow}`,
    comment: item.warnings.length ? `Проверить: ${item.warnings.join(", ")}` : "Позиция подготовлена из ВОР/materials.",
    estimatedTotal: item.estimatedTotal,
    status: "draft" as const
  }));

  const warnings = [
    ...new Set([
      ...materialNeeds.flatMap((item) => item.warnings),
      ...(input.materials.length && !candidates.length && !activeRequests.length ? ["Материалы есть, но кандидатов для заявки нет. Проверьте статусы и остатки."] : []),
      ...(materialRows.length && !input.materials.length ? ["В импорте есть material-like строки, но persisted materials пустые. Проверьте commit режима импорта."] : []),
      ...(missingRows.length ? ["Есть строки, которые нельзя включать в заявку без проверки."] : [])
    ])
  ];

  let status: ProcurementReadinessStatus = "not_started";
  if (!latestImport && !input.materials.length) status = "needs_import";
  else if (!input.materials.length && latestImport) status = "needs_review";
  else if (missingRows.length && !candidates.length && !activeRequests.length) status = "blocked";
  else if (missingRows.length) status = "needs_review";
  else if (candidates.length) status = "ready_to_commit";
  else if (activeRequests.length && materialNeeds.some((item) => item.deficitQty > 0)) status = "partial";
  else if (activeRequests.length || input.procurementRequests.length) status = "committed";
  else status = "partial";

  const blockers = [
    ...(status === "needs_import" ? ["Загрузите ВОР или добавьте материалы вручную."] : []),
    ...(missingRows.length ? [`${missingRows.length} строк требуют проверки перед закупкой.`] : []),
    ...(warnings.includes("Нужен поставщик или КП") ? ["Нужны КП или выбранные поставщики."] : [])
  ];

  return {
    status,
    tone: statusTone(status),
    summary: {
      materials: materialNeeds.length,
      candidates: candidates.length,
      committedRequests: input.procurementRequests.length,
      activeRequests: activeRequests.length,
      warnings: warnings.length,
      missingRows: missingRows.length,
      estimatedTotal: rounded(supplyItems.reduce((sum, item) => sum + item.estimatedTotal, 0)),
      deficitTotal: rounded(candidates.reduce((sum, item) => sum + item.deficitQty, 0))
    },
    materialNeeds,
    candidates,
    groupsBySection: groupCandidates(candidates, (item) => normalize(item.sourceSection) || "no-section", (item) => item.sourceSection || "Без раздела"),
    groupsByCategory: groupCandidates(candidates, (item) => normalize(item.category) || "other", (item) => item.category || "Прочее"),
    missingRows,
    warnings,
    supplyRequestDraft: {
      projectName: input.projectName,
      date: today,
      status: supplyItems.length ? "draft_ready" : "empty",
      items: supplyItems,
      estimatedTotal: rounded(supplyItems.reduce((sum, item) => sum + item.estimatedTotal, 0)),
      copyText: buildSupplyCopy(input.projectName, today, supplyItems)
    },
    readiness: {
      label:
        status === "ready_to_commit"
          ? "Готово к черновику заявки"
          : status === "committed"
            ? "Заявки созданы"
            : status === "partial"
              ? "Частично закрыто"
              : status === "needs_review"
                ? "Нужна проверка"
                : status === "blocked"
                  ? "Заблокировано данными"
                  : "Нужен импорт",
      nextStep:
        status === "ready_to_commit"
          ? "Проверьте кандидатов и выполните явный commit черновиков заявок."
          : status === "committed" || status === "partial"
            ? "Проверьте статусы заявок, поставщиков и сроки поставки."
            : status === "needs_review" || status === "blocked"
              ? "Разберите warning/unknown строки и заполните обязательные поля."
              : "Загрузите ВОР или добавьте материалы.",
      blockers
    }
  };
}
