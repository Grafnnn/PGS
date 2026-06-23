import { Prisma } from "@prisma/client";
import { z } from "zod";
import { budgetTotals, financeTotals, materialTotals, workTotals } from "@/lib/calculations";
import { importPreviewSchema, type ImportPreview, type ImportPreviewRow } from "@/lib/excel/import-types";
import { prisma } from "@/lib/prisma";
import { serializeBudgetItem, serializeMaterial, serializePayment, serializeProcurementRequest, serializeScheduleItem } from "@/lib/serializers";
import type { BudgetItem, Material, Payment, ProcurementRequest, RiskPriority, ScheduleItem } from "@/lib/types";

export type PipelineCategory = "budget" | "materials" | "procurement" | "schedule" | "finance" | "documents" | "risks" | "import" | "ai";
export type PipelinePriority = "low" | "medium" | "high" | "critical";

export interface PipelineEvidence {
  entityType: string;
  entityId?: string | null;
  label: string;
  field?: string | null;
  value?: string | number | boolean | null;
  explanation: string;
  importBatchId?: string | null;
  importRowId?: string | null;
  documentId?: string | null;
  page?: number | null;
  section?: string | null;
  snippet?: string | null;
}

export interface PipelineAction {
  id: string;
  category: PipelineCategory;
  actionType: string;
  priority: PipelinePriority;
  title: string;
  description: string;
  suggestedNextStep: string;
  entityType?: string | null;
  entityId?: string | null;
  dueDate?: string | null;
  ownerRole?: string | null;
  evidence: PipelineEvidence[];
  enabled?: boolean;
  disabledReason?: string | null;
}

export interface DocumentChecklistItem {
  key: string;
  title: string;
  status: "present" | "missing" | "degraded";
  categoryHints: string[];
  documentIds: string[];
  evidence: PipelineEvidence[];
  suggestedNextStep: string;
}

export interface PipelineReadiness {
  score: number;
  status: "empty" | "partial" | "ready";
  summary: string;
  checks: Array<{
    key: string;
    label: string;
    passed: boolean;
    weight: number;
    detail: string;
  }>;
  counts: {
    committedImports: number;
    importedBudgetItems: number;
    importedMaterials: number;
    importedWarnings: number;
    budgetItems: number;
    materials: number;
    procurementRequests: number;
    scheduleItems: number;
    cashflowPeriods: number;
    documents: number;
    calculatedRisks: number;
  };
}

export interface PipelineSnapshot {
  projectId: string;
  latestImport: ImportBatchSnapshot | null;
  readiness: PipelineReadiness;
  postImportActions: PipelineAction[];
  documentChecklist: DocumentChecklistItem[];
  calculatedRisks: PipelineAction[];
  intelligence: {
    completenessScore: number;
    summary: string;
    topRisks: PipelineAction[];
    nextActions: PipelineAction[];
    missingData: string[];
    quickActions: Array<{ title: string; prompt: string; deterministicAnswer: string }>;
  };
}

interface ImportBatchSnapshot {
  id: string;
  fileName: string;
  status: string;
  mode: string | null;
  committedAt: string | null;
  createdAt: string;
  preview: ImportPreview;
  commitResult: Record<string, unknown> | null;
}

