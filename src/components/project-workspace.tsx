"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, BarChart3, Bot, ClipboardList, FileText, Landmark, LayoutList, ListChecks, Package, Pencil, Plus, ReceiptText, Search, Send, Table2, TimerReset, Trash2, Truck, Users } from "lucide-react";
import { AcceptanceBillingWorkspace } from "@/components/acceptance-billing-workspace";
import { CommercialProposalWorkspace } from "@/components/commercial-proposal-workspace";
import { ChangeOrdersWorkspace } from "@/components/change-orders-workspace";
import { ClaimsNoticesWorkspace } from "@/components/claims-notices-workspace";
import { ContractTenderWorkspace } from "@/components/contract-tender-workspace";
import { CostToCompleteWorkspace } from "@/components/cost-to-complete-workspace";
import { FieldOperationsWorkspace } from "@/components/field-operations-workspace";
import { HseSafetyPermitWorkspace } from "@/components/hse-safety-permit-workspace";
import { ProjectCommandCenter } from "@/components/project-command-center";
import { ProjectActionCenter, type ProjectActionSuggestion } from "@/components/project-action-center";
import { DocumentComplianceWorkspace } from "@/components/document-compliance-workspace";
import { PhotoEvidenceWorkspace } from "@/components/photo-evidence-workspace";
import { ProjectIntelligenceDrilldown } from "@/components/project-intelligence-drilldown";
import { ProcurementIntelligenceWorkspace } from "@/components/procurement-intelligence-workspace";
import { QualityIssuesWorkspace } from "@/components/quality-issues-workspace";
import { ResourcesEquipmentWorkspace } from "@/components/resources-equipment-workspace";
import { RiskExecutiveWorkspace } from "@/components/risk-executive-workspace";
import { ScheduleCashflowWorkspace } from "@/components/schedule-cashflow-workspace";
import { SubcontractorExecutionWorkspace } from "@/components/subcontractor-execution-workspace";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import type { ImportExplanation, ImportMode, ImportPreview, ImportSheetMapping } from "@/lib/excel/import-types";
import { drilldownAiScenarios, type AiInsightResponse, type AiScenario } from "@/lib/project-intelligence-drilldown";
import { buildInitialProjectReadiness } from "@/lib/project-onboarding-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import type { AuditEvent, BudgetItem, DailyReport, Material, Payment, ProcurementRequest, ProjectDocument, ProjectDocumentVersion, ProjectMember, Risk, ScheduleItem } from "@/lib/types";

type Bundle = {
  project: {
    id: string;
    name: string;
    customer: string;
    object: string;
    address: string;
    contractAmount: number;
    startsAt: string;
    endsAt: string;
    manager: string;
  };
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
};

type ImportHistoryItem = {
  id: string;
  fileName: string;
  status: string;
  mode: string | null;
  summary: ImportPreview["summary"] & { commitResult?: Record<string, unknown> };
  commitResult?: Record<string, unknown> | null;
  warnings?: string[];
  errors?: string[];
  createdBy?: string | null;
  createdAt: string;
  committedAt: string | null;
  preview?: Pick<ImportPreview, "previewRows" | "unknownRows" | "summary">;
};

const tabs = [
  "Обзор",
  "Бюджет / ВОР",
  "График",
  "Материалы",
  "Заявки",
  "Финансы",
  "Договор / Тендер",
  "КП / Подача",
  "КС",
  "Исполнение",
  "Рапорты",
  "Риски",
  "Документы",
  "Действия",
  "Аналитика",
  "Участники",
  "История",
  "Настройки",
  "AI-помощник"
];

const tabMeta: Record<string, { code: string; icon: React.ReactNode; hint: string }> = {
  Обзор: { code: "00", icon: <LayoutList size={16} />, hint: "Сводка" },
  "Бюджет / ВОР": { code: "01", icon: <Table2 size={16} />, hint: "Деньги" },
  График: { code: "02", icon: <TimerReset size={16} />, hint: "Сроки" },
  Материалы: { code: "03", icon: <Package size={16} />, hint: "Снабжение" },
  Заявки: { code: "04", icon: <Truck size={16} />, hint: "Закупки" },
  Финансы: { code: "05", icon: <Landmark size={16} />, hint: "Платежи" },
  "Договор / Тендер": { code: "06", icon: <Search size={16} />, hint: "Контракт" },
  "КП / Подача": { code: "07", icon: <Send size={16} />, hint: "КП" },
  КС: { code: "08", icon: <ReceiptText size={16} />, hint: "Закрытие" },
  Исполнение: { code: "09", icon: <Users size={16} />, hint: "Подряд" },
  Рапорты: { code: "10", icon: <ClipboardList size={16} />, hint: "Площадка" },
  Риски: { code: "11", icon: <AlertTriangle size={16} />, hint: "Контроль" },
  Документы: { code: "12", icon: <FileText size={16} />, hint: "Файлы" },
  Действия: { code: "13", icon: <ListChecks size={16} />, hint: "Workflow" },
  Аналитика: { code: "14", icon: <BarChart3 size={16} />, hint: "Готовность" },
  Участники: { code: "15", icon: <Users size={16} />, hint: "Доступ" },
  История: { code: "16", icon: <ClipboardList size={16} />, hint: "Аудит" },
  Настройки: { code: "17", icon: <Trash2 size={16} />, hint: "Админ" },
  "AI-помощник": { code: "AI", icon: <Bot size={16} />, hint: "Анализ" }
};

type CurrentUser = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
  name?: string;
  email?: string;
};

type PipelineDraftKind = "procurement" | "schedule" | "cashflow";

type PipelineDraftState = {
  kind: PipelineDraftKind;
  mode: "preview" | "commit";
  draft: {
    sourceImportBatchId?: string | null;
    summary: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
  };
  created?: unknown[];
};

type IntelligenceState = {
  completenessScore: number;
  summary: string;
  topRisks: PipelineAction[];
  nextActions: PipelineAction[];
  missingData: string[];
  quickActions: Array<{ title: string; prompt: string; deterministicAnswer: string }>;
};

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

function statusTone(value: string): "good" | "warn" | "bad" | "info" | "neutral" {
  if (["done", "delivered", "paid", "closed", "active", "completed"].includes(value)) return "good";
  if (["critical", "delayed", "overdue", "required", "stopped"].includes(value)) return "bad";
  if (["high", "medium", "requested", "ordered", "in_transit", "planned", "draft"].includes(value)) return "warn";
  if (["not_started", "low", "open", "planning"].includes(value)) return "info";
  return "neutral";
}

function textFromCell(cell: React.ReactNode): string {
  if (typeof cell === "string" || typeof cell === "number") return String(cell);
  if (Array.isArray(cell)) return cell.map(textFromCell).join(" ");
  return "";
}

