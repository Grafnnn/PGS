import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";
import type { RiskExecutiveImportHistoryItem } from "@/lib/risk-executive-intelligence";

export type { RiskExecutiveImportHistoryItem };

export type DocumentComplianceReadiness = "no_data" | "needs_setup" | "missing_critical" | "partial" | "ready_for_review" | "ready";
export type RequiredDocumentCategory =
  | "executive"
  | "permit"
  | "quality"
  | "procurement"
  | "material_certificate"
  | "safety"
  | "ks"
  | "report"
  | "photo_evidence"
  | "design"
  | "unknown";
export type RequiredFor = "work_package" | "procurement" | "ks" | "executive_report" | "client_submission" | "closeout" | "safety";
export type DocumentRequirementStatus = "missing" | "needed" | "partial" | "uploaded" | "verified" | "not_applicable" | "unknown";
export type DocumentPriority = "low" | "medium" | "high" | "urgent";
export type DocumentOwnerRole = "project_manager" | "document_controller" | "site_engineer" | "procurement" | "finance" | "subcontractor" | "executive" | "unknown";
export type ComplianceSourceArea = "ВОР" | "Procurement" | "Materials" | "Schedule" | "Cashflow" | "Risks" | "Reports" | "Manual" | "Project";
export type PackageDocumentReadiness = "ready" | "partial" | "blocked" | "needs_review" | "unknown";
export type CloseoutStatus = "yes" | "partial" | "no" | "unknown";
export type PackageCategory = "structure" | "engineering" | "material" | "finishing" | "earthworks" | "roofing" | "safety" | "unknown";

export type RequiredDocument = {
  id: string;
  title: string;
  category: RequiredDocumentCategory;
  sourceArea: ComplianceSourceArea;
  requiredFor: RequiredFor[];
  status: DocumentRequirementStatus;
  priority: DocumentPriority;
  ownerRole: DocumentOwnerRole;
  linkedWorkPackageIds: string[];
  linkedRiskIds: string[];
  linkedActionIds: string[];
  evidence: string[];
  suggestedAction: string;
  blockers: string[];
  confidence: "low" | "medium" | "high";
  matchedDocumentIds: string[];
};

export type DocumentComplianceSummary = {
  readiness: DocumentComplianceReadiness;
  totalRequired: number;
  missing: number;
  urgentHigh: number;
  blockingWorkClosure: number;
  blockingKsOrReport: number;
  verifiedUploaded: number;
  unknownStatus: number;
  missingSources: ComplianceSourceArea[];
};

export type WorkPackageDocumentMapItem = {
  id: string;
  title: string;
  sourceSection: string;
  category: PackageCategory;
  readiness: PackageDocumentReadiness;
  requiredDocsCount: number;
  missingDocsCount: number;
  blockingDocs: string[];
  materialCertificateRequirements: string[];
  closeoutReady: CloseoutStatus;
  evidence: string[];
};

export type KsCloseoutReadiness = {
  readyForKs: CloseoutStatus;
  closeoutReady: CloseoutStatus;
  blockingDocuments: RequiredDocument[];
  missingPricesOrQuantities: Array<{ id: string; title: string; reason: string }>;
  notReadyWorkPackages: WorkPackageDocumentMapItem[];
  requiredReportPackage: string[];
  suggestedNextSteps: string[];
};

export type ExecutiveDocumentPackage = {
  readiness: "ready" | "partial" | "blocked" | "no_data";
  items: Array<{ title: string; status: DocumentRequirementStatus; reason: string }>;
  customerSubmissionChecklist: string[];
  limitations: string[];
};

export type WeeklyDocumentAction = {
  id: string;
  title: string;
  ownerRole: DocumentOwnerRole;
  reason: string;
  supports: string;
  priority: DocumentPriority;
  blocking: boolean;
  sourceDocumentId?: string;
};

export type DocumentComplianceRisk = {
  id: string;
  title: string;
  description: string;
  priority: DocumentPriority;
  sourceArea: ComplianceSourceArea;
  ownerRole: DocumentOwnerRole;
  suggestedAction: string;
  evidence: string[];
};

export type DocumentComplianceInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
  importHistory?: RiskExecutiveImportHistoryItem[] | null;
};

export type DocumentComplianceIntelligenceModel = {
  summary: DocumentComplianceSummary;
  requiredDocuments: RequiredDocument[];
  missingDocuments: RequiredDocument[];
  workPackageMap: WorkPackageDocumentMapItem[];
  closeoutReadiness: KsCloseoutReadiness;
  ksReadiness: KsCloseoutReadiness;
  executivePackage: ExecutiveDocumentPackage;
  weeklyPlan: WeeklyDocumentAction[];
  complianceRisks: DocumentComplianceRisk[];
  actionRegister: WeeklyDocumentAction[];
  unmatchedUploads: ProjectDocument[];
};