interface PipelineData {
  project: { id: string; organizationId: string; contractAmount: number; startsAt: string; endsAt: string; name: string };
  budgetItems: BudgetItem[];
  materials: Material[];
  scheduleItems: ScheduleItem[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  cashflowPeriods: Array<{ id: string; periodStart: Date; periodEnd: Date; outgoing: Prisma.Decimal; incoming: Prisma.Decimal }>;
  documents: Array<{ id: string; category: string; title: string; fileName: string | null }>;
  importBatches: ImportBatchSnapshot[];
}

export const draftRequestSchema = z.object({
  commit: z.boolean().default(false),
  confirmed: z.boolean().default(false)
});

const documentChecklistConfig = [
  { key: "contract", title: "Договор", hints: ["договор", "contract"] },
  { key: "estimate", title: "Смета / ВОР", hints: ["смета", "вор", "estimate"] },
  { key: "design", title: "РД / ПД", hints: ["рд", "пд", "проектная", "design"] },
  { key: "schedule", title: "График производства работ", hints: ["график", "schedule"] },
  { key: "cashflow", title: "График финансирования", hints: ["финанс", "cashflow", "cash-flow"] },
  { key: "quotes", title: "КП поставщиков", hints: ["кп", "коммерческое", "quote"] },
  { key: "asbuilt", title: "Исполнительная документация", hints: ["исполнительная", "as-built"] },
  { key: "ks", title: "КС-2 / КС-3", hints: ["кс", "ks"] }
];

const priorityRank: Record<PipelinePriority, number> = { critical: 4, high: 3, medium: 2, low: 1 };

function decimalToNumber(value: Prisma.Decimal | number | null | undefined) {
  if (typeof value === "number") return value;
  return value?.toNumber?.() ?? 0;
}

function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

function normalize(value: string) {
  return value.trim().toLowerCase().replace(/\s+/g, " ");
}

function money(value: number) {
  return Math.round(value);
}

function safePreview(value: unknown): ImportPreview | null {
  const parsed = importPreviewSchema.safeParse(value);
  return parsed.success ? (parsed.data as unknown as ImportPreview) : null;
}

function commitResult(summary: unknown) {
  if (!summary || typeof summary !== "object") return null;
  const result = (summary as { commitResult?: unknown }).commitResult;
  return result && typeof result === "object" ? (result as Record<string, unknown>) : null;
}

function previewRowId(batchId: string, row: Pick<ImportPreviewRow, "sheetName" | "sourceRowNumber">) {
  return `${batchId}:${row.sheetName}:${row.sourceRowNumber}`;
}

function rowEvidence(batch: ImportBatchSnapshot, row: ImportPreviewRow, explanation: string): PipelineEvidence {
  return {
    entityType: row.entityType,
    label: `${row.sheetName}:${row.sourceRowNumber}`,
    field: row.name ?? null,
    value: row.totalAmount ?? row.quantity ?? null,
    explanation,
    importBatchId: batch.id,
    importRowId: previewRowId(batch.id, row),
    section: row.section ?? null,
    snippet: row.name ?? null
  };
}

function importedBudgetRows(batch: ImportBatchSnapshot | null) {
  return (batch?.preview.previewRows ?? []).filter((row) => row.entityType === "budgetItem");
}

function importedMaterialRows(batch: ImportBatchSnapshot | null) {
  return (batch?.preview.previewRows ?? []).filter((row) => row.entityType === "material");
}

export async function loadPipelineData(projectId: string): Promise<PipelineData | null> {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: {
      budgetItems: { orderBy: [{ section: "asc" }, { code: "asc" }] },
      materials: { orderBy: { neededAt: "asc" } },
      scheduleItems: { orderBy: { startsAt: "asc" } },
      procurementRequests: { include: { items: true }, orderBy: { neededAt: "asc" } },
      payments: { orderBy: { plannedAt: "asc" } },
      cashflowPeriods: { orderBy: { periodStart: "asc" } },
      documents: { orderBy: { createdAt: "desc" } },
      importBatches: {
        where: { status: "committed" },
        orderBy: [{ committedAt: "desc" }, { createdAt: "desc" }],
        take: 10
      }
    }
  });
  if (!project) return null;

  const importBatches = project.importBatches
    .map((batch) => {
      const preview = safePreview(batch.previewJson);
      if (!preview) return null;
      return {
        id: batch.id,
        fileName: batch.fileName,
        status: batch.status,
        mode: batch.mode,
        committedAt: batch.committedAt?.toISOString() ?? null,
        createdAt: batch.createdAt.toISOString(),
        preview,
        commitResult: commitResult(batch.summary)
      };
    })
    .filter(Boolean) as ImportBatchSnapshot[];

  return {
    project: {
      id: project.id,
      organizationId: project.organizationId,
      contractAmount: decimalToNumber(project.contractAmount),
      startsAt: dateOnly(project.startsAt),
      endsAt: dateOnly(project.endsAt),
      name: project.name
    },
    budgetItems: project.budgetItems.map(serializeBudgetItem),
    materials: project.materials.map(serializeMaterial),
    scheduleItems: project.scheduleItems.map(serializeScheduleItem),
    procurementRequests: project.procurementRequests.map(serializeProcurementRequest),
    payments: project.payments.map(serializePayment),
    cashflowPeriods: project.cashflowPeriods,
    documents: project.documents.map((document) => ({ id: document.id, category: document.category, title: document.title, fileName: document.fileName })),
    importBatches
  };
}