export function ProjectWorkspace({ initialBundle, createdFromOnboarding = false }: { initialBundle: Bundle; createdFromOnboarding?: boolean }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [budgetItems, setBudgetItems] = useState(initialBundle.budgetItems);
  const [scheduleItems, setScheduleItems] = useState(initialBundle.scheduleItems);
  const [materials, setMaterials] = useState(initialBundle.materials);
  const [procurementRequests, setProcurementRequests] = useState(initialBundle.procurementRequests);
  const [payments, setPayments] = useState(initialBundle.payments);
  const [reports, setReports] = useState(initialBundle.dailyReports);
  const [risks, setRisks] = useState(initialBundle.risks);
  const [aiPrompt, setAiPrompt] = useState("Что сейчас самое важное по проекту?");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiScenarioLoading, setAiScenarioLoading] = useState<AiScenario | null>(null);
  const [aiResults, setAiResults] = useState<Partial<Record<AiScenario, AiInsightResponse>>>({});
  const [aiErrors, setAiErrors] = useState<Partial<Record<AiScenario, string>>>({});
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importMode, setImportMode] = useState<ImportMode>("append");
  const [importExplanation, setImportExplanation] = useState<ImportExplanation | null>(null);
  const [importHistory, setImportHistory] = useState<ImportHistoryItem[]>([]);
  const [importResult, setImportResult] = useState<Record<string, unknown> | null>(null);
  const [importPreviewFilter, setImportPreviewFilter] = useState("all");
  const [budgetTableFilter, setBudgetTableFilter] = useState("all");
  const [materialTableFilter, setMaterialTableFilter] = useState("all");
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [documentVersions, setDocumentVersions] = useState<Record<string, ProjectDocumentVersion[]>>({});
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentCategory, setDocumentCategory] = useState("прочее");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<ProjectMember["role"]>("VIEWER");
  const [readiness, setReadiness] = useState<PipelineReadiness | null>(null);
  const [postImportActions, setPostImportActions] = useState<PipelineAction[]>([]);
  const [documentChecklist, setDocumentChecklist] = useState<DocumentChecklistItem[]>([]);
  const [intelligence, setIntelligence] = useState<IntelligenceState | null>(null);
  const [pipelineDraft, setPipelineDraft] = useState<PipelineDraftState | null>(null);
  const [pipelineLoading, setPipelineLoading] = useState("");
  const [currentUser, setCurrentUser] = useState<CurrentUser | null>(null);
  const [currentUserLoaded, setCurrentUserLoaded] = useState(false);
  const [deleteProjectName, setDeleteProjectName] = useState("");
  const [deleteProjectConfirm, setDeleteProjectConfirm] = useState(false);
  const [deleteProjectDone, setDeleteProjectDone] = useState(false);
  const openIntelligenceSection = useCallback((sectionId: string) => {
    const element = document.getElementById(sectionId);
    if (element) element.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  const budget = useMemo(() => budgetTotals(initialBundle.project.contractAmount, budgetItems), [budgetItems, initialBundle.project.contractAmount]);
  const works = useMemo(() => workTotals(scheduleItems), [scheduleItems]);
  const materialStats = useMemo(() => materialTotals(materials), [materials]);
  const finance = useMemo(() => financeTotals(payments), [payments]);
  const allRisks = useMemo(() => [...risks, ...deriveAutoRisks(scheduleItems, materials, payments)], [risks, scheduleItems, materials, payments]);
  const activeRisks = allRisks.filter((risk) => risk.status !== "closed");
  const delayedWorks = scheduleItems.filter((item) => item.status === "delayed");
  const activeRequests = procurementRequests.filter((request) => request.status !== "closed");
  const budgetDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const urgentMaterial = materialStats.deficitItems[0];
  const latestReport = reports[0];
  const latestAudit = auditEvents[0];
  const priorityActions = [
    budgetDeviation > 0 ? `Снять перерасход: ${compactMoney(budgetDeviation)}` : "Бюджет в зеленой зоне",
    delayedWorks[0] ? `Вернуть в график: ${delayedWorks[0].name}` : "Критичных просрочек нет",
    urgentMaterial ? `Закрыть дефицит: ${urgentMaterial.name}` : "Дефицит материалов не выявлен",
    activeRisks[0] ? `Разобрать риск: ${activeRisks[0].title}` : "Открытых критичных рисков нет"
  ];
  const aiAnswerTone = aiLoading ? "loading" : aiAnswer ? (/OPENAI_API_KEY|not configured|failed|ошибка|error|Project not found/i.test(aiAnswer) ? "error" : "ready") : "empty";
  const aiDisplay = aiAnswerTone === "error" ? "AI-помощник сейчас недоступен. Проверьте подключение AI и повторите анализ позже." : aiAnswer;
  const canDeleteCurrentProject = currentUser?.role === "OWNER" || currentUser?.role === "ADMIN";
  const emptyOperationalBaseline =
    !budgetItems.length &&
    !scheduleItems.length &&
    !materials.length &&
    !procurementRequests.length &&
    !payments.length &&
    !documents.length &&
    !risks.length;
  const onboardingPlan = useMemo(() => buildInitialProjectReadiness(initialBundle.project), [initialBundle.project]);
  const showOnboardingPanel = createdFromOnboarding || emptyOperationalBaseline;
  const actionSuggestions = useMemo<ProjectActionSuggestion[]>(() => {
    const targetByCategory: Record<PipelineAction["category"], string> = {
      budget: "Бюджет / ВОР",
      materials: "Материалы",
      procurement: "Заявки",
      schedule: "График",
      finance: "Финансы",
      documents: "Документы",
      risks: "Риски",
      import: "Бюджет / ВОР",
      ai: "AI-помощник"
    };
    return postImportActions.filter((action) => action.enabled !== false).map((action) => ({
      id: action.id,
      title: action.title,
      description: [action.description, action.suggestedNextStep].filter(Boolean).join(" "),
      sourceModule: action.category,
      targetTab: targetByCategory[action.category],
      priority: action.priority,
      assignee: action.ownerRole,
      dueAt: action.dueDate
    }));
  }, [postImportActions]);

  useEffect(() => {
    let active = true;
    fetch("/api/auth/me")
      .then(async (response) => {
        const data = (await response.json()) as { user?: CurrentUser | null };
        if (active) setCurrentUser(response.ok ? (data.user ?? null) : null);
      })
      .catch(() => {
        if (active) setCurrentUser(null);
      })
      .finally(() => {
        if (active) setCurrentUserLoaded(true);
      });
    return () => {
      active = false;
    };
  }, []);

  const loadAudit = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/audit`);
      const data = (await response.json()) as { items?: AuditEvent[] };
      if (response.ok) setAuditEvents(data.items ?? []);
    } catch {
      setAuditEvents([]);
    }
  }, [initialBundle.project.id]);

  const loadImportHistory = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports`);
      const data = (await response.json()) as { items?: ImportHistoryItem[] };
      if (response.ok) setImportHistory(data.items ?? []);
    } catch {
      setImportHistory([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (!["Бюджет / ВОР", "График", "Материалы", "Заявки", "Финансы", "Договор / Тендер", "КП / Подача", "КС", "Исполнение", "Аналитика"].includes(activeTab)) return;
    void loadImportHistory();
  }, [activeTab, loadImportHistory]);

  useEffect(() => {
    void loadAudit();
  }, [loadAudit]);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents`);
      const data = (await response.json()) as { items?: ProjectDocument[] };
      if (response.ok) setDocuments(data.items ?? []);
    } catch {
      setDocuments([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (!["Документы", "Договор / Тендер", "КП / Подача", "КС", "Исполнение", "Риски", "Рапорты", "Аналитика"].includes(activeTab)) return;
    void loadDocuments();
  }, [activeTab, loadDocuments]);

  const loadMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members`);
      const data = (await response.json()) as { items?: ProjectMember[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить участников.");
      setMembers(data.items ?? []);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка загрузки участников.");
      setMembers([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (activeTab !== "Участники") return;
    void loadMembers();
  }, [activeTab, loadMembers]);

  const loadPipeline = useCallback(async () => {
    try {
      const [readinessResponse, actionsResponse, checklistResponse, intelligenceResponse] = await Promise.all([
        fetch(`/api/projects/${initialBundle.project.id}/data-readiness`),
        fetch(`/api/projects/${initialBundle.project.id}/post-import-actions`),
        fetch(`/api/projects/${initialBundle.project.id}/document-checklist`),
        fetch(`/api/projects/${initialBundle.project.id}/intelligence`)
      ]);
      const readinessData = (await readinessResponse.json()) as { readiness?: PipelineReadiness };
      const actionsData = (await actionsResponse.json()) as { items?: PipelineAction[] };
      const checklistData = (await checklistResponse.json()) as { items?: DocumentChecklistItem[] };
      const intelligenceData = (await intelligenceResponse.json()) as { intelligence?: IntelligenceState; calculatedRisks?: PipelineAction[]; readiness?: PipelineReadiness };
      if (readinessResponse.ok && readinessData.readiness) setReadiness(readinessData.readiness);
      if (actionsResponse.ok) setPostImportActions(actionsData.items ?? []);
      if (checklistResponse.ok) setDocumentChecklist(checklistData.items ?? []);
      if (intelligenceResponse.ok && intelligenceData.intelligence) setIntelligence(intelligenceData.intelligence);
    } catch {
      setPostImportActions([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (!["Обзор", "Бюджет / ВОР", "Материалы", "Заявки", "График", "Финансы", "Договор / Тендер", "КП / Подача", "КС", "Исполнение", "Документы", "Действия", "Аналитика", "AI-помощник"].includes(activeTab)) return;
    void loadPipeline();
  }, [activeTab, loadPipeline]);

  async function askAi(prompt = aiPrompt) {
    setAiLoading(true);
    setAiPrompt(prompt);
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = (await response.json()) as { response?: string; error?: string };
      setAiAnswer(data.response ?? data.error ?? "Нет ответа.");
    } catch (error) {
      setAiAnswer(error instanceof Error ? error.message : "Ошибка AI-запроса.");
    } finally {
      setAiLoading(false);
    }
  }

  async function runAiCommandScenario(scenario: AiScenario) {
    setAiScenarioLoading(scenario);
    setAiErrors((current) => ({ ...current, [scenario]: undefined }));
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/ai/${scenario}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          topic: scenario === "draft-text" ? "Пояснительная записка по текущему статусу объекта" : undefined,
          instructions: aiPrompt
        })
      });
      const data = (await response.json()) as { ok?: boolean; insight?: AiInsightResponse; error?: string; message?: string };
      if (!response.ok || !data.insight) throw new Error(data.message ?? data.error ?? "AI-сценарий недоступен.");
      setAiResults((current) => ({ ...current, [scenario]: data.insight }));
    } catch (scenarioError) {
      setAiErrors((current) => ({ ...current, [scenario]: scenarioError instanceof Error ? scenarioError.message : "Ошибка AI-сценария." }));
    } finally {
      setAiScenarioLoading(null);
    }
  }

  async function createResource<T>(resource: string, payload: unknown) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { item?: T; error?: string; issues?: unknown };
      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "Не удалось сохранить запись.");
      }
      return data.item;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Ошибка сохранения.";
      setError(message);
      throw saveError;
    } finally {
      setSaving("");
    }
  }

  async function runPipelineDraft(kind: PipelineDraftKind, commit = false) {
    const endpoint =
      kind === "procurement"
        ? "procurement/draft-from-import"
        : kind === "schedule"
          ? "schedule/draft-from-import"
          : "finance/draft-cashflow-from-import";
    setPipelineLoading(`${kind}-${commit ? "commit" : "preview"}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/${endpoint}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ commit, confirmed: commit })
      });
      const data = (await response.json()) as PipelineDraftState & { ok?: boolean; error?: string };
      if (!response.ok || data.ok === false) throw new Error(data.error ?? "Pipeline draft недоступен.");
      setPipelineDraft({ kind, mode: commit ? "commit" : "preview", draft: data.draft, created: data.created });
      if (commit && kind === "procurement" && Array.isArray(data.created)) {
        setProcurementRequests((current) => [...current, ...(data.created as ProcurementRequest[])]);
      }
      if (commit && kind === "schedule" && Array.isArray(data.created)) {
        setScheduleItems((current) => [...current, ...(data.created as ScheduleItem[])]);
      }
      await loadPipeline();
    } catch (draftError) {
      setError(draftError instanceof Error ? draftError.message : "Ошибка pipeline draft.");
    } finally {
      setPipelineLoading("");
    }
  }

  async function updateResource<T>(resource: string, id: string, payload: unknown) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/${resource}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { item?: T; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось обновить запись.");
      return data.item;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Ошибка обновления.");
      throw updateError;
    } finally {
      setSaving("");
    }
  }

  async function deleteResource(resource: string, id: string) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить запись.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления.");
      throw deleteError;
    } finally {
      setSaving("");
    }
  }

  async function uploadDocument() {
    if (!documentFile) {
      setError("Выберите файл документа.");
      return;
    }
    setSaving("document-upload");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", documentFile);
      formData.append("category", documentCategory);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/upload`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as { item?: ProjectDocument; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось загрузить документ.");
      setDocuments((current) => [data.item as ProjectDocument, ...current]);
      setDocumentFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Ошибка загрузки документа.");
    } finally {
      setSaving("");
    }
  }

  async function deleteDocument(document: ProjectDocument) {
    setSaving("document-delete");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить документ.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления документа.");
    } finally {
      setSaving("");
    }
  }

  async function loadDocumentVersions(document: ProjectDocument) {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}/versions`);
      const data = (await response.json()) as { items?: ProjectDocumentVersion[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить версии.");
      setDocumentVersions((current) => ({ ...current, [document.id]: data.items ?? [] }));
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Ошибка загрузки версий.");
    }
  }

  async function uploadDocumentVersion(document: ProjectDocument, file: File) {
    setSaving("document-version");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}/versions`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as { item?: ProjectDocumentVersion; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось загрузить версию.");
      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id
            ? { ...item, version: data.item!.versionNumber, fileName: data.item!.fileName, mimeType: data.item!.mimeType, sizeBytes: data.item!.sizeBytes, uploadedAt: data.item!.createdAt }
            : item
        )
      );
      await loadDocumentVersions(document);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Ошибка загрузки версии.");
    } finally {
      setSaving("");
    }
  }

  async function addProjectMember() {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail, role: memberRole })
      });
      const data = (await response.json()) as { item?: ProjectMember; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось добавить участника.");
      setMembers((current) => {
        const withoutDuplicate = current.filter((member) => member.id !== data.item!.id);
        return [...withoutDuplicate, data.item as ProjectMember];
      });
      setMemberEmail("");
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка добавления участника.");
    } finally {
      setSaving("");
    }
  }

  async function updateProjectMember(memberId: string, role: ProjectMember["role"]) {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = (await response.json()) as { item?: ProjectMember; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось изменить роль.");
      setMembers((current) => current.map((member) => (member.id === memberId ? (data.item as ProjectMember) : member)));
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка изменения роли.");
    } finally {
      setSaving("");
    }
  }

  async function removeProjectMember(memberId: string) {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members/${memberId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить участника.");
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка удаления участника.");
    } finally {
      setSaving("");
    }
  }

  async function previewImport() {
    if (!importFile) {
      setError("Выберите Excel-файл для импорта.");
      return;
    }
    setSaving("import-preview");
    setError("");
    setImportConfirmed(false);
    setImportExplanation(null);
    setImportResult(null);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/budget/preview`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as ImportPreview | { error?: string };
      if (!response.ok && "error" in data) throw new Error(data.error ?? "Не удалось проверить файл.");
      setImportPreview(data as ImportPreview);
      setImportPreviewFilter("all");
      void loadImportHistory();
    } catch (previewError) {
      setImportPreview(null);
      setError(previewError instanceof Error ? previewError.message : "Ошибка проверки Excel-файла.");
    } finally {
      setSaving("");
    }
  }

  async function remapImport(mapping: ImportSheetMapping[]) {
    if (!importPreview?.importBatchId) return;
    setSaving("import-remap");
    setError("");
    setImportExplanation(null);
    setImportResult(null);
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/${importPreview.importBatchId}/remap`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mapping: mapping.map((item) => ({
            sheetName: item.sheetName,
            headerRow: item.headerRow,
            included: item.included ?? true,
            columns: item.columns
          }))
        })
      });
      const data = (await response.json()) as ImportPreview | { error?: string };
      if (!response.ok && "error" in data) throw new Error(data.error ?? "Не удалось применить mapping.");
      setImportPreview(data as ImportPreview);
      setImportConfirmed(false);
      void loadImportHistory();
    } catch (remapError) {
      setError(remapError instanceof Error ? remapError.message : "Ошибка применения mapping.");
    } finally {
      setSaving("");
    }
  }

  async function explainImport() {
    if (!importPreview?.importBatchId) return;
    setSaving("import-explain");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/${importPreview.importBatchId}/explain`, { method: "POST" });
      const data = (await response.json()) as { explanation?: ImportExplanation; error?: string };
      if (!response.ok || !data.explanation) throw new Error(data.error ?? "Не удалось сформировать объяснение.");
      setImportExplanation(data.explanation);
      setImportPreview((current) => (current ? { ...current, explanation: data.explanation } : current));
      void loadImportHistory();
    } catch (explainError) {
      setError(explainError instanceof Error ? explainError.message : "Ошибка объяснения импорта.");
    } finally {
      setSaving("");
    }
  }

  async function commitImport() {
    if (!importPreview?.importBatchId || !importConfirmed || importPreview.summary.errors > 0) return;
    setSaving("import-commit");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/${importPreview.importBatchId}/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: importMode,
          replaceConfirmed: importMode !== "append" ? importConfirmed : false
        })
      });
      const data = (await response.json()) as {
        ok?: boolean;
        budgetItems?: BudgetItem[];
        materials?: Material[];
        scheduleItems?: ScheduleItem[];
        commitResult?: Record<string, unknown>;
        error?: string;
      };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось сохранить импорт.");

      if (importMode === "replace_budget" || importMode === "replace_all") setBudgetItems(data.budgetItems ?? []);
      else setBudgetItems((current) => [...current, ...(data.budgetItems ?? [])]);

      if (importMode === "replace_materials" || importMode === "replace_all") setMaterials(data.materials ?? []);
      else setMaterials((current) => [...current, ...(data.materials ?? [])]);

      if (importMode === "replace_schedule" || importMode === "replace_all") setScheduleItems(data.scheduleItems ?? []);
      else setScheduleItems((current) => [...current, ...(data.scheduleItems ?? [])]);

      setImportConfirmed(false);
      setImportResult(data.commitResult ?? data);
      setError("");
      setAiAnswer(`Импорт сохранен: ВОР ${data.budgetItems?.length ?? 0}, материалы ${data.materials?.length ?? 0}, график ${data.scheduleItems?.length ?? 0}.`);
      void loadImportHistory();
      void loadPipeline();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Ошибка сохранения импорта.");
    } finally {
      setSaving("");
    }
  }

  async function deleteProject() {
    if (!canDeleteCurrentProject || deleteProjectName !== initialBundle.project.name || !deleteProjectConfirm) {
      setError("Для удаления нужен OWNER/ADMIN, чекбокс и точное имя проекта.");
      return;
    }
    setSaving("project-delete");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true, projectName: deleteProjectName })
      });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить проект.");
      setDeleteProjectDone(true);
      window.setTimeout(() => {
        window.location.assign("/projects");
      }, 700);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления проекта.");
    } finally {
      setSaving("");
    }
  }

  return (
    <main className="page">
      <div className="page-header project-header">
        <div className="page-header-main">
          <div className="eyebrow">{initialBundle.project.customer}</div>
          <div className="project-title-row">
            <h1>{initialBundle.project.name}</h1>
            <StatusBadge tone="good">В работе</StatusBadge>
          </div>
          <div className="project-summary">
            <span>{initialBundle.project.object}</span>
            <span>{initialBundle.project.address}</span>
            <span>РП: {initialBundle.project.manager}</span>
          </div>
          <div className="project-state-strip">
            <StatePill label="Готовность" value={percent(works.completionPercent)} tone="info" />
            <StatePill label="Срок" value={`${formatDate(initialBundle.project.startsAt)} - ${formatDate(initialBundle.project.endsAt)}`} tone={delayedWorks.length ? "bad" : "neutral"} />
            <StatePill label="Бюджет" value={compactMoney(initialBundle.project.contractAmount)} tone="neutral" />
            <StatePill label="Отклонение" value={compactMoney(budgetDeviation)} tone={budgetDeviation > 0 ? "bad" : "good"} />
            <StatePill label="Риски" value={String(activeRisks.length)} tone={activeRisks.length ? "warn" : "good"} />
            <StatePill label="Заявки" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} />
          </div>
        </div>
        <div className="page-header-actions">
          <button className="button secondary" type="button" onClick={() => setActiveTab("Бюджет / ВОР")}>
            <Table2 size={18} />
            Импорт ВОР
          </button>
          <button className="button secondary" type="button" onClick={() => setActiveTab("Рапорты")}>
            <ClipboardList size={18} />
            Добавить рапорт
          </button>
          <button className="button primary" type="button" onClick={() => setActiveTab("AI-помощник")}>
            <Bot size={18} />
            AI-анализ
          </button>
        </div>
      </div>

      <section className="grid grid-4">
        <Kpi title="Договор" value={compactMoney(initialBundle.project.contractAmount)} />
        <Kpi title="Прогнозная прибыль" value={compactMoney(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
        <Kpi title="Готовность" value={percent(works.completionPercent)} />
        <Kpi title="Кассовый разрыв" value={compactMoney(finance.cashGap)} tone={finance.cashGap < 0 ? "bad" : "good"} />
        <Kpi title="Факт / прогноз" value={compactMoney(budget.totalForecastCost)} tone={budgetDeviation > 0 ? "bad" : "good"} />
        <Kpi title="Остаток бюджета" value={compactMoney(Math.max(initialBundle.project.contractAmount - budget.totalForecastCost, 0))} />
        <Kpi title="Срок проекта" value={`${formatDate(initialBundle.project.startsAt)} - ${formatDate(initialBundle.project.endsAt)}`} />
        <Kpi title="Заявки" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} />
      </section>

      <section className="priority-ribbon" aria-label="Приоритеты проекта">
        {priorityActions.map((action, index) => (
          <button className="priority-chip" key={action} type="button" onClick={() => setActiveTab(index === 0 ? "Бюджет / ВОР" : index === 1 ? "График" : index === 2 ? "Материалы" : "Риски")}>
            <span>{index + 1}</span>
            {action}
          </button>
        ))}
      </section>

      <div className="workspace-layout" style={{ marginTop: 18 }}>
        <div>
          <div className="tabs project-tabs" aria-label="Разделы проекта">
            {tabs.map((tab) => (
              <button className={`tab ${activeTab === tab ? "active" : ""}`} key={tab} onClick={() => setActiveTab(tab)}>
                <span className="tab-code">{tabMeta[tab]?.code}</span>
                <span className="tab-icon">{tabMeta[tab]?.icon}</span>
                <span>
                  <strong>{tab}</strong>
                  <small>{tabMeta[tab]?.hint}</small>
                </span>
              </button>
            ))}
          </div>
          {(saving || error) && (
            <div className={`panel ${error ? "delta-bad" : "muted"}`} style={{ marginBottom: 16 }}>
              {error || `Сохраняю: ${saving}`}
            </div>
          )}

          {activeTab === "Обзор" && (
            <section className="stack">
              {showOnboardingPanel && <ProjectWorkspaceOnboardingPanel created={createdFromOnboarding} onNavigate={setActiveTab} plan={onboardingPlan} />}
              <ProjectCommandCenter
                project={initialBundle.project}
                budgetItems={budgetItems}
                scheduleItems={scheduleItems}
                materials={materials}
                procurementRequests={procurementRequests}
                payments={payments}
                dailyReports={reports}
                risks={risks}
                documents={documents}
                readiness={readiness}
                documentChecklist={documentChecklist}
                importHistory={importHistory}
                intelligence={intelligence}
                aiInsight={aiResults.summary ?? aiResults["executive-report"] ?? null}
                aiLoading={aiScenarioLoading === "summary" || aiScenarioLoading === "executive-report"}
                onNavigate={setActiveTab}
                onDrilldown={openIntelligenceSection}
                onRunAiSummary={() => {
                  void runAiCommandScenario("summary");
                }}
              />
              <ProjectIntelligenceDrilldown
                project={initialBundle.project}
                budgetItems={budgetItems}
                scheduleItems={scheduleItems}
                materials={materials}
                procurementRequests={procurementRequests}
                payments={payments}
                dailyReports={reports}
                risks={risks}
                documents={documents}
                readiness={readiness}
                documentChecklist={documentChecklist}
                importHistory={importHistory}
                intelligence={intelligence}
                aiResults={aiResults}
                aiErrors={aiErrors}
                aiLoading={aiScenarioLoading}
                onNavigate={setActiveTab}
                onRunAiScenario={(scenario) => {
                  void runAiCommandScenario(scenario);
                }}
              />
            </section>
          )}
      {activeTab === "Бюджет / ВОР" && (
        <Panel title="Бюджет, ВОР и классификация затрат" icon={<Table2 size={18} />}>
          <BudgetAnalytics items={budgetItems} contractAmount={initialBundle.project.contractAmount} paid={finance.incomingPayments} forecastProfit={budget.forecastProfit} />
          <ChangeOrdersWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            onNavigate={setActiveTab}
          />
          <ImportPanel
            file={importFile}
            mode={importMode}
            preview={importPreview}
            explanation={importExplanation}
            history={importHistory}
            result={importResult}
            previewFilter={importPreviewFilter}
            confirmed={importConfirmed}
            loading={saving.startsWith("import-")}
            onFileChange={(file) => {
              setImportFile(file);
              setImportPreview(null);
              setImportExplanation(null);
              setImportResult(null);
              setImportConfirmed(false);
            }}
            onModeChange={setImportMode}
            onPreviewFilterChange={setImportPreviewFilter}
            onPreview={() => void previewImport()}
            onRemap={(mapping) => void remapImport(mapping)}
            onExplain={() => void explainImport()}
            onConfirmChange={setImportConfirmed}
            onCommit={() => void commitImport()}
            onNavigate={setActiveTab}
          />
          <PostImportActionPanel actions={postImportActions} result={importResult} onNavigate={setActiveTab} />
          <BudgetForm
            onAdd={async (item) => {
              const saved = await createResource<BudgetItem>("budget", {
                source: "Ручной ввод",
                actualUnitPrice: item.plannedUnitPrice,
                forecastUnitPrice: item.plannedUnitPrice,
                ...item
              });
              setBudgetItems((current) => [...current, saved]);
            }}
          />
          {editingBudget && (
            <BudgetEditForm
              item={editingBudget}
              onCancel={() => setEditingBudget(null)}
              onSave={async (payload) => {
                const saved = await updateResource<BudgetItem>("budget", editingBudget.id, payload);
                setBudgetItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingBudget(null);
              }}
            />
          )}
          <BudgetTable
            items={budgetItems}
            importHistory={importHistory}
            filter={budgetTableFilter}
            onFilterChange={setBudgetTableFilter}
            onEdit={setEditingBudget}
            onDelete={async (item) => {
              await deleteResource("budget", item.id);
              setBudgetItems((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
        </Panel>
      )}

      {activeTab === "График" && (
        <Panel title="Календарный график работ" icon={<TimerReset size={18} />}>
          <ScheduleCashflowWorkspace
            projectName={initialBundle.project.name}
            projectStartsAt={initialBundle.project.startsAt}
            projectEndsAt={initialBundle.project.endsAt}
            contractAmount={initialBundle.project.contractAmount}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            importHistory={importHistory}
            draft={pipelineDraft}
            loading={pipelineLoading}
            onSchedulePreview={() => void runPipelineDraft("schedule")}
            onScheduleCommit={() => void runPipelineDraft("schedule", true)}
            onCashflowPreview={() => void runPipelineDraft("cashflow")}
            onCashflowCommit={() => void runPipelineDraft("cashflow", true)}
            onNavigate={setActiveTab}
          />
          <PipelineDraftPanel
            kind="schedule"
            draft={pipelineDraft}
            loading={pipelineLoading}
            onPreview={() => void runPipelineDraft("schedule")}
            onCommit={() => void runPipelineDraft("schedule", true)}
          />
          <TimelineView items={scheduleItems} />
          <ScheduleForm
            onAdd={async (item) => {
              const saved = await createResource<ScheduleItem>("schedule", { actualQty: 0, status: "not_started", ...item });
              setScheduleItems((current) => [...current, saved]);
            }}
          />
          {editingSchedule && (
            <ScheduleEditForm
              item={editingSchedule}
              onCancel={() => setEditingSchedule(null)}
              onSave={async (payload) => {
                const saved = await updateResource<ScheduleItem>("schedule", editingSchedule.id, payload);
                setScheduleItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingSchedule(null);
              }}
            />
          )}
          <ScheduleTable
            items={scheduleItems}
            onEdit={setEditingSchedule}
            onDelete={async (item) => {
              await deleteResource("schedule", item.id);
              setScheduleItems((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
        </Panel>
      )}

      {activeTab === "Материалы" && (
        <Panel title="Материалы и снабжение" icon={<Package size={18} />}>
          <ProcurementIntelligenceWorkspace
            projectName={initialBundle.project.name}
            materials={materials}
            procurementRequests={procurementRequests}
            importHistory={importHistory}
            draft={pipelineDraft}
            loading={pipelineLoading}
            onPreview={() => void runPipelineDraft("procurement")}
            onCommit={() => void runPipelineDraft("procurement", true)}
            onNavigate={setActiveTab}
          />
          <MaterialHealth items={materials} />
          {editingMaterial && (
            <MaterialEditForm
              item={editingMaterial}
              onCancel={() => setEditingMaterial(null)}
              onSave={async (payload) => {
                const saved = await updateResource<Material>("materials", editingMaterial.id, payload);
                setMaterials((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingMaterial(null);
              }}
            />
          )}
          <MaterialTable
            items={materials}
            filter={materialTableFilter}
            onFilterChange={setMaterialTableFilter}
            onEdit={setEditingMaterial}
            onDelete={async (item) => {
              await deleteResource("materials", item.id);
              setMaterials((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
          <button
            className="button primary"
            style={{ marginTop: 14 }}
            onClick={async () => {
              const saved = await createResource<Material>("materials", {
                name: "Кабель",
                unit: "м",
                requiredQty: 500,
                orderedQty: 0,
                deliveredQty: 0,
                consumedQty: 0,
                plannedUnitPrice: 240,
                actualUnitPrice: 0,
                supplier: "Не выбран",
                neededAt: new Date().toISOString().slice(0, 10),
                status: "required"
              });
              setMaterials((current) => [...current, saved]);
            }}
          >
            <Plus size={18} />
            Добавить материал
          </button>
        </Panel>
      )}

      {activeTab === "Заявки" && (
        <Panel title="Заявки снабжению" icon={<Truck size={18} />}>
          <PipelineDraftPanel
            kind="procurement"
            draft={pipelineDraft}
            loading={pipelineLoading}
            onPreview={() => void runPipelineDraft("procurement")}
            onCommit={() => void runPipelineDraft("procurement", true)}
          />
          <ProcurementPipeline items={procurementRequests} />
          <RequestTable items={procurementRequests} />
        </Panel>
      )}

      {activeTab === "Финансы" && (
        <Panel title="Платежи и кассовый план" icon={<Landmark size={18} />}>
          <CostToCompleteWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            onNavigate={setActiveTab}
          />
          <ScheduleCashflowWorkspace
            projectName={initialBundle.project.name}
            projectStartsAt={initialBundle.project.startsAt}
            projectEndsAt={initialBundle.project.endsAt}
            contractAmount={initialBundle.project.contractAmount}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            importHistory={importHistory}
            draft={pipelineDraft}
            loading={pipelineLoading}
            onSchedulePreview={() => void runPipelineDraft("schedule")}
            onScheduleCommit={() => void runPipelineDraft("schedule", true)}
            onCashflowPreview={() => void runPipelineDraft("cashflow")}
            onCashflowCommit={() => void runPipelineDraft("cashflow", true)}
            onNavigate={setActiveTab}
          />
          <PipelineDraftPanel
            kind="cashflow"
            draft={pipelineDraft}
            loading={pipelineLoading}
            onPreview={() => void runPipelineDraft("cashflow")}
            onCommit={() => void runPipelineDraft("cashflow", true)}
          />
          <FinanceCommand payments={payments} contractAmount={initialBundle.project.contractAmount} forecastProfit={budget.forecastProfit} />
          <PaymentForm
            onAdd={async (payment) => {
              const saved = await createResource<Payment>("finance", { status: "planned", ...payment });
              setPayments((current) => [...current, saved]);
            }}
          />
          <PaymentTable items={payments} />
        </Panel>
      )}

      {activeTab === "Договор / Тендер" && (
        <Panel title="Договор, тендер и КП" icon={<Search size={18} />}>
          <ContractTenderWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <ClaimsNoticesWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
        </Panel>
      )}

      {activeTab === "КП / Подача" && (
        <Panel title="КП, коммерческое предложение и тендерная подача" icon={<Send size={18} />}>
          <CommercialProposalWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            readiness={readiness}
            documentChecklist={documentChecklist}
            importHistory={importHistory}
            onNavigate={setActiveTab}
          />
        </Panel>
      )}

      {activeTab === "КС" && (
        <Panel title="КС, закрытие и предъявление заказчику" icon={<ReceiptText size={18} />}>
          <AcceptanceBillingWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            importHistory={importHistory}
            onNavigate={setActiveTab}
          />
          <PhotoEvidenceWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <QualityIssuesWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
        </Panel>
      )}

      {activeTab === "Исполнение" && (
        <Panel title="Подрядчики, фронты и контроль исполнения" icon={<Users size={18} />}>
          <SubcontractorExecutionWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            payments={payments}
            procurementRequests={procurementRequests}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <HseSafetyPermitWorkspace
            project={initialBundle.project}
            scheduleItems={scheduleItems}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
        </Panel>
      )}

      {activeTab === "Рапорты" && (
        <Panel title="Ежедневные рапорты стройплощадки" icon={<ClipboardList size={18} />}>
          <FieldOperationsWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <ResourcesEquipmentWorkspace
            project={initialBundle.project}
            dailyReports={reports}
            scheduleItems={scheduleItems}
            onNavigate={setActiveTab}
          />
          <QualityIssuesWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <PhotoEvidenceWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <RiskExecutiveWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            readiness={readiness}
            documentChecklist={documentChecklist}
            intelligence={intelligence}
            importHistory={importHistory}
            aiLoading={aiScenarioLoading === "executive-report"}
            onNavigate={setActiveTab}
            onRunExecutiveAi={() => void runAiCommandScenario("executive-report")}
          />
          <ReportCards items={reports} />
          <button
            className="button primary"
            onClick={async () => {
              const saved = await createResource<DailyReport>("daily-reports", {
                date: new Date().toISOString().slice(0, 10),
                author: "Прораб",
                weather: "Без осадков",
                workers: 18,
                engineers: 2,
                equipment: "Кран, самосвалы",
                completedWorks: "Заполните выполненные объемы",
                materialsReceived: "",
                materialsConsumed: "",
                downtime: "",
                issues: "",
                status: "draft"
              });
              setReports((current) => [saved, ...current]);
            }}
          >
            <Plus size={18} />
            Создать рапорт
          </button>
          <ReportTable items={reports} />
        </Panel>
      )}

      {activeTab === "Риски" && (
        <Panel title="Риски и отклонения" icon={<AlertTriangle size={18} />}>
          <RiskExecutiveWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            readiness={readiness}
            documentChecklist={documentChecklist}
            intelligence={intelligence}
            importHistory={importHistory}
            aiLoading={aiScenarioLoading === "risk-review" || aiScenarioLoading === "executive-report"}
            onNavigate={setActiveTab}
            onRunExecutiveAi={() => void runAiCommandScenario("executive-report")}
          />
          <QualityIssuesWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <RiskMatrix items={allRisks} />
          <button
            className="button primary"
            onClick={async () => {
              const saved = await createResource<Risk>("risks", {
                title: "Новый риск",
                reason: "Опишите причину и требуемое решение.",
                priority: "medium",
                owner: "РП",
                dueAt: new Date().toISOString().slice(0, 10),
                status: "open"
              });
              setRisks((current) => [...current, saved]);
            }}
          >
            <Plus size={18} />
            Добавить риск
          </button>
          <RiskTable items={allRisks} />
        </Panel>
      )}

      {activeTab === "Документы" && (
        <Panel title="Документы проекта" icon={<FileText size={18} />}>
          <DocumentComplianceWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            importHistory={importHistory}
            onNavigate={setActiveTab}
          />
          <PhotoEvidenceWorkspace
            project={initialBundle.project}
            budgetItems={budgetItems}
            scheduleItems={scheduleItems}
            materials={materials}
            procurementRequests={procurementRequests}
            payments={payments}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <HseSafetyPermitWorkspace
            project={initialBundle.project}
            scheduleItems={scheduleItems}
            dailyReports={reports}
            risks={risks}
            documents={documents}
            documentChecklist={documentChecklist}
            onNavigate={setActiveTab}
          />
          <DocumentChecklistPanel items={documentChecklist} />
          <div className="form-grid form-surface">
            <label>
              Категория
              <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)}>
                <option value="договор">Договор</option>
                <option value="смета">Смета</option>
                <option value="вор">ВОР</option>
                <option value="исполнительная">Исполнительная</option>
                <option value="кс">КС</option>
                <option value="фото">Фото</option>
                <option value="прочее">Прочее</option>
              </select>
            </label>
            <label>
              Файл
              <input accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip" type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              &nbsp;
              <button className="button primary" type="button" disabled={!documentFile || saving === "document-upload"} onClick={() => void uploadDocument()}>
                Загрузить
              </button>
            </label>
          </div>
          <DocumentTable
            items={documents}
            projectId={initialBundle.project.id}
            versions={documentVersions}
            onLoadVersions={(document) => {
              void loadDocumentVersions(document);
            }}
            onUploadVersion={(document, file) => {
              void uploadDocumentVersion(document, file);
            }}
            onDelete={(document) => {
              void deleteDocument(document);
            }}
          />
          <DocumentCards items={documents} projectId={initialBundle.project.id} />
        </Panel>
      )}

      {activeTab === "Аналитика" && (
        <Panel title="Project Intelligence" icon={<BarChart3 size={18} />}>
          <ProjectIntelligencePanel readiness={readiness} intelligence={intelligence} actions={postImportActions} onNavigate={setActiveTab} />
        </Panel>
      )}

      {activeTab === "Действия" && (
        <ProjectActionCenter
          projectId={initialBundle.project.id}
          canEdit={currentUser?.role === "OWNER" || currentUser?.role === "ADMIN" || currentUser?.role === "MANAGER"}
          canApprove={currentUser?.role === "OWNER" || currentUser?.role === "ADMIN"}
          onNavigate={setActiveTab}
          suggestions={actionSuggestions}
        />
      )}

      {activeTab === "Участники" && (
        <Panel title="Участники проекта" icon={<Users size={18} />}>
          <div className="form-grid form-surface">
            <label>
              Email пользователя
              <input value={memberEmail} placeholder="manager@company.ru" onChange={(event) => setMemberEmail(event.target.value)} />
            </label>
            <label>
              Проектная роль
              <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as ProjectMember["role"])}>
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </label>
            <label>
              &nbsp;
              <button className="button primary" type="button" disabled={!memberEmail || saving === "members"} onClick={() => void addProjectMember()}>
                <Plus size={18} />
                Добавить
              </button>
            </label>
          </div>
          <ProjectMembersTable
            items={members}
            onRoleChange={(member, role) => {
              void updateProjectMember(member.id, role);
            }}
            onRemove={(member) => {
              void removeProjectMember(member.id);
            }}
          />
        </Panel>
      )}

      {activeTab === "История" && (
        <Panel title="Журнал изменений" icon={<ClipboardList size={18} />}>
          <div className="toolbar">
            <a className="button secondary" href={`/api/projects/${initialBundle.project.id}/export/json`}>
              Экспорт проекта JSON
            </a>
            <a className="button secondary" href={`/api/projects/${initialBundle.project.id}/audit/export/json`}>
              Экспорт истории JSON
            </a>
          </div>
          <AuditTable items={auditEvents} />
        </Panel>
      )}

      {activeTab === "Настройки" && (
        <Panel title="Настройки проекта" icon={<Trash2 size={18} />}>
          <ProjectDeleteDangerZone
            projectName={initialBundle.project.name}
            canDelete={canDeleteCurrentProject}
            roleLoaded={currentUserLoaded}
            role={currentUser?.role}
            confirmationName={deleteProjectName}
            confirmed={deleteProjectConfirm}
            saving={saving === "project-delete"}
            deleted={deleteProjectDone}
            onNameChange={setDeleteProjectName}
            onConfirmChange={setDeleteProjectConfirm}
            onDelete={() => void deleteProject()}
          />
        </Panel>
      )}

      {activeTab === "AI-помощник" && (
        <Panel title="AI Command Layer" icon={<Bot size={18} />} className="ai-panel">
          <div className="ai-source-row">
            <StatusBadge tone="info">Источник: ВОР</StatusBadge>
            <StatusBadge tone="info">График</StatusBadge>
            <StatusBadge tone="info">Материалы</StatusBadge>
            <StatusBadge tone="info">Финансы</StatusBadge>
            <StatusBadge tone="info">Рапорты и риски</StatusBadge>
          </div>
          <div className="ai-composer">
            <label>
              Дополнительные указания для сценариев
              <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
            </label>
          </div>
          <div className="ai-scenario-grid">
            {drilldownAiScenarios.map((scenario) => (
              <AiScenarioCard
                key={scenario.scenario}
                config={scenario}
                error={aiErrors[scenario.scenario]}
                loading={aiScenarioLoading === scenario.scenario}
                result={aiResults[scenario.scenario]}
                onRun={() => void runAiCommandScenario(scenario.scenario)}
              />
            ))}
          </div>
        </Panel>
      )}
        </div>

        <aside className="panel stack context-panel">
          <div>
            <div className="eyebrow">Контекст проекта</div>
            <h2>Что проверить</h2>
            <p className="muted">Короткая панель для РП и ПТО: риски, сроки, снабжение и финансовые отклонения.</p>
          </div>
          <div className="attention-list">
            <ContextItem title="Бюджет / факт" value={compactMoney(budgetDeviation)} tone={budgetDeviation > 0 ? "bad" : "good"} />
            <ContextItem title="Просроченные работы" value={String(delayedWorks.length)} tone={delayedWorks.length ? "bad" : "good"} />
            <ContextItem title="Открытые риски" value={String(activeRisks.length)} tone={activeRisks.length ? "warn" : "good"} />
            <ContextItem title="Заявки снабжению" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} />
          </div>
          <div className="context-block">
            <h3>Что сделать сегодня</h3>
            <ul className="action-list">
              <li>{delayedWorks[0]?.name ?? "Проверить график и подтвердить отсутствие новых просрочек"}</li>
              <li>{urgentMaterial ? `Закрыть дефицит: ${urgentMaterial.name}` : "Сверить потребность материалов на ближайшие работы"}</li>
              <li>{activeRisks[0]?.title ?? "Обновить реестр рисков после планерки"}</li>
            </ul>
          </div>
          <div className="context-block">
            <h3>Последнее событие</h3>
            <p className="muted">{latestReport ? `${formatDate(latestReport.date)} · ${latestReport.completedWorks}` : "Рапортов пока нет. Добавьте ежедневный рапорт после смены."}</p>
          </div>
          <div className="context-block audit-glimpse">
            <h3>След аудита</h3>
            <p className="muted">
              {latestAudit
                ? `${new Date(latestAudit.createdAt).toLocaleString("ru-RU")} · ${latestAudit.actorName ?? "local-user"} · ${latestAudit.summary ?? latestAudit.action}`
                : "История изменений появится после первого действия по проекту."}
            </p>
            <button className="button secondary" type="button" onClick={() => setActiveTab("История")}>
              Открыть журнал
            </button>
          </div>
          <div className="stack">
            <h3>AI-рекомендации</h3>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void runAiCommandScenario("risk-review");
            }}>
              Проверить риски проекта
            </button>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void runAiCommandScenario("budget-review");
            }}>
              Сравнить бюджет и факт
            </button>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void runAiCommandScenario("executive-report");
            }}>
              Подготовить записку
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function tabForAction(action: PipelineAction) {
  const map: Record<string, string> = {
    budget: "Бюджет / ВОР",
    materials: "Материалы",
    procurement: "Заявки",
    schedule: "График",
    finance: "Финансы",
    acceptance: "КС",
    billing: "КС",
    ks: "КС",
    documents: "Документы",
    risks: "Риски",
    import: "Бюджет / ВОР",
    ai: "Аналитика"
  };
  return map[action.category] ?? "Обзор";
}

function DataReadinessPanel({ readiness, actions, onNavigate }: { readiness: PipelineReadiness | null; actions: PipelineAction[]; onNavigate: (tab: string) => void }) {
  if (!readiness) {
    return (
      <Panel title="Готовность данных проекта" icon={<BarChart3 size={18} />}>
        <EmptyState text="Данные pipeline еще загружаются." />
      </Panel>
    );
  }
  return (
    <Panel title="Готовность данных проекта" icon={<BarChart3 size={18} />}>
      <div className="metric-strip">
        <Kpi title="Готовность" value={`${readiness.score}%`} tone={readiness.score >= 70 ? "good" : readiness.score >= 40 ? "warn" : "bad"} />
        <Kpi title="Импорты" value={String(readiness.counts.committedImports)} />
        <Kpi title="Материалы из ВОР" value={String(readiness.counts.importedMaterials)} />
        <Kpi title="Расчетные риски" value={String(readiness.counts.calculatedRisks)} tone={readiness.counts.calculatedRisks ? "warn" : "good"} />
      </div>
      <p className="muted">{readiness.summary}</p>
      <div className="readiness-grid">
        {readiness.checks.map((check) => (
          <div className="attention-item" key={check.key}>
            <StatusBadge tone={check.passed ? "good" : "warn"}>{check.passed ? "OK" : "Нужно"}</StatusBadge>
            <strong>{check.label}</strong>
            <span className="muted">{check.detail}</span>
          </div>
        ))}
      </div>
      <PostImportActionPanel actions={actions.slice(0, 5)} onNavigate={onNavigate} compact />
    </Panel>
  );
}

function PostImportActionPanel({
  actions,
  result,
  onNavigate,
  compact = false
}: {
  actions: PipelineAction[];
  result?: Record<string, unknown> | null;
  onNavigate: (tab: string) => void;
  compact?: boolean;
}) {
  if (!actions.length && !result) return null;
  return (
    <section className={`wizard-section ${compact ? "compact" : ""}`}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div>
          <h3>Следующие шаги по проекту</h3>
          <p className="muted">После загрузки ВОР система показывает, какие блоки можно обновить и где не хватает данных.</p>
        </div>
        {result && <StatusBadge tone="good">Данные проекта обновлены</StatusBadge>}
      </div>
      <div className="action-grid">
        {actions.map((action) => (
          <button
            className="button secondary action-button"
            disabled={action.enabled === false}
            key={action.id}
            title={action.enabled === false ? action.disabledReason ?? undefined : action.suggestedNextStep}
            type="button"
            onClick={() => onNavigate(tabForAction(action))}
          >
            <span>
              <strong>{action.title}</strong>
              <small>{action.enabled === false ? action.disabledReason : action.suggestedNextStep}</small>
            </span>
          </button>
        ))}
      </div>
    </section>
  );
}

function PipelineDraftPanel({
  kind,
  draft,
  loading,
  onPreview,
  onCommit
}: {
  kind: PipelineDraftKind;
  draft: PipelineDraftState | null;
  loading: string;
  onPreview: () => void;
  onCommit: () => void;
}) {
  const isCurrent = draft?.kind === kind;
  const labels: Record<PipelineDraftKind, { title: string; preview: string; commit: string }> = {
    procurement: { title: "Закупки из ВОР", preview: "Предпросмотр заявок", commit: "Создать черновики заявок" },
    schedule: { title: "Черновой график из ВОР", preview: "Предпросмотр графика", commit: "Создать черновой график" },
    cashflow: { title: "Черновой cashflow из ВОР", preview: "Предпросмотр cashflow", commit: "Создать cashflow" }
  };
  const rows = isCurrent ? draft.draft.items.slice(0, 12) : [];
  const summary = isCurrent ? draft.draft.summary : {};
  return (
    <div className="wizard-section">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div>
          <h3>{labels[kind].title}</h3>
          <p className="muted">Preview не меняет проект. Commit создает только черновые записи после явного подтверждения.</p>
        </div>
        <div className="row-actions">
          <button className="button secondary" disabled={Boolean(loading)} type="button" onClick={onPreview}>
            {loading === `${kind}-preview` ? "Готовлю..." : labels[kind].preview}
          </button>
          <button className="button primary" disabled={!isCurrent || !rows.length || Boolean(loading)} type="button" onClick={onCommit}>
            {loading === `${kind}-commit` ? "Создаю..." : labels[kind].commit}
          </button>
        </div>
      </div>
      {isCurrent && (
        <div className="stack">
          <div className="import-meta">
            {Object.entries(summary).map(([key, value]) => (
              <span className="muted" key={key}>{key}: {String(value)}</span>
            ))}
            {draft.mode === "commit" && <StatusBadge tone="good">Commit выполнен</StatusBadge>}
          </div>
          <DataTable
            headers={kind === "procurement" ? ["Материал", "Потребность", "Заказано", "Доставлено", "Дефицит", "Действие"] : kind === "schedule" ? ["Этап", "Работ", "Сумма", "Длительность", "Статус", "Warnings"] : ["Раздел", "Сумма", "Период", "Warning"]}
            rows={rows.map((item) =>
              kind === "procurement"
                ? [String(item.material ?? "-"), String(item.requiredQty ?? 0), String(item.orderedQty ?? 0), String(item.deliveredQty ?? 0), String(item.deficit ?? 0), String(item.suggestedAction ?? "-")]
                : kind === "schedule"
                  ? [String(item.stage ?? item.name ?? "-"), String(item.works ?? 0), compactMoney(Number(item.amount ?? 0)), `${String(item.suggestedDurationDays ?? "-")} дн.`, String(item.status ?? "-"), Array.isArray(item.warnings) ? item.warnings.join("; ") : "-"]
                  : [String(item.section ?? "-"), compactMoney(Number(item.amount ?? 0)), String(item.period ?? "нужны даты"), String(item.warning ?? "-")]
            )}
          />
        </div>
      )}
    </div>
  );
}

function DocumentChecklistPanel({ items }: { items: DocumentChecklistItem[] }) {
  if (!items.length) return <EmptyState text="Checklist документов еще не загружен." />;
  return (
    <div className="wizard-section">
      <h3>Checklist документов</h3>
      <DataTable
        headers={["Документ", "Статус", "Связи", "Следующий шаг"]}
        rows={items.map((item) => [
          item.title,
          <StatusBadge key="status" tone={item.status === "present" ? "good" : "warn"}>{item.status === "present" ? "Есть" : "Не хватает"}</StatusBadge>,
          item.documentIds.length ? item.documentIds.length : item.evidence.some((evidence) => evidence.importBatchId) ? "ВОР загружен" : "-",
          item.suggestedNextStep
        ])}
      />
    </div>
  );
}

function ProjectIntelligencePanel({
  readiness,
  intelligence,
  actions,
  onNavigate
}: {
  readiness: PipelineReadiness | null;
  intelligence: IntelligenceState | null;
  actions: PipelineAction[];
  onNavigate: (tab: string) => void;
}) {
  return (
    <div className="stack">
      {readiness && <DataReadinessPanel readiness={readiness} actions={actions} onNavigate={onNavigate} />}
      {intelligence ? (
        <>
          <div className="grid grid-2">
            <div className="panel">
              <h3>Top risks</h3>
              <div className="stack">
                {intelligence.topRisks.slice(0, 6).map((risk) => (
                  <div className="attention-item" key={risk.id}>
                    <StatusBadge tone={risk.priority === "critical" || risk.priority === "high" ? "bad" : risk.priority === "medium" ? "warn" : "info"}>{readableStatus(risk.priority)}</StatusBadge>
                    <strong>{risk.title}</strong>
                    <span className="muted">{risk.description}</span>
                  </div>
                ))}
                {!intelligence.topRisks.length && <EmptyState text="Расчетных рисков нет." />}
              </div>
            </div>
            <div className="panel">
              <h3>Missing data</h3>
              <ul className="action-list">
                {intelligence.missingData.slice(0, 10).map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          </div>
          <PreviewTable
            title="Deterministic quick actions"
            headers={["Действие", "Ответ без live AI"]}
            rows={intelligence.quickActions.map((item) => [item.title, item.deterministicAnswer])}
          />
        </>
      ) : (
        <EmptyState text="Project intelligence еще загружается." />
      )}
    </div>
  );
}

function ImportPanel({
  file,
  mode,
  preview,
  explanation,
  history,
  result,
  previewFilter,
  confirmed,
  loading,
  onFileChange,
  onModeChange,
  onPreviewFilterChange,
  onPreview,
  onRemap,
  onExplain,
  onConfirmChange,
  onCommit,
  onNavigate
}: {
  file: File | null;
  mode: ImportMode;
  preview: ImportPreview | null;
  explanation: ImportExplanation | null;
  history: ImportHistoryItem[];
  result: Record<string, unknown> | null;
  previewFilter: string;
  confirmed: boolean;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onModeChange: (mode: ImportMode) => void;
  onPreviewFilterChange: (filter: string) => void;
  onPreview: () => void;
  onRemap: (mapping: ImportSheetMapping[]) => void;
  onExplain: () => void;
  onConfirmChange: (confirmed: boolean) => void;
  onCommit: () => void;
  onNavigate: (tab: string) => void;
}) {
  const canCommit = Boolean(preview?.importBatchId && preview.summary.errors === 0 && confirmed && !loading);
  const replacementMode = mode !== "append";
  const explanationToShow = explanation ?? preview?.explanation ?? null;
  const [mappingDraft, setMappingDraft] = useState<ImportSheetMapping[]>([]);

  useEffect(() => {
    setMappingDraft(preview?.mapping ?? []);
  }, [preview?.importBatchId, preview?.mapping]);

  const filteredRows = (preview?.previewRows ?? []).filter((row) => {
    if (previewFilter === "all") return true;
    if (previewFilter === "ready") return row.status === "ready";
    if (previewFilter === "warnings") return row.status === "warning";
    if (previewFilter === "errors") return row.status === "error";
    if (previewFilter === "skipped") return row.status === "skipped";
    if (previewFilter === "works") return row.entityType === "budgetItem";
    if (previewFilter === "materials") return row.entityType === "material";
    if (previewFilter === "unknown") return row.entityType === "unknown";
    return true;
  });
  const visiblePreviewRows = filteredRows.slice(0, 160);
  const warningRows = preview?.summary.warningRows ?? preview?.previewRows?.filter((row) => row.status === "warning").length ?? 0;
  const previewStatus = !preview ? "idle" : preview.summary.errors > 0 ? "blocked" : warningRows > 0 || preview.summary.unknownRows > 0 ? "needs_review" : "good";
  const importableRows = (preview?.summary.budgetItems ?? 0) + (preview?.summary.materials ?? 0) + (preview?.summary.scheduleItems ?? 0);
  const commitImpact = preview
    ? [
        `Режим: ${readableImportMode(mode)}`,
        `К сохранению: ${importableRows} записей`,
        `Warnings: ${preview.summary.warnings || warningRows}`,
        `Unknown: ${preview.summary.unknownRows}`,
        `Проект: ${preview.projectId}`
      ]
    : [];
  const wizardSteps = [
    ["Upload", Boolean(file)],
    ["Sheets", Boolean(preview)],
    ["Mapping", Boolean(preview)],
    ["Preview", Boolean(preview)],
    ["AI / Explanation", Boolean(explanationToShow)],
    ["Commit", Boolean(result)],
    ["Result", Boolean(result)]
  ] as const;

  return (
    <div className="panel stack import-panel import-wizard">
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div>
          <h3>AI-assisted импорт ВОР / сметы</h3>
          <p className="muted">Сначала безопасный preview без записи в рабочие данные проекта, затем ручная проверка, optional AI explanation по клику и только потом явный commit.</p>
        </div>
        <StatusBadge tone={previewStatus === "blocked" ? "bad" : previewStatus === "needs_review" ? "warn" : previewStatus === "good" ? "good" : "info"}>
          {readableImportPreviewStatus(previewStatus)}
        </StatusBadge>
      </div>

      <div className="wizard-steps">
        {wizardSteps.map(([step, done], index) => (
          <span className={`wizard-step ${done ? "done" : ""}`} key={step}>
            <strong>{index + 1}</strong>
            {step}
          </span>
        ))}
      </div>

      <section className="wizard-section">
        <div>
          <h3>1. Upload</h3>
          <p className="muted">Поддерживаются `.xlsx`, `.xls`, `.xlsm`; макросы не выполняются, формулы читаются по сохраненным значениям.</p>
          <p className="muted">Preview сохраняет только import batch и audit trail. Бюджет, материалы и график меняются только после нажатия commit.</p>
        </div>
        <div className="form-grid">
          <label>
            Excel-файл
            <input accept=".xlsx,.xls,.xlsm" type="file" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
          </label>
          <label>
            &nbsp;
            <button className="button secondary" disabled={!file || loading} onClick={onPreview} type="button">
              {loading ? "Проверяю..." : "Предпросмотр"}
            </button>
          </label>
        </div>
        {file && <p className="muted">Выбран файл: {file.name}</p>}
      </section>

      {preview && (
        <div className="stack">
          <section className="wizard-section">
            <div className="import-meta">
              <StatusBadge tone={preview.importBatchId ? "good" : "warn"}>{preview.importBatchId ? "Batch сохранен" : "Batch недоступен"}</StatusBadge>
              <StatusBadge tone={previewStatus === "blocked" ? "bad" : previewStatus === "needs_review" ? "warn" : "good"}>{readableImportPreviewStatus(previewStatus)}</StatusBadge>
              <span className="muted">Файл: {preview.fileName}</span>
              <span className="muted">Размер: {preview.fileSize ? `${Math.round(preview.fileSize / 1024)} KB` : "-"}</span>
              <span className="muted">Parser: {preview.parserVersion}</span>
              <span className="muted">Листы: {preview.sheets.join(", ") || "-"}</span>
            </div>
            <div className="grid grid-4">
              <Kpi title="Строки" value={String(preview.summary.totalRows)} />
              <Kpi title="Parsed" value={String(preview.summary.parsedRows)} tone={preview.summary.parsedRows ? "good" : "bad"} />
              <Kpi title="Ready" value={String(preview.summary.readyRows ?? 0)} tone={(preview.summary.readyRows ?? 0) ? "good" : undefined} />
              <Kpi title="Warnings" value={String(warningRows)} tone={warningRows ? "warn" : undefined} />
              <Kpi title="Errors" value={String(preview.summary.errorRows ?? preview.summary.errors)} tone={preview.summary.errors ? "bad" : "good"} />
            </div>
            <div className="grid grid-4">
              <Kpi title="ВОР" value={String(preview.summary.budgetItems)} />
              <Kpi title="Материалы" value={String(preview.summary.materials)} />
              <Kpi title="График" value={String(preview.summary.scheduleItems)} />
              <Kpi title="Unknown" value={String(preview.summary.unknownRows)} tone={preview.summary.unknownRows ? "warn" : "good"} />
              <Kpi title="Сумма preview" value={compactMoney(preview.summary.estimatedTotalAmount ?? 0)} />
            </div>
          </section>

          <section className="wizard-section">
            <h3>2. Sheets</h3>
            <DataTable
              headers={["Вкл.", "Лист", "Тип", "Confidence", "Header", "Строк", "Распознано", "Warnings"]}
              rows={mappingDraft.map((item, index) => [
                <input
                  aria-label={`Включить лист ${item.sheetName}`}
                  checked={item.included ?? true}
                  key={`${item.sheetName}-include`}
                  onChange={(event) =>
                    setMappingDraft((current) => current.map((candidate, candidateIndex) => (candidateIndex === index ? { ...candidate, included: event.target.checked } : candidate)))
                  }
                  type="checkbox"
                />,
                item.sheetName,
                readableImportSheetType(item.detectedType ?? "unknown"),
                `${Math.round((item.confidence ?? 0) * 100)}%`,
                item.headerRow ?? "-",
                item.rows,
                item.parsedRows,
                item.warnings.length
              ])}
            />
          </section>

          <section className="wizard-section">
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h3>3. Mapping</h3>
                <p className="muted">Поменяйте target field, если автоопределение выбрало не ту колонку. Изменения применяются server-side.</p>
              </div>
              <button className="button secondary" disabled={loading} onClick={() => onRemap(mappingDraft)} type="button">
                Применить mapping
              </button>
            </div>
            {mappingDraft.map((sheet, sheetIndex) => (
              <div className="mapping-card" key={sheet.sheetName}>
                <div className="mapping-card-header">
                  <strong>{sheet.sheetName}</strong>
                  <StatusBadge tone={(sheet.confidence ?? 0) >= 0.7 ? "good" : (sheet.confidence ?? 0) >= 0.45 ? "warn" : "bad"}>
                    {Math.round((sheet.confidence ?? 0) * 100)}%
                  </StatusBadge>
                </div>
                <div className="mapping-grid">
                  {(["name", "unit", "qty", "unitPrice", "total", "section", "note", "startsAt", "endsAt"] as const).map((target) => (
                    <label key={target}>
                      {readableColumnTarget(target)}
                      <select
                        value={sheet.columns[target] ?? ""}
                        onChange={(event) => {
                          const nextValue = event.target.value === "" ? undefined : Number(event.target.value);
                          setMappingDraft((current) =>
                            current.map((candidate, candidateIndex) =>
                              candidateIndex === sheetIndex
                                ? {
                                    ...candidate,
                                    columns: {
                                      ...candidate.columns,
                                      [target]: nextValue
                                    }
                                  }
                                : candidate
                            )
                          );
                        }}
                      >
                        <option value="">Исключить</option>
                        {(sheet.sampleRows?.[0] ?? []).map((header, index) => (
                          <option key={`${sheet.sheetName}-${target}-${index}`} value={index}>
                            {index + 1}. {header || "Пусто"}
                          </option>
                        ))}
                      </select>
                      <span className="muted">{sampleForColumn(sheet, sheet.columns[target])}</span>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className="wizard-section">
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h3>4. Preview</h3>
                <p className="muted">Показаны первые 160 строк из {filteredRows.length}. Commit блокируется при errors.</p>
              </div>
              <select value={previewFilter} onChange={(event) => onPreviewFilterChange(event.target.value)}>
                <option value="all">Все</option>
                <option value="ready">Ready</option>
                <option value="warnings">Warnings</option>
                <option value="errors">Errors</option>
                <option value="skipped">Skipped</option>
                <option value="works">Works</option>
                <option value="materials">Materials</option>
                <option value="unknown">Unknown</option>
              </select>
            </div>
            <DataTable
              headers={["Статус", "№", "Тип", "Категория", "Лист", "Строка", "Раздел", "Наименование", "Ед.", "Кол-во", "Цена", "Сумма", "Conf.", "Флаги"]}
              rows={visiblePreviewRows.map((row) => [
                <StatusBadge key={`${row.id}-status`} tone={row.status === "ready" ? "good" : row.status === "warning" ? "warn" : row.status === "error" ? "bad" : "neutral"}>
                  {row.status}
                </StatusBadge>,
                row.originalNumber || row.normalizedNumber || "-",
                readableImportEntity(row.entityType),
                readableImportRowKind(row.rowKind ?? "unknown"),
                row.sheetName,
                row.sourceRowNumber,
                row.section ?? "-",
                row.name ?? "-",
                row.unit ?? "-",
                row.quantity !== undefined ? String(row.quantity) : "-",
                row.unitPrice !== undefined ? money(row.unitPrice) : "-",
                row.totalAmount !== undefined ? money(row.totalAmount) : "-",
                row.confidence !== undefined ? `${Math.round(row.confidence * 100)}%` : "-",
                row.suspiciousFlags.join(", ") || "-"
              ])}
            />
          </section>

          {preview.unknownRows.length > 0 && (
            <section className="wizard-section">
              <div className="toolbar" style={{ marginBottom: 0 }}>
                <div>
                  <h3>Unknown / skipped review</h3>
                  <p className="muted">Эти строки не попадут в рабочий ВОР как реальные позиции. Проверьте их вручную или поправьте mapping.</p>
                </div>
                <StatusBadge tone="warn">{preview.unknownRows.length} строк</StatusBadge>
              </div>
              <DataTable
                headers={["Лист", "Строка", "Причина", "Значения"]}
                rows={preview.unknownRows.slice(0, 40).map((row) => [row.sheetName, row.rowNumber, row.reason, row.values.join(" · ")])}
              />
              {preview.unknownRows.length > 40 && <p className="muted">Показаны первые 40 unknown rows из {preview.unknownRows.length}.</p>}
            </section>
          )}

          <div className="import-meta">
            <StatusBadge tone={preview.summary.errors ? "bad" : "good"}>{preview.summary.errors ? "Commit заблокирован" : "Commit возможен после подтверждения"}</StatusBadge>
            <span className="muted">Скрытые строки: {preview.summary.hiddenRows}</span>
            <span className="muted">Формулы: {preview.summary.formulaCells}</span>
            <span className="muted">Дубли: {preview.summary.duplicateRows}</span>
          </div>

          {(preview.errors.length > 0 || preview.warnings.length > 0) && (
            <div className="grid grid-2">
              <MessageList title="Ошибки" items={preview.errors} tone="bad" />
              <MessageList title="Предупреждения" items={preview.warnings} tone="warn" />
            </div>
          )}

          <section className="wizard-section">
            <div className="toolbar" style={{ marginBottom: 0 }}>
              <div>
                <h3>5. AI / Assistant Explanation</h3>
                <p className="muted">AI получает только sanitized summary. Без OpenAI показывается расчетное объяснение.</p>
              </div>
              <button className="button secondary" disabled={!preview.importBatchId || loading} onClick={onExplain} type="button">
                Объяснить ошибки и риски
              </button>
            </div>
            {explanationToShow ? (
              <div className="explanation-box">
                <StatusBadge tone={explanationToShow.status === "ai" ? "good" : explanationToShow.status === "degraded" ? "warn" : "info"}>
                  {explanationToShow.status === "ai" ? "AI" : explanationToShow.status === "degraded" ? "Degraded fallback" : "Deterministic fallback"}
                </StatusBadge>
                <p>{explanationToShow.summary}</p>
                <div className="grid grid-2">
                  <MessageList title="Блокирующие ошибки" items={explanationToShow.blockingIssues} tone="bad" />
                  <MessageList title="Что проверить" items={explanationToShow.warningsToReview} tone="warn" />
                </div>
                <PreviewTable
                  title="Рекомендации"
                  headers={["Тип", "Действие"]}
                  rows={[
                    ...explanationToShow.suggestedMappingFixes.map((item) => ["Mapping", item]),
                    ...explanationToShow.recommendedNextSteps.map((item) => ["Next step", item])
                  ]}
                />
                <p className="muted">{explanationToShow.managementNote}</p>
              </div>
            ) : (
              <p className="muted">Нажмите “Объяснить ошибки и риски”, чтобы получить AI или deterministic explanation.</p>
            )}
          </section>

          <section className="wizard-section">
            <h3>6. Commit</h3>
            <div className="import-commit-summary">
              {commitImpact.map((item) => (
                <span key={item}>{item}</span>
              ))}
            </div>
            <div className="form-grid">
              <label>
                Режим сохранения
                <select value={mode} onChange={(event) => onModeChange(event.target.value as typeof mode)}>
                  <option value="append">Добавить к текущим данным</option>
                  <option value="replace_budget">Заменить только бюджет</option>
                  <option value="replace_materials">Заменить только материалы</option>
                  <option value="replace_budget_materials">Заменить бюджет и материалы</option>
                </select>
              </label>
              <label className="checkbox-row">
                <input checked={confirmed} onChange={(event) => onConfirmChange(event.target.checked)} type="checkbox" />
                {replacementMode ? "Я понимаю, что выбранные данные проекта будут заменены" : "Я проверил импортируемые данные"}
              </label>
              <label>
                &nbsp;
                <button className="button primary" disabled={!canCommit} onClick={onCommit} type="button">
                  {mode === "append" ? "Добавить строки" : "Выполнить замену"}
                </button>
              </label>
            </div>
          </section>
        </div>
      )}

      {result && (
        <section className="wizard-section">
          <h3>7. Result</h3>
          <div className="grid grid-4">
            <Kpi title="Created" value={String(result.created ?? 0)} tone="good" />
            <Kpi title="Skipped" value={String(result.skipped ?? 0)} tone={Number(result.skipped ?? 0) ? "warn" : undefined} />
            <Kpi title="Warnings" value={String(result.warnings ?? 0)} tone={Number(result.warnings ?? 0) ? "warn" : undefined} />
            <Kpi title="Errors" value={String(result.errors ?? 0)} tone={Number(result.errors ?? 0) ? "bad" : "good"} />
          </div>
          <div className="toolbar" style={{ marginBottom: 0 }}>
            <button className="button secondary" type="button" onClick={() => onNavigate("Бюджет / ВОР")}>
              Перейти к бюджету
            </button>
            <button className="button secondary" type="button" onClick={() => onNavigate("Материалы")}>
              Перейти к материалам
            </button>
            <button className="button secondary" type="button" onClick={() => onNavigate("Обзор")}>
              Project Intelligence
            </button>
            <button className="button secondary" type="button" onClick={() => onNavigate("AI-помощник")}>
              AI-рекомендации
            </button>
          </div>
        </section>
      )}

      <section className="wizard-section">
        <h3>История импортов</h3>
        <DataTable
          headers={["Дата", "Файл", "Статус", "Режим", "Created", "Skipped", "Warnings", "Errors", "Commit"]}
          rows={history.map((item) => {
            const commit = (item.summary?.commitResult ?? item.commitResult ?? {}) as Record<string, unknown>;
            return [
              formatDate(item.createdAt),
              item.fileName,
              readableStatus(item.status),
              item.mode ?? "-",
              String(commit.created ?? 0),
              String(commit.skipped ?? item.summary?.skippedRows ?? 0),
              String(commit.warnings ?? item.summary?.warnings ?? 0),
              String(commit.errors ?? item.summary?.errors ?? 0),
              item.committedAt ? formatDate(item.committedAt) : "-"
            ];
          })}
        />
      </section>
    </div>
  );
}

function readableImportSheetType(value: string) {
  const labels: Record<string, string> = {
    works: "Работы",
    materials: "Материалы",
    schedule: "График",
    mixed: "Смешанный",
    unknown: "Неизвестно"
  };
  return labels[value] ?? value;
}

function readableImportEntity(value: string) {
  const labels: Record<string, string> = {
    budgetItem: "ВОР",
    material: "Материал",
    scheduleItem: "График",
    section: "Раздел",
    unknown: "Неизвестно"
  };
  return labels[value] ?? value;
}

function readableImportRowKind(value: string) {
  const labels: Record<string, string> = {
    section_header: "Раздел",
    stage: "Этап",
    work_item: "Работа",
    material_item: "Материал",
    equipment_item: "Техника",
    labor_item: "ФОТ",
    subtotal: "Итог",
    note: "Примечание",
    unknown: "Неизвестно"
  };
  return labels[value] ?? value;
}

function readableImportPreviewStatus(value: string) {
  const labels: Record<string, string> = {
    idle: "Ожидает файл",
    good: "Готов к commit",
    needs_review: "Нужна проверка",
    blocked: "Заблокирован"
  };
  return labels[value] ?? value;
}

function readableImportMode(value: ImportMode) {
  const labels: Record<ImportMode, string> = {
    append: "добавить к текущим данным",
    replace_budget: "заменить бюджет",
    replace_materials: "заменить материалы",
    replace_budget_materials: "заменить бюджет и материалы",
    replace_schedule: "заменить график",
    replace_all: "заменить все импортируемые блоки"
  };
  return labels[value] ?? value;
}

function readableColumnTarget(value: string) {
  const labels: Record<string, string> = {
    name: "Наименование",
    unit: "Ед. изм.",
    qty: "Количество",
    unitPrice: "Цена",
    total: "Сумма",
    section: "Раздел",
    note: "Примечание",
    startsAt: "Дата начала",
    endsAt: "Дата окончания"
  };
  return labels[value] ?? value;
}

function sampleForColumn(sheet: ImportSheetMapping, index: number | undefined) {
  if (index === undefined) return "Колонка исключена";
  const samples = (sheet.sampleRows ?? [])
    .slice(1, 4)
    .map((row) => row[index])
    .filter(Boolean);
  return samples.length ? samples.join(" / ") : "Нет примеров";
}

function MessageList({ title, items, tone }: { title: string; items: string[]; tone: "bad" | "warn" }) {
  if (!items.length) return <div className="panel muted">{title}: нет</div>;
  return (
    <div className="panel">
      <h3 className={tone === "bad" ? "delta-bad" : "delta-warn"}>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PreviewTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="stack">
      <h3>{title}</h3>
      {rows.length ? <DataTable headers={headers} rows={rows} /> : <p className="muted">Нет строк для отображения.</p>}
    </div>
  );
}

function Panel({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel stack ${className}`}>
      <div className="panel-title">
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{title}</div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : tone === "bad" ? "delta-bad" : ""}`}>{value}</div>
    </div>
  );
}

function StatusBadge({ tone, children }: { tone: "good" | "warn" | "bad" | "info" | "neutral"; children: React.ReactNode }) {
  const color = tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : tone === "info" ? "blue" : "gray";
  return <span className={`badge ${color}`}>{children}</span>;
}

function StatePill({ label, value, tone }: { label: string; value: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }) {
  return (
    <span className={`state-pill ${tone}`}>
      <span>{label}</span>
      <strong>{value}</strong>
    </span>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function ContextItem({ title, value, tone }: { title: string; value: string; tone: "good" | "warn" | "bad" }) {
  return (
    <div className="attention-item">
      <div className="kpi-label">{title}</div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : "delta-bad"}`}>{value}</div>
    </div>
  );
}