const priorityRank: Record<DocumentPriority, number> = { urgent: 4, high: 3, medium: 2, low: 1 };

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function slug(value: string) {
  return normalize(value).replace(/[^a-zа-я0-9]+/gi, "-").replace(/^-|-$/g, "") || "document";
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(normalize(needle)));
}

function hasAnyInput(input: DocumentComplianceInput) {
  return Boolean(
    (input.budgetItems ?? []).length ||
      (input.scheduleItems ?? []).length ||
      (input.materials ?? []).length ||
      (input.procurementRequests ?? []).length ||
      (input.documents ?? []).length ||
      (input.documentChecklist ?? []).length ||
      (input.importHistory ?? []).some((item) => item.preview)
  );
}

function requirement(input: Omit<RequiredDocument, "status" | "matchedDocumentIds"> & Partial<Pick<RequiredDocument, "status" | "matchedDocumentIds">>): RequiredDocument {
  return {
    status: input.status ?? "needed",
    matchedDocumentIds: input.matchedDocumentIds ?? [],
    ...input
  };
}

function mergeRequiredFor(left: RequiredFor[], right: RequiredFor[]) {
  return Array.from(new Set([...left, ...right]));
}

function addRequirement(target: RequiredDocument[], item: RequiredDocument) {
  const existing = target.find((candidate) => candidate.id === item.id);
  if (!existing) {
    target.push(item);
    return;
  }
  existing.requiredFor = mergeRequiredFor(existing.requiredFor, item.requiredFor);
  existing.linkedWorkPackageIds = Array.from(new Set([...existing.linkedWorkPackageIds, ...item.linkedWorkPackageIds]));
  existing.linkedRiskIds = Array.from(new Set([...existing.linkedRiskIds, ...item.linkedRiskIds]));
  existing.linkedActionIds = Array.from(new Set([...existing.linkedActionIds, ...item.linkedActionIds]));
  existing.evidence = Array.from(new Set([...existing.evidence, ...item.evidence]));
  existing.blockers = Array.from(new Set([...existing.blockers, ...item.blockers]));
  if (priorityRank[item.priority] > priorityRank[existing.priority]) existing.priority = item.priority;
}

function categoryGroupTitle(category: RequiredDocumentCategory) {
  if (category === "executive") return "Исполнительная";
  if (category === "material_certificate" || category === "quality" || category === "procurement") return "Материалы / certificates";
  if (category === "ks") return "КС / финальное закрытие";
  if (category === "report") return "Отчетность / executive";
  if (category === "photo_evidence") return "Фотофиксация";
  if (category === "design") return "Проектные/исходные данные";
  if (category === "permit" || category === "safety") return "Safety / permits";
  return "Требует классификации";
}

export function classifyRequiredDocumentForWorkPackage(input: Pick<BudgetItem | ScheduleItem, "id" | "name"> & { section?: string; kind?: string }): PackageCategory {
  const text = normalize(`${input.section ?? ""} ${input.name} ${input.kind ?? ""}`);
  if (includesAny(text, ["бетон", "арматур", "монолит", "плита", "конструкц", "каркас", "закладн"])) return "structure";
  if (includesAny(text, ["сети", "труб", "пнд", "кабель", "электр", "вод", "канализац", "испытан"])) return "engineering";
  if (includesAny(text, ["материал", "поставка", "кабель", "бетон", "арматур", "песок", "щебень", "геотекстиль", "гидроизоляц"])) return "material";
  if (includesAny(text, ["отдел", "штукатур", "плитк", "окрас", "пол", "потол"])) return "finishing";
  if (includesAny(text, ["землян", "котлован", "грунт", "основан", "геодез"])) return "earthworks";
  if (includesAny(text, ["кров", "гидроизоляц", "пароизоляц"])) return "roofing";
  if (includesAny(text, ["опасн", "допуск", "наряд", "высот"])) return "safety";
  return "unknown";
}