export function buildDocumentChecklist(data: PipelineData): DocumentChecklistItem[] {
  return documentChecklistConfig.map((item) => {
    const matches = data.documents.filter((document) => {
      const haystack = normalize(`${document.category} ${document.title} ${document.fileName ?? ""}`);
      return item.hints.some((hint) => haystack.includes(hint));
    });
    const importEvidence =
      item.key === "estimate" && data.importBatches.length
        ? [
            {
              entityType: "importBatch",
              entityId: data.importBatches[0].id,
              label: data.importBatches[0].fileName,
              explanation: "Committed import batch confirms that VOR/estimate data was uploaded.",
              importBatchId: data.importBatches[0].id
            }
          ]
        : [];
    const present = matches.length > 0 || importEvidence.length > 0;
    return {
      key: item.key,
      title: item.title,
      status: present ? "present" : "missing",
      categoryHints: item.hints,
      documentIds: matches.map((document) => document.id),
      evidence: [
        ...matches.map((document) => ({
          entityType: "document",
          entityId: document.id,
          label: document.title,
          explanation: `Document category/title matched ${item.title}.`,
          documentId: document.id
        })),
        ...importEvidence
      ],
      suggestedNextStep: present ? "Проверить актуальность и версии документа." : `Загрузить документ: ${item.title}.`
    };
  });
}

export function buildProcurementDraft(data: PipelineData) {
  const materialByKey = new Map(data.materials.map((material) => [`${normalize(material.name)}|${normalize(material.unit)}`, material]));
  const rows = importedMaterialRows(data.importBatches[0]);
  const suggestions = data.materials
    .filter((material) => material.requiredQty > material.deliveredQty)
    .map((material) => {
      const deficit = Math.max(material.requiredQty - Math.max(material.orderedQty, material.deliveredQty), 0);
      return {
        materialId: material.id,
        material: material.name,
        unit: material.unit,
        requiredQty: material.requiredQty,
        orderedQty: material.orderedQty,
        deliveredQty: material.deliveredQty,
        deficit,
        status: material.supplier && material.supplier !== "Не выбран" ? "planned" : "quote_needed",
        suggestedAction: deficit > 0 ? "Создать черновик заявки снабжения" : "Проверить остатки и поставки",
        evidence: rows
          .filter((row) => `${normalize(row.name ?? "")}|${normalize(row.unit ?? "")}` === `${normalize(material.name)}|${normalize(material.unit)}`)
          .map((row) => rowEvidence(data.importBatches[0], row, "Material was extracted from committed VOR import."))
      };
    })
    .filter((item) => item.deficit > 0 || !materialByKey.has(`${normalize(item.material)}|${normalize(item.unit)}`));

  return {
    projectId: data.project.id,
    sourceImportBatchId: data.importBatches[0]?.id ?? null,
    canCommit: suggestions.length > 0,
    summary: {
      materials: suggestions.length,
      totalDeficitQty: suggestions.reduce((sum, item) => sum + item.deficit, 0),
      quoteNeeded: suggestions.filter((item) => item.status === "quote_needed").length
    },
    items: suggestions
  };
}