function readableStatus(value: string) {
  const labels: Record<string, string> = {
    not_started: "Не начато",
    in_progress: "В работе",
    done: "Готово",
    delayed: "Просрочено",
    stopped: "Остановлено",
    required: "Требуется",
    requested: "Запрошено",
    ordered: "Заказано",
    in_transit: "В пути",
    delivered: "Доставлено",
    closed: "Закрыто",
    planned: "План",
    need_quote: "Нужно КП",
    quote_needed: "Нужно КП",
    needs_dates: "Нужны даты",
    already_exists: "Уже есть",
    paid: "Оплачено",
    overdue: "Просрочено",
    open: "Открыт",
    draft: "Черновик",
    active: "Активен",
    inactive: "Отключен",
    planning: "Планирование",
    paused: "Пауза",
    completed: "Завершен",
    critical: "Критично",
    high: "Высокий",
    medium: "Средний",
    low: "Низкий",
    work: "Работа",
    material: "Материал",
    equipment: "Техника",
    payroll: "ФОТ",
    subcontract: "Субподряд",
    overhead: "Накладные",
    on_track: "В норме",
    attention: "Внимание",
    unknown: "Недостаточно данных"
  };
  return labels[value] ?? value;
}

function BudgetForm({ onAdd }: { onAdd: (item: Omit<BudgetItem, "id" | "projectId" | "source" | "actualUnitPrice" | "forecastUnitPrice">) => Promise<void> }) {
  return (
    <form
      className="form-grid form-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          section: String(data.get("section") || "Новый раздел"),
          code: String(data.get("code") || "new"),
          name: String(data.get("name") || "Новая позиция"),
          unit: String(data.get("unit") || "ед."),
          qty: Number(data.get("qty") || 1),
          plannedUnitPrice: Number(data.get("price") || 0),
          kind: String(data.get("kind") || "work") as BudgetItem["kind"]
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Раздел
        <input name="section" placeholder="Отделочные работы" />
      </label>
      <label>
        Наименование
        <input name="name" placeholder="Штукатурка стен" />
      </label>
      <label>
        Тип
        <select name="kind" defaultValue="work">
          <option value="work">Работа</option>
          <option value="material">Материал</option>
          <option value="equipment">Техника</option>
          <option value="payroll">ФОТ</option>
          <option value="subcontract">Субподряд</option>
          <option value="overhead">Накладные</option>
        </select>
      </label>
      <label>
        Код
        <input name="code" placeholder="5.1" />
      </label>
      <label>
        Ед.
        <input name="unit" placeholder="м2" />
      </label>
      <label>
        Кол-во
        <input name="qty" type="number" step="0.01" placeholder="100" />
      </label>
      <label>
        Цена
        <input name="price" type="number" step="0.01" placeholder="1200" />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function ScheduleForm({ onAdd }: { onAdd: (item: Omit<ScheduleItem, "id" | "projectId" | "actualQty" | "status">) => Promise<void> }) {
  return (
    <form
      className="form-grid form-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          name: String(data.get("name") || "Новая работа"),
          owner: String(data.get("owner") || "РП"),
          startsAt: String(data.get("startsAt") || new Date().toISOString().slice(0, 10)),
          endsAt: String(data.get("endsAt") || new Date().toISOString().slice(0, 10)),
          plannedQty: Number(data.get("plannedQty") || 1)
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Работа
        <input name="name" placeholder="Монтаж перегородок" />
      </label>
      <label>
        Ответственный
        <input name="owner" placeholder="ПТО" />
      </label>
      <label>
        Начало
        <input name="startsAt" type="date" />
      </label>
      <label>
        Окончание
        <input name="endsAt" type="date" />
      </label>
      <label>
        Плановый объем
        <input name="plannedQty" type="number" step="0.01" />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function PaymentForm({ onAdd }: { onAdd: (payment: Omit<Payment, "id" | "projectId" | "status">) => Promise<void> }) {
  return (
    <form
      className="form-grid form-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          title: String(data.get("title") || "Новый платеж"),
          counterparty: String(data.get("counterparty") || "Контрагент"),
          direction: String(data.get("direction") || "outgoing") as Payment["direction"],
          plannedAt: String(data.get("plannedAt") || new Date().toISOString().slice(0, 10)),
          amount: Number(data.get("amount") || 0),
          category: String(data.get("category") || "supplier") as Payment["category"]
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Платеж
        <input name="title" placeholder="Оплата поставщику" />
      </label>
      <label>
        Контрагент
        <input name="counterparty" placeholder="Поставщик" />
      </label>
      <label>
        Тип
        <select name="direction" defaultValue="outgoing">
          <option value="incoming">Поступление</option>
          <option value="outgoing">Платеж</option>
        </select>
      </label>
      <label>
        Дата
        <input name="plannedAt" type="date" />
      </label>
      <label>
        Сумма
        <input name="amount" type="number" />
      </label>
      <label>
        Категория
        <select name="category" defaultValue="supplier">
          <option value="customer">Заказчик</option>
          <option value="supplier">Поставщик</option>
          <option value="subcontractor">Субподряд</option>
          <option value="payroll">ФОТ</option>
          <option value="tax">Налоги</option>
          <option value="overhead">Накладные</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function BudgetEditForm({ item, onSave, onCancel }: { item: BudgetItem; onSave: (payload: Partial<BudgetItem>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid form-surface edit-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          unit: String(data.get("unit") || item.unit),
          qty: Number(data.get("qty") || item.qty),
          plannedUnitPrice: Number(data.get("plannedUnitPrice") || item.plannedUnitPrice),
          actualUnitPrice: Number(data.get("actualUnitPrice") || item.actualUnitPrice),
          forecastUnitPrice: Number(data.get("forecastUnitPrice") || item.forecastUnitPrice)
        }).catch(() => undefined);
      }}
    >
      <label>
        Наименование
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ед.
        <input name="unit" defaultValue={item.unit} />
      </label>
      <label>
        Кол-во
        <input name="qty" type="number" step="0.001" defaultValue={item.qty} />
      </label>
      <label>
        Цена план
        <input name="plannedUnitPrice" type="number" step="0.01" defaultValue={item.plannedUnitPrice} />
      </label>
      <label>
        Цена факт
        <input name="actualUnitPrice" type="number" step="0.01" defaultValue={item.actualUnitPrice} />
      </label>
      <label>
        Цена прогноз
        <input name="forecastUnitPrice" type="number" step="0.01" defaultValue={item.forecastUnitPrice} />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function ScheduleEditForm({ item, onSave, onCancel }: { item: ScheduleItem; onSave: (payload: Partial<ScheduleItem>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid form-surface edit-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          owner: String(data.get("owner") || item.owner),
          startsAt: String(data.get("startsAt") || item.startsAt),
          endsAt: String(data.get("endsAt") || item.endsAt),
          plannedQty: Number(data.get("plannedQty") || item.plannedQty),
          actualQty: Number(data.get("actualQty") || item.actualQty),
          status: String(data.get("status") || item.status) as ScheduleItem["status"]
        }).catch(() => undefined);
      }}
    >
      <label>
        Работа
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ответственный
        <input name="owner" defaultValue={item.owner} />
      </label>
      <label>
        Начало
        <input name="startsAt" type="date" defaultValue={item.startsAt} />
      </label>
      <label>
        Окончание
        <input name="endsAt" type="date" defaultValue={item.endsAt} />
      </label>
      <label>
        План
        <input name="plannedQty" type="number" step="0.001" defaultValue={item.plannedQty} />
      </label>
      <label>
        Факт
        <input name="actualQty" type="number" step="0.001" defaultValue={item.actualQty} />
      </label>
      <label>
        Статус
        <select name="status" defaultValue={item.status}>
          <option value="not_started">Не начато</option>
          <option value="in_progress">В работе</option>
          <option value="done">Готово</option>
          <option value="delayed">Просрочено</option>
          <option value="stopped">Остановлено</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function MaterialEditForm({ item, onSave, onCancel }: { item: Material; onSave: (payload: Partial<Material>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid form-surface edit-surface"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          unit: String(data.get("unit") || item.unit),
          requiredQty: Number(data.get("requiredQty") || item.requiredQty),
          orderedQty: Number(data.get("orderedQty") || item.orderedQty),
          deliveredQty: Number(data.get("deliveredQty") || item.deliveredQty),
          consumedQty: Number(data.get("consumedQty") || item.consumedQty),
          plannedUnitPrice: Number(data.get("plannedUnitPrice") || item.plannedUnitPrice),
          actualUnitPrice: Number(data.get("actualUnitPrice") || item.actualUnitPrice),
          status: String(data.get("status") || item.status) as Material["status"]
        }).catch(() => undefined);
      }}
    >
      <label>
        Материал
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ед.
        <input name="unit" defaultValue={item.unit} />
      </label>
      <label>
        Потребность
        <input name="requiredQty" type="number" step="0.001" defaultValue={item.requiredQty} />
      </label>
      <label>
        Заказано
        <input name="orderedQty" type="number" step="0.001" defaultValue={item.orderedQty} />
      </label>
      <label>
        Доставлено
        <input name="deliveredQty" type="number" step="0.001" defaultValue={item.deliveredQty} />
      </label>
      <label>
        Списано
        <input name="consumedQty" type="number" step="0.001" defaultValue={item.consumedQty} />
      </label>
      <label>
        Цена план
        <input name="plannedUnitPrice" type="number" step="0.01" defaultValue={item.plannedUnitPrice} />
      </label>
      <label>
        Цена факт
        <input name="actualUnitPrice" type="number" step="0.01" defaultValue={item.actualUnitPrice} />
      </label>
      <label>
        Статус
        <select name="status" defaultValue={item.status}>
          <option value="required">Требуется</option>
          <option value="requested">Запрошено</option>
          <option value="ordered">Заказано</option>
          <option value="in_transit">В пути</option>
          <option value="delivered">Доставлено</option>
          <option value="closed">Закрыто</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row-actions">
      <button className="icon-button" title="Редактировать" type="button" onClick={onEdit}>
        <Pencil size={16} />
      </button>
      <button className="icon-button" title="Удалить" type="button" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function BudgetTable({
  items,
  importHistory,
  filter,
  onFilterChange,
  onEdit,
  onDelete
}: {
  items: BudgetItem[];
  importHistory: ImportHistoryItem[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onEdit: (item: BudgetItem) => void;
  onDelete: (item: BudgetItem) => void;
}) {
  const importedRows = importHistory.flatMap((batch) =>
    (batch as ImportHistoryItem & { preview?: ImportPreview }).preview?.previewRows?.map((row) => ({ ...row, importBatchId: batch.id, fileName: batch.fileName })) ?? []
  );
  const rowByKey = new Map(importedRows.map((row) => [`${row.section ?? ""}|${row.name ?? ""}|${row.unit ?? ""}`, row]));
  const decorated = items.map((item) => {
    const row = rowByKey.get(`${item.section}|${item.name}|${item.unit}`);
    const imported = Boolean(row) || /excel|import|вор|смет/i.test(item.source);
    const flags = row?.suspiciousFlags ?? [];
    return {
      item,
      imported,
      sourceRow: row,
      flags,
      hasWarning: Boolean(row?.warnings?.length || flags.length),
      missingPrice: item.plannedUnitPrice <= 0 || flags.includes("missingPrice"),
      missingQuantity: item.qty <= 0 || flags.includes("missingQuantity"),
      duplicate: flags.includes("duplicate")
    };
  });
  const filtered = decorated.filter((entry) => {
    if (filter === "imported") return entry.imported;
    if (filter === "warnings") return entry.hasWarning;
    if (filter === "missingPrice") return entry.missingPrice;
    if (filter === "missingQuantity") return entry.missingQuantity;
    if (filter === "duplicate") return entry.duplicate;
    return true;
  });
  const worksTotal = decorated.filter((entry) => entry.item.kind !== "material").reduce((sum, entry) => sum + entry.item.qty * entry.item.plannedUnitPrice, 0);
  const materialsTotal = decorated.filter((entry) => entry.item.kind === "material").reduce((sum, entry) => sum + entry.item.qty * entry.item.plannedUnitPrice, 0);
  const problematic = decorated.filter((entry) => entry.hasWarning || entry.missingPrice || entry.missingQuantity || entry.duplicate).length;
  return (
    <div className="stack">
      <div className="metric-strip">
        <Kpi title="Работы" value={compactMoney(worksTotal)} />
        <Kpi title="Материалы" value={compactMoney(materialsTotal)} />
        <Kpi title="Всего ВОР" value={compactMoney(worksTotal + materialsTotal)} />
        <Kpi title="Проблемные позиции" value={String(problematic)} tone={problematic ? "warn" : "good"} />
      </div>
      <div className="segmented-control">
        {[
          ["all", "Все"],
          ["imported", "Импортированные"],
          ["warnings", "С предупреждениями"],
          ["missingPrice", "Без цены"],
          ["missingQuantity", "Без количества"],
          ["duplicate", "Дубли"]
        ].map(([value, label]) => (
          <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => onFilterChange(value)}>
            {label}
          </button>
        ))}
      </div>
      <DataTable
        headers={["Раздел", "Код", "Наименование", "Источник", "Флаги", "Тип", "Кол-во", "Цена план", "Сумма план", ""]}
        numericColumns={[6, 7, 8]}
        emptyMessage="ВОР пока пустая. Добавьте позицию вручную или импортируйте Excel."
        rows={filtered.map(({ item, imported, sourceRow, flags, missingPrice, missingQuantity, duplicate }) => [
          item.section,
          item.code,
          item.name,
          <div className="stack" key="source">
            <StatusBadge tone={imported ? "info" : "neutral"}>{imported ? "из ВОР" : "ручной ввод"}</StatusBadge>
            <span className="muted">{sourceRow ? `${sourceRow.fileName} · ${sourceRow.sheetName}:${sourceRow.sourceRowNumber}` : item.source}</span>
          </div>,
          [missingPrice && "missingPrice", missingQuantity && "missingQuantity", duplicate && "duplicate", ...flags].filter(Boolean).join(", ") || "-",
          <StatusBadge key="kind" tone="info">{readableStatus(item.kind)}</StatusBadge>,
          `${item.qty.toLocaleString("ru-RU")} ${item.unit}`,
          compactMoney(item.plannedUnitPrice),
          compactMoney(item.qty * item.plannedUnitPrice),
          <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
        ])}
      />
    </div>
  );
}

function ScheduleTable({ items, onEdit, onDelete }: { items: ScheduleItem[]; onEdit: (item: ScheduleItem) => void; onDelete: (item: ScheduleItem) => void }) {
  return (
    <DataTable
      headers={["Работа", "Ответственный", "Начало", "Окончание", "План", "Факт", "Выполнение", "Статус", ""]}
      numericColumns={[4, 5, 6]}
      emptyMessage="График пока не заполнен. Добавьте первую работу или импортируйте план."
      rows={items.map((item) => [
        item.name,
        item.owner,
        item.startsAt,
        item.endsAt,
        item.plannedQty,
        item.actualQty,
        percent(item.plannedQty ? (item.actualQty / item.plannedQty) * 100 : 0),
        <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>,
        <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
      ])}
    />
  );
}

function MaterialTable({
  items,
  filter,
  onFilterChange,
  onEdit,
  onDelete
}: {
  items: Material[];
  filter: string;
  onFilterChange: (filter: string) => void;
  onEdit: (item: Material) => void;
  onDelete: (item: Material) => void;
}) {
  const filtered = items.filter((item) => {
    const deficit = item.requiredQty > Math.max(item.orderedQty, item.deliveredQty);
    const partial = item.deliveredQty > 0 && item.deliveredQty < item.requiredQty;
    const overstock = item.deliveredQty > item.requiredQty;
    if (filter === "missingPrice") return item.plannedUnitPrice <= 0;
    if (filter === "missingSupplier") return !item.supplier || item.supplier === "Не выбран";
    if (filter === "needPurchase") return deficit;
    if (filter === "partial") return partial;
    if (filter === "overstock") return overstock;
    if (filter === "imported") return ["required", "need_quote", "planned"].includes(item.status) || item.supplier === "Не выбран";
    return true;
  });
  return (
    <div className="stack">
      <div className="segmented-control">
        {[
          ["all", "Все"],
          ["missingPrice", "Без цены"],
          ["missingSupplier", "Без поставщика"],
          ["needPurchase", "Требуется закупка"],
          ["partial", "Частично закрыто"],
          ["overstock", "Излишек"],
          ["imported", "Из ВОР"]
        ].map(([value, label]) => (
          <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => onFilterChange(value)}>
            {label}
          </button>
        ))}
      </div>
      <DataTable
        headers={["Материал", "Потребность", "Заказано", "Доставлено", "Остаток", "Цена план/факт", "Поставщик", "Статус", ""]}
        numericColumns={[1, 2, 3, 4, 5]}
        emptyMessage="Материалы пока не заведены. Добавьте позицию или загрузите ВОР."
        rows={filtered.map((item) => {
          const remaining = item.requiredQty - item.deliveredQty;
          return [
            item.name,
            `${item.requiredQty} ${item.unit}`,
            `${item.orderedQty} ${item.unit}`,
            `${item.deliveredQty} ${item.unit}`,
            <span className={remaining > 0 ? "delta-bad" : remaining < 0 ? "delta-warn" : "delta-good"} key="remaining">
              {remaining.toLocaleString("ru-RU")} {item.unit}
            </span>,
            `${compactMoney(item.plannedUnitPrice)} / ${compactMoney(item.actualUnitPrice)}`,
            item.supplier,
            <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>,
            <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
          ];
        })}
      />
    </div>
  );
}

function RequestTable({ items }: { items: ProcurementRequest[] }) {
  return (
    <DataTable
      headers={["Заявка", "Инициатор", "Требуется", "Приоритет", "Статус", "Позиции"]}
      emptyMessage="Заявок снабжению пока нет."
      rows={items.map((item) => [
        item.title,
        item.initiator,
        item.neededAt,
        <StatusBadge key="priority" tone={statusTone(item.priority)}>{readableStatus(item.priority)}</StatusBadge>,
        <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>,
        item.items.map((requestItem) => `${requestItem.name}: ${requestItem.qty} ${requestItem.unit}`).join("; ")
      ])}
    />
  );
}

function PaymentTable({ items }: { items: Payment[] }) {
  return (
    <DataTable
      headers={["Платеж", "Контрагент", "Тип", "Дата", "Сумма", "Категория", "Статус"]}
      numericColumns={[4]}
      emptyMessage="Платежи пока не заведены."
      rows={items.map((item) => [
        item.title,
        item.counterparty,
        item.direction === "incoming" ? "Поступление" : "Платеж",
        item.plannedAt,
        compactMoney(item.amount),
        item.category,
        <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function ReportTable({ items }: { items: DailyReport[] }) {
  return (
    <DataTable
      headers={["Дата", "Автор", "Погода", "Люди", "Техника", "Выполнено", "Проблемы", "Статус"]}
      emptyMessage="Рапортов пока нет."
      rows={items.map((item) => [
        item.date,
        item.author,
        item.weather,
        `${item.workers} раб. / ${item.engineers} ИТР`,
        item.equipment,
        item.completedWorks,
        item.issues,
        <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function RiskTable({ items }: { items: Risk[] }) {
  return (
    <DataTable
      headers={["Риск", "Причина", "Приоритет", "Ответственный", "Срок", "Статус"]}
      emptyMessage="Риски пока не заведены."
      rows={items.map((item) => [
        item.title,
        item.reason,
        <StatusBadge key="priority" tone={statusTone(item.priority)}>{readableStatus(item.priority)}</StatusBadge>,
        item.owner,
        item.dueAt,
        <StatusBadge key="status" tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function AuditTable({ items }: { items: AuditEvent[] }) {
  return (
    <DataTable
      headers={["Дата", "Действие", "Сущность", "Описание", "Пользователь"]}
      emptyMessage="История изменений пока пустая."
      rows={items.map((item) => [
        new Date(item.createdAt).toLocaleString("ru-RU"),
        item.action,
        item.entity,
        item.summary ?? item.entityId,
        item.actorName ?? "local-user"
      ])}
    />
  );
}

function DocumentTable({
  items,
  projectId,
  versions,
  onLoadVersions,
  onUploadVersion,
  onDelete
}: {
  items: ProjectDocument[];
  projectId: string;
  versions: Record<string, ProjectDocumentVersion[]>;
  onLoadVersions: (document: ProjectDocument) => void;
  onUploadVersion: (document: ProjectDocument, file: File) => void;
  onDelete: (document: ProjectDocument) => void;
}) {
  return (
    <DataTable
      headers={["Файл", "Категория", "Тип", "Версии", "Размер", "Загрузил", "Дата", "Действия"]}
      numericColumns={[4]}
      emptyMessage="Документы пока не загружены."
      rows={items.map((item) => [
        <a key="download" className="delta-good" href={`/api/projects/${projectId}/documents/${item.id}/download`}>
          {item.fileName ?? item.title}
        </a>,
        item.category,
        item.previewAvailable ? `${item.mimeType ?? "-"} · preview-ready` : item.mimeType ?? "-",
        <div key="versions" className="stack">
          <button className="button secondary" type="button" onClick={() => onLoadVersions(item)}>
            v{item.version} · История
          </button>
          {versions[item.id]?.map((version) => (
            <a key={version.id} className="muted" href={`/api/projects/${projectId}/documents/${item.id}/versions/${version.id}/download`}>
              v{version.versionNumber}: {version.fileName}
            </a>
          ))}
        </div>,
        item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "-",
        item.author,
        item.uploadedAt ? new Date(item.uploadedAt).toLocaleString("ru-RU") : new Date(item.createdAt).toLocaleString("ru-RU"),
        <div key="actions" className="stack">
          <input accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip" type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadVersion(item, file);
            event.currentTarget.value = "";
          }} />
          <button className="icon-button" title="Удалить" type="button" onClick={() => onDelete(item)}>
            <Trash2 size={16} />
          </button>
        </div>
      ])}
    />
  );
}

function ProjectMembersTable({
  items,
  onRoleChange,
  onRemove
}: {
  items: ProjectMember[];
  onRoleChange: (member: ProjectMember, role: ProjectMember["role"]) => void;
  onRemove: (member: ProjectMember) => void;
}) {
  return (
    <DataTable
      headers={["Пользователь", "Email", "Проектная роль", "Глобальная роль", "Статус", "Добавлен", "Действия"]}
      emptyMessage="Участники проекта пока не добавлены."
      rows={items.map((member) => [
        member.user.name,
        member.user.email,
        <select key="role" value={member.role} onChange={(event) => onRoleChange(member, event.target.value as ProjectMember["role"])}>
          <option value="OWNER">OWNER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="MANAGER">MANAGER</option>
          <option value="VIEWER">VIEWER</option>
        </select>,
        <StatusBadge key="global-role" tone="info">{member.user.role}</StatusBadge>,
        <StatusBadge key="status" tone={member.user.isActive ? "good" : "neutral"}>{member.user.isActive ? "Активен" : "Отключен"}</StatusBadge>,
        new Date(member.createdAt).toLocaleString("ru-RU"),
        <button className="icon-button" key="remove" title="Удалить участника" type="button" onClick={() => onRemove(member)}>
          <Trash2 size={16} />
        </button>
      ])}
    />
  );
}

function AiScenarioCard({
  config,
  loading,
  result,
  error,
  onRun
}: {
  config: { scenario: AiScenario; title: string; description: string; data: string[] };
  loading: boolean;
  result?: AiInsightResponse;
  error?: string;
  onRun: () => void;
}) {
  return (
    <article className="ai-scenario-card">
      <div className="ai-scenario-head">
        <div>
          <h3>{config.title}</h3>
          <p className="muted">{config.description}</p>
        </div>
        {result?.overallStatus && <StatusBadge tone={result.overallStatus === "critical" ? "bad" : result.overallStatus === "attention" ? "warn" : result.overallStatus === "on_track" ? "good" : "neutral"}>{readableStatus(result.overallStatus)}</StatusBadge>}
      </div>
      <div className="ai-data-used">
        {config.data.map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
      <div className="row-actions">
        <button className="button primary" disabled={loading} type="button" onClick={onRun}>
          <Bot size={16} />
          {loading ? "Анализ..." : result ? "Повторить" : "Запустить"}
        </button>
        {result && (
          <button className="button secondary" type="button" onClick={() => void navigator.clipboard?.writeText(formatAiResultForCopy(result))}>
            Копировать
          </button>
        )}
      </div>
      {error && <p className="error-text">{error}</p>}
      {result && <AiScenarioResult result={result} />}
    </article>
  );
}

function AiScenarioResult({ result }: { result: AiInsightResponse }) {
  return (
    <div className="ai-result">
      <div className="ai-result-summary">
        <strong>{result.title}</strong>
        <span className="muted">{new Date(result.generatedAt).toLocaleString("ru-RU")} · {result.provider}</span>
        {result.subject && <span className="muted">Тема: {result.subject}</span>}
        <p>{result.summary}</p>
      </div>
      {!!result.findings.length && (
        <details open>
          <summary>Найденные проблемы</summary>
          <div className="ai-result-list">
            {result.findings.map((finding, index) => (
              <div className="ai-result-item" key={`${finding.title}-${index}`}>
                <StatusBadge tone={finding.severity === "critical" ? "bad" : finding.severity === "high" || finding.severity === "medium" ? "warn" : "info"}>{readableStatus(finding.severity)}</StatusBadge>
                <strong>{finding.title}</strong>
                <p>{finding.description}</p>
                {finding.recommendation && <span>{finding.recommendation}</span>}
              </div>
            ))}
          </div>
        </details>
      )}
      {!!result.recommendedActions.length && (
        <details open>
          <summary>Рекомендованные действия</summary>
          <div className="ai-result-list">
            {result.recommendedActions.map((actionItem, index) => (
              <div className="ai-result-item" key={`${actionItem.title}-${index}`}>
                <StatusBadge tone={actionItem.priority === "high" ? "warn" : "info"}>{readableStatus(actionItem.priority)}</StatusBadge>
                <strong>{actionItem.title}</strong>
                <p>{actionItem.description}</p>
              </div>
            ))}
          </div>
        </details>
      )}
      {result.draftText && (
        <details open>
          <summary>Draft text</summary>
          <pre className="ai-draft-text">{result.draftText}</pre>
        </details>
      )}
      {!!result.recommendedAttachments?.length && (
        <details>
          <summary>Рекомендуемые приложения</summary>
          <ul className="action-list">
            {result.recommendedAttachments.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
      {!!result.dataLimitations.length && (
        <details>
          <summary>Ограничения данных</summary>
          <ul className="action-list">
            {result.dataLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function formatAiResultForCopy(result: AiInsightResponse) {
  return [
    result.title,
    result.summary,
    "",
    "Проблемы:",
    ...result.findings.map((item) => `- [${item.severity}] ${item.title}: ${item.description}${item.recommendation ? ` Рекомендация: ${item.recommendation}` : ""}`),
    "",
    "Действия:",
    ...result.recommendedActions.map((item) => `- [${item.priority}] ${item.title}: ${item.description}`),
    result.recommendedAttachments?.length ? `\nПриложения:\n${result.recommendedAttachments.map((item) => `- ${item}`).join("\n")}` : "",
    result.draftText ? `\nDraft:\n${result.draftText}` : "",
    result.dataLimitations.length ? `\nОграничения:\n${result.dataLimitations.map((item) => `- ${item}`).join("\n")}` : ""
  ].join("\n");
}

function BudgetAnalytics({ items, contractAmount, paid, forecastProfit }: { items: BudgetItem[]; contractAmount: number; paid: number; forecastProfit: number }) {
  const sections = Object.entries(
    items.reduce<Record<string, number>>((acc, item) => {
      acc[item.section] = (acc[item.section] ?? 0) + item.qty * item.forecastUnitPrice;
      return acc;
    }, {})
  ).sort((left, right) => right[1] - left[1]);
  const max = Math.max(...sections.map(([, value]) => value), 1);
  const forecastCost = sections.reduce((total, [, value]) => total + value, 0);

  return (
    <div className="analytics-grid">
      <div className="metric-strip">
        <Kpi title="Договор" value={compactMoney(contractAmount)} />
        <Kpi title="Прогноз затрат" value={compactMoney(forecastCost)} tone={forecastCost > contractAmount ? "bad" : "warn"} />
        <Kpi title="Прогноз прибыли" value={compactMoney(forecastProfit)} tone={forecastProfit > 0 ? "good" : "bad"} />
        <Kpi title="Оплачено" value={compactMoney(paid)} />
      </div>
      <div className="breakdown-panel">
        <h3>Структура бюджета по разделам</h3>
        {sections.slice(0, 6).map(([section, value]) => (
          <div className="breakdown-row" key={section}>
            <span>{section}</span>
            <div><i style={{ width: `${Math.max(8, (value / max) * 100)}%` }} /></div>
            <strong>{compactMoney(value)}</strong>
          </div>
        ))}
      </div>
      <div className="waterfall">
        <h3>Договор → затраты → прибыль</h3>
        <div className="waterfall-track">
          <span style={{ width: "100%" }}>Договор {compactMoney(contractAmount)}</span>
          <span className="warn" style={{ width: `${Math.min(100, (forecastCost / contractAmount) * 100)}%` }}>Затраты</span>
          <span className={forecastProfit > 0 ? "good" : "bad"} style={{ width: `${Math.min(100, (Math.abs(forecastProfit) / contractAmount) * 100)}%` }}>Прибыль</span>
        </div>
      </div>
    </div>
  );
}

function TimelineView({ items }: { items: ScheduleItem[] }) {
  const times = items.flatMap((item) => [new Date(item.startsAt).getTime(), new Date(item.endsAt).getTime()]).filter(Number.isFinite);
  const start = Math.min(...times);
  const end = Math.max(...times);
  const span = Math.max(end - start, 86_400_000);
  const today = Date.now();
  const todayLeft = Math.max(0, Math.min(100, ((today - start) / span) * 100));

  return (
    <div className="timeline-panel">
      <div className="timeline-head">
        <h3>График работ</h3>
        <div className="segmented-control">
          <button className="active" type="button">Неделя</button>
          <button type="button">Месяц</button>
          <button type="button">Квартал</button>
        </div>
      </div>
      <div className="gantt" style={{ ["--today-left" as string]: `${todayLeft}%` }}>
        {items.slice(0, 8).map((item) => {
          const itemStart = new Date(item.startsAt).getTime();
          const itemEnd = new Date(item.endsAt).getTime();
          const left = Math.max(0, ((itemStart - start) / span) * 100);
          const width = Math.max(8, ((itemEnd - itemStart) / span) * 100);
          const completion = item.plannedQty ? Math.min(100, (item.actualQty / item.plannedQty) * 100) : 0;
          return (
            <div className="gantt-row" key={item.id}>
              <div>
                <strong>{item.name}</strong>
                <span>{item.owner} · {formatDate(item.startsAt)} - {formatDate(item.endsAt)}</span>
              </div>
              <div className="gantt-track">
                <span className={`gantt-bar ${statusTone(item.status)}`} style={{ left: `${left}%`, width: `${width}%` }}>
                  <i style={{ width: `${completion}%` }} />
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MaterialHealth({ items }: { items: Material[] }) {
  const critical = items.filter((item) => item.requiredQty > item.orderedQty);
  const today = new Date().toISOString().slice(0, 10);
  const dueSoon = items.filter((item) => item.neededAt <= today && item.status !== "closed");

  return (
    <div className="metric-strip">
      <Kpi title="Потребность" value={items.reduce((sum, item) => sum + item.requiredQty, 0).toLocaleString("ru-RU")} />
      <Kpi title="Дефицит" value={String(critical.length)} tone={critical.length ? "bad" : "good"} />
      <Kpi title="Нужно сегодня" value={String(dueSoon.length)} tone={dueSoon.length ? "warn" : "good"} />
      <Kpi title="Поставщиков" value={String(new Set(items.map((item) => item.supplier)).size)} />
    </div>
  );
}

function ProcurementPipeline({ items }: { items: ProcurementRequest[] }) {
  const columns = [
    { key: "draft", label: "Требуется" },
    { key: "submitted", label: "Заявка" },
    { key: "approved", label: "Согласование" },
    { key: "ordered", label: "Заказано" },
    { key: "closed", label: "Закрыто" }
  ];

  return (
    <div className="pipeline">
      {columns.map((column) => {
        const columnItems = items.filter((item) => item.status === column.key);
        return (
          <div className="pipeline-column" key={column.key}>
            <div className="pipeline-title">
              <strong>{column.label}</strong>
              <span>{columnItems.length}</span>
            </div>
            {columnItems.length ? columnItems.map((item) => (
              <div className="pipeline-card" key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.initiator} · до {formatDate(item.neededAt)}</span>
                <StatusBadge tone={statusTone(item.priority)}>{readableStatus(item.priority)}</StatusBadge>
              </div>
            )) : <div className="pipeline-empty">Нет заявок</div>}
          </div>
        );
      })}
    </div>
  );
}

function FinanceCommand({ payments, contractAmount, forecastProfit }: { payments: Payment[]; contractAmount: number; forecastProfit: number }) {
  const incoming = payments.filter((payment) => payment.direction === "incoming").reduce((sum, payment) => sum + payment.amount, 0);
  const outgoing = payments.filter((payment) => payment.direction === "outgoing").reduce((sum, payment) => sum + payment.amount, 0);
  const overdue = payments.filter((payment) => payment.status === "overdue").reduce((sum, payment) => sum + payment.amount, 0);

  return (
    <div className="analytics-grid finance-grid">
      <div className="metric-strip">
        <Kpi title="Договор" value={compactMoney(contractAmount)} />
        <Kpi title="Оплачено" value={compactMoney(incoming)} tone="good" />
        <Kpi title="Кредиторка" value={compactMoney(outgoing)} />
        <Kpi title="Просрочено" value={compactMoney(overdue)} tone={overdue ? "bad" : "good"} />
      </div>
      <div className="waterfall">
        <h3>Cash-flow</h3>
        <div className="cashflow-bars">
          {payments.slice(0, 8).map((payment) => (
            <span className={payment.direction === "incoming" ? "good" : "bad"} key={payment.id} title={`${payment.title}: ${compactMoney(payment.amount)}`}>
              <i style={{ height: `${Math.max(14, Math.min(100, (payment.amount / contractAmount) * 220))}%` }} />
              <small>{formatDate(payment.plannedAt)}</small>
            </span>
          ))}
        </div>
      </div>
      <div className="waterfall">
        <h3>Прогноз прибыли</h3>
        <strong className={forecastProfit > 0 ? "delta-good" : "delta-bad"}>{compactMoney(forecastProfit)}</strong>
        <p className="muted">С учетом текущего прогноза затрат и оплат.</p>
      </div>
    </div>
  );
}

function RiskMatrix({ items }: { items: Risk[] }) {
  const priorities: Risk["priority"][] = ["low", "medium", "high", "critical"];
  return (
    <div className="risk-matrix">
      {priorities.map((priority) => {
        const count = items.filter((item) => item.priority === priority && item.status !== "closed").length;
        return (
          <div className={`risk-cell ${statusTone(priority)}`} key={priority}>
            <span>{readableStatus(priority)}</span>
            <strong>{count}</strong>
          </div>
        );
      })}
    </div>
  );
}

function ReportCards({ items }: { items: DailyReport[] }) {
  return (
    <div className="report-card-grid">
      {items.slice(0, 3).map((item) => (
        <div className="report-card" key={item.id}>
          <div>
            <strong>{formatDate(item.date)}</strong>
            <StatusBadge tone={statusTone(item.status)}>{readableStatus(item.status)}</StatusBadge>
          </div>
          <p>{item.completedWorks}</p>
          <span>{item.workers} рабочих · {item.engineers} ИТР · {item.weather || "Погода не указана"}</span>
        </div>
      ))}
    </div>
  );
}

function DocumentCards({ items, projectId }: { items: ProjectDocument[]; projectId: string }) {
  if (!items.length) return null;
  return (
    <div className="document-card-grid">
      {items.slice(0, 4).map((item) => (
        <a className="document-card" href={`/api/projects/${projectId}/documents/${item.id}/download`} key={item.id}>
          <FileText size={18} />
          <strong>{item.fileName ?? item.title}</strong>
          <span>{item.category} · v{item.version}</span>
          <small>{item.uploadedAt ? formatDate(item.uploadedAt) : formatDate(item.createdAt)}</small>
        </a>
      ))}
    </div>
  );
}

function ProjectWorkspaceOnboardingPanel({
  created,
  plan,
  onNavigate
}: {
  created: boolean;
  plan: ReturnType<typeof buildInitialProjectReadiness>;
  onNavigate: (tab: string) => void;
}) {
  const moduleLinks = plan.modules.filter((module) => module.status !== "not_selected").slice(0, 7);
  const baselineLists = [
    { title: "Документы", items: plan.baseline.documentBaseline },
    { title: "Снабжение", items: plan.baseline.procurementBaseline },
    { title: "График", items: plan.baseline.scheduleBaseline },
    { title: "КС", items: plan.baseline.acceptanceBaseline }
  ];

  return (
    <article className="panel project-onboarding-panel">
      <div className="project-onboarding-panel-head">
        <div>
          <div className="eyebrow">{created ? "Project created" : "Setup baseline"}</div>
          <h3>Запустите рабочий контур проекта</h3>
          <p>{plan.summary}</p>
        </div>
        <div className="onboarding-status-stack">
          <span className="badge yellow">{plan.score}% onboarding</span>
          <span className="badge blue">{plan.baseline.readiness}</span>
        </div>
      </div>
      <div className="project-baseline-banner">
        <div>
          <small>Template baseline</small>
          <strong>{plan.template.title}</strong>
          <span>{plan.template.description}</span>
        </div>
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Аналитика")}>
          Project Intelligence
        </button>
      </div>
      <div className="project-onboarding-grid">
        <div className="onboarding-checklist compact">
          {plan.nextActions.slice(0, 6).map((action, index) => (
            <div className="onboarding-checklist-item" key={action}>
              <span>{index + 1}</span>
              <p>{action}</p>
            </div>
          ))}
        </div>
        <div className="module-link-grid">
          {moduleLinks.map((module) => (
            <button className="module-link-card" key={module.id} type="button" onClick={() => onNavigate(module.tab)}>
              <strong>{module.label}</strong>
              <small>{module.nextAction}</small>
            </button>
          ))}
        </div>
      </div>
      <div className="project-baseline-mini-grid">
        {baselineLists.map((list) => (
          <div className="baseline-preview-list compact" key={list.title}>
            <strong>{list.title}</strong>
            {list.items.length ? list.items.slice(0, 4).map((item) => <span key={item}>{item}</span>) : <span className="muted">настраивается вручную</span>}
          </div>
        ))}
      </div>
      <div className="onboarding-mini-list">
        {plan.baseline.limitations.slice(0, 2).map((item) => (
          <span key={item}>{item}</span>
        ))}
      </div>
    </article>
  );
}

export function ProjectDeleteDangerZone({
  projectName,
  canDelete,
  roleLoaded,
  role,
  confirmationName,
  confirmed,
  saving,
  deleted,
  onNameChange,
  onConfirmChange,
  onDelete
}: {
  projectName: string;
  canDelete: boolean;
  roleLoaded: boolean;
  role?: CurrentUser["role"];
  confirmationName: string;
  confirmed: boolean;
  saving: boolean;
  deleted: boolean;
  onNameChange: (value: string) => void;
  onConfirmChange: (value: boolean) => void;
  onDelete: () => void;
}) {
  const exactMatch = confirmationName === projectName;
  const disabled = !canDelete || !exactMatch || !confirmed || saving || deleted;
  const disabledReason = !roleLoaded
    ? "Проверяю роль пользователя."
    : !canDelete
      ? `Удаление доступно только OWNER/ADMIN. Текущая роль: ${role ?? "не определена"}.`
      : !exactMatch
        ? "Введите точное имя проекта для подтверждения."
        : !confirmed
          ? "Подтвердите понимание последствий удаления."
          : null;

  return (
    <div className="danger-zone">
      <div className="danger-zone-card">
        <div>
          <div className="eyebrow">Danger zone</div>
          <h3>Удаление проекта</h3>
          <p className="muted">
            Операция удалит проект и связанные рабочие данные: ВОР, график, материалы, заявки, платежи, документы, рапорты, риски, импорт и AI-историю. Пользователи организации не удаляются.
          </p>
        </div>
        <div className="form-grid danger-form">
          <label>
            Точное имя проекта
            <input value={confirmationName} placeholder={projectName} onChange={(event) => onNameChange(event.target.value)} />
          </label>
          <label className="checkbox-row">
            <input checked={confirmed} type="checkbox" onChange={(event) => onConfirmChange(event.target.checked)} />
            <span>Я понимаю, что проект будет удален без восстановления из интерфейса.</span>
          </label>
          <label>
            &nbsp;
            <button className="button danger-button" type="button" disabled={disabled} onClick={onDelete}>
              <Trash2 size={18} />
              {saving ? "Удаляю..." : deleted ? "Удалено" : "Удалить проект"}
            </button>
          </label>
        </div>
        {disabledReason && <p className="muted">{disabledReason}</p>}
        {deleted && <StatusBadge tone="good">Проект удален. Перехожу к списку проектов.</StatusBadge>}
      </div>
    </div>
  );
}

function DataTable({
  headers,
  rows,
  numericColumns = [],
  emptyMessage = "Нет данных для отображения."
}: {
  headers: string[];
  rows: React.ReactNode[][];
  numericColumns?: number[];
  emptyMessage?: string;
}) {
  const [query, setQuery] = useState("");
  const [density, setDensity] = useState<"comfortable" | "compact">("comfortable");
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const filteredRows = normalizedQuery
    ? rows.filter((row) => row.map(textFromCell).join(" ").toLocaleLowerCase("ru-RU").includes(normalizedQuery))
    : rows;
  const actionColumnIndex = headers.findIndex((header) => header === "" || header === "Действия");

  return (
    <div className={`data-table ${density}`}>
      {rows.length ? (
        <>
          <div className="table-toolbar">
            <label className="table-search">
              <Search size={15} />
              <input value={query} placeholder="Найти в таблице" onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div className="density-toggle" aria-label="Плотность таблицы">
              <button className={density === "comfortable" ? "active" : ""} type="button" onClick={() => setDensity("comfortable")}>Обычная</button>
              <button className={density === "compact" ? "active" : ""} type="button" onClick={() => setDensity("compact")}>Плотная</button>
            </div>
            <span className="table-count">{filteredRows.length} из {rows.length}</span>
          </div>
          <div className="table-wrap">
            {filteredRows.length ? (
              <table>
                <thead>
                  <tr>
                    {headers.map((header, index) => (
                      <th className={`${numericColumns.includes(index) ? "numeric" : ""} ${index === actionColumnIndex ? "action-column" : ""}`.trim() || undefined} key={`${header}-${index}`}>{header}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map((row, index) => (
                    <tr key={index}>
                      {row.map((cell, cellIndex) => (
                        <td className={`${numericColumns.includes(cellIndex) ? "numeric" : ""} ${cellIndex === actionColumnIndex ? "action-column" : ""}`.trim() || undefined} data-label={headers[cellIndex]} key={cellIndex}>{cell}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <EmptyState text="По текущему фильтру строк нет." />
            )}
          </div>
        </>
      ) : (
        <EmptyState text={emptyMessage} />
      )}
    </div>
  );
}
