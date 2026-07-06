import type { Project, ProjectStatus } from "@/lib/types";

export type ProjectObjectType =
  | "residential"
  | "commercial"
  | "social"
  | "engineering"
  | "reconstruction"
  | "roofing_facade"
  | "interior"
  | "other";

export type ProjectVatMode = "including_vat" | "excluding_vat" | "no_vat" | "unknown";
export type ProjectTenderSource = "contract" | "tender" | "commercial_offer" | "draft" | "unknown";
export type ProjectVolumeChangeMode = "fixed_scope" | "fact_based" | "can_change" | "unknown";

export type OnboardingModuleId = "vor" | "documents" | "schedule" | "materials" | "acceptance" | "risks" | "contract" | "reports";
export type ProjectOnboardingStatus = "draft" | "ready_to_create" | "needs_required_fields" | "created_needs_setup" | "blocked";
export type ModuleSetupStatus = "selected_pending" | "not_selected" | "ready";

export type ProjectCreationDraft = {
  name?: string;
  code?: string;
  customer?: string;
  object?: string;
  objectType?: ProjectObjectType;
  address?: string;
  description?: string;
  contractAmount?: string | number;
  vatMode?: ProjectVatMode;
  vatPercent?: string | number;
  startsAt?: string;
  endsAt?: string;
  manager?: string;
  status?: ProjectStatus;
  tenderSource?: ProjectTenderSource;
  paymentNotes?: string;
  volumeChangeMode?: ProjectVolumeChangeMode;
  selectedModules?: OnboardingModuleId[];
};

export type ProjectOnboardingIssue = {
  field: keyof ProjectCreationDraft | "selectedModules";
  message: string;
};

export type OnboardingModuleSetup = {
  id: OnboardingModuleId;
  label: string;
  tab: string;
  status: ModuleSetupStatus;
  nextAction: string;
};

export type ProjectOnboardingPlan = {
  status: ProjectOnboardingStatus;
  score: number;
  issues: ProjectOnboardingIssue[];
  missingData: string[];
  modules: OnboardingModuleSetup[];
  nextActions: string[];
  recommendedFirstWorkflow: string;
  summary: string;
  commandCenterSignals: string[];
  projectIntelligenceBaseline: string[];
};

const moduleDefinitions: Record<OnboardingModuleId, Omit<OnboardingModuleSetup, "status">> = {
  vor: { id: "vor", label: "ВОР / import", tab: "Бюджет / ВОР", nextAction: "Загрузить или занести ВОР, чтобы запустить бюджет, материалы и КС." },
  documents: { id: "documents", label: "Documents / compliance", tab: "Документы", nextAction: "Собрать стартовый пакет: договор, ВОР, график, исполнительные требования." },
  schedule: { id: "schedule", label: "Schedule", tab: "График", nextAction: "Подготовить график работ или draft из ВОР." },
  materials: { id: "materials", label: "Materials / procurement", tab: "Материалы", nextAction: "Определить материалы и первые заявки снабжению." },
  acceptance: { id: "acceptance", label: "КС / acceptance billing", tab: "КС", nextAction: "Зафиксировать правила подтверждения объемов и пакет КС." },
  risks: { id: "risks", label: "Risks", tab: "Риски", nextAction: "Создать стартовый реестр рисков по срокам, деньгам и документам." },
  contract: { id: "contract", label: "Contract / tender review", tab: "Договор / Тендер", nextAction: "Проверить условия договора/тендера до запуска исполнения." },
  reports: { id: "reports", label: "Reports / executive", tab: "Рапорты", nextAction: "Настроить ритм рапортов и executive weekly report." }
};

export const defaultOnboardingModules: OnboardingModuleId[] = ["vor", "documents", "schedule", "materials", "acceptance", "risks", "contract"];

const objectTypeLabels: Record<ProjectObjectType, string> = {
  residential: "Жилое строительство",
  commercial: "Коммерческий объект",
  social: "Социальный объект",
  engineering: "Инженерные сети",
  reconstruction: "Реконструкция / капремонт",
  roofing_facade: "Кровля / фасад",
  interior: "Внутренние работы",
  other: "Другое"
};

const tenderSourceLabels: Record<ProjectTenderSource, string> = {
  contract: "договор",
  tender: "тендер",
  commercial_offer: "КП",
  draft: "устная/черновая",
  unknown: "unknown"
};

