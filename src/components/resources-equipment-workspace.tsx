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
  Users,
  Wrench,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildResourcesEquipmentIntelligence, type ResourcesEquipmentTone } from "@/lib/resources-equipment-intelligence";
import {
  buildWorkforceCapacitySummary,
  buildWorkforceEconomics,
  DEFAULT_PAYROLL_POLICY
} from "@/lib/workforce-capacity";
import type {
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

type AvailableResource = Pick<WorkforceResource, "id" | "name" | "kind" | "profession" | "employmentType" | "status">;
type ViewMode = "economics" | "team" | "demand" | "settings";

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
  const [available, setAvailable] = useState<AvailableResource[]>([]);
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
  const [resourceFilter, setResourceFilter] = useState<"people" | "equipment">("people");

  const summary = useMemo(() => buildWorkforceCapacitySummary(items, demands, policy), [demands, items, policy]);
  const economics = useMemo(() => buildWorkforceEconomics({
    resources: items,
    demands,
    policy,
    budgetItems: props.budgetItems,
    contractAmount: props.project.contractAmount ?? 0
  }), [demands, items, policy, props.budgetItems, props.project.contractAmount]);
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
        available?: AvailableResource[];
        permissions?: { edit?: boolean };
      };
      const nextPolicy = body.policy ?? defaultPolicy(props.projectId);
      setItems(body.items ?? []);
      setDemands(body.demands ?? []);
      setPolicy(nextPolicy);
      setPolicyForm(nextPolicy);
      setAvailable(body.available ?? []);
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
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
  }

  function openEdit(item: WorkforceResource) {
    setEditingId(item.id);
    setExistingResourceId("");
    setForm(formFromItem(item));
    setFormOpen(true);
    setDemandOpen(false);
    setError("");
    setNotice("");
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
            productivityNorm: form.productivityNorm,
            productivityUnit: form.productivityUnit || null,
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
          productivityUnit: demandForm.productivityUnit || null,
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
              <button className="button secondary compact-button" type="button" onClick={() => { setDemandOpen(true); setFormOpen(false); }}>
                <Plus size={16} /> Потребность
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
        <button className={mode === "team" ? "active" : ""} type="button" onClick={() => setMode("team")}><Users size={15} /> Штат</button>
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
              <label className="field"><span>Норма выработки</span><input min={0} step="0.001" type="number" value={form.productivityNorm} onChange={(event) => setForm({ ...form, productivityNorm: Number(event.target.value) })} /></label>
              <label className="field"><span>Единица выработки</span><input value={form.productivityUnit} onChange={(event) => setForm({ ...form, productivityUnit: event.target.value })} placeholder="м²/смена, м³/ч" /></label>
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
            <label className="field"><span>Норма выработки</span><input min={0} step="0.001" type="number" value={demandForm.productivityNorm} onChange={(event) => setDemandForm({ ...demandForm, productivityNorm: Number(event.target.value) })} /></label>
            <label className="field"><span>Единица нормы</span><input value={demandForm.productivityUnit} onChange={(event) => setDemandForm({ ...demandForm, productivityUnit: event.target.value })} /></label>
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
          <div className="project-action-toolbar resource-filter" role="group" aria-label="Фильтр ресурсов">
            <button className={resourceFilter === "people" ? "active" : ""} type="button" onClick={() => setResourceFilter("people")}>Сотрудники и бригады</button>
            <button className={resourceFilter === "equipment" ? "active" : ""} type="button" onClick={() => setResourceFilter("equipment")}>Техника</button>
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

      {mode === "demand" ? (
        <>
          <div className="payroll-section-heading">
            <div><FileSpreadsheet size={18} /><span><strong>Потребность из Excel и ручного плана</strong><small>ИТР, рабочие и бригады не создаются как фактические сотрудники: это план для комплектования проекта.</small></span></div>
            {canEdit ? <button className="button secondary compact-button" type="button" onClick={() => { setDemandOpen(true); setFormOpen(false); }}><Plus size={16} /> Добавить строку</button> : null}
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
