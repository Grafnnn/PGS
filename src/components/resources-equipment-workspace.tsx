"use client";

import {
  AlertTriangle,
  ClipboardList,
  HardHat,
  Pencil,
  Plus,
  RefreshCw,
  TimerReset,
  Trash2,
  Users,
  Wrench,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildResourcesEquipmentIntelligence, type ResourcesEquipmentTone } from "@/lib/resources-equipment-intelligence";
import { buildWorkforceCapacitySummary } from "@/lib/workforce-capacity";
import type {
  DailyReport,
  Project,
  ResourceAssignmentStatus,
  ResourceEmploymentType,
  ResourceKind,
  ResourceStatus,
  ScheduleItem,
  WorkforceResource
} from "@/lib/types";

type AvailableResource = Pick<WorkforceResource, "id" | "name" | "kind" | "profession" | "employmentType" | "status">;
type Props = {
  projectId: string;
  project: Partial<Project>;
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
    hourlyCost: 0,
    certifications: "",
    status: "active",
    notes: "",
    startsAt: project.startsAt?.slice(0, 10) ?? new Date().toISOString().slice(0, 10),
    endsAt: project.endsAt?.slice(0, 10) ?? new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
    allocationPercent: 100,
    plannedHours: 0,
    plannedOutput: 0,
    assignmentStatus: "planned",
    assignmentNotes: ""
  };
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

function badge(tone: ResourcesEquipmentTone) {
  return tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : tone === "info" ? "blue" : "gray";
}

function money(value: number) {
  return new Intl.NumberFormat("ru-RU", { style: "currency", currency: "RUB", maximumFractionDigits: 0 }).format(value);
}

function capacity(value: number) {
  return new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 0 }).format(value);
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для ресурсного плана.";
  return body.error ?? fallback;
}

