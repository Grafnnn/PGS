import { z } from "zod";

export const closeoutPackageStatuses = ["draft", "in_progress", "submitted", "accepted", "rejected", "closed"] as const;
export const closeoutChecklistStatuses = ["pending", "in_progress", "completed", "blocked", "not_applicable"] as const;
export const warrantyStatuses = ["draft", "active", "expiring", "expired", "closed"] as const;

export type CloseoutPackageStatus = (typeof closeoutPackageStatuses)[number];
export type CloseoutChecklistStatus = (typeof closeoutChecklistStatuses)[number];
export type WarrantyStatus = (typeof warrantyStatuses)[number];
export type CloseoutReadiness = "not_started" | "in_progress" | "blocked" | "awaiting_acceptance" | "ready" | "warranty" | "completed";

export type CloseoutDocumentCandidate = {
  id: string;
  title: string;
  category: string;
  fileName?: string | null;
};

export type CloseoutChecklistLike = {
  id?: string;
  required: boolean;
  status: string;
  sourceType: string;
  sourceSatisfied?: boolean | null;
};

export type CloseoutPackageLike = {
  id?: string;
  status: string;
  dueAt?: Date | string | null;
  checklistItems: CloseoutChecklistLike[];
};

export type WarrantyLike = {
  id?: string;
  status: string;
  endsAt?: Date | string | null;
  noticeDays?: number | null;
  retentionAmount?: number | string | { toString(): string } | null;
  retentionReleaseAt?: Date | string | null;
};

export type CloseoutSummary = {
  readiness: CloseoutReadiness;
  packageCount: number;
  acceptedPackageCount: number;
  requiredItemCount: number;
  completedItemCount: number;
  blockedItemCount: number;
  remainingItemCount: number;
  completionPercent: number;
  openAcceptanceBlockers: number;
  activeWarrantyCount: number;
  expiringWarrantyCount: number;
  retentionHeld: number;
  canCompleteProject: boolean;
};

export type CloseoutBootstrapItem = {
  sequence: number;
  title: string;
  category: string;
  required: boolean;
  status: CloseoutChecklistStatus;
  sourceType: string;
  sourceId: string | null;
  documentId: string | null;
  notes: string;
};

const nullableDate = z.string().datetime().nullable().optional();
const nullableText = z.string().trim().max(2000).nullable().optional();
const nullableId = z.string().trim().min(1).max(180).nullable().optional();

export const closeoutMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("bootstrap") }).strict(),
  z.object({
    action: z.literal("create_package"),
    title: z.string().trim().min(3).max(180),
    scope: nullableText,
    responsibleParty: z.string().trim().max(180).nullable().optional(),
    dueAt: nullableDate,
    notes: nullableText
  }).strict(),
  z.object({
    action: z.literal("update_package"),
    id: z.string().trim().min(1).max(180),
    title: z.string().trim().min(3).max(180).optional(),
    scope: nullableText,
    status: z.enum(closeoutPackageStatuses).optional(),
    responsibleParty: z.string().trim().max(180).nullable().optional(),
    dueAt: nullableDate,
    handoverAt: nullableDate,
    transmittalId: nullableId,
    decisionComment: nullableText,
    notes: nullableText
  }).strict(),
  z.object({
    action: z.literal("update_checklist_item"),
    id: z.string().trim().min(1).max(180),
    status: z.enum(closeoutChecklistStatuses),
    documentId: nullableId,
    notes: nullableText
  }).strict(),
  z.object({
    action: z.literal("create_warranty"),
    packageId: nullableId,
    title: z.string().trim().min(3).max(180),
    category: z.string().trim().min(2).max(80).default("workmanship"),
    counterparty: z.string().trim().max(180).nullable().optional(),
    responsibleParty: z.string().trim().max(180).nullable().optional(),
    startsAt: nullableDate,
    endsAt: nullableDate,
    noticeDays: z.coerce.number().int().min(1).max(365).default(30),
    retentionAmount: z.coerce.number().min(0).max(999_999_999_999).default(0),
    retentionReleaseAt: nullableDate,
    terms: nullableText,
    notes: nullableText,
    sourceDocumentId: nullableId
  }).strict(),
  z.object({
    action: z.literal("update_warranty"),
    id: z.string().trim().min(1).max(180),
    title: z.string().trim().min(3).max(180).optional(),
    category: z.string().trim().min(2).max(80).optional(),
    status: z.enum(warrantyStatuses).optional(),
    counterparty: z.string().trim().max(180).nullable().optional(),
    responsibleParty: z.string().trim().max(180).nullable().optional(),
    startsAt: nullableDate,
    endsAt: nullableDate,
    noticeDays: z.coerce.number().int().min(1).max(365).optional(),
    retentionAmount: z.coerce.number().min(0).max(999_999_999_999).optional(),
    retentionReleaseAt: nullableDate,
    terms: nullableText,
    notes: nullableText,
    sourceDocumentId: nullableId
  }).strict(),
  z.object({ action: z.literal("complete_project") }).strict()
]);