function workPackages(input: DocumentComplianceInput) {
  const budgetById = new Map((input.budgetItems ?? []).map((item) => [item.id, item]));
  const fromSchedule = (input.scheduleItems ?? []).map((item) => {
    const budgetItem = item.budgetItemId ? budgetById.get(item.budgetItemId) : undefined;
    return {
      id: item.id,
      title: item.name,
      section: budgetItem?.section ?? item.name,
      kind: budgetItem?.kind,
      source: "Schedule" as ComplianceSourceArea,
      missingQuantity: item.plannedQty <= 0,
      missingPrice: budgetItem ? budgetItem.plannedUnitPrice <= 0 && budgetItem.forecastUnitPrice <= 0 : false
    };
  });
  if (fromSchedule.length) return fromSchedule;
  const bySection = new Map<string, BudgetItem[]>();
  for (const item of input.budgetItems ?? []) {
    if (item.kind === "material") continue;
    bySection.set(item.section, [...(bySection.get(item.section) ?? []), item]);
  }
  return Array.from(bySection.entries()).map(([section, items]) => ({
    id: `budget-section:${slug(section)}`,
    title: section,
    section,
    kind: items[0]?.kind,
    source: "ВОР" as ComplianceSourceArea,
    missingQuantity: items.some((item) => item.qty <= 0),
    missingPrice: items.some((item) => item.plannedUnitPrice <= 0 && item.forecastUnitPrice <= 0)
  }));
}

function docsForPackage(pkg: ReturnType<typeof workPackages>[number]) {
  const category = classifyRequiredDocumentForWorkPackage({ id: pkg.id, name: pkg.title, section: pkg.section, kind: pkg.kind });
  const base = [
    requirement({
      id: `pkg:${pkg.id}:journal`,
      title: "Журнал работ / общий журнал",
      category: "report",
      sourceArea: pkg.source,
      requiredFor: ["work_package", "executive_report"],
      priority: "medium",
      ownerRole: "site_engineer",
      linkedWorkPackageIds: [pkg.id],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: [`Пакет: ${pkg.title}`],
      suggestedAction: "Проверить, что работы отражены в журнале работ.",
      blockers: [],
      confidence: "medium"
    }),
    requirement({
      id: `pkg:${pkg.id}:photo`,
      title: "Фотофиксация выполненных работ",
      category: "photo_evidence",
      sourceArea: pkg.source,
      requiredFor: ["work_package", "executive_report", "client_submission"],
      priority: "medium",
      ownerRole: "site_engineer",
      linkedWorkPackageIds: [pkg.id],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: [`Пакет: ${pkg.title}`],
      suggestedAction: "Собрать фото до/после и привязать к пакету работ.",
      blockers: [],
      confidence: "medium"
    })
  ];

  if (category === "structure") {
    base.push(
      requirement({
        id: `pkg:${pkg.id}:hidden-works`,
        title: "Акт освидетельствования скрытых работ",
        category: "executive",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "ks", "closeout"],
        priority: "urgent",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Конструктивный/монолитный пакет: ${pkg.title}`],
        suggestedAction: "Подготовить акт скрытых работ до закрытия следующего слоя.",
        blockers: ["closeout", "ks"],
        confidence: "high"
      }),
      requirement({
        id: `pkg:${pkg.id}:responsible-structures`,
        title: "Акт приемки ответственных конструкций",
        category: "executive",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "ks", "closeout"],
        priority: "high",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Конструктивный пакет: ${pkg.title}`],
        suggestedAction: "Проверить необходимость акта по ответственным конструкциям.",
        blockers: ["closeout"],
        confidence: "medium"
      })
    );
  }

  if (category === "engineering") {
    base.push(
      requirement({
        id: `pkg:${pkg.id}:executive-scheme`,
        title: "Исполнительная схема",
        category: "executive",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "ks", "client_submission", "closeout"],
        priority: "high",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Инженерный/сетевой пакет: ${pkg.title}`],
        suggestedAction: "Подготовить исполнительную схему по фактическому положению.",
        blockers: ["closeout", "client_submission"],
        confidence: "high"
      }),
      requirement({
        id: `pkg:${pkg.id}:test-protocol`,
        title: "Протокол испытаний",
        category: "quality",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "ks", "closeout"],
        priority: "high",
        ownerRole: "subcontractor",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Инженерный/сетевой пакет: ${pkg.title}`],
        suggestedAction: "Запросить протокол испытаний или указать, почему он не применим.",
        blockers: ["ks", "closeout"],
        confidence: "medium"
      })
    );
  }

  if (category === "earthworks") {
    base.push(
      requirement({
        id: `pkg:${pkg.id}:geodesy-scheme`,
        title: "Исполнительная геодезическая схема",
        category: "executive",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "client_submission", "closeout"],
        priority: "high",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Земляные/геодезические работы: ${pkg.title}`],
        suggestedAction: "Подтвердить исполнительную геодезическую схему по факту работ.",
        blockers: ["closeout"],
        confidence: "medium"
      })
    );
  }

  if (category === "finishing" || category === "roofing") {
    base.push(
      requirement({
        id: `pkg:${pkg.id}:layer-hidden-works`,
        title: "Акты скрытых работ по слоям/основаниям",
        category: "executive",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "ks", "closeout"],
        priority: category === "roofing" ? "high" : "medium",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Пакет с закрываемыми слоями: ${pkg.title}`],
        suggestedAction: "Проверить акты по слоям до закрытия работ.",
        blockers: ["closeout"],
        confidence: "medium"
      })
    );
  }

  if (category === "unknown") {
    base.push(
      requirement({
        id: `pkg:${pkg.id}:classification-review`,
        title: "Классификация пакета для исполнительной документации",
        category: "unknown",
        sourceArea: pkg.source,
        requiredFor: ["work_package", "executive_report"],
        priority: "medium",
        ownerRole: "document_controller",
        linkedWorkPackageIds: [pkg.id],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Не удалось надежно классифицировать: ${pkg.title}`],
        suggestedAction: "ПТО нужно определить, какие документы применимы к пакету.",
        blockers: ["reporting"],
        confidence: "low"
      })
    );
  }

  return base;
}

function materialRequirements(input: DocumentComplianceInput) {
  const requirements: RequiredDocument[] = [];
  for (const material of input.materials ?? []) {
    const id = `material:${material.id}`;
    addRequirement(
      requirements,
      requirement({
        id: `${id}:certificate`,
        title: `Паспорт/сертификат материала: ${material.name}`,
        category: "material_certificate",
        sourceArea: "Materials",
        requiredFor: ["procurement", "ks", "closeout"],
        priority: material.requiredQty > material.deliveredQty ? "high" : "medium",
        ownerRole: "procurement",
        linkedWorkPackageIds: [],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Потребность: ${material.requiredQty} ${material.unit}`, `Поставщик: ${material.supplier || "не выбран"}`],
        suggestedAction: "Запросить паспорт/сертификат качества у поставщика.",
        blockers: material.requiredQty > material.deliveredQty ? ["procurement", "ks"] : [],
        confidence: "high"
      })
    );
    addRequirement(
      requirements,
      requirement({
        id: `${id}:incoming-inspection`,
        title: `Входной контроль материала: ${material.name}`,
        category: "quality",
        sourceArea: "Materials",
        requiredFor: ["procurement", "closeout"],
        priority: material.status === "delivered" || material.deliveredQty > 0 ? "high" : "medium",
        ownerRole: "site_engineer",
        linkedWorkPackageIds: [],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Доставлено: ${material.deliveredQty} ${material.unit}`],
        suggestedAction: "Зафиксировать входной контроль после поставки материала.",
        blockers: material.deliveredQty > 0 ? ["quality"] : [],
        confidence: "medium"
      })
    );
  }

  for (const request of input.procurementRequests ?? []) {
    if (["closed", "rejected"].includes(request.status)) continue;
    addRequirement(
      requirements,
      requirement({
        id: `procurement:${request.id}:delivery-docs`,
        title: `Заявка/накладная по материалам: ${request.title}`,
        category: "procurement",
        sourceArea: "Procurement",
        requiredFor: ["procurement", "executive_report"],
        priority: request.priority === "critical" ? "urgent" : request.priority === "high" ? "high" : "medium",
        ownerRole: "procurement",
        linkedWorkPackageIds: [],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Статус заявки: ${request.status}`, `Позиции: ${request.items.length}`],
        suggestedAction: "Проверить подтверждение заказа, накладные и документы поставки.",
        blockers: request.status !== "closed" ? ["procurement"] : [],
        confidence: "medium"
      })
    );
  }

  return requirements;
}

