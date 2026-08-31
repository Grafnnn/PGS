"use client";

import {
  AlertTriangle,
  Calculator,
  CheckCircle2,
  ClipboardList,
  FileSpreadsheet,
  HardHat,
  Landmark,
  Pencil,
  Plus,
  RefreshCw,
  ShieldCheck,
  TimerReset,
  Trash2,
  Upload,
  UserPlus,
  UserRoundSearch,
  Users,
  Wrench,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildResourcesEquipmentIntelligence, type ResourcesEquipmentTone } from "@/lib/resources-equipment-intelligence";
import { WorkforceAdmissionRequests } from "@/components/workforce-admission-requests";
import {
  buildWorkforceCapacitySummary,
  buildWorkforceEconomics,
  DEFAULT_PAYROLL_POLICY
} from "@/lib/workforce-capacity";
import {
  buildWorkforceStaffingPlan,
  type WorkforceStaffingCandidate,
  type WorkforceStaffingGap
} from "@/lib/workforce-staffing-plan";
import {
  recommendProductivityNorm,
  type ProductivityNormBenchmark,
  type ProductivityNormRecommendation
} from "@/lib/workforce-productivity";
import type {
  AvailableWorkforceResource,
  BudgetItem,
  DailyReport,
  Project,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  ResourceAssignmentStatus,
  ResourceEmploymentType,
  ResourceKind,
  ResourceStatus,
  ScheduleItem,
  WorkforceResource
} from "@/lib/types";

type ViewMode = "economics" | "staffing" | "team" | "requests" | "demand" | "settings";

type Props = {
  projectId: string;
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  dailyReports: DailyReport[];
  scheduleItems: ScheduleItem[];
  onNavigate: (tab: string) => void;
};

type ResourceForm = {
  kind: ResourceKind;
  name: string;
  profession: string;
  employmentType: ResourceEmploymentType;
  headcount: number;
  capacityHoursPerMonth: number;
  productivityNorm: number;
  productivityUnit: string;
  monthlyCost: number;
  grossMonthlySalary: number;
  hourlyCost: number;
  certifications: string;
  status: ResourceStatus;
  notes: string;
  startsAt: string;
  endsAt: string;
  allocationPercent: number;
  plannedHours: number;
  plannedOutput: number;
  assignmentStatus: ResourceAssignmentStatus;
  assignmentNotes: string;
};

type DemandForm = {
  category: Exclude<ResourceKind, "equipment">;
  profession: string;
  function: string;
  grossMonthlySalary: number;
  peakHeadcount: number;
  personMonths: number;
  plannedHours: number;
  productivityNorm: number;
  productivityUnit: string;
  startsAt: string;
  endsAt: string;
  notes: string;
};

type WorkforceImportRow = {
  key: string;
  sheetName: string;
  sourceRow: number;
  section: string;
  name: string;
  profession: string;
  kind: Exclude<ResourceKind, "equipment">;
  employmentType: Exclude<ResourceEmploymentType, "owned" | "rented">;
  netMonthlySalary: number;
  employerMonthlyCost: number;
  notes: string;
  duplicateInFile: boolean;
  existingStatus: "new" | "organization" | "assigned";
};

type WorkforceImportPreview = {
  parserVersion: string;
  fileName: string;
  rows: WorkforceImportRow[];
  warnings: string[];
  skippedRows: number;
};

const kindLabels: Record<ResourceKind, string> = {
  worker: "Рабочий",
  engineer: "ИТР",
  crew: "Бригада",
  equipment: "Техника"
};

const employmentLabels: Record<ResourceEmploymentType, string> = {
  staff: "Штат",
  hired: "Привлечённый",
  subcontract: "Субподряд",
  owned: "Собственная",
  rented: "Аренда"
};

const statusLabels: Record<ResourceStatus, string> = {
  active: "Доступен",
  unavailable: "Недоступен",
  maintenance: "На обслуживании",
  archived: "Архив"
};

function projectDates(project: Partial<Project>) {
  return {
    startsAt: project.startsAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endsAt: project.endsAt?.slice(0, 10) ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10)
  };
}

function defaultForm(project: Partial<Project>): ResourceForm {
  return {
    kind: "worker",
    name: "",
    profession: "",
    employmentType: "staff",
    headcount: 1,
    capacityHoursPerMonth: 160,
    productivityNorm: 0,
    productivityUnit: "",
    monthlyCost: 0,
    grossMonthlySalary: 0,
    hourlyCost: 0,
    certifications: "",
    status: "active",
    notes: "",
    ...projectDates(project),
    allocationPercent: 100,
    plannedHours: 0,
    plannedOutput: 0,
    assignmentStatus: "planned",
    assignmentNotes: ""
  };
}

function defaultDemand(project: Partial<Project>): DemandForm {
  return {
    category: "worker",
    profession: "",
    function: "",
    grossMonthlySalary: 0,
    peakHeadcount: 1,
    personMonths: 1,
    plannedHours: 160,
    productivityNorm: 0,
    productivityUnit: "",
    ...projectDates(project),
    notes: ""
  };
}

function defaultPolicy(projectId: string): ProjectPayrollPolicy {
  return { projectId, ...DEFAULT_PAYROLL_POLICY };
}

function formFromItem(item: WorkforceResource): ResourceForm {
  return {
    kind: item.kind,
    name: item.name,
    profession: item.profession ?? "",
    employmentType: item.employmentType,
    headcount: item.headcount,
    capacityHoursPerMonth: item.capacityHoursPerMonth,
    productivityNorm: item.productivityNorm,
    productivityUnit: item.productivityUnit ?? "",
    monthlyCost: item.monthlyCost,
    grossMonthlySalary: item.grossMonthlySalary,
    hourlyCost: item.hourlyCost,
    certifications: item.certifications.join(", "),
    status: item.status,
    notes: item.notes ?? "",
    startsAt: item.assignment.startsAt.slice(0, 10),
    endsAt: item.assignment.endsAt.slice(0, 10),
    allocationPercent: item.assignment.allocationPercent,
    plannedHours: item.assignment.plannedHours,
    plannedOutput: item.assignment.plannedOutput,
    assignmentStatus: item.assignment.status,
    assignmentNotes: item.assignment.notes ?? ""
  };
}

function isPeople(kind: ResourceKind) {
  return kind !== "equipment";
}

function usesPayroll(kind: ResourceKind, employmentType: ResourceEmploymentType) {
  return isPeople(kind) && employmentType !== "subcontract";
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function number(value: number, digits = 0) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: digits }).format(value);
}

function percent(value: number) {
  return `${number(value, 1)}%`;
}

function confidenceLabel(value: number) {
  if (value >= 0.8) return "Высокая";
  if (value >= 0.55) return "Средняя";
  return "Требует проверки";
}

function normConfidenceLabel(value: ProductivityNormRecommendation["confidence"]) {
  if (value === "high") return "высокое";
  if (value === "medium") return "среднее";
  return "низкое";
}

function staffingActionLabel(action: WorkforceStaffingGap["action"]) {
  if (action === "covered") return "Покрыто";
  if (action === "assign-existing") return "Назначить из штата";
  if (action === "combine") return "Штат + найм";
  if (action === "hire") return "Подбор ИТР";
  return "Найм / субподряд";
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для изменения ФОТ и ресурсов.";
  return body.error ?? fallback;
}

