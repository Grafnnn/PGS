import type {
  BudgetItem as DbBudgetItem,
  DailyReport as DbDailyReport,
  Document as DbDocument,
  Material as DbMaterial,
  Payment as DbPayment,
  ProcurementRequest as DbProcurementRequest,
  ProcurementRequestItem as DbProcurementRequestItem,
  AuditLog as DbAuditLog,
  Project as DbProject,
  Risk as DbRisk,
  ScheduleItem as DbScheduleItem
} from "@prisma/client";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, Risk, ScheduleItem } from "./types";

const dateOnly = (date: Date) => date.toISOString().slice(0, 10);
const num = (value: { toNumber?: () => number } | number | null | undefined) => {
  if (typeof value === "number") return value;
  return value?.toNumber?.() ?? 0;
};

export function serializeProject(project: DbProject): Project {
  return {
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    customer: project.customer,
    object: project.object,
    address: project.address,
    contractAmount: num(project.contractAmount),
    vatMode: project.vatMode === "no_vat" ? "no_vat" : "vat",
    startsAt: dateOnly(project.startsAt),
    endsAt: dateOnly(project.endsAt),
    manager: project.manager,
    status: project.status
  };
}

export function serializeBudgetItem(item: DbBudgetItem): BudgetItem {
  return {
    id: item.id,
    projectId: item.projectId,
    section: item.section,
    subsection: item.subsection ?? undefined,
    code: item.code,
    name: item.name,
    unit: item.unit,
    qty: num(item.qty),
    plannedUnitPrice: num(item.plannedUnitPrice),
    actualUnitPrice: num(item.actualUnitPrice),
    forecastUnitPrice: num(item.forecastUnitPrice),
    kind: item.kind,
    source: item.source,
    comment: item.comment ?? undefined
  };
}

export function serializeScheduleItem(item: DbScheduleItem): ScheduleItem {
  return {
    id: item.id,
    projectId: item.projectId,
    budgetItemId: item.budgetItemId ?? undefined,
    name: item.name,
    owner: item.owner,
    startsAt: dateOnly(item.startsAt),
    endsAt: dateOnly(item.endsAt),
    plannedQty: num(item.plannedQty),
    actualQty: num(item.actualQty),
    status: item.status as ScheduleItem["status"],
    dependency: item.dependency ?? undefined
  };
}

export function serializeMaterial(item: DbMaterial): Material {
  return {
    id: item.id,
    projectId: item.projectId,
    name: item.name,
    unit: item.unit,
    requiredQty: num(item.requiredQty),
    orderedQty: num(item.orderedQty),
    deliveredQty: num(item.deliveredQty),
    consumedQty: num(item.consumedQty),
    plannedUnitPrice: num(item.plannedUnitPrice),
    actualUnitPrice: num(item.actualUnitPrice),
    supplier: item.supplier ?? "Не выбран",
    neededAt: dateOnly(item.neededAt),
    status: item.status as Material["status"]
  };
}

export function serializeProcurementRequest(item: DbProcurementRequest & { items: DbProcurementRequestItem[] }): ProcurementRequest {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    initiator: item.initiator,
    neededAt: dateOnly(item.neededAt),
    priority: item.priority,
    status: item.status as ProcurementRequest["status"],
    items: item.items.map((requestItem) => ({
      materialId: requestItem.materialId ?? "",
      name: requestItem.name,
      qty: num(requestItem.qty),
      unit: requestItem.unit,
      comment: requestItem.comment ?? undefined
    }))
  };
}

export function serializePayment(item: DbPayment): Payment {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    counterparty: item.counterparty,
    direction: item.direction as Payment["direction"],
    plannedAt: dateOnly(item.plannedAt),
    paidAt: item.paidAt ? dateOnly(item.paidAt) : undefined,
    amount: num(item.amount),
    status: item.status as Payment["status"],
    category: item.category as Payment["category"]
  };
}

export function serializeDailyReport(item: DbDailyReport): DailyReport {
  return {
    id: item.id,
    projectId: item.projectId,
    date: dateOnly(item.date),
    author: item.author,
    weather: item.weather,
    workers: item.workers,
    engineers: item.engineers,
    equipment: item.equipment,
    completedWorks: item.completedWorks,
    materialsReceived: item.materialsReceived,
    materialsConsumed: item.materialsConsumed,
    downtime: item.downtime,
    issues: item.issues,
    status: item.status as DailyReport["status"]
  };
}

export function serializeRisk(item: DbRisk): Risk {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    reason: item.reason,
    priority: item.priority,
    owner: item.owner,
    dueAt: dateOnly(item.dueAt),
    status: item.status as Risk["status"]
  };
}

export function serializeDocument(item: DbDocument) {
  return {
    id: item.id,
    projectId: item.projectId,
    category: item.category,
    title: item.title,
    filePath: item.filePath,
    fileName: item.fileName,
    mimeType: item.mimeType,
    sizeBytes: item.sizeBytes,
    storageKey: item.storageKey,
    uploadedAt: item.uploadedAt.toISOString(),
    previewAvailable: Boolean(item.mimeType?.startsWith("image/") || item.mimeType === "application/pdf"),
    version: item.version,
    author: item.author,
    comment: item.comment,
    createdAt: item.createdAt.toISOString()
  };
}

export function serializeAuditLog(item: DbAuditLog) {
  return {
    id: item.id,
    projectId: item.projectId,
    actorName: item.actorName,
    actorEmail: item.actorEmail,
    entity: item.entity,
    entityId: item.entityId,
    action: item.action,
    summary: item.summary,
    createdAt: item.createdAt.toISOString()
  };
}