function projectLevelRequirements(input: DocumentComplianceInput) {
  const items: RequiredDocument[] = [
    requirement({
      id: "project:contract",
      title: "Договор и приложения",
      category: "design",
      sourceArea: "Project",
      requiredFor: ["client_submission", "executive_report"],
      priority: "high",
      ownerRole: "project_manager",
      linkedWorkPackageIds: [],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: [input.project?.name ? `Проект: ${input.project.name}` : "Карточка проекта"],
      suggestedAction: "Проверить актуальность договора и приложений.",
      blockers: ["executive_report"],
      confidence: "high"
    }),
    requirement({
      id: "project:vor",
      title: "ВОР / сметная ведомость",
      category: "design",
      sourceArea: "ВОР",
      requiredFor: ["ks", "executive_report", "closeout"],
      priority: "urgent",
      ownerRole: "document_controller",
      linkedWorkPackageIds: [],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: [`Позиции ВОР: ${(input.budgetItems ?? []).length}`],
      suggestedAction: "Подтвердить управленческую ВОР/смету как базу закрытия.",
      blockers: (input.budgetItems ?? []).length ? [] : ["ks", "executive_report"],
      confidence: "high"
    }),
    requirement({
      id: "project:design-docs",
      title: "Проектная / рабочая документация",
      category: "design",
      sourceArea: "Project",
      requiredFor: ["work_package", "client_submission", "closeout"],
      priority: "high",
      ownerRole: "document_controller",
      linkedWorkPackageIds: [],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: ["Базовый операционный checklist проекта"],
      suggestedAction: "Проверить комплект РД/ПД и актуальные версии.",
      blockers: ["work_package"],
      confidence: "medium"
    }),
    requirement({
      id: "project:ks-package",
      title: "КС-2 / КС-3 package readiness",
      category: "ks",
      sourceArea: "Reports",
      requiredFor: ["ks", "client_submission", "closeout"],
      priority: "urgent",
      ownerRole: "finance",
      linkedWorkPackageIds: [],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: ["Закрытие работ требует документального пакета и подтвержденных объемов."],
      suggestedAction: "Проверить объемы, цены, исполнительную документацию и документы поставок перед КС.",
      blockers: ["ks", "closeout"],
      confidence: "high"
    }),
    requirement({
      id: "project:executive-status-report",
      title: "Исполнительный отчет для заказчика",
      category: "report",
      sourceArea: "Reports",
      requiredFor: ["executive_report", "client_submission"],
      priority: "medium",
      ownerRole: "project_manager",
      linkedWorkPackageIds: [],
      linkedRiskIds: [],
      linkedActionIds: [],
      evidence: ["Executive reporting package"],
      suggestedAction: "Собрать статус, риски, фото, график, снабжение и ограничения данных.",
      blockers: [],
      confidence: "medium"
    })
  ];

  const unknownRows = (input.importHistory ?? []).flatMap((item) => item.preview?.unknownRows ?? []);
  if (unknownRows.length) {
    items.push(
      requirement({
        id: "import:unknown-document-classification",
        title: "Классификация unknown rows для документального checklist",
        category: "unknown",
        sourceArea: "ВОР",
        requiredFor: ["executive_report", "work_package"],
        priority: unknownRows.length >= 10 ? "high" : "medium",
        ownerRole: "document_controller",
        linkedWorkPackageIds: [],
        linkedRiskIds: [],
        linkedActionIds: [],
        evidence: [`Unknown rows: ${unknownRows.length}`],
        suggestedAction: "Разобрать нераспознанные строки ВОР и уточнить применимые документы.",
        blockers: ["classification"],
        confidence: "high"
      })
    );
  }

  return items;
}