export function buildScheduleDraft(data: PipelineData) {
  const batch = data.importBatches[0] ?? null;
  const workItems = data.budgetItems.filter((item) => item.kind !== "material");
  const sections = Array.from(new Set(workItems.map((item) => item.section)));
  const existingSections = new Set(data.scheduleItems.map((item) => normalize(item.name)));
  const items = sections.map((section, index) => {
    const sectionItems = workItems.filter((item) => item.section === section);
    const importedRows = importedBudgetRows(batch).filter((row) => row.section === section);
    const amount = sectionItems.reduce((sum, item) => sum + item.qty * item.plannedUnitPrice, 0);
    const suggestedDurationDays = Math.max(3, Math.min(30, Math.ceil(sectionItems.length * 2.5)));
    return {
      stage: section,
      name: section,
      works: sectionItems.length,
      amount: money(amount),
      suggestedDurationDays,
      dependency: index > 0 ? sections[index - 1] : null,
      status: existingSections.has(normalize(section)) ? "already_exists" : "needs_dates",
      warnings: data.scheduleItems.length ? [] : ["Нет подтвержденного календарного графика, даты являются черновыми."],
      evidence: importedRows.slice(0, 5).map((row) => rowEvidence(batch!, row, "Work row belongs to this imported section."))
    };
  });
  return {
    projectId: data.project.id,
    sourceImportBatchId: batch?.id ?? null,
    canCommit: items.some((item) => item.status !== "already_exists"),
    summary: { stages: items.length, existingScheduleItems: data.scheduleItems.length, missingDates: items.filter((item) => item.status === "needs_dates").length },
    items
  };
}

export function buildCashflowDraft(data: PipelineData) {
  const budget = budgetTotals(data.project.contractAmount, data.budgetItems);
  const materialsTotal = data.materials.reduce((sum, item) => sum + item.requiredQty * item.plannedUnitPrice, 0);
  const worksTotal = data.budgetItems.filter((item) => item.kind !== "material").reduce((sum, item) => sum + item.qty * item.plannedUnitPrice, 0);
  const missingPrices = data.budgetItems.filter((item) => item.plannedUnitPrice <= 0).length + data.materials.filter((item) => item.plannedUnitPrice <= 0).length;
  const sections = Object.entries(
    data.budgetItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.section] = (acc[item.section] ?? 0) + item.qty * item.plannedUnitPrice;
      return acc;
    }, {})
  ).map(([section, amount]) => ({
    section,
    amount: money(amount),
    period: data.scheduleItems.find((item) => item.name === section)?.startsAt ?? null,
    warning: data.scheduleItems.length ? null : "Нужен график для разнесения по датам."
  }));
  return {
    projectId: data.project.id,
    sourceImportBatchId: data.importBatches[0]?.id ?? null,
    canCommit: sections.length > 0 && data.cashflowPeriods.length === 0,
    commitSupported: true,
    summary: {
      totalBudget: money(budget.totalPlannedCost),
      materialsTotal: money(materialsTotal),
      worksTotal: money(worksTotal),
      unplannedAmount: money(Math.max(data.project.contractAmount - budget.totalPlannedCost, 0)),
      missingDates: data.scheduleItems.length ? 0 : sections.length,
      missingPrices,
      existingCashflowPeriods: data.cashflowPeriods.length
    },
    items: sections
  };
}