const packageTransitions: Record<CloseoutPackageStatus, readonly CloseoutPackageStatus[]> = {
  draft: ["in_progress"],
  in_progress: ["submitted"],
  submitted: ["accepted", "rejected", "in_progress"],
  accepted: ["closed", "in_progress"],
  rejected: ["in_progress"],
  closed: []
};

const warrantyTransitions: Record<WarrantyStatus, readonly WarrantyStatus[]> = {
  draft: ["active", "closed"],
  active: ["expiring", "expired", "closed"],
  expiring: ["active", "expired", "closed"],
  expired: ["closed"],
  closed: []
};

export function canTransitionCloseoutPackage(current: string, next: CloseoutPackageStatus) {
  if (current === next) return true;
  if (!closeoutPackageStatuses.includes(current as CloseoutPackageStatus)) return false;
  return packageTransitions[current as CloseoutPackageStatus].includes(next);
}

export function canTransitionWarranty(current: string, next: WarrantyStatus) {
  if (current === next) return true;
  if (!warrantyStatuses.includes(current as WarrantyStatus)) return false;
  return warrantyTransitions[current as WarrantyStatus].includes(next);
}

function timestamp(value: Date | string | null | undefined) {
  if (!value) return null;
  const result = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(result) ? result : null;
}

function amount(value: WarrantyLike["retentionAmount"]) {
  const result = Number(value ?? 0);
  return Number.isFinite(result) ? result : 0;
}

export function effectiveWarrantyStatus(warranty: WarrantyLike, now = new Date()): WarrantyStatus {
  if (warranty.status === "closed") return "closed";
  const end = timestamp(warranty.endsAt);
  if (!end) return warrantyStatuses.includes(warranty.status as WarrantyStatus) ? warranty.status as WarrantyStatus : "draft";
  if (end < now.getTime()) return "expired";
  const noticeDays = Math.max(1, Math.min(365, Number(warranty.noticeDays ?? 30) || 30));
  if (end <= now.getTime() + noticeDays * 86_400_000) return "expiring";
  return warranty.status === "draft" ? "draft" : "active";
}

export function effectiveChecklistStatus(item: CloseoutChecklistLike, openAcceptanceBlockers: number): CloseoutChecklistStatus {
  if (item.sourceType === "quality_gate" && openAcceptanceBlockers > 0) return "blocked";
  const status = closeoutChecklistStatuses.includes(item.status as CloseoutChecklistStatus)
    ? item.status as CloseoutChecklistStatus
    : "pending";
  if (status === "completed" && item.sourceSatisfied === false) return "blocked";
  return status;
}

export function summarizeProjectCloseout(input: {
  projectStatus: string;
  packages: CloseoutPackageLike[];
  warranties: WarrantyLike[];
  openAcceptanceBlockers: number;
  now?: Date;
}): CloseoutSummary {
  const now = input.now ?? new Date();
  const checklistItems = input.packages.flatMap((item) => item.checklistItems);
  const required = checklistItems.filter((item) => item.required);
  const statuses = required.map((item) => effectiveChecklistStatus(item, input.openAcceptanceBlockers));
  const completedItemCount = statuses.filter((status) => status === "completed" || status === "not_applicable").length;
  const blockedItemCount = statuses.filter((status) => status === "blocked").length;
  const remainingItemCount = Math.max(0, required.length - completedItemCount);
  const acceptedPackageCount = input.packages.filter((item) => item.status === "accepted" || item.status === "closed").length;
  const packageOverdue = input.packages.some((item) => {
    const due = timestamp(item.dueAt);
    return Boolean(due && due < now.getTime() && item.status !== "accepted" && item.status !== "closed");
  });
  const effectiveWarranties = input.warranties.map((item) => ({ item, status: effectiveWarrantyStatus(item, now) }));
  const activeWarrantyCount = effectiveWarranties.filter(({ status }) => ["active", "expiring"].includes(status)).length;
  const expiringWarrantyCount = effectiveWarranties.filter(({ status }) => status === "expiring" || status === "expired").length;
  const retentionHeld = effectiveWarranties
    .filter(({ status, item }) => status !== "closed" && (!item.retentionReleaseAt || (timestamp(item.retentionReleaseAt) ?? 0) > now.getTime()))
    .reduce((sum, { item }) => sum + amount(item.retentionAmount), 0);
  const allPackagesAccepted = input.packages.length > 0 && acceptedPackageCount === input.packages.length;
  const canCompleteProject = allPackagesAccepted && remainingItemCount === 0 && input.openAcceptanceBlockers === 0;

  let readiness: CloseoutReadiness = "in_progress";
  if (!input.packages.length) readiness = "not_started";
  else if (blockedItemCount || input.openAcceptanceBlockers || packageOverdue) readiness = "blocked";
  else if (canCompleteProject && input.projectStatus !== "completed" && input.projectStatus !== "archived") readiness = "ready";
  else if (input.packages.some((item) => item.status === "submitted")) readiness = "awaiting_acceptance";
  else if (input.projectStatus === "completed" && activeWarrantyCount) readiness = "warranty";
  else if (input.projectStatus === "completed" || input.projectStatus === "archived") readiness = "completed";

  return {
    readiness,
    packageCount: input.packages.length,
    acceptedPackageCount,
    requiredItemCount: required.length,
    completedItemCount,
    blockedItemCount,
    remainingItemCount,
    completionPercent: required.length ? Math.round((completedItemCount / required.length) * 100) : 0,
    openAcceptanceBlockers: input.openAcceptanceBlockers,
    activeWarrantyCount,
    expiringWarrantyCount,
    retentionHeld,
    canCompleteProject
  };
}