export function inferDocumentRequirementsFromProjectData(input: DocumentComplianceInput): RequiredDocument[] {
  const requirements: RequiredDocument[] = [];
  for (const item of projectLevelRequirements(input)) addRequirement(requirements, item);
  for (const pkg of workPackages(input)) {
    for (const item of docsForPackage(pkg)) addRequirement(requirements, item);
  }
  for (const item of materialRequirements(input)) addRequirement(requirements, item);
  return requirements;
}

function docHaystack(document: ProjectDocument) {
  return normalize(`${document.category} ${document.title} ${document.fileName ?? ""} ${document.comment ?? ""}`);
}

function requirementKeywords(item: RequiredDocument) {
  const words = [item.title, categoryGroupTitle(item.category), item.category, ...item.requiredFor, ...item.evidence].join(" ");
  const custom: Record<string, string[]> = {
    contract: ["договор", "contract"],
    vor: ["вор", "смет", "estimate"],
    design: ["проект", "рд", "пд", "design"],
    "ks-package": ["кс", "кс-2", "кс-3"],
    certificate: ["сертификат", "паспорт", "certificate"],
    "incoming-inspection": ["входной", "контроль"],
    "hidden-works": ["скрытых", "акт"],
    "executive-scheme": ["исполнительная", "схема"],
    photo: ["фото", "photo"],
    journal: ["журнал"],
    protocol: ["протокол", "испыт"]
  };
  const idMatches = Object.entries(custom).flatMap(([key, values]) => (item.id.includes(key) ? values : []));
  return Array.from(new Set([...normalize(words).split(" ").filter((part) => part.length > 3), ...idMatches]));
}

