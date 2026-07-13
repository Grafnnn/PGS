"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, ChevronLeft, ChevronRight, ClipboardList, FileSpreadsheet, FileText, Filter, Grid2X2, Landmark, List, PackageCheck, Plus, RotateCcw, Search, Sparkles, TimerReset } from "lucide-react";
import { money, percent } from "@/lib/calculations";
import {
  mergePrefillIntoProjectDraft,
  type ContractPrefillField,
  type ContractProjectPrefill
} from "@/lib/contract-project-prefill";
import {
  buildProjectCreationSummary,
  buildProjectOnboardingPlan,
  defaultOnboardingModules,
  projectCreationPayloadFromDraft,
  type OnboardingModuleId,
  type ProjectCreationDraft,
  type ProjectObjectType,
  type ProjectTenderSource,
  type ProjectVatMode,
  type ProjectVolumeChangeMode
} from "@/lib/project-onboarding-intelligence";
import { buildProjectBaselineFromTemplate, getProjectTemplateById, getProjectTemplates, type ProjectTemplateId } from "@/lib/project-templates";
import type {
  ProjectWorkbookAnalysis,
  ProjectWorkbookSheetOverride,
  ProjectWorkbookSheetOverrides,
  ProjectWorkbookSheetRole
} from "@/lib/excel/project-workbook-import";
import type { Project } from "@/lib/types";

type PendingOnboardingDocument = {
  id: string;
  file: File;
  category: string;
  source?: "contract-prefill" | "project-workbook" | "manual";
};

type ContractPrefillState =
  | { status: "idle" }
  | { status: "extracting"; fileName: string }
  | { status: "ready"; fileName: string; result: ContractProjectPrefill }
  | { status: "warning"; fileName: string; message: string }
  | { status: "failed"; fileName: string; message: string };

type ProjectWorkbookState =
  | { status: "idle" }
  | { status: "analyzing"; file: File; overrides: ProjectWorkbookSheetOverrides }
  | { status: "ready"; file: File; analysis: ProjectWorkbookAnalysis; overrides: ProjectWorkbookSheetOverrides; mappingDirty: boolean }
  | { status: "warning"; file: File; message: string; analysis?: ProjectWorkbookAnalysis }
  | { status: "failed"; file: File; message: string };

const workbookSheetRoleOptions: Array<{ value: ProjectWorkbookSheetRole; label: string }> = [
  { value: "works", label: "ВОР / работы" },
  { value: "materials", label: "Материалы" },
  { value: "schedule", label: "График" },
  { value: "payroll", label: "ФОТ" },
  { value: "equipment", label: "Техника" },
  { value: "summary", label: "Свод / ССР" },
  { value: "reference", label: "Справочник" },
  { value: "control", label: "Контроль" },
  { value: "unknown", label: "Не определено" }
];

const workbookSheetRoleLabels = Object.fromEntries(workbookSheetRoleOptions.map((option) => [option.value, option.label])) as Record<ProjectWorkbookSheetRole, string>;

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const statusLabels: Record<Project["status"], string> = {
  active: "В работе",
  archived: "Архив",
  completed: "Завершен",
  draft: "Черновик",
  paused: "Пауза",
  planning: "Планирование"
};

const objectTypeOptions: Array<{ value: ProjectObjectType; label: string }> = [
  { value: "residential", label: "Жилое строительство" },
  { value: "commercial", label: "Коммерческий объект" },
  { value: "social", label: "Социальный объект" },
  { value: "engineering", label: "Инженерные сети" },
  { value: "reconstruction", label: "Реконструкция / капремонт" },
  { value: "roofing_facade", label: "Кровля / фасад" },
  { value: "interior", label: "Внутренние работы" },
  { value: "other", label: "Другое" }
];

const tenderSourceOptions: Array<{ value: ProjectTenderSource; label: string }> = [
  { value: "contract", label: "Договор" },
  { value: "tender", label: "Тендер" },
  { value: "commercial_offer", label: "КП" },
  { value: "draft", label: "Устная / черновая" },
  { value: "unknown", label: "Неизвестно" }
];

const vatModeOptions: Array<{ value: ProjectVatMode; label: string }> = [
  { value: "including_vat", label: "С НДС в сумме" },
  { value: "excluding_vat", label: "Без НДС в сумме" },
  { value: "no_vat", label: "Без НДС" },
  { value: "unknown", label: "Неизвестно" }
];

const volumeModeOptions: Array<{ value: ProjectVolumeChangeMode; label: string }> = [
  { value: "fixed_scope", label: "Фиксированный объем" },
  { value: "fact_based", label: "По фактическим объемам" },
  { value: "can_change", label: "Может меняться вверх/вниз" },
  { value: "unknown", label: "Неизвестно" }
];

const moduleOptions: Array<{ id: OnboardingModuleId; label: string; detail: string; icon: React.ReactNode }> = [
  { id: "vor", label: "ВОР / import", detail: "Бюджет, материалы, КС и план-факт", icon: <Landmark size={17} /> },
  { id: "documents", label: "Документы", detail: "Compliance, договор, исполнительный пакет", icon: <FileText size={17} /> },
  { id: "schedule", label: "График", detail: "Работы, сроки, зависимости", icon: <TimerReset size={17} /> },
  { id: "materials", label: "Материалы", detail: "Потребность, закупки, поставки", icon: <PackageCheck size={17} /> },
  { id: "acceptance", label: "КС", detail: "Закрытие объемов и пакет заказчику", icon: <ClipboardList size={17} /> },
  { id: "risks", label: "Риски", detail: "Сроки, деньги, документы, снабжение", icon: <AlertTriangle size={17} /> },
  { id: "contract", label: "Договор / Тендер", detail: "Условия, платежи, scope, risk review", icon: <Search size={17} /> },
  { id: "reports", label: "Рапорты / executive", detail: "Ритм отчетности и weekly report", icon: <Sparkles size={17} /> }
];

const wizardSteps = ["Проект", "Договор", "Контур", "Чеклист", "Создание"];
const projectTemplates = getProjectTemplates();
const documentCategoryOptions = [
  { value: "договор", label: "Договор" },
  { value: "тз", label: "ТЗ" },
  { value: "вор", label: "ВОР / смета" },
  { value: "график", label: "График" },
  { value: "исполнительная", label: "Исполнительная" },
  { value: "кс", label: "КС" },
  { value: "прочее", label: "Прочее" }
];