export function ResourcesEquipmentWorkspace(props: Props) {
  const reportModel = buildResourcesEquipmentIntelligence(props);
  const [items, setItems] = useState<WorkforceResource[]>([]);
  const [available, setAvailable] = useState<AvailableResource[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [existingResourceId, setExistingResourceId] = useState("");
  const [form, setForm] = useState<ResourceForm>(() => defaultForm(props.project));
  const [filter, setFilter] = useState<"all" | "people" | "equipment">("all");
  const summary = useMemo(() => buildWorkforceCapacitySummary(items), [items]);
  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "equipment") return item.kind === "equipment";
    return item.kind !== "equipment";
  }), [filter, items]);

  const loadResources = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/resources`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить ресурсный план."));
      const body = (await response.json()) as { items?: WorkforceResource[]; available?: AvailableResource[]; permissions?: { edit?: boolean } };
      setItems(body.items ?? []);
      setAvailable(body.available ?? []);
      setCanEdit(Boolean(body.permissions?.edit));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить ресурсный план.");
    } finally {
      setLoading(false);
    }
  }, [props.projectId]);

  useEffect(() => {
    void loadResources();
  }, [loadResources]);

  function openCreate() {
    setEditingId(null);
    setExistingResourceId("");
    setForm(defaultForm(props.project));
    setFormOpen(true);
    setError("");
  }

  function openEdit(item: WorkforceResource) {
    setEditingId(item.id);
    setExistingResourceId("");
    setForm(formFromItem(item));
    setFormOpen(true);
    setError("");
  }

  async function saveResource(event: React.FormEvent) {
    event.preventDefault();
    setSaving("resource");
    setError("");
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
            monthlyCost: form.monthlyCost,
            hourlyCost: form.hourlyCost,
            certifications: form.certifications.split(/[,;\n]+/).map((item) => item.trim()).filter(Boolean),
            status: form.status,
            notes: form.notes || null,
            assignment
          };
      const response = await fetch(editingId ? `/api/projects/${props.projectId}/resources/${editingId}` : `/api/projects/${props.projectId}/resources`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить ресурс."));
      setFormOpen(false);
      setEditingId(null);
      setExistingResourceId("");
      await loadResources();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить ресурс.");
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

  return (
    <section className="quality-issues-workspace resources-equipment-workspace" aria-label="Workforce FOT and Equipment Capacity">
      <div className={`quality-issues-header tone-${summary.status === "controlled" ? "good" : summary.status === "attention" ? "warn" : "info"}`}>
        <div>
          <div className="eyebrow">Workforce, ФОТ &amp; Equipment Capacity</div>
          <h3>Ресурсный план проекта</h3>
          <p>Люди, бригады, ИТР и техника с загрузкой, стоимостью, выработкой и пересечениями между проектами.</p>
          <div className="quality-issues-badges">
            <span className={`badge ${summary.status === "controlled" ? "green" : summary.status === "attention" ? "yellow" : "gray"}`}>
              {summary.status === "controlled" ? "Ресурс подтверждён" : summary.status === "attention" ? "Требует выравнивания" : "Нет ресурсного плана"}
            </span>
            <span className="badge blue">{summary.headcount} человек</span>
            <span className="badge gray">{summary.equipment} ед. техники</span>
          </div>
        </div>
        <div className="quality-issues-actions">
          <button className="button secondary compact-button" disabled={loading} type="button" onClick={() => void loadResources()}>
            <RefreshCw className={loading ? "spin" : ""} size={16} /> Обновить
          </button>
          {canEdit ? <button className="button primary compact-button" type="button" onClick={openCreate}><Plus size={16} /> Добавить ресурс</button> : null}
        </div>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="quality-issues-grid metrics workforce-metrics">
        <Metric title="ФОТ / месяц" value={money(summary.payroll)} detail={`${summary.headcount} человек · ${summary.engineers} ИТР`} tone={summary.headcount ? "info" : "neutral"} />
        <Metric title="Техника / месяц" value={money(summary.equipmentCost)} detail={`${summary.equipment} назначено`} tone={summary.equipment ? "info" : "neutral"} />
        <Metric title="Мощность" value={`${capacity(summary.plannedHours)} / ${capacity(summary.allocatedCapacityHours)} ч`} detail={summary.shortageHours ? `дефицит ${capacity(summary.shortageHours)} ч` : "план покрыт"} tone={summary.shortageHours ? "bad" : summary.headcount ? "good" : "neutral"} />
        <Metric title="Конфликты" value={String(summary.overloaded)} detail={`${summary.certificationGaps} без допусков`} tone={summary.overloaded ? "bad" : summary.certificationGaps ? "warn" : "good"} />
      </div>

      {formOpen ? (
        <form className="resource-capacity-form" onSubmit={saveResource}>
          <div className="reports-workflow-heading compact">
            <div><strong>{editingId ? "Редактирование ресурса" : "Ресурс и назначение"}</strong><span>Стоимость и загрузка применяются только после сохранения.</span></div>
            <button className="icon-button" title="Закрыть" type="button" onClick={() => setFormOpen(false)}><X size={18} /></button>
          </div>
          {!editingId && available.length ? (
            <label className="field field-wide"><span>Назначить из общего реестра</span><select value={existingResourceId} onChange={(event) => setExistingResourceId(event.target.value)}><option value="">Создать новый ресурс</option>{available.map((item) => <option key={item.id} value={item.id}>{item.name} · {kindLabels[item.kind]}</option>)}</select></label>
          ) : null}
          {!existingResourceId || editingId ? (
            <div className="resource-capacity-grid">
              <label className="field"><span>Тип</span><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as ResourceKind })}>{Object.entries(kindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field field-wide"><span>Название / ФИО</span><input required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className="field"><span>Профессия / модель</span><input value={form.profession} onChange={(event) => setForm({ ...form, profession: event.target.value })} /></label>
              <label className="field"><span>Форма</span><select value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value as ResourceEmploymentType })}>{Object.entries(employmentLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
              <label className="field"><span>Численность</span><input min={1} type="number" value={form.headcount} onChange={(event) => setForm({ ...form, headcount: Number(event.target.value) })} /></label>
              <label className="field"><span>ФОТ / аренда в месяц</span><input min={0} type="number" value={form.monthlyCost} onChange={(event) => setForm({ ...form, monthlyCost: Number(event.target.value) })} /></label>
              <label className="field"><span>Стоимость часа</span><input min={0} type="number" value={form.hourlyCost} onChange={(event) => setForm({ ...form, hourlyCost: Number(event.target.value) })} /></label>
              <label className="field"><span>Мощность, ч/мес.</span><input min={0} type="number" value={form.capacityHoursPerMonth} onChange={(event) => setForm({ ...form, capacityHoursPerMonth: Number(event.target.value) })} /></label>
              <label className="field"><span>Норма выработки</span><input min={0} step="0.001" type="number" value={form.productivityNorm} onChange={(event) => setForm({ ...form, productivityNorm: Number(event.target.value) })} /></label>
              <label className="field"><span>Единица выработки</span><input value={form.productivityUnit} onChange={(event) => setForm({ ...form, productivityUnit: event.target.value })} placeholder="м²/смена, м³/ч" /></label>
              <label className="field field-wide"><span>Допуски / удостоверения</span><input value={form.certifications} onChange={(event) => setForm({ ...form, certifications: event.target.value })} placeholder="Через запятую" /></label>
              <label className="field"><span>Статус ресурса</span><select value={form.status} onChange={(event) => setForm({ ...form, status: event.target.value as ResourceStatus })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
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

      <div className="project-action-toolbar resource-filter" role="group" aria-label="Фильтр ресурсов">
        <button className={filter === "all" ? "active" : ""} type="button" onClick={() => setFilter("all")}>Все</button>
        <button className={filter === "people" ? "active" : ""} type="button" onClick={() => setFilter("people")}>Люди и бригады</button>
        <button className={filter === "equipment" ? "active" : ""} type="button" onClick={() => setFilter("equipment")}>Техника</button>
      </div>

      {loading ? <div className="empty-state">Загрузка ресурсного плана...</div> : visibleItems.length ? (
        <div className="resource-capacity-list">
          {visibleItems.map((item) => {
            const availableHours = item.capacityHoursPerMonth * item.headcount * item.assignment.allocationPercent / 100;
            return (
              <article className={`resource-capacity-row ${item.allocation.overloaded ? "overloaded" : ""}`} key={item.id}>
                <div className="resource-capacity-identity">
                  <span className="resource-kind-icon">{item.kind === "equipment" ? <Wrench size={18} /> : <Users size={18} />}</span>
                  <div><strong>{item.name}</strong><span>{kindLabels[item.kind]} · {item.profession || "без специализации"} · {employmentLabels[item.employmentType]}</span></div>
                </div>
                <div className="resource-capacity-values">
                  <span><small>Состав</small><strong>{item.kind === "equipment" ? "1 ед." : `${item.headcount} чел.`}</strong></span>
                  <span><small>Загрузка</small><strong>{item.assignment.allocationPercent}%</strong></span>
                  <span><small>Часы</small><strong>{capacity(item.assignment.plannedHours)} / {capacity(availableHours)}</strong></span>
                  <span><small>Месяц</small><strong>{money(item.monthlyCost * item.assignment.allocationPercent / 100)}</strong></span>
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
      ) : <div className="empty-state">Ресурсный план пока пуст.</div>}

      <div className={`quality-issues-header compact tone-${reportModel.summary.tone}`}>
        <div><div className="eyebrow">Сигналы из рапортов</div><h3>Факт смены и простои</h3><p>{reportModel.summary.headline}</p></div>
        <div className="quality-issues-actions"><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Рапорты")}><ClipboardList size={16} /> Рапорты</button><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("График")}><TimerReset size={16} /> График</button></div>
      </div>
      <div className="quality-issues-grid">
        <article className="quality-issues-card wide"><div className="section-title"><HardHat size={18} /><h4>Техника по рапортам</h4></div><div className="quality-issues-list">{reportModel.equipment.length ? reportModel.equipment.map((item) => <div className={`quality-issue-item tone-${item.tone}`} key={item.name}><strong>{item.name}</strong><span>{item.mentions} упоминаний · последний рапорт {item.lastSeen}</span></div>) : <span className="muted">Техника появится после заполнения ежедневного рапорта.</span>}</div></article>
        <article className="quality-issues-card"><div className="section-title"><Wrench size={18} /><h4>Сигналы</h4></div><div className="quality-issues-list">{reportModel.signals.length ? reportModel.signals.map((item) => <button className={`quality-issue-item tone-${item.tone}`} key={item.id} type="button" onClick={() => props.onNavigate(item.targetTab)}><strong>{item.title}</strong><span>{item.source}</span><small>{item.detail}</small><em>{item.nextAction}</em></button>) : <span className="muted">Нет ресурсных сигналов в доступных рапортах.</span>}</div></article>
        <article className="quality-issues-card"><div className="section-title"><Users size={18} /><h4>Следующие действия</h4></div><div className="quality-issues-action-list">{reportModel.actions.map((item) => <button className={`quality-issues-action priority-${item.priority}`} key={item.title} type="button" onClick={() => props.onNavigate(item.targetTab)}><strong>{item.title}</strong><span>{item.ownerRole} · {item.detail}</span></button>)}</div></article>
        <article className="quality-issues-card"><div className="section-title"><ClipboardList size={18} /><h4>{reportModel.handoff.title}</h4></div><pre className="quality-issues-handoff-copy">{reportModel.handoff.copyText}</pre></article>
      </div>
    </section>
  );
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ResourcesEquipmentTone }) {
  return <div className={`quality-issues-card metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span>{detail}</span></div>;
}