function checklistMatches(item: RequiredDocument, checklist: DocumentChecklistItem[]) {
  const keywords = requirementKeywords(item);
  return checklist.filter((check) => {
    const haystack = normalize(`${check.key} ${check.title} ${check.categoryHints.join(" ")}`);
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

function documentMatches(item: RequiredDocument, documents: ProjectDocument[]) {
  const keywords = requirementKeywords(item);
  return documents.filter((document) => {
    const haystack = docHaystack(document);
    return keywords.some((keyword) => haystack.includes(keyword));
  });
}

export function buildRequiredDocumentChecklist(input: DocumentComplianceInput): RequiredDocument[] {
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];
  return inferDocumentRequirementsFromProjectData(input)
    .map((item) => {
      const matchedDocs = documentMatches(item, documents);
      const matchedChecks = checklistMatches(item, checklist);
      const presentCheck = matchedChecks.find((check) => check.status === "present");
      const degradedCheck = matchedChecks.find((check) => check.status === "degraded");
      const missingCheck = matchedChecks.find((check) => check.status === "missing");
      const status: DocumentRequirementStatus = matchedDocs.length
        ? "uploaded"
        : presentCheck
          ? "verified"
          : degradedCheck
            ? "partial"
            : missingCheck
              ? "missing"
              : item.category === "unknown"
                ? "unknown"
                : "missing";
      return {
        ...item,
        status,
        matchedDocumentIds: matchedDocs.map((document) => document.id),
        evidence: Array.from(
          new Set([
            ...item.evidence,
            ...matchedDocs.map((document) => `Загружен документ: ${document.fileName ?? document.title}`),
            ...matchedChecks.map((check) => `${check.title}: ${check.status}`)
          ])
        )
      };
    })
    .sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority] || left.title.localeCompare(right.title, "ru"));
}

export function buildMissingDocumentSignals(requiredDocuments: RequiredDocument[]) {
  return requiredDocuments.filter((item) => ["missing", "needed", "partial", "unknown"].includes(item.status));
}

export function buildWorkPackageDocumentMap(input: DocumentComplianceInput, requiredDocuments = buildRequiredDocumentChecklist(input)): WorkPackageDocumentMapItem[] {
  return workPackages(input).map((pkg) => {
    const category = classifyRequiredDocumentForWorkPackage({ id: pkg.id, name: pkg.title, section: pkg.section, kind: pkg.kind });
    const docs = requiredDocuments.filter((item) => item.linkedWorkPackageIds.includes(pkg.id));
    const missing = docs.filter((item) => ["missing", "needed", "partial", "unknown"].includes(item.status));
    const blocking = missing.filter((item) => item.blockers.length || item.requiredFor.includes("ks") || item.requiredFor.includes("closeout"));
    const readiness: PackageDocumentReadiness = !docs.length ? "unknown" : blocking.length ? "blocked" : missing.length ? "partial" : "ready";
    return {
      id: pkg.id,
      title: pkg.title,
      sourceSection: pkg.section,
      category,
      readiness,
      requiredDocsCount: docs.length,
      missingDocsCount: missing.length,
      blockingDocs: blocking.map((item) => item.title),
      materialCertificateRequirements: docs.filter((item) => item.category === "material_certificate").map((item) => item.title),
      closeoutReady: readiness === "ready" ? "yes" : readiness === "partial" ? "partial" : readiness === "blocked" ? "no" : "unknown",
      evidence: [`source: ${pkg.source}`, pkg.missingQuantity ? "missing quantity" : "", pkg.missingPrice ? "missing price" : ""].filter(Boolean)
    };
  });
}

export function buildCloseoutReadiness(input: DocumentComplianceInput, requiredDocuments = buildRequiredDocumentChecklist(input), workMap = buildWorkPackageDocumentMap(input, requiredDocuments)): KsCloseoutReadiness {
  const blockingDocuments = requiredDocuments.filter(
    (item) => ["missing", "needed", "partial", "unknown"].includes(item.status) && (item.blockers.length || item.requiredFor.includes("ks") || item.requiredFor.includes("closeout"))
  );
  const missingPricesOrQuantities = (input.budgetItems ?? [])
    .filter((item) => item.qty <= 0 || (item.plannedUnitPrice <= 0 && item.forecastUnitPrice <= 0))
    .map((item) => ({ id: item.id, title: item.name, reason: item.qty <= 0 ? "missing quantity" : "missing price" }));
  const notReadyWorkPackages = workMap.filter((item) => item.closeoutReady !== "yes");
  const hasData = hasAnyInput(input);
  const readyForKs: CloseoutStatus = !hasData
    ? "unknown"
    : blockingDocuments.length || missingPricesOrQuantities.length
      ? "no"
      : notReadyWorkPackages.length
        ? "partial"
        : "yes";
  return {
    readyForKs,
    closeoutReady: readyForKs,
    blockingDocuments,
    missingPricesOrQuantities,
    notReadyWorkPackages,
    requiredReportPackage: ["ВОР/смета", "исполнительная документация", "материальные сертификаты", "фотофиксация", "risk register snapshot"],
    suggestedNextSteps: [
      blockingDocuments[0] ? `Закрыть документальный блокер: ${blockingDocuments[0].title}.` : "",
      missingPricesOrQuantities[0] ? `Уточнить объем/цену: ${missingPricesOrQuantities[0].title}.` : "",
      notReadyWorkPackages[0] ? `Проверить пакет работ: ${notReadyWorkPackages[0].title}.` : "",
      !blockingDocuments.length && !missingPricesOrQuantities.length ? "Проверить комплект перед выпуском КС/отчета." : ""
    ].filter(Boolean)
  };
}