function clean(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function numberValue(value: unknown) {
  if (typeof value === "number") return value;
  if (typeof value === "string" && value.trim()) return Number(value.replace(/\s/g, "").replace(",", "."));
  return Number.NaN;
}

function validDate(value: unknown) {
  if (typeof value !== "string" || !value) return false;
  return !Number.isNaN(new Date(value).getTime());
}

function selectedModules(draft: ProjectCreationDraft) {
  const modules = draft.selectedModules?.length ? draft.selectedModules : defaultOnboardingModules;
  return Array.from(new Set(modules.filter((item): item is OnboardingModuleId => item in moduleDefinitions)));
}

export function validateProjectCreationDraft(draft: ProjectCreationDraft): ProjectOnboardingIssue[] {
  const issues: ProjectOnboardingIssue[] = [];
  if (clean(draft.name).length < 2) issues.push({ field: "name", message: "Укажите название проекта." });
  if (clean(draft.customer).length < 2) issues.push({ field: "customer", message: "Укажите заказчика." });
  if (clean(draft.object).length < 2) issues.push({ field: "object", message: "Укажите объект." });
  if (clean(draft.address).length < 2) issues.push({ field: "address", message: "Укажите адрес объекта." });
  if (clean(draft.manager).length < 2) issues.push({ field: "manager", message: "Укажите руководителя проекта." });
  const amount = numberValue(draft.contractAmount);
  if (!Number.isFinite(amount) || amount < 0) issues.push({ field: "contractAmount", message: "Договорная сумма должна быть числом не ниже 0." });
  if (!validDate(draft.startsAt)) issues.push({ field: "startsAt", message: "Укажите дату начала." });
  if (!validDate(draft.endsAt)) issues.push({ field: "endsAt", message: "Укажите плановую дату завершения." });
  if (validDate(draft.startsAt) && validDate(draft.endsAt) && new Date(String(draft.endsAt)).getTime() < new Date(String(draft.startsAt)).getTime()) {
    issues.push({ field: "endsAt", message: "Дата завершения не может быть раньше начала." });
  }
  if ((draft.vatMode === "including_vat" || draft.vatMode === "excluding_vat") && !Number.isFinite(numberValue(draft.vatPercent))) {
    issues.push({ field: "vatPercent", message: "Укажите процент НДС или выберите другой режим." });
  }
  if (!selectedModules(draft).length) issues.push({ field: "selectedModules", message: "Выберите хотя бы один стартовый модуль." });
  return issues;
}

export function buildOnboardingModuleSetup(draft: ProjectCreationDraft, created = false): OnboardingModuleSetup[] {
  const chosen = selectedModules(draft);
  return Object.values(moduleDefinitions).map((module) => ({
    ...module,
    status: chosen.includes(module.id) ? (created ? "selected_pending" : "selected_pending") : "not_selected"
  }));
}

export function buildOnboardingNextActions(draft: ProjectCreationDraft, created = false): string[] {
  const modules = selectedModules(draft);
  const actions: string[] = [];
  if (modules.includes("vor")) actions.push("Импортировать ВОР или добавить стартовые позиции бюджета.");
  if (modules.includes("contract")) actions.push("Заполнить условия договора/тендера и проверить риски до исполнения.");
  if (modules.includes("documents")) actions.push("Подготовить чеклист документов для договора, ВОР, графика и КС.");
  if (modules.includes("schedule")) actions.push("Собрать стартовый график работ или создать draft после ВОР.");
  if (modules.includes("materials")) actions.push("Выделить материалы и сформировать первую снабженческую потребность.");
  if (modules.includes("acceptance")) actions.push("Определить подход к подтверждению объемов и пакету КС.");
  if (modules.includes("risks")) actions.push("Зафиксировать стартовые риски: сроки, цена, документы, снабжение.");
  if (modules.includes("reports")) actions.push("Настроить регулярные рапорты и executive weekly report.");
  if (!created) actions.push("Проверить сводку и создать проект.");
  return actions.slice(0, 8);
}

export function buildInitialProjectReadiness(project?: Partial<Project> | null): ProjectOnboardingPlan {
  const draft: ProjectCreationDraft = {
    name: project?.name,
    customer: project?.customer,
    object: project?.object,
    address: project?.address,
    contractAmount: project?.contractAmount,
    startsAt: project?.startsAt,
    endsAt: project?.endsAt,
    manager: project?.manager,
    status: project?.status ?? "planning",
    selectedModules: defaultOnboardingModules
  };
  const plan = buildProjectOnboardingPlan(draft, Boolean(project?.id));
  return {
    ...plan,
    status: project?.id ? "created_needs_setup" : plan.status,
    summary: project?.id
      ? "Проект создан. Операционный baseline пока не закрыт: нужны ВОР, документы, график, снабжение, КС и риски."
      : plan.summary
  };
}

export function buildProjectCreationSummary(draft: ProjectCreationDraft) {
  const amount = numberValue(draft.contractAmount);
  const modules = buildOnboardingModuleSetup(draft).filter((item) => item.status !== "not_selected");
  return {
    name: clean(draft.name) || "Проект без названия",
    customer: clean(draft.customer) || "Заказчик не указан",
    object: clean(draft.object) || objectTypeLabels[draft.objectType ?? "other"],
    address: clean(draft.address) || "Адрес не указан",
    amountLabel: Number.isFinite(amount) ? `${Math.round(amount).toLocaleString("ru-RU")} ₽` : "Сумма не указана",
    vatLabel:
      draft.vatMode === "including_vat"
        ? `с НДС ${draft.vatPercent ?? 22}%`
        : draft.vatMode === "excluding_vat"
          ? `без НДС в цене, ставка ${draft.vatPercent ?? 22}%`
          : draft.vatMode === "no_vat"
            ? "без НДС"
            : "НДС не определен",
    datesLabel: `${draft.startsAt || "начало не указано"} - ${draft.endsAt || "завершение не указано"}`,
    tenderSourceLabel: tenderSourceLabels[draft.tenderSource ?? "unknown"],
    moduleLabels: modules.map((item) => item.label)
  };
}

export function buildProjectOnboardingPlan(draft: ProjectCreationDraft, created = false): ProjectOnboardingPlan {
  const issues = validateProjectCreationDraft(draft);
  const modules = buildOnboardingModuleSetup(draft, created);
  const selectedCount = modules.filter((item) => item.status !== "not_selected").length;
  const missingData = [
    !clean(draft.description) ? "краткое описание/границы работ" : "",
    draft.tenderSource === "unknown" || !draft.tenderSource ? "источник договора/тендера" : "",
    draft.vatMode === "unknown" || !draft.vatMode ? "режим НДС" : "",
    draft.volumeChangeMode === "unknown" || !draft.volumeChangeMode ? "правило изменения объемов" : "",
    !selectedCount ? "стартовые модули" : "",
    created ? "загруженный ВОР" : "",
    created ? "чеклист документов" : "",
    created ? "график работ" : "",
    created ? "материалы и заявки" : "",
    created ? "подход к КС" : ""
  ].filter(Boolean);
  const score = Math.max(0, Math.min(100, Math.round(100 - issues.length * 16 - missingData.length * (created ? 5 : 3) + selectedCount * 2)));
  const status: ProjectOnboardingStatus = issues.length ? "needs_required_fields" : created ? "created_needs_setup" : "ready_to_create";
  const firstWorkflow = selectedModules(draft).includes("vor")
    ? "Бюджет / ВОР"
    : selectedModules(draft).includes("documents")
      ? "Документы"
      : selectedModules(draft).includes("contract")
        ? "Договор / Тендер"
        : "Аналитика";

  return {
    status,
    score,
    issues,
    missingData,
    modules,
    nextActions: buildOnboardingNextActions(draft, created),
    recommendedFirstWorkflow: firstWorkflow,
    summary: issues.length
      ? "Нужно закрыть обязательные поля перед созданием проекта."
      : created
        ? "Проект создан, но требует стартовой настройки рабочих разделов."
        : "Черновик готов к созданию. После сохранения система откроет рабочий объект с onboarding baseline.",
    commandCenterSignals: [
      "ВОР/import ожидает исходные данные.",
      "Документы и compliance пока не подтверждены.",
      "График, материалы и КС требуют стартовой настройки.",
      "AI не запускается автоматически; рекомендации доступны только по клику."
    ],
    projectIntelligenceBaseline: [
      `Готовность onboarding: ${score}%.`,
      `Первый workflow: ${firstWorkflow}.`,
      missingData.length ? `Недостающие данные: ${missingData.slice(0, 4).join(", ")}.` : "Обязательные поля заполнены.",
      "Риски не считаются закрытыми без ВОР, графика, документов и снабжения."
    ]
  };
}

export function projectCreationPayloadFromDraft(draft: ProjectCreationDraft) {
  return {
    name: clean(draft.name),
    customer: clean(draft.customer),
    object: clean(draft.object) || objectTypeLabels[draft.objectType ?? "other"],
    address: clean(draft.address),
    contractAmount: numberValue(draft.contractAmount),
    vatMode: draft.vatMode === "no_vat" ? "no_vat" : "vat",
    startsAt: draft.startsAt,
    endsAt: draft.endsAt,
    manager: clean(draft.manager),
    status: draft.status ?? "planning"
  };
}
