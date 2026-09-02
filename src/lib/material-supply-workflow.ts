import type { Material, ProcurementRequest, RiskPriority, ScheduleItem } from "@/lib/types";

export const DEFAULT_SUPPLY_LEAD_DAYS = 14;

const DAY_MS = 86_400_000;
const ACTIVE_REQUEST_STATUSES = new Set(["draft", "submitted", "approved", "ordered", "expected", "partially_received"]);
const AWAITING_REQUEST_STATUSES = new Set(["approved", "ordered", "expected", "partially_received"]);

export type MaterialSupplyDemand = {
  id: string;
  materialId: string;
  name: string;
  unit: string;
  category: string;
  requestCode?: string;
  requiredQty: number;
  orderedQty: number;
  deliveredQty: number;
  consumedQty: number;
  onHandQty: number;
  deficitQty: number;
  plannedUnitPrice: number;
  deliveryAt: string;
  requestAt: string;
  leadTimeDays: number;
  source: "schedule" | "material";
  phase: "due" | "upcoming" | "covered" | "stocked";
  daysUntilDelivery: number;
  activeRequestId?: string;
};

export type MaterialSupplyRequestGroup = {
  key: string;
  title: string;
  category: string;
  requestAt: string;
  neededAt: string;
  priority: RiskPriority;
  items: MaterialSupplyDemand[];
};