export function buildKsReadiness(input: DocumentComplianceInput, requiredDocuments = buildRequiredDocumentChecklist(input), workMap = buildWorkPackageDocumentMap(input, requiredDocuments)) {
  return buildCloseoutReadiness(input, requiredDocuments, workMap);
}

export function buildExecutiveDocumentPackage(input: DocumentComplianceInput, requiredDocuments = buildRequiredDocumentChecklist(input), closeout = buildCloseoutReadiness(input, requiredDocuments)): ExecutiveDocumentPackage {
  const reportDocs = requiredDocuments.filter((item) => item.requiredFor.includes("executive_report") || item.requiredFor.includes("client_submission")).slice(0, 10);
  const missing = reportDocs.filter((item) => ["missing", "needed", "partial", "unknown"].includes(item.status));
  const readiness: ExecutiveDocumentPackage["readiness"] = !hasAnyInput(input) ? "no_data" : closeout.readyForKs === "no" || missing.some((item) => item.priority === "urgent") ? "blocked" : missing.length ? "partial" : "ready";
  return {
    readiness,
    items: reportDocs.map((item) => ({ title: item.title, status: item.status, reason: item.suggestedAction })),
    customerSubmissionChecklist: ["status report", "risk register snapshot", "schedule/cashflow summary", "procurement status", "missing document list", "photo evidence placeholder"],
    limitations: [
      !hasAnyInput(input) ? "Нет исходных данных для документального пакета." : "",
      missing.length ? `Не закрыто документов: ${missing.length}.` : "",
      "Это операционный checklist, не юридическая гарантия полноты комплекта."
    ].filter(Boolean)
  };
}

export function buildWeeklyDocumentCollectionPlan(requiredDocuments: RequiredDocument[], workMap: WorkPackageDocumentMapItem[]): WeeklyDocumentAction[] {
  const actions: WeeklyDocumentAction[] = buildMissingDocumentSignals(requiredDocuments)
    .slice(0, 12)
    .map((item) => ({
      id: `doc-action:${item.id}`,
      title: item.suggestedAction,
      ownerRole: item.ownerRole,
      reason: item.title,
      supports: item.requiredFor.join(", "),
      priority: item.priority,
      blocking: Boolean(item.blockers.length || item.requiredFor.includes("ks") || item.requiredFor.includes("closeout")),
      sourceDocumentId: item.id
    }));
  for (const pkg of workMap.filter((item) => item.readiness === "blocked").slice(0, 4)) {
    actions.push({
      id: `pkg-action:${pkg.id}`,
      title: `Собрать документы по пакету: ${pkg.title}`,
      ownerRole: "site_engineer",
      reason: pkg.blockingDocs.slice(0, 2).join("; ") || "Документы пакета не готовы.",
      supports: "work_package, closeout",
      priority: "high",
      blocking: true
    });
  }
  return actions.sort((left, right) => priorityRank[right.priority] - priorityRank[left.priority] || left.title.localeCompare(right.title, "ru"));
}

export function buildDocumentComplianceRisks(input: DocumentComplianceInput, requiredDocuments = buildRequiredDocumentChecklist(input), closeout = buildCloseoutReadiness(input, requiredDocuments)): DocumentComplianceRisk[] {
  const risks: DocumentComplianceRisk[] = [];
  if (!hasAnyInput(input)) {
    risks.push({
      id: "documents:no-data",
      title: "Нет данных для документального compliance-check",
      description: "Система не может оценить исполнительную документацию без ВОР, графика, материалов или checklist.",
      priority: "medium",
      sourceArea: "Project",
      ownerRole: "document_controller",
      suggestedAction: "Загрузить ВОР/смету и сформировать базовый document checklist.",
      evidence: ["no project document sources"]
    });
  }
  for (const item of requiredDocuments.filter((doc) => ["missing", "needed", "partial", "unknown"].includes(doc.status) && priorityRank[doc.priority] >= 3).slice(0, 10)) {
    risks.push({
      id: `doc-risk:${item.id}`,
      title: `Документальный блокер: ${item.title}`,
      description: item.blockers.length ? `Блокирует: ${item.blockers.join(", ")}.` : "Требует проверки перед отчетом/закрытием.",
      priority: item.priority,
      sourceArea: item.sourceArea,
      ownerRole: item.ownerRole,
      suggestedAction: item.suggestedAction,
      evidence: item.evidence.slice(0, 4)
    });
  }
  if (closeout.readyForKs === "no") {
    risks.push({
      id: "documents:ks-blocked",
      title: "КС / closeout не готов из-за документов",
      description: "Есть документальные или объемно-ценовые блокеры для закрытия работ.",
      priority: "urgent",
      sourceArea: "Reports",
      ownerRole: "finance",
      suggestedAction: "Закрыть блокеры перед формированием КС-ready пакета.",
      evidence: [...closeout.blockingDocuments.slice(0, 3).map((item) => item.title), ...closeout.missingPricesOrQuantities.slice(0, 2).map((item) => item.title)]
    });
  }
  return risks;
}