const contractSuggestionFields: Array<{
  field: ContractPrefillField;
  label: string;
  draftKey?: keyof ProjectCreationDraft;
  value: (result: ContractProjectPrefill) => string | number | undefined;
}> = [
  { field: "projectName", label: "Название / объект", draftKey: "name", value: (result) => result.projectName },
  { field: "customerName", label: "Заказчик", draftKey: "customer", value: (result) => result.customerName },
  { field: "contractorName", label: "Подрядчик", value: (result) => result.contractorName },
  { field: "objectAddress", label: "Адрес объекта", draftKey: "address", value: (result) => result.objectAddress },
  { field: "objectType", label: "Тип объекта", draftKey: "objectType", value: (result) => result.objectType },
  { field: "scopeSummary", label: "Scope summary", draftKey: "description", value: (result) => result.scopeSummary },
  { field: "contractAmount", label: "Сумма договора", draftKey: "contractAmount", value: (result) => result.contractAmount },
  { field: "vatMode", label: "Режим НДС", draftKey: "vatMode", value: (result) => result.vatMode },
  { field: "vatPercent", label: "НДС, %", draftKey: "vatPercent", value: (result) => result.vatPercent },
  { field: "startDate", label: "Начало", draftKey: "startsAt", value: (result) => result.startDate },
  { field: "finishDate", label: "Завершение", draftKey: "endsAt", value: (result) => result.finishDate },
  { field: "paymentTerms", label: "Условия оплаты", draftKey: "paymentNotes", value: (result) => result.paymentTerms },
  { field: "advanceTerms", label: "Аванс", draftKey: "paymentNotes", value: (result) => result.advanceTerms },
  { field: "acceptanceTerms", label: "КС / приемка", draftKey: "paymentNotes", value: (result) => result.acceptanceTerms },
  { field: "contractSource", label: "Источник", draftKey: "tenderSource", value: (result) => result.contractSource },
  { field: "volumeChangeMode", label: "Изменение объемов", draftKey: "volumeChangeMode", value: (result) => result.volumeChangeMode },
  { field: "penalties", label: "Штрафы / пени", value: (result) => result.penalties },
  { field: "retention", label: "Удержания", value: (result) => result.retention }
];

function makeInitialDraft(): ProjectCreationDraft {
  const today = new Date().toISOString().slice(0, 10);
  const finish = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  return {
    name: "",
    code: "",
    customer: "",
    object: "",
    objectType: "commercial",
    templateId: "general_construction",
    address: "",
    description: "",
    contractAmount: "",
    vatMode: "including_vat",
    vatPercent: "22",
    startsAt: today,
    endsAt: finish,
    manager: "",
    status: "planning",
    tenderSource: "unknown",
    paymentNotes: "",
    volumeChangeMode: "unknown",
    selectedModules: defaultOnboardingModules
  };
}