export type MaterialSupplyWorkflowModel = {
  today: string;
  leadTimeDays: number;
  demands: MaterialSupplyDemand[];
  dueDemands: MaterialSupplyDemand[];
  upcomingDemands: MaterialSupplyDemand[];
  groups: MaterialSupplyRequestGroup[];
  drafts: ProcurementRequest[];
  submitted: ProcurementRequest[];
  awaiting: ProcurementRequest[];
  received: ProcurementRequest[];
  warehouse: Array<MaterialSupplyDemand & { stockValue: number }>;
  summary: {
    due: number;
    dueGroups: number;
    submitted: number;
    awaiting: number;
    overdue: number;
    warehousePositions: number;
    warehouseValue: number;
  };
};

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function dateValue(value: string) {
  const parsed = new Date(`${value.slice(0, 10)}T00:00:00.000Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function dateOnly(value: Date) {
  return value.toISOString().slice(0, 10);
}

function shiftDays(value: string, days: number) {
  const parsed = dateValue(value) ?? new Date();
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return dateOnly(parsed);
}

function daysBetween(from: string, to: string) {
  const left = dateValue(from);
  const right = dateValue(to);
  if (!left || !right) return 0;
  return Math.round((right.getTime() - left.getTime()) / DAY_MS);
}

function weekStart(value: string) {
  const parsed = dateValue(value) ?? new Date();
  const day = parsed.getUTCDay() || 7;
  parsed.setUTCDate(parsed.getUTCDate() - day + 1);
  return dateOnly(parsed);
}

function earliestDate(values: Array<string | undefined>) {
  return values
    .filter((value): value is string => Boolean(value && dateValue(value)))
    .sort()[0];
}

function sourceRequestCode(name: string) {
  const match = name.match(/^\s*\[([^\]]+)\]\s*/);
  return match?.[1]?.trim() || undefined;
}

export function materialSupplyCategory(name: string) {
  const value = normalize(name);
  if (/бетон|раствор|цемент|песок|щеб/.test(value)) return "Бетон и инертные";
  if (/армат|металл|швеллер|уголок|сталь/.test(value)) return "Металл";
  if (/кабель|щит|автомат|электр|свет/.test(value)) return "Электрика";
  if (/труба|пнд|канал|вод|фитинг|запор/.test(value)) return "Инженерные сети";
  if (/гидро|мембран|утепл|кров/.test(value)) return "Кровля и изоляция";
  if (/краск|грунт|плитк|гкл|смес|отдел/.test(value)) return "Отделка";
  return "Прочее";
}

function priorityForDelivery(today: string, deliveryAt: string): RiskPriority {
  const days = daysBetween(today, deliveryAt);
  if (days <= 0) return "critical";
  if (days <= 7) return "high";
  return "medium";
}

export function buildMaterialSupplyWorkflow({
  materials,
  scheduleItems,
  procurementRequests,
  today = new Date().toISOString().slice(0, 10),
  leadTimeDays = DEFAULT_SUPPLY_LEAD_DAYS
}: {
  materials: Material[];
  scheduleItems: ScheduleItem[];
  procurementRequests: ProcurementRequest[];
  today?: string;
  leadTimeDays?: number;
}): MaterialSupplyWorkflowModel {
  const activeRequestByMaterial = new Map<string, ProcurementRequest>();
  const pendingRequestQtyByMaterial = new Map<string, number>();
  const confirmedRequestQtyByMaterial = new Map<string, number>();
  for (const request of procurementRequests.filter((item) => ACTIVE_REQUEST_STATUSES.has(item.status))) {
    for (const item of request.items) {
      if (!item.materialId) continue;
      if (!activeRequestByMaterial.has(item.materialId)) activeRequestByMaterial.set(item.materialId, request);
      const quantities = ["draft", "submitted"].includes(request.status) ? pendingRequestQtyByMaterial : confirmedRequestQtyByMaterial;
      quantities.set(item.materialId, (quantities.get(item.materialId) ?? 0) + item.qty);
    }
  }

  const scheduleByCostCode = new Map<string, ScheduleItem[]>();
  for (const item of scheduleItems) {
    if (!item.costCodeId || item.status === "done") continue;
    const current = scheduleByCostCode.get(item.costCodeId) ?? [];
    current.push(item);
    scheduleByCostCode.set(item.costCodeId, current);
  }

  const demands = materials.map((material) => {
    const scheduleStart = material.costCodeId
      ? earliestDate((scheduleByCostCode.get(material.costCodeId) ?? []).map((item) => item.startsAt))
      : undefined;
    const deliveryAt = earliestDate([scheduleStart, material.neededAt]) ?? material.neededAt;
    const requestAt = earliestDate([material.orderByAt]) ?? shiftDays(deliveryAt, -leadTimeDays);
    const requestCode = sourceRequestCode(material.name);
    const orderedOrConfirmedQty = Math.max(
      material.orderedQty,
      material.deliveredQty,
      confirmedRequestQtyByMaterial.get(material.id) ?? 0
    );
    const coveredQty = orderedOrConfirmedQty + (pendingRequestQtyByMaterial.get(material.id) ?? 0);
    const deficitQty = Math.max(material.requiredQty - coveredQty, 0);
    const onHandQty = Math.max(material.deliveredQty - material.consumedQty, 0);
    const activeRequest = activeRequestByMaterial.get(material.id);
    const phase: MaterialSupplyDemand["phase"] = onHandQty > 0 && deficitQty <= 0
      ? "stocked"
      : deficitQty <= 0
        ? "covered"
        : requestAt <= today
          ? "due"
          : "upcoming";
    return {
      id: material.id,
      materialId: material.id,
      name: material.name,
      unit: material.unit,
      category: materialSupplyCategory(material.name),
      requestCode,
      requiredQty: material.requiredQty,
      orderedQty: material.orderedQty,
      deliveredQty: material.deliveredQty,
      consumedQty: material.consumedQty,
      onHandQty,
      deficitQty,
      plannedUnitPrice: material.plannedUnitPrice,
      deliveryAt,
      requestAt,
      leadTimeDays,
      source: scheduleStart && scheduleStart <= material.neededAt ? "schedule" : "material",
      phase,
      daysUntilDelivery: daysBetween(today, deliveryAt),
      activeRequestId: activeRequest?.id
    } satisfies MaterialSupplyDemand;
  }).sort((left, right) => left.deliveryAt.localeCompare(right.deliveryAt) || left.name.localeCompare(right.name, "ru"));

  const dueDemands = demands.filter((item) => item.phase === "due" && item.deficitQty > 0);
  const upcomingDemands = demands.filter((item) => item.phase === "upcoming" && item.deficitQty > 0);
  const grouped = new Map<string, MaterialSupplyRequestGroup>();
  for (const item of dueDemands) {
    const groupCategory = item.requestCode ? `${item.requestCode} · ${item.category}` : item.category;
    const key = item.requestCode
      ? `${item.requestAt}|${normalize(item.requestCode)}`
      : `${weekStart(item.deliveryAt)}|${item.category}`;
    const existing = grouped.get(key) ?? {
      key,
      title: item.requestCode
        ? `${item.requestCode} · поставка до ${item.deliveryAt}`
        : `Автозаявка · ${item.category} · поставка до ${item.deliveryAt}`,
      category: groupCategory,
      requestAt: item.requestAt,
      neededAt: item.deliveryAt,
      priority: priorityForDelivery(today, item.deliveryAt),
      items: []
    };
    existing.items.push(item);
    if (item.deliveryAt < existing.neededAt) existing.neededAt = item.deliveryAt;
    if (item.requestAt < existing.requestAt) existing.requestAt = item.requestAt;
    const nextPriority = priorityForDelivery(today, item.deliveryAt);
    if (nextPriority === "critical" || (nextPriority === "high" && existing.priority === "medium")) existing.priority = nextPriority;
    grouped.set(key, existing);
  }

  const groups = Array.from(grouped.values()).sort((left, right) => left.neededAt.localeCompare(right.neededAt) || left.category.localeCompare(right.category, "ru"));
  const drafts = procurementRequests.filter((item) => item.status === "draft");
  const submitted = procurementRequests.filter((item) => item.status === "submitted");
  const awaiting = procurementRequests.filter((item) => AWAITING_REQUEST_STATUSES.has(item.status));
  const received = procurementRequests.filter((item) => ["received", "closed"].includes(item.status));
  const warehouse = demands
    .filter((item) => item.onHandQty > 0 || item.deliveredQty > 0)
    .map((item) => ({ ...item, stockValue: item.onHandQty * (item.plannedUnitPrice || 0) }))
    .sort((left, right) => right.stockValue - left.stockValue || left.name.localeCompare(right.name, "ru"));
  const overdue = awaiting.filter((item) => (item.expectedAt ?? item.neededAt) < today && item.status !== "received").length;

  return {
    today,
    leadTimeDays,
    demands,
    dueDemands,
    upcomingDemands,
    groups,
    drafts,
    submitted,
    awaiting,
    received,
    warehouse,
    summary: {
      due: dueDemands.length,
      dueGroups: groups.length,
      submitted: submitted.length,
      awaiting: awaiting.length,
      overdue,
      warehousePositions: warehouse.length,
      warehouseValue: warehouse.reduce((sum, item) => sum + item.stockValue, 0)
    }
  };
}