export function buildDocumentActionRegister(requiredDocuments: RequiredDocument[], workMap: WorkPackageDocumentMapItem[]) {
  return buildWeeklyDocumentCollectionPlan(requiredDocuments, workMap);
}

function buildSummary(input: DocumentComplianceInput, requiredDocuments: RequiredDocument[], closeout: KsCloseoutReadiness): DocumentComplianceSummary {
  const missing = buildMissingDocumentSignals(requiredDocuments);
  const urgentHigh = missing.filter((item) => item.priority === "urgent" || item.priority === "high").length;
  const blockingWorkClosure = missing.filter((item) => item.requiredFor.includes("work_package") || item.requiredFor.includes("closeout")).length;
  const blockingKsOrReport = missing.filter((item) => item.requiredFor.includes("ks") || item.requiredFor.includes("executive_report") || item.requiredFor.includes("client_submission")).length;
  const verifiedUploaded = requiredDocuments.filter((item) => item.status === "verified" || item.status === "uploaded").length;
  const unknownStatus = requiredDocuments.filter((item) => item.status === "unknown").length;
  const missingSources = (["ВОР", "Schedule", "Materials", "Project"] as ComplianceSourceArea[]).filter((source) => {
    if (source === "ВОР") return !(input.budgetItems ?? []).length && !(input.importHistory ?? []).some((item) => item.preview);
    if (source === "Schedule") return !(input.scheduleItems ?? []).length;
    if (source === "Materials") return !(input.materials ?? []).length;
    return !(input.documents ?? []).length && !(input.documentChecklist ?? []).length;
  });
  const readiness: DocumentComplianceReadiness = !hasAnyInput(input)
    ? "no_data"
    : !requiredDocuments.length
      ? "needs_setup"
      : urgentHigh || closeout.readyForKs === "no"
        ? "missing_critical"
        : missing.length
          ? verifiedUploaded
            ? "partial"
            : "needs_setup"
          : unknownStatus
            ? "ready_for_review"
            : "ready";
  return {
    readiness,
    totalRequired: requiredDocuments.length,
    missing: missing.length,
    urgentHigh,
    blockingWorkClosure,
    blockingKsOrReport,
    verifiedUploaded,
    unknownStatus,
    missingSources
  };
}

export function buildDocumentComplianceIntelligence(input: DocumentComplianceInput): DocumentComplianceIntelligenceModel {
  const requiredDocuments = buildRequiredDocumentChecklist(input);
  const workPackageMap = buildWorkPackageDocumentMap(input, requiredDocuments);
  const closeoutReadiness = buildCloseoutReadiness(input, requiredDocuments, workPackageMap);
  const executivePackage = buildExecutiveDocumentPackage(input, requiredDocuments, closeoutReadiness);
  const weeklyPlan = buildWeeklyDocumentCollectionPlan(requiredDocuments, workPackageMap);
  const complianceRisks = buildDocumentComplianceRisks(input, requiredDocuments, closeoutReadiness);
  const matchedIds = new Set(requiredDocuments.flatMap((item) => item.matchedDocumentIds));
  const unmatchedUploads = (input.documents ?? []).filter((document) => !matchedIds.has(document.id));
  const summary = buildSummary(input, requiredDocuments, closeoutReadiness);
  return {
    summary,
    requiredDocuments,
    missingDocuments: buildMissingDocumentSignals(requiredDocuments),
    workPackageMap,
    closeoutReadiness,
    ksReadiness: closeoutReadiness,
    executivePackage,
    weeklyPlan,
    complianceRisks,
    actionRegister: buildDocumentActionRegister(requiredDocuments, workPackageMap),
    unmatchedUploads
  };
}