function calculatedRiskActions(data: PipelineData, checklist: DocumentChecklistItem[]): PipelineAction[] {
  const batch = data.importBatches[0] ?? null;
  const rows = batch?.preview.previewRows ?? [];
  const risks: PipelineAction[] = [];
  const push = (action: PipelineAction) => risks.push(action);
  const missingPriceRows = rows.filter((row) => row.suspiciousFlags.includes("missingPrice"));
  if (missingPriceRows.length) {
    push({
      id: "risk-import-missing-price",
      category: "risks",
      actionType: "calculated_risk",
      priority: "high",
      title: "Есть позиции ВОР без цены",
      description: `${missingPriceRows.length} строк требуют проверки цены до закупок и cashflow.`,
      suggestedNextStep: "Открыть фильтр бюджета “без цены” и заполнить плановые цены.",
      ownerRole: "ПТО / РП",
      evidence: missingPriceRows.slice(0, 5).map((row) => rowEvidence(batch!, row, "Import parser detected missing price."))
    });
  }
  const missingQtyRows = rows.filter((row) => row.suspiciousFlags.includes("missingQuantity"));
  if (missingQtyRows.length) {
    push({
      id: "risk-import-missing-qty",
      category: "risks",
      actionType: "calculated_risk",
      priority: "high",
      title: "Есть позиции ВОР без количества",
      description: `${missingQtyRows.length} строк не могут участвовать в бюджете и заявках без объема.`,
      suggestedNextStep: "Проверить исходный Excel или скорректировать mapping.",
      ownerRole: "ПТО",
      evidence: missingQtyRows.slice(0, 5).map((row) => rowEvidence(batch!, row, "Import parser detected missing quantity."))
    });
  }
  const materialsWithoutSupplier = data.materials.filter((item) => !item.supplier || item.supplier === "Не выбран");
  if (materialsWithoutSupplier.length) {
    push({
      id: "risk-materials-no-supplier",
      category: "materials",
      actionType: "calculated_risk",
      priority: "medium",
      title: "Материалы без поставщика",
      description: `${materialsWithoutSupplier.length} материалов требуют КП или выбора поставщика.`,
      suggestedNextStep: "Сформировать черновик заявок снабжения.",
      ownerRole: "Снабжение",
      evidence: materialsWithoutSupplier.slice(0, 5).map((item) => ({
        entityType: "material",
        entityId: item.id,
        label: item.name,
        field: "supplier",
        value: item.supplier,
        explanation: "Material has no confirmed supplier."
      }))
    });
  }
  if (!data.scheduleItems.length) {
    push({
      id: "risk-no-schedule",
      category: "schedule",
      actionType: "calculated_risk",
      priority: "high",
      title: "График не создан",
      description: "Без графика нельзя разнести работы, закупки и cashflow по датам.",
      suggestedNextStep: "Сформировать черновой график из разделов ВОР.",
      ownerRole: "РП / ПТО",
      evidence: []
    });
  }
  if (!data.cashflowPeriods.length) {
    push({
      id: "risk-no-cashflow",
      category: "finance",
      actionType: "calculated_risk",
      priority: "medium",
      title: "Cashflow не сформирован",
      description: "Потребность в финансировании пока не разнесена по периодам.",
      suggestedNextStep: "Сформировать черновой cashflow из ВОР.",
      ownerRole: "Финансы",
      evidence: []
    });
  }
  for (const missing of checklist.filter((item) => item.status === "missing" && ["contract", "design"].includes(item.key))) {
    push({
      id: `risk-document-${missing.key}`,
      category: "documents",
      actionType: "calculated_risk",
      priority: missing.key === "contract" ? "high" : "medium",
      title: `Отсутствует документ: ${missing.title}`,
      description: "Документ нужен для проверки объема работ, условий оплаты и проектных решений.",
      suggestedNextStep: missing.suggestedNextStep,
      ownerRole: "РП / ПТО",
      evidence: []
    });
  }
  if ((batch?.preview.summary.warnings ?? 0) > 0) {
    push({
      id: "risk-import-warnings",
      category: "import",
      actionType: "calculated_risk",
      priority: "medium",
      title: "В импорте остались предупреждения",
      description: `${batch?.preview.summary.warnings ?? 0} предупреждений требуют проверки перед управленческими решениями.`,
      suggestedNextStep: "Открыть историю импорта и проверить warnings.",
      ownerRole: "ПТО",
      evidence: rows.filter((row) => row.warnings.length).slice(0, 5).map((row) => rowEvidence(batch!, row, "Import row has parser warnings."))
    });
  }
  return risks.sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority]);
}