const bootstrapRequirements: Array<{
  title: string;
  category: string;
  sourceType: string;
  patterns?: RegExp[];
  notes: string;
}> = [
  {
    title: "Договор и согласованный итоговый объем",
    category: "commercial",
    sourceType: "document_requirement",
    patterns: [/договор|контракт/i, /вор|смет|объем/i],
    notes: "Проверить договорный объем, изменения и финальную редакцию."
  },
  {
    title: "Финальный пакет КС и взаиморасчеты",
    category: "billing",
    sourceType: "document_requirement",
    patterns: [/кс[-\s]?[23]|акт.*выполн|финальн.*расч/i],
    notes: "Подтвердить закрываемые объемы, суммы, удержания и остатки."
  },
  {
    title: "Исполнительные схемы и акты скрытых работ",
    category: "documents",
    sourceType: "document_requirement",
    patterns: [/исполнительн.*схем|акт.*скрыт|аоср/i],
    notes: "Связать актуальную версию исполнительного комплекта."
  },
  {
    title: "Сертификаты и паспорта материалов",
    category: "documents",
    sourceType: "document_requirement",
    patterns: [/сертификат|паспорт.*материал|декларац.*соответ/i],
    notes: "Проверить документы качества по фактически примененным материалам."
  },
  {
    title: "NCR, дефекты и Punch List закрыты",
    category: "quality",
    sourceType: "quality_gate",
    notes: "Обязательный gate: открытые блокирующие замечания не позволяют принять пакет."
  },
  {
    title: "Испытания, пусконаладка и разрешения",
    category: "commissioning",
    sourceType: "manual",
    notes: "Зафиксировать применимые испытания, протоколы и разрешения."
  },
  {
    title: "Итоговая передача комплекта заказчику",
    category: "handover",
    sourceType: "transmittal_gate",
    notes: "Привязать финальную выдачу и получить подтверждение заказчика."
  },
  {
    title: "Гарантийные условия и удержания подтверждены",
    category: "warranty",
    sourceType: "warranty_gate",
    notes: "Указать реальные сроки и суммы из договора; система не подставляет их автоматически."
  }
];

function documentText(document: CloseoutDocumentCandidate) {
  return `${document.title} ${document.category} ${document.fileName ?? ""}`.toLocaleLowerCase("ru-RU");
}

export function buildCloseoutBootstrapChecklist(
  documents: CloseoutDocumentCandidate[],
  openAcceptanceBlockers: number
): CloseoutBootstrapItem[] {
  return bootstrapRequirements.map((requirement, index) => {
    const match = requirement.patterns
      ? documents.find((document) => requirement.patterns?.some((pattern) => pattern.test(documentText(document))))
      : null;
    const status: CloseoutChecklistStatus = requirement.sourceType === "quality_gate" && openAcceptanceBlockers > 0
      ? "blocked"
      : match
        ? "in_progress"
        : "pending";
    return {
      sequence: index + 1,
      title: requirement.title,
      category: requirement.category,
      required: true,
      status,
      sourceType: requirement.sourceType,
      sourceId: match?.id ?? null,
      documentId: match?.id ?? null,
      notes: match
        ? `${requirement.notes} Найден кандидат: ${match.title}. Требуется подтверждение.`
        : requirement.notes
    };
  });
}