export function ResourcesEquipmentWorkspace(props: Props) {
  const reportModel = buildResourcesEquipmentIntelligence(props);
  const [items, setItems] = useState<WorkforceResource[]>([]);
  const [demands, setDemands] = useState<ProjectLaborDemand[]>([]);
  const [policy, setPolicy] = useState<ProjectPayrollPolicy>(() => defaultPolicy(props.projectId));
  const [policyForm, setPolicyForm] = useState<ProjectPayrollPolicy>(() => defaultPolicy(props.projectId));
  const [available, setAvailable] = useState<AvailableWorkforceResource[]>([]);
  const [productivityNorms, setProductivityNorms] = useState<ProductivityNormBenchmark[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mode, setMode] = useState<ViewMode>("economics");
  const [formOpen, setFormOpen] = useState(false);
  const [demandOpen, setDemandOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingResourceId, setExistingResourceId] = useState("");
  const [form, setForm] = useState<ResourceForm>(() => defaultForm(props.project));
  const [demandForm, setDemandForm] = useState<DemandForm>(() => defaultDemand(props.project));
  const [resourceNormAuto, setResourceNormAuto] = useState(true);
  const [demandNormAuto, setDemandNormAuto] = useState(true);
  const [resourceFilter, setResourceFilter] = useState<"people" | "equipment">("people");
  const [staffingFilter, setStaffingFilter] = useState<"gaps" | "all">("gaps");
  const [importOpen, setImportOpen] = useState(false);
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<WorkforceImportPreview | null>(null);
  const [importSelection, setImportSelection] = useState<string[]>([]);

  const resourceNormRecommendation = useMemo(() => recommendProductivityNorm({
    category: form.kind === "equipment" ? "engineer" : form.kind,
    profession: form.profession,
    unit: form.productivityUnit,
    benchmarks: productivityNorms
  }), [form.kind, form.productivityUnit, form.profession, productivityNorms]);
  const demandNormRecommendation = useMemo(() => recommendProductivityNorm({
    category: demandForm.category,
    profession: demandForm.profession,
    function: demandForm.function,
    unit: demandForm.productivityUnit,
    benchmarks: productivityNorms
  }), [demandForm.category, demandForm.function, demandForm.productivityUnit, demandForm.profession, productivityNorms]);
  const resourceNormAutoApplied = resourceNormAuto && Boolean(resourceNormRecommendation?.autoApplicable);
  const demandNormAutoApplied = demandNormAuto && Boolean(demandNormRecommendation?.autoApplicable);
  const effectiveResourceNorm = resourceNormAutoApplied ? resourceNormRecommendation?.norm ?? 0 : form.productivityNorm;
  const effectiveResourceUnit = resourceNormAutoApplied ? resourceNormRecommendation?.unit ?? "" : form.productivityUnit;
  const effectiveDemandNorm = demandNormAutoApplied ? demandNormRecommendation?.norm ?? 0 : demandForm.productivityNorm;
  const effectiveDemandUnit = demandNormAutoApplied ? demandNormRecommendation?.unit ?? "" : demandForm.productivityUnit;

  const summary = useMemo(() => buildWorkforceCapacitySummary(items, demands, policy), [demands, items, policy]);
  const economics = useMemo(() => buildWorkforceEconomics({
    resources: items,
    demands,
    policy,
    budgetItems: props.budgetItems,
    contractAmount: props.project.contractAmount ?? 0
  }), [demands, items, policy, props.budgetItems, props.project.contractAmount]);
  const staffingPlan = useMemo(() => buildWorkforceStaffingPlan({
    resources: items,
    demands,
    availableResources: available,
    policy
  }), [available, demands, items, policy]);
  const visibleItems = useMemo(
    () => items.filter((item) => resourceFilter === "equipment" ? item.kind === "equipment" : item.kind !== "equipment"),
    [items, resourceFilter]
  );
  const demandAllocations = useMemo(() => demands.flatMap((item) => item.allocations.map((allocation) => ({
    ...allocation,
    demandId: item.id,
    profession: item.profession,
    category: item.category
  }))).sort((left, right) => right.plannedHours - left.plannedHours), [demands]);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/resources`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить ФОТ и ресурсный план."));
      const body = (await response.json()) as {
        items?: WorkforceResource[];
        demands?: ProjectLaborDemand[];
        policy?: ProjectPayrollPolicy;
        available?: AvailableWorkforceResource[];
        productivityNorms?: ProductivityNormBenchmark[];
        permissions?: { edit?: boolean };
      };
      const nextPolicy = body.policy ?? defaultPolicy(props.projectId);
      setItems(body.items ?? []);
      setDemands(body.demands ?? []);
      setPolicy(nextPolicy);
      setPolicyForm(nextPolicy);
      setAvailable(body.available ?? []);
      setProductivityNorms(body.productivityNorms ?? []);
      setCanEdit(Boolean(body.permissions?.edit));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ФОТ и ресурсный план.");
    } finally {
      setLoading(false);
    }
  }, [props.projectId]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  function openCreate(kind: ResourceKind = "worker") {
    setEditingId(null);
    setExistingResourceId("");
    setForm({ ...defaultForm(props.project), kind });
    setResourceNormAuto(true);
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
  }

  function openEdit(item: WorkforceResource) {
    setEditingId(item.id);
    setExistingResourceId("");
    setForm(formFromItem(item));
    setResourceNormAuto(false);
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
  }

  function openCandidateAssignment(candidate: WorkforceStaffingCandidate, gap: WorkforceStaffingGap) {
    const allocationPercent = Math.max(1, Math.min(100, Math.ceil(gap.gapHeadcount / Math.max(1, candidate.headcount) * 100)));
    setEditingId(null);
    setExistingResourceId(candidate.resourceId);
    setResourceNormAuto(false);
    setForm({
      ...defaultForm(props.project),
      kind: candidate.kind,
      startsAt: gap.monthStartsAt.slice(0, 10),
      endsAt: gap.monthEndsAt.slice(0, 10),
      allocationPercent,
      plannedHours: Math.round(gap.gapHeadcount * policy.workingHoursPerMonth),
      assignmentStatus: "planned",
      assignmentNotes: `Комплектование: ${gap.profession}, ${gap.monthLabel}`
    });
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
  }

  function openNewResourceForGap(gap: WorkforceStaffingGap) {
    setEditingId(null);
    setExistingResourceId("");
    setResourceNormAuto(true);
    setForm({
      ...defaultForm(props.project),
      kind: gap.category,
      profession: gap.profession,
      headcount: Math.max(1, Math.ceil(gap.gapHeadcount)),
      grossMonthlySalary: gap.grossMonthlySalary,
      startsAt: gap.monthStartsAt.slice(0, 10),
      endsAt: gap.monthEndsAt.slice(0, 10),
      plannedHours: Math.round(gap.gapHeadcount * policy.workingHoursPerMonth),
      assignmentStatus: "planned",
      assignmentNotes: `Закрытие дефицита: ${gap.profession}, ${gap.monthLabel}`
    });
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
  }

  function openDemand() {
    setDemandForm(defaultDemand(props.project));
    setDemandNormAuto(true);
    setDemandOpen(true);
    setFormOpen(false);
    setError("");
    setNotice("");
  }

  function toggleResourceNormAuto(value: boolean) {
    if (!value && resourceNormRecommendation?.autoApplicable) {
      setForm((current) => ({
        ...current,
        productivityNorm: resourceNormRecommendation.norm,
        productivityUnit: resourceNormRecommendation.unit
      }));
    }
    setResourceNormAuto(value);
  }

  function toggleDemandNormAuto(value: boolean) {
    if (!value && demandNormRecommendation?.autoApplicable) {
      setDemandForm((current) => ({
        ...current,
        productivityNorm: demandNormRecommendation.norm,
        productivityUnit: demandNormRecommendation.unit
      }));
    }
    setDemandNormAuto(value);
  }

  async function saveResource(event: React.FormEvent) {
    event.preventDefault();
    setSaving("resource");
    setError("");
    setNotice("");
    try {
      const assignment = {
        startsAt: form.startsAt,
        endsAt: form.endsAt,
        allocationPercent: form.allocationPercent,
        plannedHours: form.plannedHours,
        plannedOutput: form.plannedOutput,
        status: form.assignmentStatus,
        notes: form.assignmentNotes || null
      };
      const payload = existingResourceId && !editingId
        ? { resourceId: existingResourceId, assignment }
        : {
            kind: form.kind,
            name: form.name,
            profession: form.profession || null,
            employmentType: form.employmentType,
            headcount: form.headcount,
            capacityHoursPerMonth: form.capacityHoursPerMonth,
            productivityNorm: effectiveResourceNorm,
            productivityUnit: effectiveResourceUnit || null,
            grossMonthlySalary: usesPayroll(form.kind, form.employmentType) ? form.grossMonthlySalary : 0,
            monthlyCost: usesPayroll(form.kind, form.employmentType) ? form.grossMonthlySalary * form.headcount : form.monthlyCost,
            hourlyCost: form.hourlyCost,
            certifications: form.certifications.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean),
            status: form.status,
            notes: form.notes || null,
            assignment
          };
      const response = await fetch(
        editingId ? `/api/projects/${props.projectId}/resources/${editingId}` : `/api/projects/${props.projectId}/resources`,
        {
          method: editingId ? "PATCH" : "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(payload)
        }
      );
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить ресурс."));
      setFormOpen(false);
      setEditingId(null);
      setExistingResourceId("");
      setNotice("Ресурс сохранён и включён в расчёт ФОТ проекта.");
      await loadResources();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить ресурс.");
    } finally {
      setSaving("");
    }
  }

  async function saveDemand(event: React.FormEvent) {
    event.preventDefault();
    setSaving("demand");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/labor-demands`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...demandForm,
          function: demandForm.function || null,
          productivityNorm: effectiveDemandNorm,
          productivityUnit: effectiveDemandUnit || null,
          monthlyProfile: [],
          source: "Ручной план ФОТ",
          confidence: 1,
          notes: demandForm.notes || null
        })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить потребность."));
      setDemandOpen(false);
      setDemandForm(defaultDemand(props.project));
      setNotice("Потребность добавлена. Свяжите её с ВОР через повторный импорт или уточните вручную.");
      await loadResources();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить потребность.");
    } finally {
      setSaving("");
    }
  }

  async function savePolicy(event: React.FormEvent) {
    event.preventDefault();
    setSaving("policy");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/payroll-policy`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(policyForm)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить параметры начислений."));
      const body = (await response.json()) as { policy?: ProjectPayrollPolicy };
      const nextPolicy = body.policy ?? policyForm;
      setPolicy(nextPolicy);
      setPolicyForm(nextPolicy);
      setNotice("Параметры ФОТ обновлены. Экономика проекта пересчитана.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить параметры начислений.");
    } finally {
      setSaving("");
    }
  }

  async function removeAssignment(item: WorkforceResource) {
    if (!window.confirm(`Снять ресурс «${item.name}» с этого проекта? Запись общего реестра сохранится.`)) return;
    setSaving(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/resources/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось снять ресурс с проекта."));
      await loadResources();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Не удалось снять ресурс с проекта.");
    } finally {
      setSaving("");
    }
  }

  async function removeDemand(item: ProjectLaborDemand) {
    if (!window.confirm(`Удалить потребность «${item.profession}»? Импортированный план можно восстановить повторным импортом Excel.`)) return;
    setSaving(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/labor-demands/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить потребность."));
      await loadResources();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Не удалось удалить потребность.");
    } finally {
      setSaving("");
    }
  }

  function openImport() {
    setImportOpen(true);
    setImportFile(null);
    setImportPreview(null);
    setImportSelection([]);
    setError("");
    setNotice("");
    setMode("team");
  }

  function chooseImportFile(file: File | null) {
    setImportFile(file);
    setImportPreview(null);
    setImportSelection([]);
  }

  async function previewImport() {
    if (!importFile) return;
    setSaving("workforce-preview");
    setError("");
    try {
      const data = new FormData();
      data.set("action", "preview");
      data.set("file", importFile);
      const response = await fetch(`/api/projects/${props.projectId}/resources/import`, { method: "POST", body: data });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось разобрать Excel-реестр."));
      const body = (await response.json()) as { preview?: WorkforceImportPreview };
      const preview = body.preview ?? null;
      setImportPreview(preview);
      setImportSelection(preview?.rows.filter((row) => !row.duplicateInFile && row.existingStatus !== "assigned").map((row) => row.key) ?? []);
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Не удалось разобрать Excel-реестр.");
    } finally {
      setSaving("");
    }
  }

  async function commitImport() {
    if (!importFile || !importSelection.length) return;
    setSaving("workforce-commit");
    setError("");
    try {
      const data = new FormData();
      data.set("action", "commit");
      data.set("file", importFile);
      data.set("selectedKeys", JSON.stringify(importSelection));
      const response = await fetch(`/api/projects/${props.projectId}/resources/import`, { method: "POST", body: data });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось импортировать сотрудников."));
      const body = (await response.json()) as { result?: { created?: number; assigned?: number; skipped?: number } };
      setNotice(`Реестр сохранён: создано ${body.result?.created ?? 0}, назначено ${body.result?.assigned ?? 0}, пропущено ${body.result?.skipped ?? 0}.`);
      setImportOpen(false);
      setImportFile(null);
      setImportPreview(null);
      setImportSelection([]);
      await loadResources();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Не удалось импортировать сотрудников.");
    } finally {
      setSaving("");
    }
  }

  function toggleImportRow(key: string) {
    setImportSelection((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <section className="resources-equipment-workspace payroll-workspace" aria-label="ФОТ, штат и трудовая потребность">
      <header className={`payroll-workspace-header status-${summary.status}`}>
        <div>
          <div className="eyebrow">Workforce &amp; Payroll Intelligence</div>
          <h3>Штат, ФОТ и потребность проекта</h3>
          <p>Сводит сотрудников, ИТР и бригады с потребностью из Excel, начислениями работодателя, ВОР и прогнозной рентабельностью.</p>
          <div className="quality-issues-badges">
            <span className={`badge ${summary.shortageHours ? "red" : summary.headcount ? "green" : "gray"}`}>
              {summary.shortageHours ? `Дефицит ${number(summary.shortageHours)} ч/мес.` : summary.headcount ? "Ресурсный план покрыт" : "Штат не назначен"}
            </span>
            <span className="badge blue">{summary.headcount} человек · {summary.engineers} ИТР</span>
            <span className="badge gray">{demands.length} строк потребности</span>
          </div>
        </div>
        <div className="quality-issues-actions">
          <button className="button secondary compact-button" disabled={loading} type="button" onClick={() => void loadResources()}>
            <RefreshCw className={loading ? "spin" : ""} size={16} /> Обновить
          </button>
          {canEdit ? (
            <>
              <button className="button secondary compact-button" type="button" onClick={openDemand}>
                <Plus size={16} /> Потребность
              </button>
              <button className="button secondary compact-button" type="button" onClick={openImport}>
                <Upload size={16} /> Реестр Excel
              </button>
              <button className="button secondary compact-button" type="button" onClick={() => setMode("requests")}>
                <ClipboardList size={16} /> Заявка
              </button>
              <button className="button primary compact-button" type="button" onClick={() => openCreate()}>
                <Plus size={16} /> Сотрудник
              </button>
            </>
          ) : null}
        </div>
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}

      <div className="project-action-toolbar payroll-mode-tabs" role="tablist" aria-label="Режим раздела ФОТ">
        <button className={mode === "economics" ? "active" : ""} type="button" onClick={() => setMode("economics")}><Calculator size={15} /> Экономика</button>
        <button className={mode === "staffing" ? "active" : ""} type="button" onClick={() => setMode("staffing")}><UserRoundSearch size={15} /> Комплектование</button>
        <button className={mode === "team" ? "active" : ""} type="button" onClick={() => setMode("team")}><Users size={15} /> Штат</button>
        {canEdit ? <button className={mode === "requests" ? "active" : ""} type="button" onClick={() => setMode("requests")}><ClipboardList size={15} /> Заявки на допуск</button> : null}
        <button className={mode === "demand" ? "active" : ""} type="button" onClick={() => setMode("demand")}><FileSpreadsheet size={15} /> Потребность по ВОР</button>
        <button className={mode === "settings" ? "active" : ""} type="button" onClick={() => setMode("settings")}><ShieldCheck size={15} /> Начисления</button>
      </div>

      {mode === "economics" ? (
        <>
          <div className="payroll-kpi-grid">
            <Metric title="Налоговая база / ФОТ" value={money(economics.grossPayroll)} detail={`${money(economics.demandGrossPayroll)} по потребности`} tone={economics.grossPayroll ? "info" : "neutral"} />
            <Metric title="Начисления работодателя" value={money(economics.employerContributions)} detail={`${percent(policy.insuranceContributionRate + policy.accidentContributionRate)} сверх ФОТ`} tone={economics.employerContributions ? "warn" : "neutral"} />
            <Metric title="Полная стоимость труда" value={money(economics.totalEmployerCost)} detail={`Бюджет ФОТ ${money(economics.payrollBudget)}`} tone={economics.uncoveredEmployerCost ? "warn" : economics.totalEmployerCost ? "good" : "neutral"} />
            <Metric title="Маржа с учетом ФОТ" value={percent(economics.adjustedForecastMarginPercent)} detail={`Прибыль ${money(economics.adjustedForecastProfit)}`} tone={economics.adjustedForecastProfit < 0 ? "bad" : economics.adjustedForecastMarginPercent < 10 ? "warn" : "good"} />
          </div>

          <div className="payroll-economics-band">
            <div>
              <span><Landmark size={17} /> Экономический расчёт</span>
              <strong>{money(economics.adjustedForecastCost)}</strong>
              <small>Прогнозная себестоимость проекта после покрытия ФОТ и начислений</small>
            </div>
            <div>
              <span>Непокрытая стоимость труда</span>
              <strong className={economics.uncoveredEmployerCost ? "negative" : ""}>{money(economics.uncoveredEmployerCost)}</strong>
              <small>{economics.uncoveredEmployerCost ? "Добавлена к прогнозу сверх существующего бюджета ФОТ" : "Текущий бюджет ФОТ покрывает расчётную нагрузку"}</small>
            </div>
            <div>
              <span>НДФЛ к удержанию</span>
              <strong>{money(economics.withheldPersonalIncomeTax)}</strong>
              <small>Показан отдельно и не добавляется повторно к затратам работодателя</small>
            </div>
          </div>

          <div className="payroll-capacity-strip">
            <div><small>Пиковая потребность</small><strong>{number(summary.demandHeadcount, 1)} чел.</strong></div>
            <div><small>Назначено</small><strong>{summary.headcount} чел.</strong></div>
            <div><small>Потребность</small><strong>{number(summary.demandHours)} ч/мес.</strong></div>
            <div><small>Мощность</small><strong>{number(summary.allocatedCapacityHours)} ч/мес.</strong></div>
            <button className="button secondary compact-button" type="button" onClick={() => setMode("demand")}>Проверить ВОР</button>
          </div>

          <div className={`payroll-readiness-note ${demands.length ? "ready" : "empty"}`}>
            <FileSpreadsheet size={18} />
            <div>
              <strong>{demands.length ? "ФОТ из Excel включён в расчёт" : "Нет рассчитанной потребности из Excel"}</strong>
              <span>{demands.length
                ? `${demands.length} ролей и ${demandAllocations.length} связей с работами. Низкую уверенность нужно проверить вручную.`
                : "Загрузите единый Excel проекта: строки ФОТ станут потребностью, а ВОР получат плановые трудозатраты."}</span>
            </div>
            <button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Бюджет / ВОР")}>Открыть импорт</button>
          </div>
        </>
      ) : null}

      {mode === "staffing" ? (
        <>
          <div className="staffing-plan-heading">
            <div>
              <div className="eyebrow">Workforce Gap &amp; Staffing Plan</div>
              <h3>План комплектования по профессиям и месяцам</h3>
              <p>Сопоставляет потребность из ФОТ/ВОР с назначенным штатом и показывает, кого можно привлечь из реестра организации.</p>
            </div>
            <span className={`badge ${staffingPlan.summary.status === "controlled" ? "green" : staffingPlan.summary.status === "attention" ? "yellow" : "gray"}`}>
              {staffingPlan.summary.status === "controlled" ? "Потребность покрыта" : staffingPlan.summary.status === "attention" ? "Требуется комплектование" : "Нет плана потребности"}
            </span>
          </div>

          <div className="staffing-kpi-grid">
            <Metric title="Покрытие потребности" value={percent(staffingPlan.summary.coveragePercent)} detail={`${number(staffingPlan.summary.assignedPersonMonths, 1)} из ${number(staffingPlan.summary.requiredPersonMonths, 1)} чел.-мес.`} tone={staffingPlan.summary.status === "controlled" ? "good" : staffingPlan.summary.status === "attention" ? "warn" : "neutral"} />
            <Metric title="Пиковый дефицит" value={`${number(staffingPlan.summary.peakGapHeadcount, 1)} чел.`} detail={`${staffingPlan.summary.professionsWithGap} профессий требуют решения`} tone={staffingPlan.summary.peakGapHeadcount ? "warn" : staffingPlan.summary.peakRequiredHeadcount ? "good" : "neutral"} />
            <Metric title="Дефицит трудозатрат" value={`${number(staffingPlan.summary.shortageHours)} ч`} detail="Суммарно по непокрытым месяцам" tone={staffingPlan.summary.shortageHours ? "warn" : "neutral"} />
            <Metric title="Стоимость закрытия" value={money(staffingPlan.summary.estimatedGapEmployerCost)} detail={canEdit ? `${staffingPlan.summary.matchedAvailableResources} подходящих ресурсов в реестре` : "Подбор кандидатов доступен редактору проекта"} tone={staffingPlan.summary.estimatedGapEmployerCost ? "info" : "neutral"} />
          </div>

          <div className="project-action-toolbar staffing-filter" role="group" aria-label="Фильтр плана комплектования">
            <button className={staffingFilter === "gaps" ? "active" : ""} type="button" onClick={() => setStaffingFilter("gaps")}>Только дефицит</button>
            <button className={staffingFilter === "all" ? "active" : ""} type="button" onClick={() => setStaffingFilter("all")}>Все роли</button>
          </div>

          {staffingPlan.months.length ? (
            <div className="staffing-timeline">
              {staffingPlan.months.map((month) => {
                const rows = staffingFilter === "gaps" ? month.rows.filter((row) => row.gapHeadcount > 0) : month.rows;
                if (!rows.length) return null;
                return (
                  <section className="staffing-month" key={month.key}>
                    <header className="staffing-month-header">
                      <div><strong>{month.label}</strong><span>{number(month.requiredHeadcount, 1)} требуется · {number(month.assignedHeadcount, 1)} назначено</span></div>
                      <span className={`badge ${month.gapHeadcount ? "yellow" : "green"}`}>{month.gapHeadcount ? `Дефицит ${number(month.gapHeadcount, 1)}` : "Покрыто"}</span>
                    </header>
                    <div className="staffing-gap-list">
                      {rows.map((row) => (
                        <article className={`staffing-gap-row ${row.gapHeadcount ? "has-gap" : "covered"}`} key={row.key}>
                          <div className="staffing-gap-identity">
                            <span className="resource-kind-icon"><HardHat size={17} /></span>
                            <div><strong>{row.profession}</strong><span>{kindLabels[row.category]} · {staffingActionLabel(row.action)}</span></div>
                          </div>
                          <div className="staffing-coverage">
                            <div><span>Покрытие</span><strong>{percent(row.coveragePercent)}</strong></div>
                            <div className="staffing-coverage-track" aria-label={`Покрытие ${row.coveragePercent}%`}><span style={{ width: `${row.coveragePercent}%` }} /></div>
                          </div>
                          <div className="staffing-gap-metrics">
                            <span><small>Нужно</small><strong>{number(row.requiredHeadcount, 1)}</strong></span>
                            <span><small>Назначено</small><strong>{number(row.assignedHeadcount, 1)}</strong></span>
                            <span><small>Дефицит</small><strong>{number(row.gapHeadcount, 1)}</strong></span>
                            <span><small>Стоимость</small><strong>{money(row.estimatedEmployerCost)}</strong></span>
                          </div>
                          <div className="staffing-candidates">
                            {row.gapHeadcount ? (
                              row.candidates.length ? (
                                <>
                                  <span>Подходят из реестра</span>
                                  <div>{row.candidates.map((candidate) => <em key={candidate.resourceId}>{candidate.name} · свободно {number(candidate.availableHeadcount, 1)}</em>)}</div>
                                </>
                              ) : <span>{canEdit ? "Свободных совпадений в реестре нет" : "Подбор кандидатов доступен редактору проекта"}</span>
                            ) : <span>Дополнительное назначение не требуется</span>}
                          </div>
                          {canEdit && row.gapHeadcount ? (
                            row.candidates[0]
                              ? <button className="button secondary compact-button" type="button" onClick={() => openCandidateAssignment(row.candidates[0], row)}><UserPlus size={15} /> Назначить</button>
                              : <button className="button secondary compact-button" type="button" onClick={() => openNewResourceForGap(row)}><Plus size={15} /> Добавить</button>
                          ) : null}
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
              {staffingFilter === "gaps" && staffingPlan.rows.every((row) => row.gapHeadcount <= 0)
                ? <div className="empty-state">Все рассчитанные роли уже покрыты назначенными ресурсами.</div>
                : null}
            </div>
          ) : (
            <div className="empty-state">Сначала загрузите ФОТ из проектного Excel или добавьте потребность вручную. План комплектования не строит ложный «зелёный» статус без исходных данных.</div>
          )}

          <div className="staffing-limitations">
            <AlertTriangle size={17} />
            <div><strong>Проверка перед назначением</strong>{staffingPlan.limitations.map((item) => <span key={item}>{item}</span>)}</div>
          </div>
        </>
      ) : null}

      {formOpen ? (
        <form className="resource-capacity-form" onSubmit={saveResource}>
          <div className="reports-workflow-heading compact">
            <div><strong>{editingId ? "Редактирование сотрудника или ресурса" : "Новый сотрудник, ИТР, бригада или техника"}</strong><span>Для людей укажите зарплату до удержаний на одного человека.</span></div>
            <button className="icon-button" title="Закрыть" type="button" onClick={() => setFormOpen(false)}><X size={18} /></button>
          </div>
          {!editingId && available.length ? (
            <label className="field field-wide"><span>Назначить из общего реестра</span><select value={existingResourceId} onChange={(event) => setExistingResourceId(event.target.value)}><option value="">Создать новый ресурс</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · {kindLabels[item.kind]}</option>)}</select></label>
          ) : null}
          {!existingResourceId || editingId ? (
            <div className="resource-capacity-grid">
              <label className="field"><span>Категория</span><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ResourceKind })}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field field-wide"><span>ФИО / название бригады</span><input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="field"><span>Должность / профессия</span><input value={form.profession} onChange={(event) => setForm({ ...form, profession: event.target.value })} /></label>
              <label className="field"><span>Форма привлечения</span><select value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value as ResourceEmploymentType })}>{Object.entries(employmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>Численность</span><input min={1} type="number" value={form.headcount} onChange={(event) => setForm({ ...form, headcount: Number(event.target.value) })} /></label>
              {usesPayroll(form.kind, form.employmentType) ? (
                <label className="field"><span>Зарплата до удержаний, ₽/чел.</span><input min={0} type="number" value={form.grossMonthlySalary} onChange={(event) => setForm({ ...form, grossMonthlySalary: Number(event.target.value) })} /></label>
              ) : (
                <label className="field"><span>{form.kind === "equipment" ? "Аренда / стоимость" : "Стоимость субподряда"}, ₽/мес.</span><input min={0} type="number" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost: Number(event.target.value) })} /></label>
              )}
              <label className="field"><span>Стоимость часа</span><input min={0} type="number" value={form.hourlyCost} onChange={(event) => setForm({ ...form, hourlyCost: Number(event.target.value) })} /></label>
              <label className="field"><span>Мощность, ч/мес.</span><input min={0} type="number" value={form.capacityHoursPerMonth} onChange={(event) => setForm({ ...form, capacityHoursPerMonth: Number(event.target.value) })} /></label>
              <label className="field"><span>Норма выработки</span><input min={0} readOnly={resourceNormAutoApplied} step="0.001" type="number" value={effectiveResourceNorm} onChange={(event) => { setResourceNormAuto(false); setForm({ ...form, productivityNorm: Number(event.target.value) }); }} /></label>
              <label className="field"><span>Единица выработки</span><input readOnly={resourceNormAutoApplied} value={effectiveResourceUnit} onChange={(event) => { setResourceNormAuto(false); setForm({ ...form, productivityUnit: event.target.value }); }} placeholder="м²/смена, м³/ч" /></label>
              <ProductivityNormAssistant
                autoEnabled={resourceNormAuto}
                category={form.kind}
                onToggle={toggleResourceNormAuto}
                recommendation={resourceNormRecommendation}
              />
              <label className="field field-wide"><span>Допуски / удостоверения</span><input value={form.certifications} onChange={(event) => setForm({ ...form, certifications: event.target.value })} placeholder="Через запятую" /></label>
              <label className="field"><span>Статус</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ResourceStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field field-wide"><span>Примечание</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
            </div>
          ) : null}
          <div className="resource-capacity-grid assignment">
            <label className="field"><span>Начало</span><input required type="date" value={form.startsAt} onChange={(event) => setForm({ ...form, startsAt: event.target.value })} /></label>
            <label className="field"><span>Окончание</span><input required type="date" value={form.endsAt} onChange={(event) => setForm({ ...form, endsAt: event.target.value })} /></label>
            <label className="field"><span>Загрузка, %</span><input min={1} max={200} type="number" value={form.allocationPercent} onChange={(event) => setForm({ ...form, allocationPercent: Number(event.target.value) })} /></label>
            <label className="field"><span>План часов</span><input min={0} type="number" value={form.plannedHours} onChange={(event) => setForm({ ...form, plannedHours: Number(event.target.value) })} /></label>
            <label className="field"><span>План выработки</span><input min={0} step="0.001" type="number" value={form.plannedOutput} onChange={(event) => setForm({ ...form, plannedOutput: Number(event.target.value) })} /></label>
            <label className="field"><span>Статус назначения</span><select value={form.assignmentStatus} onChange={(event) => setForm({ ...form, assignmentStatus: event.target.value as ResourceAssignmentStatus })}><option value="planned">Запланировано</option><option value="active">На проекте</option><option value="completed">Завершено</option></select></label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={saving === "resource"} type="submit">{saving === "resource" ? "Сохраняю..." : editingId ? "Сохранить изменения" : "Добавить в план"}</button>
            <button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      {demandOpen ? (
        <form className="resource-capacity-form" onSubmit={saveDemand}>
          <div className="reports-workflow-heading compact">
            <div><strong>Ручная потребность проекта</strong><span>Используйте, если роли или нормы отсутствуют в Excel.</span></div>
            <button className="icon-button" title="Закрыть" type="button" onClick={() => setDemandOpen(false)}><X size={18} /></button>
          </div>
          <div className="resource-capacity-grid">
            <label className="field"><span>Категория</span><select value={demandForm.category} onChange={(event) => setDemandForm({ ...demandForm, category: event.target.value as DemandForm["category"] })}><option value="worker">Рабочий</option><option value="engineer">ИТР</option><option value="crew">Бригада</option></select></label>
            <label className="field field-wide"><span>Должность / профессия</span><input required minLength={2} value={demandForm.profession} onChange={(event) => setDemandForm({ ...demandForm, profession: event.target.value })} /></label>
            <label className="field field-wide"><span>Функция</span><input value={demandForm.function} onChange={(event) => setDemandForm({ ...demandForm, function: event.target.value })} /></label>
            <label className="field"><span>Зарплата до удержаний, ₽/мес.</span><input min={0} type="number" value={demandForm.grossMonthlySalary} onChange={(event) => setDemandForm({ ...demandForm, grossMonthlySalary: Number(event.target.value) })} /></label>
            <label className="field"><span>Пиковая численность</span><input min={0} step="0.1" type="number" value={demandForm.peakHeadcount} onChange={(event) => setDemandForm({ ...demandForm, peakHeadcount: Number(event.target.value) })} /></label>
            <label className="field"><span>Человеко-месяцы</span><input min={0} step="0.1" type="number" value={demandForm.personMonths} onChange={(event) => setDemandForm({ ...demandForm, personMonths: Number(event.target.value) })} /></label>
            <label className="field"><span>План часов</span><input min={0} type="number" value={demandForm.plannedHours} onChange={(event) => setDemandForm({ ...demandForm, plannedHours: Number(event.target.value) })} /></label>
            <label className="field"><span>Норма выработки</span><input min={0} readOnly={demandNormAutoApplied} step="0.001" type="number" value={effectiveDemandNorm} onChange={(event) => { setDemandNormAuto(false); setDemandForm({ ...demandForm, productivityNorm: Number(event.target.value) }); }} /></label>
            <label className="field"><span>Единица нормы</span><input readOnly={demandNormAutoApplied} value={effectiveDemandUnit} onChange={(event) => { setDemandNormAuto(false); setDemandForm({ ...demandForm, productivityUnit: event.target.value }); }} /></label>
            <ProductivityNormAssistant
              autoEnabled={demandNormAuto}
              category={demandForm.category}
              onToggle={toggleDemandNormAuto}
              recommendation={demandNormRecommendation}
            />
            <label className="field"><span>Начало</span><input required type="date" value={demandForm.startsAt} onChange={(event) => setDemandForm({ ...demandForm, startsAt: event.target.value })} /></label>
            <label className="field"><span>Окончание</span><input required type="date" value={demandForm.endsAt} onChange={(event) => setDemandForm({ ...demandForm, endsAt: event.target.value })} /></label>
            <label className="field field-wide"><span>Примечание</span><input value={demandForm.notes} onChange={(event) => setDemandForm({ ...demandForm, notes: event.target.value })} /></label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={saving === "demand"} type="submit">{saving === "demand" ? "Сохраняю..." : "Добавить потребность"}</button>
            <button className="button secondary" type="button" onClick={() => setDemandOpen(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      {mode === "team" ? (
        <>
          {importOpen ? (
            <section className="workforce-import-panel" aria-label="Импорт сотрудников из Excel">
              <div className="reports-workflow-heading compact">
                <div><strong>Импорт сотрудников из Excel</strong><span>Поддерживается реестр ФОТ со столбцами «Должность · ФИО · на руки · с учётом налогов».</span></div>
                <button className="icon-button" title="Закрыть" type="button" onClick={() => setImportOpen(false)}><X size={18} /></button>
              </div>
              <div className="workforce-import-controls">
                <label className="field field-wide"><span>Excel-реестр сотрудников</span><input accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel" type="file" onChange={(event) => chooseImportFile(event.target.files?.[0] ?? null)} /></label>
                <button className="button secondary" disabled={!importFile || saving === "workforce-preview"} type="button" onClick={() => void previewImport()}><FileSpreadsheet size={16} />{saving === "workforce-preview" ? "Анализирую..." : "Проверить файл"}</button>
              </div>
              {importPreview ? (
                <>
                  <div className="workforce-import-summary">
                    <span><strong>{importPreview.rows.length}</strong><small>строк распознано</small></span>
                    <span><strong>{importSelection.length}</strong><small>выбрано</small></span>
                    <span><strong>{importPreview.rows.filter((row) => row.existingStatus === "assigned").length}</strong><small>уже на проекте</small></span>
                    <span><strong>{importPreview.rows.filter((row) => row.duplicateInFile).length}</strong><small>дублей в файле</small></span>
                  </div>
                  {importPreview.warnings.length ? <div className="workforce-import-warnings">{importPreview.warnings.map((warning) => <span key={warning}><AlertTriangle size={14} />{warning}</span>)}</div> : null}
                  <div className="workforce-import-table-scroll">
                    <div className="workforce-import-table" role="table" aria-label="Предпросмотр сотрудников">
                      <div className="workforce-import-head" role="row"><span /><span>ФИО / должность</span><span>Тип</span><span>На руки</span><span>Стоимость работодателя</span><span>Статус</span></div>
                      {importPreview.rows.map((row) => {
                        const disabled = row.duplicateInFile || row.existingStatus === "assigned";
                        return (
                          <label className={`workforce-import-row ${disabled ? "disabled" : ""}`} key={row.key} role="row">
                            <input checked={importSelection.includes(row.key)} disabled={disabled} type="checkbox" onChange={() => toggleImportRow(row.key)} />
                            <span><strong>{row.name}</strong><small>{row.profession} · {row.sheetName}, строка {row.sourceRow}</small></span>
                            <span>{kindLabels[row.kind]}</span>
                            <span>{row.netMonthlySalary ? money(row.netMonthlySalary) : "—"}</span>
                            <span>{row.employerMonthlyCost ? money(row.employerMonthlyCost) : "—"}</span>
                            <span className={`badge ${row.existingStatus === "assigned" || row.duplicateInFile ? "gray" : row.existingStatus === "organization" ? "blue" : "green"}`}>{row.duplicateInFile ? "Дубль" : row.existingStatus === "assigned" ? "Уже назначен" : row.existingStatus === "organization" ? "Из реестра" : "Новый"}</span>
                          </label>
                        );
                      })}
                    </div>
                  </div>
                  <div className="form-actions">
                    <button className="button primary" disabled={!importSelection.length || saving === "workforce-commit"} type="button" onClick={() => void commitImport()}><Upload size={16} />{saving === "workforce-commit" ? "Импортирую..." : `Импортировать (${importSelection.length})`}</button>
                    <span className="muted">Сохранение выполняется только после этого подтверждения. Повторы не создаются.</span>
                  </div>
                </>
              ) : null}
            </section>
          ) : null}
          <div className="project-action-toolbar resource-filter" role="group" aria-label="Фильтр ресурсов">
            <button className={resourceFilter === "people" ? "active" : ""} type="button" onClick={() => setResourceFilter("people")}>Сотрудники и бригады</button>
            <button className={resourceFilter === "equipment" ? "active" : ""} type="button" onClick={() => setResourceFilter("equipment")}>Техника</button>
            {canEdit ? <button type="button" onClick={openImport}><Upload size={15} /> Импорт Excel</button> : null}
          </div>
          {loading ? <div className="empty-state">Загрузка ресурсного плана...</div> : visibleItems.length ? (
            <div className="resource-capacity-list">
              {visibleItems.map((item) => {
                const availableHours = item.capacityHoursPerMonth * item.headcount * item.assignment.allocationPercent / 100;
                const monthlyValue = usesPayroll(item.kind, item.employmentType)
                  ? item.grossMonthlySalary * item.headcount * item.assignment.allocationPercent / 100
                  : item.monthlyCost * item.assignment.allocationPercent / 100;
                return (
                  <article className={`resource-capacity-row ${item.allocation.overloaded ? "overloaded" : ""}`} key={item.id}>
                    <div className="resource-capacity-identity">
                      <span className="resource-kind-icon">{item.kind === "equipment" ? <Wrench size={18} /> : <Users size={18} />}</span>
                      <div><strong>{item.name}</strong><span>{kindLabels[item.kind]} · {item.profession || "без специализации"} · {employmentLabels[item.employmentType]}</span></div>
                    </div>
                    <div className="resource-capacity-values">
                      <span><small>Состав</small><strong>{item.kind === "equipment" ? "1 ед." : `${item.headcount} чел.`}</strong></span>
                      <span><small>Загрузка</small><strong>{item.assignment.allocationPercent}%</strong></span>
                      <span><small>Часы</small><strong>{number(item.assignment.plannedHours)} / {number(availableHours)}</strong></span>
                      <span><small>{usesPayroll(item.kind, item.employmentType) ? "ФОТ / месяц" : item.kind === "equipment" ? "Месяц" : "Субподряд / месяц"}</small><strong>{money(monthlyValue)}</strong></span>
                    </div>
                    <div className="resource-capacity-status">
                      {item.allocation.overloaded ? <span className="badge red"><AlertTriangle size={13} /> {item.allocation.totalPercent}% между проектами</span> : <span className="badge green">{statusLabels[item.status]}</span>}
                      {item.productivityNorm ? <small>{item.productivityNorm} {item.productivityUnit || "ед."}</small> : <small>Норма не задана</small>}
                    </div>
                    {canEdit ? <div className="resource-capacity-controls"><button className="icon-button" title="Редактировать" type="button" onClick={() => openEdit(item)}><Pencil size={16} /></button><button className="icon-button danger" disabled={saving === item.id} title="Снять с проекта" type="button" onClick={() => void removeAssignment(item)}><Trash2 size={16} /></button></div> : null}
                  </article>
                );
              })}
            </div>
          ) : <div className="empty-state">На проект пока не назначены {resourceFilter === "equipment" ? "машины и механизмы" : "сотрудники или бригады"}.</div>}

          <div className={`quality-issues-header compact tone-${reportModel.summary.tone}`}>
            <div><div className="eyebrow">Факт стройплощадки</div><h3>Смены, техника и простои</h3><p>{reportModel.summary.headline}</p></div>
            <div className="quality-issues-actions"><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Рапорты")}><ClipboardList size={16} /> Рапорты</button><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("График")}><TimerReset size={16} /> График</button></div>
          </div>
        </>
      ) : null}

      {mode === "requests" && canEdit ? (
        <WorkforceAdmissionRequests project={props.project} projectId={props.projectId} onResourcesChanged={loadResources} />
      ) : null}

      {mode === "demand" ? (
        <>
          <div className="payroll-section-heading">
            <div><FileSpreadsheet size={18} /><span><strong>Потребность из Excel и ручного плана</strong><small>ИТР, рабочие и бригады не создаются как фактические сотрудники: это план для комплектования проекта.</small></span></div>
            {canEdit ? <button className="button secondary compact-button" type="button" onClick={openDemand}><Plus size={16} /> Добавить строку</button> : null}
          </div>
          {demands.length ? (
            <div className="labor-demand-list">
              {demands.map((item) => (
                <details className="labor-demand-row" key={item.id}>
                  <summary>
                    <span className="resource-kind-icon"><HardHat size={17} /></span>
                    <span className="labor-demand-title"><strong>{item.profession}</strong><small>{kindLabels[item.category]} · {item.function || item.source}</small></span>
                    <span><small>Пик</small><strong>{number(item.peakHeadcount, 1)} чел.</strong></span>
                    <span><small>Объём</small><strong>{number(item.personMonths, 1)} чел.-мес.</strong></span>
                    <span><small>ФОТ</small><strong>{money(item.grossMonthlySalary * item.personMonths)}</strong></span>
                    <span className={`badge ${item.confidence >= 0.8 ? "green" : item.confidence >= 0.55 ? "yellow" : "red"}`}>{confidenceLabel(item.confidence)}</span>
                  </summary>
                  <div className="labor-demand-details">
                    <div className="labor-demand-meta">
                      <span>Период <strong>{new Date(item.startsAt).toLocaleDateString("ru-RU")} – {new Date(item.endsAt).toLocaleDateString("ru-RU")}</strong></span>
                      <span>Часы <strong>{number(item.plannedHours)}</strong></span>
                      <span>Оклад <strong>{money(item.grossMonthlySalary)}/мес.</strong></span>
                      <span>Норма <strong>{item.productivityNorm ? `${number(item.productivityNorm, 3)} ${item.productivityUnit || "ед."}` : "не задана"}</strong></span>
                      <span>Источник <strong>{item.sourceSheet ? `${item.sourceSheet}${item.sourceRow ? `, строка ${item.sourceRow}` : ""}` : item.source}</strong></span>
                    </div>
                    {item.allocations.length ? (
                      <div className="labor-allocation-table">
                        <div className="labor-allocation-head"><span>Работа ВОР</span><span>Доля</span><span>Часы</span><span>Потребность</span><span>Основание</span></div>
                        {item.allocations.map((allocation) => (
                          <div className="labor-allocation-line" key={allocation.id}>
                            <span><strong>{allocation.workCode || "—"}</strong>{allocation.workName}</span>
                            <span>{percent(allocation.sharePercent)}</span>
                            <span>{number(allocation.plannedHours)} ч</span>
                            <span>{number(allocation.requiredHeadcount, 1)} чел.</span>
                            <span>{allocation.reason || confidenceLabel(allocation.confidence)}</span>
                          </div>
                        ))}
                      </div>
                    ) : <div className="form-hint">Связи с ВОР пока нет. Для ручной строки задайте норму или повторите импорт проектного Excel.</div>}
                    {item.importBatchId
                      ? <span className="badge blue">Управляется импортом Excel</span>
                      : canEdit
                        ? <button className="button danger compact-button" disabled={saving === item.id} type="button" onClick={() => void removeDemand(item)}><Trash2 size={15} /> Удалить потребность</button>
                        : null}
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="empty-state">Потребность пока не рассчитана. Загрузите проектный Excel с листом ФОТ или добавьте строку вручную.</div>}
        </>
      ) : null}

      {mode === "settings" ? (
        <form className="payroll-policy-form" onSubmit={savePolicy}>
          <div className="payroll-section-heading">
            <div><ShieldCheck size={18} /><span><strong>Плановые ставки и налоговая база</strong><small>Настройки применяются только к экономическому прогнозу этого проекта.</small></span></div>
            <span className="badge blue">Источник {policyForm.sourceYear}</span>
          </div>
          <div className="resource-capacity-grid">
            <label className="field"><span>Страховые взносы, %</span><input min={0} max={100} step="0.1" type="number" value={policyForm.insuranceContributionRate} onChange={(event) => setPolicyForm({ ...policyForm, insuranceContributionRate: Number(event.target.value) })} /></label>
            <label className="field"><span>Травматизм, %</span><input min={0} max={100} step="0.01" type="number" value={policyForm.accidentContributionRate} onChange={(event) => setPolicyForm({ ...policyForm, accidentContributionRate: Number(event.target.value) })} /></label>
            <label className="field"><span>НДФЛ к удержанию, %</span><input min={0} max={100} step="0.1" type="number" value={policyForm.personalIncomeTaxRate} onChange={(event) => setPolicyForm({ ...policyForm, personalIncomeTaxRate: Number(event.target.value) })} /></label>
            <label className="field"><span>Рабочих часов / месяц</span><input min={1} max={744} step="1" type="number" value={policyForm.workingHoursPerMonth} onChange={(event) => setPolicyForm({ ...policyForm, workingHoursPerMonth: Number(event.target.value) })} /></label>
            <label className="field"><span>Расчётный год</span><input min={2020} max={2100} type="number" value={policyForm.sourceYear} onChange={(event) => setPolicyForm({ ...policyForm, sourceYear: Number(event.target.value) })} /></label>
            <label className="field field-wide"><span>Основание / примечание</span><textarea rows={3} value={policyForm.notes ?? ""} onChange={(event) => setPolicyForm({ ...policyForm, notes: event.target.value })} /></label>
          </div>
          <div className="payroll-policy-warning">
            <AlertTriangle size={17} />
            <span><strong>Это управленческий план, не расчёт зарплаты и налоговая декларация.</strong> Проверьте право на льготные тарифы, предельную базу, класс профриска и прогрессивную ставку НДФЛ с бухгалтерией.</span>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={!canEdit || saving === "policy"} type="submit">{saving === "policy" ? "Сохраняю..." : "Сохранить ставки"}</button>
          </div>
        </form>
      ) : null}
    </section>
  );
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ResourcesEquipmentTone }) {
  return <div className={`quality-issues-card metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function ProductivityNormAssistant({
  autoEnabled,
  category,
  onToggle,
  recommendation
}: {
  autoEnabled: boolean;
  category: ResourceKind;
  onToggle: (value: boolean) => void;
  recommendation: ProductivityNormRecommendation | null;
}) {
  const eligible = category === "worker" || category === "crew";
  const autoApplied = eligible && autoEnabled && Boolean(recommendation?.autoApplicable);
  const averageLabel = recommendation?.basis === "actual"
    ? "Фактическая средняя"
    : recommendation?.basis === "mixed"
      ? "Смешанная средняя"
      : "Плановая средняя";
  return (
    <div className={`productivity-norm-assistant ${autoApplied ? "is-applied" : ""}`}>
      <Calculator size={18} />
      <div>
        <strong>
          {!eligible
            ? "Норма задаётся вручную"
            : recommendation
              ? `${averageLabel}: ${number(recommendation.norm, 3)} ${recommendation.unit}`
              : "Средняя норма пока не рассчитана"}
        </strong>
        <span>
          {!eligible
            ? "Автоматический расчёт применяется только к рабочим и бригадам."
            : recommendation
              ? `${recommendation.explanation} Диапазон ${number(recommendation.minimum, 3)}–${number(recommendation.maximum, 3)}; доверие ${normConfidenceLabel(recommendation.confidence)}.`
              : "Нужны минимум два сопоставимых наблюдения по профессии и единице выработки."}
        </span>
      </div>
      {eligible ? (
        <label className="productivity-norm-toggle">
          <input checked={autoEnabled} onChange={(event) => onToggle(event.target.checked)} type="checkbox" />
          <span>{autoApplied ? "Применяется автоматически" : "Автоматически при достаточных данных"}</span>
        </label>
      ) : null}
    </div>
  );
}