function buildPostImportActions(data: PipelineData, risks: PipelineAction[]): PipelineAction[] {
  const batch = data.importBatches[0] ?? null;
  const hasImport = Boolean(batch);
  const procurementDraft = buildProcurementDraft(data);
  const scheduleDraft = buildScheduleDraft(data);
  const cashflowDraft = buildCashflowDraft(data);
  const actions: PipelineAction[] = [
    {
      id: "open-budget",
      category: "budget",
      actionType: "navigate",
      priority: "high",
      title: "Открыть бюджет",
      description: hasImport ? "Проверить строки ВОР, суммы и предупреждения импорта." : "Сначала загрузите ВОР или смету.",
      suggestedNextStep: "Перейти во вкладку “Бюджет / ВОР”.",
      enabled: hasImport,
      disabledReason: hasImport ? null : "Нет committed импорта.",
      evidence: batch ? [{ entityType: "importBatch", entityId: batch.id, label: batch.fileName, explanation: "Latest committed import." }] : []
    },
    {
      id: "open-materials",
      category: "materials",
      actionType: "navigate",
      priority: "high",
      title: "Открыть материалы",
      description: `${data.materials.length} материалов доступны для проверки потребности и поставщиков.`,
      suggestedNextStep: "Проверить дефицит, поставщика и цену.",
      enabled: data.materials.length > 0,
      disabledReason: data.materials.length ? null : "Материалы не выделены.",
      evidence: []
    },
    {
      id: "draft-procurement",
      category: "procurement",
      actionType: "draft_preview",
      priority: procurementDraft.summary.quoteNeeded ? "high" : "medium",
      title: "Сформировать черновик заявок снабжения",
      description: `${procurementDraft.summary.materials} материалов имеют дефицит или требуют КП.`,
      suggestedNextStep: "Открыть preview закупок и подтвердить создание черновиков.",
      enabled: procurementDraft.canCommit,
      disabledReason: procurementDraft.canCommit ? null : "Нет дефицита материалов для заявки.",
      evidence: procurementDraft.items.flatMap((item) => item.evidence).slice(0, 5)
    },
    {
      id: "draft-schedule",
      category: "schedule",
      actionType: "draft_preview",
      priority: data.scheduleItems.length ? "medium" : "high",
      title: "Сформировать черновой график",
      description: `${scheduleDraft.summary.stages} этапов можно сгруппировать по разделам ВОР.`,
      suggestedNextStep: "Проверить этапы и подтвердить создание черновика.",
      enabled: scheduleDraft.canCommit,
      disabledReason: scheduleDraft.canCommit ? null : "График уже содержит этапы или нет работ.",
      evidence: scheduleDraft.items.flatMap((item) => item.evidence).slice(0, 5)
    },
    {
      id: "draft-cashflow",
      category: "finance",
      actionType: "draft_preview",
      priority: "medium",
      title: "Сформировать черновой cashflow",
      description: `План затрат: ${cashflowDraft.summary.totalBudget.toLocaleString("ru-RU")} ₽.`,
      suggestedNextStep: "Проверить суммы и недостающие даты.",
      enabled: cashflowDraft.canCommit,
      disabledReason: cashflowDraft.canCommit ? null : data.cashflowPeriods.length ? "Cashflow periods already exist." : "Нет бюджетных данных.",
      evidence: []
    },
    {
      id: "check-documents",
      category: "documents",
      actionType: "navigate",
      priority: "medium",
      title: "Проверить документы",
      description: "Сверить договор, РД/ПД, КП и графики после загрузки ВОР.",
      suggestedNextStep: "Открыть checklist документов.",
      enabled: true,
      evidence: []
    },
    {
      id: "open-analytics",
      category: "ai",
      actionType: "navigate",
      priority: risks.some((risk) => risk.priority === "high" || risk.priority === "critical") ? "high" : "medium",
      title: "Открыть аналитику",
      description: "Посмотреть готовность проекта, top risks и следующие действия.",
      suggestedNextStep: "Открыть вкладку “Аналитика”.",
      enabled: true,
      evidence: []
    }
  ];
  return actions.sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority]);
}