export function ProjectsIndex({ projects }: { projects: Project[] }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Project["status"]>("all");
  const [sort, setSort] = useState<"amount" | "finish" | "name">("amount");
  const [view, setView] = useState<"cards" | "table">("cards");
  const managers = Array.from(new Set(projects.map((project) => project.manager)));

  const filteredProjects = projects
    .filter((project) => {
      const haystack = `${project.name} ${project.customer} ${project.object} ${project.address} ${project.manager}`.toLocaleLowerCase("ru-RU");
      return (!query || haystack.includes(query.toLocaleLowerCase("ru-RU"))) && (status === "all" || project.status === status);
    })
    .sort((left, right) => {
      if (sort === "amount") return right.contractAmount - left.contractAmount;
      if (sort === "finish") return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
      return left.name.localeCompare(right.name, "ru-RU");
    });

  return (
    <div className="stack">
      <ProjectCreationWizard />

      <section className="panel stack">
        <div className="toolbar project-filterbar">
          <label className="search-label">
            Поиск
            <span className="search-field">
              <Search size={17} />
              <input value={query} placeholder="Название, заказчик, адрес" onChange={(event) => setQuery(event.target.value)} />
            </span>
          </label>
          <label>
            Статус
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | Project["status"])}>
              <option value="all">Все статусы</option>
              <option value="active">В работе</option>
              <option value="planning">Планирование</option>
              <option value="paused">Приостановлен</option>
              <option value="completed">Завершен</option>
            </select>
          </label>
          <label>
            Сортировка
            <select value={sort} onChange={(event) => setSort(event.target.value as "amount" | "finish" | "name")}>
              <option value="amount">По сумме договора</option>
              <option value="finish">По сроку завершения</option>
              <option value="name">По названию</option>
            </select>
          </label>
          <div className="density-toggle view-toggle" aria-label="Вид списка проектов">
            <button className={view === "cards" ? "active" : ""} type="button" onClick={() => setView("cards")}>
              <Grid2X2 size={15} />
              Карточки
            </button>
            <button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")}>
              <List size={15} />
              Таблица
            </button>
          </div>
        </div>

        {filteredProjects.length ? (
          view === "cards" ? (
            <div className="project-card-grid">
              {filteredProjects.map((project, index) => (
                <ProjectCard key={project.id} managerCount={managers.length} project={project} riskCount={index + 2} />
              ))}
            </div>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Название</th>
                    <th>Объект</th>
                    <th>Заказчик</th>
                    <th className="numeric">Договорная сумма</th>
                    <th>Руководитель</th>
                    <th>Контроль</th>
                    <th>Статус</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredProjects.map((project) => (
                    <tr key={project.id}>
                      <td data-label="Название">
                        <Link href={`/projects/${project.id}`}>
                          <strong>{project.name}</strong>
                        </Link>
                        <div className="muted">{project.address}</div>
                      </td>
                      <td data-label="Объект">{project.object}</td>
                      <td data-label="Заказчик">{project.customer}</td>
                      <td className="numeric" data-label="Договорная сумма">{compactMoney(project.contractAmount)}</td>
                      <td data-label="Руководитель">{project.manager}</td>
                      <td data-label="Контроль">
                        <span className="badge yellow">
                          <AlertTriangle size={13} />
                          План-факт
                        </span>
                      </td>
                      <td data-label="Статус">
                        <span className="badge green">{statusLabels[project.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="empty-state">Проекты не найдены. Измените фильтры или создайте новый объект.</div>
        )}
      </section>
    </div>
  );
}

export function ProjectCreationWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState<ProjectCreationDraft>(() => makeInitialDraft());
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const [createdProjectPath, setCreatedProjectPath] = useState("");
  const [pendingDocuments, setPendingDocuments] = useState<PendingOnboardingDocument[]>([]);
  const [contractPrefill, setContractPrefill] = useState<ContractPrefillState>({ status: "idle" });
  const [projectWorkbook, setProjectWorkbook] = useState<ProjectWorkbookState>({ status: "idle" });
  const [manualFields, setManualFields] = useState<Set<keyof ProjectCreationDraft>>(() => new Set());
  const plan = buildProjectOnboardingPlan(draft);
  const summary = buildProjectCreationSummary(draft);
  const selectedTemplate = getProjectTemplateById(draft.templateId);
  const templateBaseline = buildProjectBaselineFromTemplate(draft.templateId);
  const currentStepIssues = plan.issues.filter((issue) => {
    if (step === 0) return ["name", "customer", "object", "address", "manager"].includes(String(issue.field));
    if (step === 1) return ["contractAmount", "startsAt", "endsAt", "vatPercent"].includes(String(issue.field));
    if (step === 2) return issue.field === "selectedModules";
    return true;
  });
  const canMoveNext = step < 4 && currentStepIssues.length === 0;

  const updateDraft = <K extends keyof ProjectCreationDraft>(key: K, value: ProjectCreationDraft[K]) => {
    setManualFields((current) => new Set(current).add(key));
    setDraft((current) => ({ ...current, [key]: value }));
  };
  const applyDraftPatch = (patch: ProjectCreationDraft) => {
    setDraft(patch);
  };
  const toggleModule = (moduleId: OnboardingModuleId) => {
    setDraft((current) => {
      const selected = new Set(current.selectedModules ?? defaultOnboardingModules);
      if (selected.has(moduleId)) selected.delete(moduleId);
      else selected.add(moduleId);
      return { ...current, selectedModules: Array.from(selected) };
    });
  };
  const selectTemplate = (templateId: ProjectTemplateId) => {
    const template = getProjectTemplateById(templateId);
    const nextObjectType: ProjectObjectType =
      templateId === "engineering_networks"
        ? "engineering"
        : templateId === "fit_out"
          ? "interior"
          : templateId === "roofing" || templateId === "facade"
            ? "roofing_facade"
            : templateId === "tender"
              ? "commercial"
              : templateId === "empty"
                ? "other"
                : "commercial";
    setDraft((current) => ({
      ...current,
      templateId,
      objectType: current.objectType === "other" || !current.objectType ? nextObjectType : nextObjectType,
      selectedModules: [...template.modules]
    }));
  };
  const reset = () => {
    setDraft(makeInitialDraft());
    setStep(0);
    setCreateError("");
    setCreatedProjectPath("");
    setPendingDocuments([]);
    setContractPrefill({ status: "idle" });
    setProjectWorkbook({ status: "idle" });
    setManualFields(new Set());
  };
  const addPendingDocuments = (files: FileList | null) => {
    if (!files?.length) return;
    setPendingDocuments((current) => [
      ...current,
      ...Array.from(files).map((file) => ({
        id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
        file,
        category: "прочее",
        source: "manual" as const
      }))
    ]);
  };
  const setContractAsPendingDocument = (file: File) => {
    setPendingDocuments((current) => [
      ...current.filter((item) => item.source !== "contract-prefill"),
      {
        id: `contract-${file.name}-${file.size}-${file.lastModified}`,
        file,
        category: "договор",
        source: "contract-prefill"
      }
    ]);
  };
  const setWorkbookAsPendingDocument = (file: File) => {
    setPendingDocuments((current) => [
      ...current.filter((item) => item.source !== "project-workbook"),
      {
        id: `project-workbook-${file.name}-${file.size}-${file.lastModified}`,
        file,
        category: "вор",
        source: "project-workbook"
      }
    ]);
  };
  const updatePendingDocumentCategory = (id: string, category: string) => {
    setPendingDocuments((current) => current.map((item) => (item.id === id ? { ...item, category } : item)));
  };
  const removePendingDocument = (id: string) => {
    setPendingDocuments((current) => current.filter((item) => item.id !== id));
  };
  const uploadPendingDocuments = async (projectId: string) => {
    for (const document of pendingDocuments) {
      const formData = new FormData();
      formData.append("file", document.file);
      formData.append("category", document.category);
      const response = await fetch(`/api/projects/${projectId}/documents/upload`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json().catch(() => ({}))) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? `Не удалось загрузить документ "${document.file.name}".`);
    }
  };
  const handleContractPrefillFile = async (file: File | undefined) => {
    if (!file) return;
    setContractAsPendingDocument(file);
    setContractPrefill({ status: "extracting", fileName: file.name });
    const formData = new FormData();
    formData.append("file", file);
    try {
      const response = await fetch("/api/projects/onboarding/contract-prefill", {
        method: "POST",
        body: formData
      });
      const data = (await response.json().catch(() => ({}))) as { result?: ContractProjectPrefill; error?: string };
      if (!response.ok || !data.result) {
        setContractPrefill({
          status: "warning",
          fileName: file.name,
          message: data.error ?? "Не удалось извлечь данные, заполните вручную. Файл останется стартовым документом."
        });
        return;
      }
      setContractPrefill({ status: "ready", fileName: file.name, result: data.result });
    } catch (error) {
      setContractPrefill({
        status: "failed",
        fileName: file.name,
        message: error instanceof Error ? error.message : "Не удалось извлечь данные, заполните вручную."
      });
    }
  };
  const analyzeProjectWorkbook = async (
    file: File,
    overrides: ProjectWorkbookSheetOverrides,
    options: { applySuggestions: boolean }
  ) => {
    setProjectWorkbook({ status: "analyzing", file, overrides });
    const formData = new FormData();
    formData.append("file", file);
    formData.append("startsAt", String(draft.startsAt ?? ""));
    formData.append("sheetOverrides", JSON.stringify(overrides));
    try {
      const response = await fetch("/api/projects/onboarding/workbook-analyze", { method: "POST", body: formData });
      const data = (await response.json().catch(() => ({}))) as { analysis?: ProjectWorkbookAnalysis; error?: string };
      if (!response.ok || !data.analysis) {
        setProjectWorkbook({ status: "warning", file, analysis: data.analysis, message: data.error ?? "Файл сохранится как документ, но автоматическое распределение недоступно." });
        return;
      }
      const analysis = data.analysis;
      setProjectWorkbook({ status: "ready", file, analysis, overrides, mappingDirty: false });
      if (options.applySuggestions) {
        setDraft((current) => {
          const next = { ...current };
          if (analysis.suggestions.contractAmount && !manualFields.has("contractAmount")) next.contractAmount = String(Math.round(analysis.suggestions.contractAmount));
          if (analysis.suggestions.vatPercent && !manualFields.has("vatPercent")) next.vatPercent = String(analysis.suggestions.vatPercent);
          if (analysis.suggestions.durationMonths && current.startsAt && !manualFields.has("endsAt")) {
            const finish = new Date(`${current.startsAt}T00:00:00Z`);
            finish.setUTCMonth(finish.getUTCMonth() + analysis.suggestions.durationMonths);
            next.endsAt = finish.toISOString().slice(0, 10);
          }
          next.selectedModules = Array.from(new Set([...(current.selectedModules ?? []), ...analysis.suggestions.selectedModules]));
          return next;
        });
      }
    } catch (error) {
      setProjectWorkbook({ status: "failed", file, message: error instanceof Error ? error.message : "Не удалось проанализировать Excel." });
    }
  };
  const handleProjectWorkbookFile = async (file: File | undefined) => {
    if (!file) return;
    setWorkbookAsPendingDocument(file);
    await analyzeProjectWorkbook(file, {}, { applySuggestions: true });
  };
  const updateWorkbookSheetOverride = (sheetName: string, patch: ProjectWorkbookSheetOverride) => {
    setProjectWorkbook((current) => {
      if (current.status !== "ready") return current;
      const sheet = current.analysis.sheets.find((item) => item.sheetName === sheetName);
      if (!sheet) return current;
      const previous = current.overrides[sheetName] ?? {};
      const nextOverride = { ...previous, ...patch };
      const nextOverrides = { ...current.overrides };
      if ((nextOverride.role ?? sheet.detectedRole) === sheet.detectedRole && (nextOverride.enabled ?? true)) delete nextOverrides[sheetName];
      else nextOverrides[sheetName] = nextOverride;
      return { ...current, overrides: nextOverrides, mappingDirty: true };
    });
  };
  const resetWorkbookSheetOverride = (sheetName: string) => {
    setProjectWorkbook((current) => {
      if (current.status !== "ready") return current;
      const nextOverrides = { ...current.overrides };
      delete nextOverrides[sheetName];
      return { ...current, overrides: nextOverrides, mappingDirty: true };
    });
  };
  const applyWorkbookMapping = async () => {
    if (projectWorkbook.status !== "ready") return;
    await analyzeProjectWorkbook(projectWorkbook.file, projectWorkbook.overrides, { applySuggestions: false });
  };
  const applyContractSuggestion = (result: ContractProjectPrefill, field: ContractPrefillField) => {
    const next = mergePrefillIntoProjectDraft(draft, result, { overwrite: true, fields: [field] });
    applyDraftPatch(next);
  };
  const applySafeContractSuggestions = (result: ContractProjectPrefill) => {
    const safeFields = contractSuggestionFields
      .filter((item) => item.draftKey && !manualFields.has(item.draftKey))
      .map((item) => item.field);
    applyDraftPatch(mergePrefillIntoProjectDraft(draft, result, { fields: safeFields }));
  };
  const commitProjectWorkbook = async (projectId: string, workbook: Extract<ProjectWorkbookState, { status: "ready" }>) => {
    const formData = new FormData();
    formData.append("file", workbook.file);
    formData.append("sheetOverrides", JSON.stringify(workbook.overrides));
    const previewResponse = await fetch(`/api/projects/${projectId}/imports/budget/preview`, { method: "POST", body: formData });
    const preview = (await previewResponse.json().catch(() => ({}))) as { importBatchId?: string; error?: string; errors?: string[] };
    if (!previewResponse.ok || !preview.importBatchId) {
      throw new Error(preview.error ?? preview.errors?.[0] ?? "Не удалось подготовить распределение Excel по модулям.");
    }
    const commitResponse = await fetch(`/api/projects/${projectId}/imports/budget/commit`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importBatchId: preview.importBatchId, mode: "append", replaceConfirmed: false })
    });
    const commit = (await commitResponse.json().catch(() => ({}))) as { error?: string };
    if (!commitResponse.ok) throw new Error(commit.error ?? "Не удалось заполнить модули данными Excel.");
  };
  const submit = async () => {
    const issues = buildProjectOnboardingPlan(draft).issues;
    if (issues.length) {
      setCreateError(issues[0]?.message ?? "Проверьте обязательные поля.");
      setStep(0);
      return;
    }
    if (projectWorkbook.status === "ready" && projectWorkbook.mappingDirty) {
      setCreateError("Карта Excel изменена. Пересчитайте распределение листов перед созданием проекта.");
      setStep(3);
      return;
    }
    if (creating) return;
    setCreating(true);
    setCreateError("");
    setCreatedProjectPath("");
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(projectCreationPayloadFromDraft(draft))
      });
      const data = (await response.json()) as { project?: Project; error?: string | { message?: string }; issues?: Array<{ message?: string }> };
      if (!response.ok || !data.project) {
        const message = typeof data.error === "string" ? data.error : data.error?.message ?? data.issues?.[0]?.message;
        throw new Error(message ?? "Не удалось создать проект.");
      }
      const setupErrors: string[] = [];
      if (projectWorkbook.status === "ready") {
        try {
          await commitProjectWorkbook(data.project.id, projectWorkbook);
        } catch (importError) {
          setupErrors.push(importError instanceof Error ? `Excel не распределился по модулям: ${importError.message}` : "Excel не распределился по модулям.");
        }
      }
      if (pendingDocuments.length) {
        try {
          await uploadPendingDocuments(data.project.id);
        } catch (uploadError) {
          setupErrors.push(uploadError instanceof Error ? `Стартовые документы не загрузились: ${uploadError.message}` : "Стартовые документы не загрузились.");
        }
      }
      if (setupErrors.length) {
        setCreatedProjectPath(`/projects/${data.project.id}?created=1`);
        setCreateError(`Проект создан. ${setupErrors.join(" ")}`);
        router.refresh();
        return;
      }
      router.push(`/projects/${data.project.id}?created=1`);
      router.refresh();
    } catch (error) {
      setCreateError(error instanceof Error ? error.message : "Ошибка создания проекта.");
    } finally {
      setCreating(false);
    }
  };

  return (
    <section className="panel stack create-project-panel project-onboarding-wizard" id="create-project">
      <div className="toolbar">
        <div>
          <div className="eyebrow">Project Creation & Onboarding</div>
          <h2>Создать проект и запустить baseline</h2>
          <p className="muted">Загрузите единый Excel проекта: система разберет листы, покажет план распределения и после создания заполнит ВОР, материалы, график, ФОТ и технику.</p>
        </div>
        <div className={`onboarding-score tone-${plan.status === "ready_to_create" ? "good" : "warn"}`}>
          <strong>{plan.score}%</strong>
          <span>{plan.status === "ready_to_create" ? "готов к созданию" : "нужно заполнить"}</span>
        </div>
      </div>

      <div className="wizard-steps onboarding-steps" aria-label="Шаги создания проекта">
        {wizardSteps.map((label, index) => (
          <button className={`wizard-step ${index <= step ? "done" : ""}`} key={label} type="button" onClick={() => setStep(index)}>
            <strong>{index + 1}</strong>
            {label}
          </button>
        ))}
      </div>

      <div className="onboarding-wizard-layout">
        <form className="project-create-grid onboarding-form" onSubmit={(event) => event.preventDefault()}>
          {step === 0 && (
            <>
              <div className="wide-field">
                <div className="field-heading">
                  <strong>Шаблон проекта</strong>
                  <span>Определяет baseline, но не создает фактические документы/работы без данных.</span>
                </div>
                <div className="template-selector-grid" aria-label="Project templates">
                  {projectTemplates.map((template) => (
                    <button
                      className={`template-card ${draft.templateId === template.id ? "active" : ""}`}
                      key={template.id}
                      type="button"
                      onClick={() => selectTemplate(template.id)}
                    >
                      <strong>{template.shortTitle}</strong>
                      <span>{template.description}</span>
                      <small>{template.modules.length ? `${template.modules.length} модулей baseline` : "ручная настройка"}</small>
                    </button>
                  ))}
                </div>
              </div>
              <ContractPrefillCard
                state={contractPrefill}
                draft={draft}
                onFile={handleContractPrefillFile}
                onApplyAll={applySafeContractSuggestions}
                onApplyField={applyContractSuggestion}
                onClear={() => {
                  setContractPrefill({ status: "idle" });
                  setPendingDocuments((current) => current.filter((item) => item.source !== "contract-prefill"));
                }}
              />
              <ProjectWorkbookCard
                state={projectWorkbook}
                onFile={handleProjectWorkbookFile}
                onClear={() => {
                  setProjectWorkbook({ status: "idle" });
                  setPendingDocuments((current) => current.filter((item) => item.source !== "project-workbook"));
                }}
              />
              <label>
                Название проекта *
                <input value={draft.name ?? ""} onChange={(event) => updateDraft("name", event.target.value)} placeholder="Например: Административное здание" />
              </label>
              <label>
                Код / slug
                <input value={draft.code ?? ""} onChange={(event) => updateDraft("code", event.target.value)} placeholder="PGS-2026-01" />
              </label>
              <label>
                Заказчик *
                <input value={draft.customer ?? ""} onChange={(event) => updateDraft("customer", event.target.value)} placeholder="Название заказчика" />
              </label>
              <label>
                Тип объекта
                <select value={draft.objectType} onChange={(event) => updateDraft("objectType", event.target.value as ProjectObjectType)}>
                  {objectTypeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Объект *
                <input value={draft.object ?? ""} onChange={(event) => updateDraft("object", event.target.value)} placeholder="Корпус, площадка, этап" />
              </label>
              <label>
                Адрес *
                <input value={draft.address ?? ""} onChange={(event) => updateDraft("address", event.target.value)} placeholder="Адрес или локация" />
              </label>
              <label>
                Руководитель проекта *
                <input value={draft.manager ?? ""} onChange={(event) => updateDraft("manager", event.target.value)} placeholder="ФИО / роль" />
              </label>
              <label>
                Статус
                <select value={draft.status} onChange={(event) => updateDraft("status", event.target.value as Project["status"])}>
                  <option value="planning">Планирование</option>
                  <option value="draft">Черновик</option>
                  <option value="active">В работе</option>
                </select>
              </label>
              <label className="wide-field">
                Описание / scope summary
                <textarea value={draft.description ?? ""} onChange={(event) => updateDraft("description", event.target.value)} placeholder="Кратко: что строим, границы работ, особенности запуска" rows={3} />
              </label>
            </>
          )}

          {step === 1 && (
            <>
              {contractPrefill.status === "ready" && (
                <ContractPrefillSummary
                  result={contractPrefill.result}
                  onApplyAll={applySafeContractSuggestions}
                  onApplyField={applyContractSuggestion}
                />
              )}
              <label>
                Договорная сумма *
                <input inputMode="decimal" value={draft.contractAmount ?? ""} onChange={(event) => updateDraft("contractAmount", event.target.value)} placeholder="10000000" />
              </label>
              <label>
                Режим НДС
                <select value={draft.vatMode} onChange={(event) => updateDraft("vatMode", event.target.value as ProjectVatMode)}>
                  {vatModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                НДС, %
                <input inputMode="decimal" value={draft.vatPercent ?? ""} onChange={(event) => updateDraft("vatPercent", event.target.value)} />
              </label>
              <label>
                Источник
                <select value={draft.tenderSource} onChange={(event) => updateDraft("tenderSource", event.target.value as ProjectTenderSource)}>
                  {tenderSourceOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label>
                Начало *
                <input type="date" value={draft.startsAt ?? ""} onChange={(event) => updateDraft("startsAt", event.target.value)} />
              </label>
              <label>
                Плановое завершение *
                <input type="date" value={draft.endsAt ?? ""} onChange={(event) => updateDraft("endsAt", event.target.value)} />
              </label>
              <label>
                Изменение объемов
                <select value={draft.volumeChangeMode} onChange={(event) => updateDraft("volumeChangeMode", event.target.value as ProjectVolumeChangeMode)}>
                  {volumeModeOptions.map((option) => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </label>
              <label className="wide-field">
                Примечания по оплате
                <textarea value={draft.paymentNotes ?? ""} onChange={(event) => updateDraft("paymentNotes", event.target.value)} placeholder="Аванс, этапы оплаты, удержания. Только как onboarding-note, без юридической генерации." rows={3} />
              </label>
            </>
          )}

          {step === 2 && (
            <div className="module-setup-grid">
              {moduleOptions.map((option) => {
                const active = (draft.selectedModules ?? defaultOnboardingModules).includes(option.id);
                return (
                  <button className={`module-setup-card ${active ? "active" : ""}`} key={option.id} type="button" onClick={() => toggleModule(option.id)}>
                    <span>{option.icon}</span>
                    <strong>{option.label}</strong>
                    <small>{option.detail}</small>
                  </button>
                );
              })}
            </div>
          )}

          {step === 3 && (
            <div className="template-baseline-preview">
              {projectWorkbook.status === "ready" && (
                <ProjectWorkbookDistribution
                  state={projectWorkbook}
                  onApplyMapping={applyWorkbookMapping}
                  onOverride={updateWorkbookSheetOverride}
                  onResetOverride={resetWorkbookSheetOverride}
                />
              )}
              <div className="baseline-preview-head">
                <div>
                  <div className="eyebrow">Template baseline</div>
                  <h3>{templateBaseline.templateTitle}</h3>
                  <p>{selectedTemplate.description} Файлы можно приложить на финальном шаге перед созданием проекта.</p>
                </div>
                <span className="badge blue">{templateBaseline.readiness}</span>
              </div>
              <div className="baseline-preview-grid">
                <BaselinePreviewList title="Документы" items={templateBaseline.documentBaseline} empty="Документы задаются вручную." />
                <BaselinePreviewList title="Снабжение" items={templateBaseline.procurementBaseline} empty="Категории снабжения не выбраны." />
                <BaselinePreviewList title="График" items={templateBaseline.scheduleBaseline} empty="Этапы графика не заданы." />
                <BaselinePreviewList title="Риски" items={templateBaseline.riskBaseline} empty="Риски появятся после данных проекта." />
                <BaselinePreviewList title="КС" items={templateBaseline.acceptanceBaseline} empty="КС-настройка ручная." />
                <BaselinePreviewList title="Договор / тендер" items={templateBaseline.contractTenderBaseline} empty="Проверки договора не выбраны." />
              </div>
              <div className="onboarding-checklist">
                {plan.nextActions.map((action, index) => (
                  <div className="onboarding-checklist-item" key={action}>
                    <span>{index + 1}</span>
                    <p>{action}</p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="project-create-review">
              <div>
                <small>Проект</small>
                <strong>{summary.name}</strong>
                <span>{summary.customer} · {summary.object}</span>
              </div>
              <div>
                <small>Адрес и сроки</small>
                <strong>{summary.address}</strong>
                <span>{summary.datesLabel}</span>
              </div>
              <div>
                <small>Договор</small>
                <strong>{summary.amountLabel}</strong>
                <span>{summary.vatLabel} · источник: {summary.tenderSourceLabel}</span>
              </div>
              <div>
                <small>Шаблон baseline</small>
                <strong>{summary.templateLabel}</strong>
                <span>{summary.templateDescription}</span>
              </div>
              <div>
                <small>Первый workflow</small>
                <strong>{plan.recommendedFirstWorkflow}</strong>
                <span>{summary.moduleLabels.join(", ")}</span>
              </div>
              {projectWorkbook.status === "ready" && (
                <div className="project-workbook-review">
                  <small>Автозаполнение из Excel</small>
                  <strong>{projectWorkbook.file.name}</strong>
                  <span>
                    {projectWorkbook.analysis.summary.budgetItems} строк бюджета · {projectWorkbook.analysis.summary.materials} материалов · {projectWorkbook.analysis.summary.scheduleItems} задач · {projectWorkbook.analysis.summary.payrollItems} строк ФОТ
                  </span>
                  <span>
                    {projectWorkbook.analysis.summary.overriddenSheets} ручных решений · {projectWorkbook.analysis.summary.excludedSheets} листов исключено
                  </span>
                </div>
              )}
              <div className="pending-documents-panel">
                <small>Стартовые документы</small>
                <strong>{pendingDocuments.length ? `${pendingDocuments.length} файл(ов) к загрузке` : "Можно приложить сейчас"}</strong>
                <span>После создания проекта файлы автоматически попадут во вкладку “Документы”.</span>
                <label className="document-upload-inline">
                  <FileText size={17} />
                  <span>Выбрать документы</span>
                  <input
                    accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip"
                    multiple
                    type="file"
                    onChange={(event) => addPendingDocuments(event.target.files)}
                  />
                </label>
                {pendingDocuments.length > 0 && (
                  <div className="pending-document-list" aria-label="Документы к загрузке после создания проекта">
                    {pendingDocuments.map((document) => (
                      <div className="pending-document-row" key={document.id}>
                        <span>{document.file.name}</span>
                        <select value={document.category} onChange={(event) => updatePendingDocumentCategory(document.id, event.target.value)}>
                          {documentCategoryOptions.map((option) => (
                            <option key={option.value} value={option.value}>{option.label}</option>
                          ))}
                        </select>
                        <button className="icon-button" type="button" onClick={() => removePendingDocument(document.id)} aria-label={`Убрать ${document.file.name}`}>
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="project-create-actions">
            <button className="button secondary" disabled={step === 0 || creating} type="button" onClick={() => setStep((current) => Math.max(0, current - 1))}>
              <ChevronLeft size={17} />
              Назад
            </button>
            {step < 4 ? (
              <button className="button primary" disabled={!canMoveNext || creating} type="button" onClick={() => setStep((current) => Math.min(4, current + 1))}>
                Далее
                <ChevronRight size={17} />
              </button>
            ) : (
              <button
                className="button primary"
                disabled={creating || plan.issues.length > 0 || (projectWorkbook.status === "ready" && projectWorkbook.mappingDirty)}
                type="button"
                onClick={submit}
              >
                <Plus size={17} />
                {creating ? "Создаем..." : "Создать и открыть"}
              </button>
            )}
            <button className="button secondary" disabled={creating} type="button" onClick={reset}>
              <RotateCcw size={16} />
              Сбросить
            </button>
            {createError && <span className="error-text">{createError}</span>}
            {createdProjectPath && (
              <a className="button secondary" href={createdProjectPath}>
                Открыть созданный проект
              </a>
            )}
          </div>
        </form>

        <aside className="onboarding-summary-card">
          <div className="section-title">
            <CheckCircle2 size={18} />
            <h3>Onboarding baseline</h3>
          </div>
          <p>{plan.summary}</p>
          <div className="template-summary-card">
            <small>Выбранный шаблон</small>
            <strong>{plan.template.title}</strong>
            <span>{plan.template.description}</span>
          </div>
          {plan.issues.length ? (
            <div className="onboarding-issues">
              {plan.issues.slice(0, 4).map((issue) => (
                <span key={`${issue.field}-${issue.message}`}>{issue.message}</span>
              ))}
            </div>
          ) : (
            <span className="badge green">обязательные поля закрыты</span>
          )}
          <div className="onboarding-mini-list">
            {plan.projectIntelligenceBaseline.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="onboarding-mini-list">
            {templateBaseline.firstActions.slice(0, 5).map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </aside>
      </div>
    </section>
  );
}

function suggestionValue(value: string | number | undefined) {
  if (value === undefined || value === "") return "";
  return typeof value === "number" ? value.toLocaleString("ru-RU") : String(value);
}

function ProjectWorkbookCard({
  state,
  onFile,
  onClear
}: {
  state: ProjectWorkbookState;
  onFile: (file: File | undefined) => void;
  onClear: () => void;
}) {
  const analysis = state.status === "ready" || state.status === "warning" ? state.analysis : undefined;
  return (
    <div className="project-workbook-card wide-field">
      <div className="project-workbook-card-head">
        <span className="project-workbook-icon"><FileSpreadsheet size={21} /></span>
        <div>
          <strong>Единый Excel проекта</strong>
          <span>Загрузите то, что есть: ВОР, ССР, материалы, графики, машины, ФОТ и вспомогательные листы.</span>
        </div>
        {state.status !== "idle" && <button className="button secondary" type="button" onClick={onClear}>Убрать</button>}
      </div>
      <label className="project-workbook-upload">
        <FileSpreadsheet size={18} />
        <span>{state.status === "analyzing" ? "Анализируем книгу..." : state.status === "idle" ? "Выбрать Excel проекта" : "Заменить Excel"}</span>
        <input accept=".xlsx,.xls,.xlsm" disabled={state.status === "analyzing"} type="file" onChange={(event) => onFile(event.target.files?.[0])} />
      </label>
      {state.status === "ready" && (
        <div className="project-workbook-result">
          <div>
            <small>Распознано</small>
            <strong>{state.analysis.summary.totalSheets} листов</strong>
            <span>
              {state.analysis.summary.includedSheets} рабочих · {state.analysis.summary.referenceSheets} для сверки
              {state.analysis.summary.reviewSheets ? ` · ${state.analysis.summary.reviewSheets} проверить` : ""}
            </span>
          </div>
          <div>
            <small>Расходная часть</small>
            <strong>{compactMoney(state.analysis.summary.estimatedDirectCost)}</strong>
            <span>
              {state.analysis.summary.reconciliationGap > 0
                ? `${state.analysis.summary.automatedCoveragePercent}% распределено · остаток ${compactMoney(
                    state.analysis.summary.reconciliationGap,
                  )}`
                : "сверка с ССР закрыта"}
            </span>
          </div>
          <div>
            <small>ФОТ</small>
            <strong>{compactMoney(state.analysis.summary.payrollCost)}</strong>
            <span>{state.analysis.summary.payrollItems} должностей / бригад</span>
          </div>
          <div>
            <small>Техника</small>
            <strong>{compactMoney(state.analysis.summary.equipmentCost)}</strong>
            <span>{state.analysis.summary.equipmentItems} позиций</span>
          </div>
        </div>
      )}
      {(state.status === "warning" || state.status === "failed") && <p className="error-text">{state.message}</p>}
      {analysis?.warnings.slice(0, 2).map((warning) => <p className="muted" key={warning}>{warning}</p>)}
    </div>
  );
}

function ProjectWorkbookDistribution({
  state,
  onApplyMapping,
  onOverride,
  onResetOverride
}: {
  state: Extract<ProjectWorkbookState, { status: "ready" }>;
  onApplyMapping: () => void;
  onOverride: (sheetName: string, patch: ProjectWorkbookSheetOverride) => void;
  onResetOverride: (sheetName: string) => void;
}) {
  const [filter, setFilter] = useState<"all" | "work" | "source" | "review">("all");
  const { analysis, overrides } = state;
  const visibleSheets = analysis.sheets.filter((sheet) => {
    const override = overrides[sheet.sheetName];
    const enabled = override?.enabled ?? sheet.enabled;
    const role = override?.role ?? sheet.role;
    if (filter === "work") return enabled && ["works", "materials", "schedule", "payroll", "equipment"].includes(role);
    if (filter === "source") return !enabled || ["summary", "reference", "control"].includes(role);
    if (filter === "review") return enabled && (role === "unknown" || sheet.confidence < 0.8 || Boolean(override));
    return true;
  });
  const pendingOverrides = Object.keys(overrides).length;
  return (
    <div className="project-workbook-distribution">
      <div className="baseline-preview-head">
        <div>
          <div className="eyebrow">Workbook distribution</div>
          <h3>Как система заполнит проект</h3>
          <p>{analysis.fileName} · {analysis.summary.totalSheets} листов. Своды, источники и контрольные вкладки не создают дубли.</p>
        </div>
        <span className="badge green">готово к импорту</span>
      </div>
      <div className="project-workbook-module-grid">
        {analysis.modules.map((module) => (
          <div className={`project-workbook-module tone-${module.status === "ready" ? "good" : module.status === "reference" ? "info" : "neutral"}`} key={module.id}>
            <div>
              <strong>{module.label}</strong>
              <span>{module.rows ? `${module.rows} строк` : module.status === "reference" ? `${module.sheets.length} листов` : "не найдено"}</span>
            </div>
            {module.amount > 0 && <b>{compactMoney(module.amount)}</b>}
            <p>{module.detail}</p>
            {module.sheets.length > 0 && <small>{module.sheets.slice(0, 4).join(" · ")}{module.sheets.length > 4 ? ` · +${module.sheets.length - 4}` : ""}</small>}
          </div>
        ))}
      </div>
      <div className="project-workbook-fot-note">
        <AlertTriangle size={18} />
        <div>
          <strong>ФОТ формирует расходную часть проекта</strong>
          <span>Система использует человеко-месяцы или считает их из объема и нормы выработки. Месячная зарплата становится ставкой, а помесячная загрузка сохраняется в обосновании.</span>
        </div>
      </div>
      <div className="project-workbook-mapping">
        <div className="project-workbook-mapping-head">
          <div>
            <div className="eyebrow">Import review & mapping</div>
            <h3>Проверьте карту листов</h3>
            <p>Роль определена автоматически. Исключённые листы не участвуют ни в импорте, ни в сверке итогов.</p>
          </div>
          <div className="project-workbook-mapping-summary">
            <span>{analysis.summary.includedSheets} рабочих</span>
            <span>{analysis.summary.referenceSheets} источников</span>
            <span>{analysis.summary.reviewSheets} требуют проверки</span>
          </div>
        </div>
        <div className="project-workbook-mapping-toolbar">
          <div className="density-toggle" aria-label="Фильтр карты листов">
            {([
              ["all", "Все"],
              ["work", "Рабочие"],
              ["source", "Сверка"],
              ["review", "Проверить"]
            ] as const).map(([value, label]) => (
              <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>
                {value === "review" && <Filter size={14} />}
                {label}
              </button>
            ))}
          </div>
          <span className={`badge ${state.mappingDirty ? "yellow" : "green"}`}>
            {state.mappingDirty ? `${pendingOverrides} изменений не пересчитано` : `${analysis.summary.overriddenSheets} ручных решений применено`}
          </span>
        </div>
        <div className="project-workbook-sheet-list">
          {visibleSheets.map((sheet) => {
            const override = overrides[sheet.sheetName];
            const enabled = override?.enabled ?? sheet.enabled;
            const role = override?.role ?? sheet.role;
            const needsReview = enabled && !override && !sheet.overridden && (role === "unknown" || sheet.confidence < 0.8);
            return (
              <div className={`project-workbook-sheet-row ${!enabled ? "is-disabled" : ""} ${needsReview ? "needs-review" : ""}`} key={sheet.sheetName}>
                <label className="project-workbook-sheet-enabled">
                  <input
                    checked={enabled}
                    type="checkbox"
                    onChange={(event) => onOverride(sheet.sheetName, { enabled: event.target.checked })}
                  />
                  <span>{enabled ? "учитывать" : "исключён"}</span>
                </label>
                <div className="project-workbook-sheet-name">
                  <strong>{sheet.sheetName}</strong>
                  <span>{sheet.rows} строк · {sheet.importedRows} распознано</span>
                  <small>{sheet.reason}</small>
                </div>
                <label className="project-workbook-sheet-role">
                  Роль
                  <select value={role} onChange={(event) => onOverride(sheet.sheetName, { role: event.target.value as ProjectWorkbookSheetRole })}>
                    {workbookSheetRoleOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="project-workbook-sheet-confidence">
                  <span className={`badge ${needsReview ? "yellow" : sheet.confidence >= 0.9 ? "green" : "blue"}`}>{Math.round(sheet.confidence * 100)}%</span>
                  <small>авто: {workbookSheetRoleLabels[sheet.detectedRole]}</small>
                </div>
                {(override || sheet.overridden) && (
                  <button className="icon-button" type="button" title="Вернуть автоматическое решение" aria-label={`Вернуть автоматическую роль листа ${sheet.sheetName}`} onClick={() => onResetOverride(sheet.sheetName)}>
                    <RotateCcw size={15} />
                  </button>
                )}
              </div>
            );
          })}
          {!visibleSheets.length && <div className="empty-state">В этом фильтре листов нет.</div>}
        </div>
        {state.mappingDirty && (
          <div className="project-workbook-mapping-action">
            <div>
              <strong>Карта изменена</strong>
              <span>Пересчитайте суммы и модули. До этого создание проекта заблокировано.</span>
            </div>
            <button className="button primary" type="button" onClick={onApplyMapping}>
              <RotateCcw size={16} />
              Пересчитать карту
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function ContractPrefillCard({
  state,
  draft,
  onFile,
  onApplyAll,
  onApplyField,
  onClear
}: {
  state: ContractPrefillState;
  draft: ProjectCreationDraft;
  onFile: (file: File | undefined) => void;
  onApplyAll: (result: ContractProjectPrefill) => void;
  onApplyField: (result: ContractProjectPrefill, field: ContractPrefillField) => void;
  onClear: () => void;
}) {
  const result = state.status === "ready" ? state.result : undefined;
  const appliedCount = contractSuggestionFields.filter((item) => result && suggestionValue(item.value(result))).length;

  return (
    <div className="contract-prefill-card wide-field">
      <div className="field-heading">
        <div>
          <strong>Загрузить договор для автозаполнения</strong>
          <span>TXT/Markdown preview без AI: PGS предложит значения, а вы решите, что применить.</span>
        </div>
        {result && <span className="badge blue">{appliedCount} предложений</span>}
      </div>
      <div className="contract-prefill-toolbar">
        <label className="document-upload-inline">
          <FileText size={17} />
          <span>{state.status === "extracting" ? "Извлекаем..." : "Выбрать договор"}</span>
          <input
            accept=".txt,.md,.markdown,.text,.pdf,.doc,.docx"
            type="file"
            onChange={(event) => onFile(event.target.files?.[0])}
          />
        </label>
        <span className="muted">PDF/DOCX можно приложить как стартовый документ; автозаполнение v1 поддерживает текстовые файлы.</span>
      </div>
      {state.status === "extracting" && <div className="inline-status">Анализируем {state.fileName}...</div>}
      {(state.status === "warning" || state.status === "failed") && (
        <div className="onboarding-issues">
          <span>{state.message}</span>
          <span>Файл останется в стартовых документах с категорией “Договор”, проект можно заполнить вручную.</span>
        </div>
      )}
      {result && (
        <>
          <div className="contract-prefill-actions">
            <button className="button secondary" type="button" onClick={() => onApplyAll(result)}>
              Применить безопасные предложения
            </button>
            <button className="button secondary" type="button" onClick={onClear}>
              Убрать договор
            </button>
            <span className="muted">Заполненные вручную поля не меняются при безопасном применении.</span>
          </div>
          <ContractSuggestionList draft={draft} result={result} onApplyField={onApplyField} />
        </>
      )}
    </div>
  );
}

function ContractPrefillSummary({
  result,
  onApplyAll,
  onApplyField
}: {
  result: ContractProjectPrefill;
  onApplyAll: (result: ContractProjectPrefill) => void;
  onApplyField: (result: ContractProjectPrefill, field: ContractPrefillField) => void;
}) {
  return (
    <div className="contract-prefill-card wide-field compact">
      <div className="field-heading">
        <div>
          <strong>Договорная база из файла</strong>
          <span>Проверьте сумму, НДС, сроки, оплату, КС и режим изменения объемов перед созданием проекта.</span>
        </div>
        <button className="button secondary" type="button" onClick={() => onApplyAll(result)}>
          Применить безопасные предложения
        </button>
      </div>
      <ContractSuggestionList result={result} onApplyField={onApplyField} focus="contract" />
    </div>
  );
}

function ContractSuggestionList({
  result,
  draft,
  focus,
  onApplyField
}: {
  result: ContractProjectPrefill;
  draft?: ProjectCreationDraft;
  focus?: "contract";
  onApplyField: (result: ContractProjectPrefill, field: ContractPrefillField) => void;
}) {
  const fields = contractSuggestionFields.filter((item) => {
    const value = suggestionValue(item.value(result));
    if (!value) return false;
    if (focus === "contract") return ["contractAmount", "vatMode", "vatPercent", "startDate", "finishDate", "paymentTerms", "advanceTerms", "acceptanceTerms", "contractSource", "volumeChangeMode", "penalties", "retention"].includes(item.field);
    return true;
  });

  return (
    <div className="contract-suggestion-list">
      {fields.map((item) => {
        const value = suggestionValue(item.value(result));
        const currentValue = item.draftKey ? suggestionValue(draft?.[item.draftKey] as string | number | undefined) : "";
        const confidence = result.confidenceByField[item.field] ?? "low";
        return (
          <div className="contract-suggestion-row" key={item.field}>
            <div>
              <small>{item.label}</small>
              <strong>{value}</strong>
              {result.evidenceByField[item.field] && <span>{result.evidenceByField[item.field]}</span>}
              {currentValue && <em>Текущее значение: {currentValue}</em>}
            </div>
            <span className={`badge ${confidence === "high" ? "green" : confidence === "medium" ? "blue" : "yellow"}`}>{confidence}</span>
            {item.draftKey ? (
              <button className="button secondary" type="button" onClick={() => onApplyField(result, item.field)}>
                Применить
              </button>
            ) : (
              <span className="muted">для проверки</span>
            )}
          </div>
        );
      })}
      {result.warnings.length > 0 && (
        <div className="onboarding-issues">
          {result.warnings.slice(0, 5).map((warning) => <span key={warning}>{warning}</span>)}
        </div>
      )}
      {result.missingFields.length > 0 && <p className="muted">Не найдено: {result.missingFields.slice(0, 6).join(", ")}.</p>}
    </div>
  );
}

function BaselinePreviewList({ title, items, empty }: { title: string; items: string[]; empty: string }) {
  return (
    <div className="baseline-preview-list">
      <strong>{title}</strong>
      {items.length ? (
        items.slice(0, 5).map((item) => <span key={item}>{item}</span>)
      ) : (
        <span className="muted">{empty}</span>
      )}
    </div>
  );
}

function ProjectCard({ project, riskCount, managerCount }: { project: Project; riskCount: number; managerCount: number }) {
  const progress = project.status === "completed" ? 100 : project.status === "planning" ? 8 : 42;
  const margin = Math.max(8, 18 - riskCount);

  return (
    <Link className="project-card" href={`/projects/${project.id}`}>
      <div className="project-thumb" aria-hidden="true">
        <span>PGS</span>
      </div>
      <div className="project-card-body">
        <div className="project-card-title">
          <div>
            <strong>{project.name}</strong>
            <span>{project.address}</span>
          </div>
          <span className="badge green">{statusLabels[project.status]}</span>
        </div>
        <div className="project-card-meta">
          <span>{project.object}</span>
          <span>{project.customer}</span>
          <span>РП: {project.manager}</span>
        </div>
        <div className="progress-line" aria-label={`Готовность ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="project-card-kpis">
          <span>
            Договор
            <strong>{compactMoney(project.contractAmount)}</strong>
          </span>
          <span>
            Срок
            <strong>{formatDate(project.endsAt)}</strong>
          </span>
          <span>
            Маржа
            <strong>{percent(margin)}</strong>
          </span>
          <span>
            Риски
            <strong>{riskCount}</strong>
          </span>
        </div>
        <div className="project-card-footer">
          <span>{managerCount} руководитель в контуре</span>
          <strong>Открыть штаб объекта</strong>
        </div>
      </div>
    </Link>
  );
}