function buildReadiness(data: PipelineData, checklist: DocumentChecklistItem[], risks: PipelineAction[]): PipelineReadiness {
  const materials = materialTotals(data.materials);
  const checks = [
    { key: "budget_loaded", label: "ВОР загружен", passed: data.budgetItems.length > 0 || data.importBatches.length > 0, weight: 18, detail: `${data.budgetItems.length} позиций бюджета` },
    { key: "materials_extracted", label: "Материалы определены", passed: data.materials.length > 0, weight: 14, detail: `${data.materials.length} материалов` },
    { key: "procurement_drafted", label: "Закупки подготовлены", passed: data.procurementRequests.length > 0, weight: 12, detail: `${data.procurementRequests.length} заявок` },
    { key: "schedule_drafted", label: "График есть", passed: data.scheduleItems.length > 0, weight: 14, detail: `${data.scheduleItems.length} работ` },
    { key: "cashflow_drafted", label: "Cashflow есть", passed: data.cashflowPeriods.length > 0 || data.payments.length > 0, weight: 12, detail: `${data.cashflowPeriods.length} периодов / ${data.payments.length} платежей` },
    { key: "key_documents", label: "Ключевые документы", passed: checklist.filter((item) => item.status === "present").length >= 3, weight: 14, detail: `${checklist.filter((item) => item.status === "present").length}/${checklist.length}` },
    { key: "material_deficit", label: "Дефицит материалов", passed: materials.deficitItems.length === 0, weight: 8, detail: `${materials.deficitItems.length} дефицитных позиций` },
    { key: "import_warnings", label: "Warnings импорта", passed: (data.importBatches[0]?.preview.summary.warnings ?? 0) === 0, weight: 8, detail: `${data.importBatches[0]?.preview.summary.warnings ?? 0} warnings` }
  ];
  const maxScore = checks.reduce((sum, item) => sum + item.weight, 0);
  const score = Math.round((checks.filter((item) => item.passed).reduce((sum, item) => sum + item.weight, 0) / maxScore) * 100);
  return {
    score,
    status: score >= 70 ? "ready" : score >= 25 ? "partial" : "empty",
    summary:
      score >= 70
        ? `Проект готов к работе на ${score}%: основные данные связаны, проверьте оставшиеся риски.`
        : `Проект готов к работе на ${score}%: ВОР загружен, но нужны закупки, график, cashflow или ключевые документы.`,
    checks,
    counts: {
      committedImports: data.importBatches.length,
      importedBudgetItems: importedBudgetRows(data.importBatches[0]).length,
      importedMaterials: importedMaterialRows(data.importBatches[0]).length,
      importedWarnings: data.importBatches[0]?.preview.summary.warnings ?? 0,
      budgetItems: data.budgetItems.length,
      materials: data.materials.length,
      procurementRequests: data.procurementRequests.length,
      scheduleItems: data.scheduleItems.length,
      cashflowPeriods: data.cashflowPeriods.length,
      documents: data.documents.length,
      calculatedRisks: risks.length
    }
  };
}

export async function buildPipelineSnapshot(projectId: string): Promise<PipelineSnapshot | null> {
  const data = await loadPipelineData(projectId);
  if (!data) return null;
  const documentChecklist = buildDocumentChecklist(data);
  const calculatedRisks = calculatedRiskActions(data, documentChecklist);
  const readiness = buildReadiness(data, documentChecklist, calculatedRisks);
  const postImportActions = buildPostImportActions(data, calculatedRisks);
  const missingData = [
    ...readiness.checks.filter((item) => !item.passed).map((item) => item.label),
    ...documentChecklist.filter((item) => item.status === "missing").map((item) => item.title)
  ];
  const nextActions = postImportActions.filter((item) => item.enabled !== false).slice(0, 7);
  return {
    projectId,
    latestImport: data.importBatches[0] ?? null,
    readiness,
    postImportActions,
    documentChecklist,
    calculatedRisks,
    intelligence: {
      completenessScore: readiness.score,
      summary: readiness.summary,
      topRisks: calculatedRisks.slice(0, 5),
      nextActions,
      missingData,
      quickActions: [
        {
          title: "Что делать после загрузки ВОР?",
          prompt: "Что делать после загрузки ВОР?",
          deterministicAnswer: nextActions.map((item, index) => `${index + 1}. ${item.title}: ${item.suggestedNextStep}`).join("\n")
        },
        {
          title: "Какие материалы нужно закупить?",
          prompt: "Какие материалы нужно закупить?",
          deterministicAnswer: buildProcurementDraft(data).items.map((item) => `${item.material}: дефицит ${item.deficit} ${item.unit}, ${item.suggestedAction}`).join("\n") || "Критичного дефицита материалов не выявлено."
        },
        {
          title: "Какие позиции бюджета проверить?",
          prompt: "Какие позиции бюджета проверить?",
          deterministicAnswer: calculatedRisks.filter((item) => item.category === "budget" || item.category === "import").map((item) => `${item.title}: ${item.description}`).join("\n") || "Блокирующих бюджетных замечаний по импорту нет."
        },
        {
          title: "Сформируй задачи для ПТО",
          prompt: "Сформируй задачи для ПТО",
          deterministicAnswer: nextActions.filter((item) => /ПТО|РП/.test(item.ownerRole ?? "") || ["budget", "schedule", "documents"].includes(item.category)).map((item) => `- ${item.title}: ${item.suggestedNextStep}`).join("\n")
        },
        {
          title: "Сводка для руководства",
          prompt: "Сводка для руководства",
          deterministicAnswer: `${readiness.summary}\nTop risks: ${calculatedRisks.slice(0, 3).map((item) => item.title).join("; ") || "нет критичных расчетных рисков"}.`
        }
      ]
    }
  };
}

export async function buildPipelineOrThrow(projectId: string) {
  const data = await loadPipelineData(projectId);
  if (!data) return null;
  return data;
}

export async function commitProcurementDraft(projectId: string, userId: string) {
  const data = await buildPipelineOrThrow(projectId);
  if (!data) return null;
  const draft = buildProcurementDraft(data);
  if (!draft.items.length) return { draft, created: [] };
  const created = await prisma.$transaction(
    draft.items.map((item) =>
      prisma.procurementRequest.create({
        data: {
          organizationId: data.project.organizationId,
          projectId,
          title: `Черновик снабжения: ${item.material}`,
          initiator: "PGS Pipeline",
          neededAt: new Date(),
          priority: item.status === "quote_needed" ? "high" : "medium",
          status: "draft",
          createdBy: userId,
          items: {
            create: [
              {
                materialId: item.materialId,
                name: item.material,
                qty: new Prisma.Decimal(item.deficit),
                unit: item.unit,
                comment: `Draft from VOR import ${draft.sourceImportBatchId ?? "unknown"}`
              }
            ]
          }
        },
        include: { items: true }
      })
    )
  );
  return { draft, created: created.map(serializeProcurementRequest) };
}

export async function commitScheduleDraft(projectId: string, userId: string) {
  const data = await buildPipelineOrThrow(projectId);
  if (!data) return null;
  const draft = buildScheduleDraft(data);
  const projectStart = new Date(data.project.startsAt);
  let cursor = Number.isNaN(projectStart.getTime()) ? new Date() : projectStart;
  const itemsToCreate = draft.items.filter((item) => item.status !== "already_exists");
  const created = await prisma.$transaction(
    itemsToCreate.map((item) => {
      const startsAt = new Date(cursor);
      const endsAt = new Date(cursor);
      endsAt.setDate(endsAt.getDate() + item.suggestedDurationDays);
      cursor = new Date(endsAt);
      cursor.setDate(cursor.getDate() + 1);
      return prisma.scheduleItem.create({
        data: {
          organizationId: data.project.organizationId,
          projectId,
          name: item.name,
          owner: "ПТО",
          startsAt,
          endsAt,
          plannedQty: new Prisma.Decimal(item.works || 1),
          actualQty: new Prisma.Decimal(0),
          status: "not_started",
          dependency: item.dependency ?? undefined,
          createdBy: userId
        }
      });
    })
  );
  return { draft, created: created.map(serializeScheduleItem) };
}

export async function commitCashflowDraft(projectId: string) {
  const data = await buildPipelineOrThrow(projectId);
  if (!data) return null;
  const draft = buildCashflowDraft(data);
  if (data.cashflowPeriods.length > 0) return { draft, created: [] };
  const projectStart = new Date(data.project.startsAt);
  const created = await prisma.$transaction(
    draft.items.map((item, index) => {
      const periodStart = new Date(projectStart);
      periodStart.setMonth(periodStart.getMonth() + index);
      periodStart.setDate(1);
      const periodEnd = new Date(periodStart);
      periodEnd.setMonth(periodEnd.getMonth() + 1);
      periodEnd.setDate(0);
      return prisma.cashflowPeriod.create({
        data: {
          organizationId: data.project.organizationId,
          projectId,
          periodStart,
          periodEnd,
          openingBalance: new Prisma.Decimal(0),
          incoming: new Prisma.Decimal(0),
          outgoing: new Prisma.Decimal(item.amount),
          closingBalance: new Prisma.Decimal(-item.amount),
          cashGap: new Prisma.Decimal(-item.amount)
        }
      });
    })
  );
  return {
    draft,
    created: created.map((item) => ({
      id: item.id,
      periodStart: item.periodStart.toISOString(),
      periodEnd: item.periodEnd.toISOString(),
      outgoing: decimalToNumber(item.outgoing),
      cashGap: decimalToNumber(item.cashGap)
    }))
  };
}
