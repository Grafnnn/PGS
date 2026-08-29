"use client";

import React, { useMemo, useState } from "react";
import {
  AlertTriangle,
  CalendarDays,
  ChevronDown,
  ClipboardList,
  Landmark,
  PackageCheck,
  Pencil,
  Plus,
  Search,
  TimerReset,
  Trash2
} from "lucide-react";
import {
  buildScheduleCashflowIntelligenceModel,
  type ScheduleCashflowImportHistoryItem,
  type ScheduleCashflowTone
} from "@/lib/schedule-cashflow-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, ScheduleItem } from "@/lib/types";

type ScheduleDraftState = {
  kind: string;
  mode: "preview" | "commit";
  draft: {
    summary: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
  };
  created?: unknown[];
} | null;

export type ScheduleCreateInput = Omit<ScheduleItem, "id" | "projectId" | "actualQty" | "status" | "budgetItemId"> & {
  budgetItemId?: string | null;
};

type ScheduleUpdateInput = Omit<Partial<ScheduleItem>, "budgetItemId"> & {
  budgetItemId?: string | null;
};

type Props = {
  projectName: string;
  projectStartsAt?: string;
  projectEndsAt?: string;
  contractAmount: number;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  importHistory: ScheduleCashflowImportHistoryItem[];
  draft: ScheduleDraftState;
  loading: string;
  busy: boolean;
  canEdit: boolean;
  onCreate: (item: ScheduleCreateInput) => Promise<void>;
  onUpdate: (item: ScheduleItem, payload: ScheduleUpdateInput) => Promise<void>;
  onDelete: (item: ScheduleItem) => Promise<void>;
  onSchedulePreview: () => void;
  onScheduleCommit: () => void;
  onCashflowPreview: () => void;
  onCashflowCommit: () => void;
  onNavigate: (tab: string) => void;
};

type Filter = "all" | "active" | "delayed" | "done";

type ScheduleGroup = {
  id: string;
  title: string;
  items: ScheduleItem[];
  startsAt: string;
  endsAt: string;
  progress: number;
  delayed: number;
  active: number;
  done: number;
  tone: "good" | "warn" | "bad" | "info";
};

const DAY = 86_400_000;

const statusMeta: Record<ScheduleItem["status"], { label: string; tone: string }> = {
  not_started: { label: "Не начато", tone: "info" },
  in_progress: { label: "В работе", tone: "warn" },
  done: { label: "Готово", tone: "good" },
  delayed: { label: "Просрочено", tone: "bad" },
  stopped: { label: "Остановлено", tone: "bad" }
};

function timestamp(value?: string) {
  if (!value) return Number.NaN;
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return date.getTime();
}

function clamp(value: number, min = 0, max = 100) {
  return Math.max(min, Math.min(max, value));
}

function formatDate(value?: string, options?: Intl.DateTimeFormatOptions) {
  const time = timestamp(value);
  if (!Number.isFinite(time)) return "Дата не задана";
  return new Date(time).toLocaleDateString("ru-RU", options ?? { day: "2-digit", month: "short", year: "numeric" });
}

function formatShortDate(value?: string) {
  return formatDate(value, { day: "2-digit", month: "short" });
}

function formatQty(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function workCountLabel(value: number) {
  const mod100 = value % 100;
  const mod10 = value % 10;
  if (mod100 >= 11 && mod100 <= 14) return `${value} работ`;
  if (mod10 === 1) return `${value} работа`;
  if (mod10 >= 2 && mod10 <= 4) return `${value} работы`;
  return `${value} работ`;
}

function itemProgress(item: ScheduleItem) {
  if (item.status === "done") return 100;
  if (item.plannedQty > 0) return clamp((item.actualQty / item.plannedQty) * 100);
  return item.status === "in_progress" ? 50 : 0;
}

function phaseForItem(item: ScheduleItem, budgetById: Map<string, BudgetItem>) {
  const section = item.budgetItemId ? budgetById.get(item.budgetItemId)?.section?.trim() : "";
  return section || "Без этапа";
}

function completionByWorkCount(items: ScheduleItem[]) {
  if (!items.length) return 0;
  return (items.filter((item) => item.status === "done").length / items.length) * 100;
}

function calendarDelayDays(item: ScheduleItem, now = Date.now()) {
  if (item.status === "done") return 0;
  const end = timestamp(item.endsAt);
  if (!Number.isFinite(end) || end >= now) return 0;
  return Math.max(1, Math.floor((now - end) / DAY));
}

function isDelayed(item: ScheduleItem, now = Date.now()) {
  return item.status === "delayed" || item.status === "stopped" || calendarDelayDays(item, now) > 0;
}

export function buildScheduleGroups(items: ScheduleItem[], budgetItems: BudgetItem[], now = Date.now()): ScheduleGroup[] {
  const budgetById = new Map(budgetItems.map((item) => [item.id, item]));
  const grouped = new Map<string, ScheduleItem[]>();

  for (const item of items) {
    const title = phaseForItem(item, budgetById);
    grouped.set(title, [...(grouped.get(title) ?? []), item]);
  }

  return Array.from(grouped.entries())
    .map(([title, groupItems]) => {
      const sorted = groupItems.slice().sort((left, right) => timestamp(left.startsAt) - timestamp(right.startsAt));
      const startsAt = sorted.reduce((current, item) => (timestamp(item.startsAt) < timestamp(current) ? item.startsAt : current), sorted[0]?.startsAt ?? "");
      const endsAt = sorted.reduce((current, item) => (timestamp(item.endsAt) > timestamp(current) ? item.endsAt : current), sorted[0]?.endsAt ?? "");
      const delayed = sorted.filter((item) => isDelayed(item, now)).length;
      const active = sorted.filter((item) => item.status === "in_progress").length;
      const done = sorted.filter((item) => item.status === "done").length;
      return {
        id: title.toLocaleLowerCase("ru-RU").replace(/[^a-zа-яё0-9]+/giu, "-") || "schedule-group",
        title,
        items: sorted,
        startsAt,
        endsAt,
        progress: completionByWorkCount(sorted),
        delayed,
        active,
        done,
        tone: delayed ? "bad" : done === sorted.length ? "good" : active ? "warn" : "info"
      } satisfies ScheduleGroup;
    })
    .sort((left, right) => timestamp(left.startsAt) - timestamp(right.startsAt));
}

type WeeklyControlRow = {
  id: string;
  title: string;
  hint: string;
  items: ScheduleItem[];
  tone: "good" | "warn" | "bad" | "info";
};

export function buildWeeklyControl(items: ScheduleItem[], now = Date.now()): WeeklyControlRow[] {
  const today = new Date(now);
  const day = today.getDay() || 7;
  const weekStart = new Date(today.getFullYear(), today.getMonth(), today.getDate() - day + 1).getTime();
  const weekEnd = weekStart + 7 * DAY - 1;
  const nextWeekEnd = weekEnd + 7 * DAY;
  const sorted = items.slice().sort((left, right) => timestamp(left.endsAt) - timestamp(right.endsAt));
  const overlaps = (item: ScheduleItem, start: number, end: number) => timestamp(item.startsAt) <= end && timestamp(item.endsAt) >= start;
  const overdue = sorted.filter((item) => isDelayed(item, now));
  const current = sorted.filter((item) => item.status !== "done" && overlaps(item, weekStart, weekEnd));
  const finishing = sorted.filter((item) => item.status !== "done" && timestamp(item.endsAt) >= weekStart && timestamp(item.endsAt) <= weekEnd);
  const next = sorted.filter((item) => item.status === "not_started" && timestamp(item.startsAt) > weekEnd && timestamp(item.startsAt) <= nextWeekEnd);

  return [
    { id: "overdue", title: "Переходящие просрочки", hint: "требуют решения", items: overdue, tone: overdue.length ? "bad" : "good" },
    { id: "current", title: "Работы текущей недели", hint: "на контроле ПТО", items: current, tone: current.length ? "info" : "good" },
    { id: "finishing", title: "Завершаются на неделе", hint: "нужен факт", items: finishing, tone: finishing.length ? "warn" : "good" },
    { id: "next", title: "Стартуют на следующей", hint: "проверить готовность", items: next, tone: "info" }
  ];
}

function timelineScale(items: ScheduleItem[], projectStartsAt?: string, projectEndsAt?: string) {
  const values = [timestamp(projectStartsAt), timestamp(projectEndsAt), ...items.flatMap((item) => [timestamp(item.startsAt), timestamp(item.endsAt)])].filter(Number.isFinite);
  const start = values.length ? Math.min(...values) : Date.now();
  const end = values.length ? Math.max(...values) : start + 30 * DAY;
  const span = Math.max(end - start, DAY);
  const today = Date.now();
  return {
    start,
    end,
    span,
    todayLeft: today >= start && today <= end ? ((today - start) / span) * 100 : null
  };
}

function timelineTicks(scale: ReturnType<typeof timelineScale>, count = 7) {
  const longRange = scale.span > 120 * DAY;
  return Array.from({ length: count }, (_, index) => {
    const ratio = count === 1 ? 0 : index / (count - 1);
    const value = scale.start + scale.span * ratio;
    return {
      id: `${Math.round(value)}-${index}`,
      label: new Date(value).toLocaleDateString("ru-RU", longRange ? { month: "short", year: "2-digit" } : { day: "2-digit", month: "short" }),
      left: ratio * 100
    };
  });
}

function timelinePosition(startsAt: string, endsAt: string, scale: ReturnType<typeof timelineScale>) {
  const start = timestamp(startsAt);
  const end = timestamp(endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return { left: 0, width: 2 };
  const left = clamp(((start - scale.start) / scale.span) * 100);
  return {
    left,
    width: clamp(((Math.max(end, start + DAY) - start) / scale.span) * 100, 2, 100 - left)
  };
}

function durationDays(item: ScheduleItem) {
  const start = timestamp(item.startsAt);
  const end = timestamp(item.endsAt);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return 0;
  return Math.max(1, Math.round((end - start) / DAY) + 1);
}

function toneClass(tone: ScheduleCashflowTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function ScheduleForm({
  item,
  budgetItems,
  busy,
  onCancel,
  onSave
}: {
  item?: ScheduleItem;
  budgetItems: BudgetItem[];
  busy: boolean;
  onCancel?: () => void;
  onSave: (payload: ScheduleCreateInput | ScheduleUpdateInput, form: HTMLFormElement) => Promise<void>;
}) {
  const [error, setError] = useState("");

  return (
    <form
      className="production-schedule-form"
      onSubmit={async (event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const startsAt = String(data.get("startsAt") || item?.startsAt || "");
        const endsAt = String(data.get("endsAt") || item?.endsAt || "");
        if (!startsAt || !endsAt || timestamp(endsAt) < timestamp(startsAt)) {
          setError("Дата окончания должна быть не раньше даты начала.");
          return;
        }
        setError("");
        const payload = {
          name: String(data.get("name") || item?.name || "Новая работа").trim(),
          owner: String(data.get("owner") || item?.owner || "ПТО").trim(),
          startsAt,
          endsAt,
          plannedQty: Number(data.get("plannedQty") || item?.plannedQty || 0),
          dependency: String(data.get("dependency") || "").trim() || undefined,
          budgetItemId: String(data.get("budgetItemId") || "").trim() || null,
          ...(item
            ? {
                actualQty: Number(data.get("actualQty") || 0),
                status: String(data.get("status") || item.status) as ScheduleItem["status"]
              }
            : {})
        };
        try {
          await onSave(payload, form);
        } catch {
          setError("Не удалось сохранить работу. Проверьте поля и повторите.");
        }
      }}
    >
      <label className="field field-wide">
        <span>Работа</span>
        <input defaultValue={item?.name} name="name" placeholder="Например: устройство монолитной плиты" required minLength={2} />
      </label>
      <label className="field">
        <span>Ответственный</span>
        <input defaultValue={item?.owner} name="owner" placeholder="Прораб / ПТО / подрядчик" required minLength={2} />
      </label>
      <label className="field field-wide">
        <span>Раздел / позиция ВОР</span>
        <select defaultValue={item?.budgetItemId ?? ""} name="budgetItemId">
          <option value="">Без этапа</option>
          {budgetItems.map((budgetItem) => <option key={budgetItem.id} value={budgetItem.id}>{budgetItem.section} — {budgetItem.name}</option>)}
        </select>
      </label>
      <label className="field">
        <span>Зависимость</span>
        <input defaultValue={item?.dependency} name="dependency" placeholder="Предшествующая работа или условие" />
      </label>
      <label className="field">
        <span>Начало</span>
        <input defaultValue={item?.startsAt} name="startsAt" required type="date" />
      </label>
      <label className="field">
        <span>Окончание</span>
        <input defaultValue={item?.endsAt} name="endsAt" required type="date" />
      </label>
      <label className="field">
        <span>Плановый объём</span>
        <input defaultValue={item?.plannedQty ?? 1} min="0" name="plannedQty" required step="0.01" type="number" />
      </label>
      {item ? (
        <>
          <label className="field">
            <span>Фактический объём</span>
            <input defaultValue={item.actualQty} min="0" name="actualQty" step="0.01" type="number" />
          </label>
          <label className="field">
            <span>Статус</span>
            <select defaultValue={item.status} name="status">
              {Object.entries(statusMeta).map(([value, meta]) => <option key={value} value={value}>{meta.label}</option>)}
            </select>
          </label>
        </>
      ) : null}
      {error ? <div className="production-schedule-form-error" role="alert">{error}</div> : null}
      <div className="production-schedule-form-actions">
        <button className="button primary" disabled={busy} type="submit">
          {item ? <Pencil size={16} /> : <Plus size={16} />}
          {busy ? "Сохраняю..." : item ? "Сохранить изменения" : "Добавить работу"}
        </button>
        {onCancel ? <button className="button secondary" disabled={busy} onClick={onCancel} type="button">Отмена</button> : null}
      </div>
    </form>
  );
}

function TimelineBar({
  startsAt,
  endsAt,
  progress,
  scale,
  tone,
  label
}: {
  startsAt: string;
  endsAt: string;
  progress: number;
  scale: ReturnType<typeof timelineScale>;
  tone: string;
  label?: string;
}) {
  const position = timelinePosition(startsAt, endsAt, scale);

  return (
    <div className="production-gantt-track" role="img" aria-label={`Период: ${formatDate(startsAt)} — ${formatDate(endsAt)}, выполнено ${Math.round(progress)}%`}>
      {scale.todayLeft !== null ? <i className="production-today-line" style={{ left: `${scale.todayLeft}%` }} /> : null}
      <span className={`production-gantt-bar tone-${tone}`} style={{ left: `${position.left}%`, width: `${position.width}%` }}>
        <b style={{ width: `${progress}%` }} />
        {label ? <small>{label}</small> : null}
      </span>
    </div>
  );
}

function WorkRow({
  item,
  budgetItems,
  scale,
  canEdit,
  busy,
  editing,
  onEdit,
  onCancelEdit,
  onUpdate,
  onDelete
}: {
  item: ScheduleItem;
  budgetItems: BudgetItem[];
  scale: ReturnType<typeof timelineScale>;
  canEdit: boolean;
  busy: boolean;
  editing: boolean;
  onEdit: () => void;
  onCancelEdit: () => void;
  onUpdate: (payload: ScheduleUpdateInput) => Promise<void>;
  onDelete: () => Promise<void>;
}) {
  const progress = itemProgress(item);
  const meta = statusMeta[item.status];
  const delayDays = calendarDelayDays(item);
  const rowTone = delayDays || item.status === "delayed" || item.status === "stopped" ? "bad" : meta.tone;
  const rowStatus = delayDays ? `Просрочено ${delayDays} дн.` : meta.label;

  return (
    <details className={`production-work-row tone-${rowTone}`}>
      <summary>
        <span className="production-work-marker"><i className={`production-status-dot tone-${rowTone}`} aria-hidden="true" /></span>
        <span className="production-work-title">
          <strong>{item.name}</strong>
          <small>{item.owner || "Ответственный не назначен"} · {formatShortDate(item.startsAt)} — {formatShortDate(item.endsAt)}</small>
        </span>
        <TimelineBar endsAt={item.endsAt} label={`${Math.round(progress)}%`} progress={progress} scale={scale} startsAt={item.startsAt} tone={rowTone} />
        <span className={`production-status-label tone-${rowTone}`}>{rowStatus}</span>
        <ChevronDown className="production-disclosure-chevron" size={17} aria-hidden="true" />
      </summary>
      <div className="production-work-body">
        <div className="production-work-facts">
          <span><small>План / факт</small><strong>{formatQty(item.plannedQty)} / {formatQty(item.actualQty)}</strong></span>
          <span><small>Длительность</small><strong>{durationDays(item)} дн.</strong></span>
          <span><small>Ответственный</small><strong>{item.owner || "Не назначен"}</strong></span>
          <span><small>Зависимость</small><strong>{item.dependency || "Нет"}</strong></span>
          <span><small>Статус в системе</small><strong>{meta.label}</strong></span>
        </div>
        {canEdit ? (
          <div className="production-work-actions">
            <button className="button secondary compact-button" disabled={busy} onClick={onEdit} type="button"><Pencil size={15} />Редактировать</button>
            <button
              aria-label={`Удалить работу: ${item.name}`}
              className="icon-button danger"
              disabled={busy}
              onClick={async () => {
                if (!window.confirm(`Удалить работу «${item.name}»?`)) return;
                await onDelete();
              }}
              title="Удалить работу"
              type="button"
            >
              <Trash2 size={16} />
            </button>
          </div>
        ) : null}
        {editing ? (
          <ScheduleForm
            budgetItems={budgetItems}
            busy={busy}
            item={item}
            onCancel={onCancelEdit}
            onSave={async (payload) => onUpdate(payload as ScheduleUpdateInput)}
          />
        ) : null}
      </div>
    </details>
  );
}

function DraftRows({ draft, kind }: { draft: ScheduleDraftState; kind: "schedule" | "cashflow" }) {
  if (draft?.kind !== kind) return null;
  return (
    <div className="production-draft-preview">
      <div className="production-draft-meta">
        {Object.entries(draft.draft.summary).slice(0, 5).map(([key, value]) => <span key={key}>{key}: {String(value)}</span>)}
        <span className={`badge ${draft.mode === "commit" ? "green" : "blue"}`}>{draft.mode === "commit" ? "Сохранено" : "Preview"}</span>
      </div>
      <div className="production-draft-rows">
        {draft.draft.items.slice(0, 8).map((row, index) => (
          <div key={`${kind}-${index}`}>
            <strong>{String(row.stage ?? row.section ?? row.name ?? `Строка ${index + 1}`)}</strong>
            <span>{kind === "schedule" ? `${String(row.suggestedDurationDays ?? "—")} дн. · ${workCountLabel(Number(row.works ?? 0))}` : `${money(Number(row.amount ?? 0))} · ${String(row.period ?? "период не задан")}`}</span>
          </div>
        ))}
        {!draft.draft.items.length ? <p className="muted">В preview нет строк.</p> : null}
      </div>
    </div>
  );
}

export function ProductionScheduleWorkspace({
  projectName,
  projectStartsAt,
  projectEndsAt,
  contractAmount,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  importHistory,
  draft,
  loading,
  busy,
  canEdit,
  onCreate,
  onUpdate,
  onDelete,
  onSchedulePreview,
  onScheduleCommit,
  onCashflowPreview,
  onCashflowCommit,
  onNavigate
}: Props) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  const model = useMemo(() => buildScheduleCashflowIntelligenceModel({
    project: { name: projectName, startsAt: projectStartsAt, endsAt: projectEndsAt, contractAmount },
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    importHistory
  }), [budgetItems, contractAmount, importHistory, materials, payments, procurementRequests, projectEndsAt, projectName, projectStartsAt, scheduleItems]);
  const scale = useMemo(() => timelineScale(scheduleItems, projectStartsAt, projectEndsAt), [projectEndsAt, projectStartsAt, scheduleItems]);
  const ticks = useMemo(() => timelineTicks(scale), [scale]);
  const visibleItems = useMemo(() => scheduleItems.filter((item) => {
    if (filter === "active" && item.status !== "in_progress") return false;
    if (filter === "delayed" && !isDelayed(item)) return false;
    if (filter === "done" && item.status !== "done") return false;
    if (normalizedQuery && !`${item.name} ${item.owner} ${item.dependency ?? ""}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery)) return false;
    return true;
  }), [filter, normalizedQuery, scheduleItems]);
  const groups = useMemo(() => buildScheduleGroups(visibleItems, budgetItems), [budgetItems, visibleItems]);
  const weeklyControl = useMemo(() => buildWeeklyControl(scheduleItems), [scheduleItems]);
  const doneCount = scheduleItems.filter((item) => item.status === "done").length;
  const completion = Math.round(completionByWorkCount(scheduleItems));
  const delayedCount = scheduleItems.filter((item) => isDelayed(item)).length;
  const activeCount = scheduleItems.filter((item) => item.status === "in_progress").length;
  const nextItem = scheduleItems
    .filter((item) => item.status !== "done")
    .slice()
    .sort((left, right) => timestamp(left.endsAt) - timestamp(right.endsAt))[0];
  const healthLabel = delayedCount ? "Требует внимания" : activeCount ? "Работы идут" : scheduleItems.length ? "План сформирован" : "График не заполнен";
  const canScheduleCommit = draft?.kind === "schedule" && draft.mode === "preview" && !loading;
  const canCashflowCommit = draft?.kind === "cashflow" && draft.mode === "preview" && !loading;

  return (
    <section className="production-schedule-workspace" aria-label="График производства работ">
      <header className="production-schedule-header">
        <div>
          <div className="eyebrow">План производства</div>
          <h2><TimerReset size={22} />График производства работ</h2>
          <p>{projectName} · {formatDate(projectStartsAt)} — {formatDate(projectEndsAt)}</p>
        </div>
        <div className="production-schedule-health">
          <span className={`badge ${delayedCount ? "red" : activeCount ? "yellow" : scheduleItems.length ? "green" : "gray"}`}>{healthLabel}</span>
          <button className="button secondary compact-button" onClick={() => onNavigate("Рапорты")} type="button"><ClipboardList size={15} />Факт с площадки</button>
        </div>
      </header>

      <div className="production-schedule-metrics" aria-label="Сводка графика">
        <article><small>Завершено работ</small><strong>{scheduleItems.length ? `${completion}%` : "Нет данных"}</strong><span>Выполнено: {doneCount} / {scheduleItems.length}</span></article>
        <article><small>Работы</small><strong>{scheduleItems.length}</strong><span>Сейчас выполняется: {activeCount}</span></article>
        <article className={delayedCount ? "tone-bad" : "tone-good"}><small>Отклонения</small><strong>{delayedCount}</strong><span>{delayedCount ? "нужен разбор" : "критичных нет"}</span></article>
        <article><small>Ближайший срок</small><strong>{nextItem ? formatShortDate(nextItem.endsAt) : "—"}</strong><span>{nextItem?.name ?? "активных работ нет"}</span></article>
      </div>

      <div className="production-schedule-toolbar">
        <label className="production-schedule-search">
          <Search size={16} />
          <input aria-label="Поиск по графику" onChange={(event) => setQuery(event.target.value)} placeholder="Работа, ответственный, зависимость" value={query} />
        </label>
        <div className="production-schedule-filters" aria-label="Фильтр работ" role="group">
          {([
            ["all", "Все", scheduleItems.length],
            ["active", "В работе", activeCount],
            ["delayed", "Отклонения", delayedCount],
            ["done", "Готово", scheduleItems.filter((item) => item.status === "done").length]
          ] as Array<[Filter, string, number]>).map(([value, label, count]) => (
            <button aria-pressed={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} type="button">{label}<span>{count}</span></button>
          ))}
        </div>
      </div>

      {canEdit ? (
        <details className="production-schedule-add">
          <summary>
            <span><Plus size={17} /><strong>Новая работа</strong><small>ручной ввод в график</small></span>
            <ChevronDown className="production-disclosure-chevron" size={17} />
          </summary>
          <ScheduleForm
            budgetItems={budgetItems}
            busy={busy}
            onSave={async (payload, form) => {
              await onCreate(payload as ScheduleCreateInput);
              form.reset();
            }}
          />
        </details>
      ) : null}

      <div className="production-phase-list" id="production-gantt">
        <div className="production-gantt-axis" aria-hidden="true">
          <span className="production-gantt-axis-title">Этап / работа</span>
          <div className="production-gantt-axis-dates">
            {ticks.map((tick) => <span key={tick.id} style={{ left: `${tick.left}%` }}>{tick.label}</span>)}
            {scale.todayLeft !== null ? <b style={{ left: `${scale.todayLeft}%` }}>Сегодня</b> : null}
          </div>
          <span className="production-gantt-axis-status">Статус</span>
        </div>
        {groups.map((group, groupIndex) => (
          <details className={`production-phase tone-${group.tone}`} key={group.id} open={groupIndex === 0 && !normalizedQuery && filter === "all"}>
            <summary>
              <span className="production-phase-index">{String(groupIndex + 1).padStart(2, "0")}</span>
              <span className="production-phase-title"><strong>{group.title}</strong><small>{workCountLabel(group.items.length)} · {formatShortDate(group.startsAt)} — {formatShortDate(group.endsAt)}</small></span>
              <TimelineBar endsAt={group.endsAt} label={`${Math.round(group.progress)}%`} progress={group.progress} scale={scale} startsAt={group.startsAt} tone={group.tone} />
              <span className="production-phase-state">{group.delayed ? `${group.delayed} откл.` : group.active ? `${group.active} в работе` : group.done === group.items.length ? "завершено" : "по плану"}</span>
              <ChevronDown className="production-disclosure-chevron" size={18} aria-hidden="true" />
            </summary>
            <div className="production-phase-body">
              {group.items.map((item) => (
                <WorkRow
                  budgetItems={budgetItems}
                  busy={busy}
                  canEdit={canEdit}
                  editing={editingId === item.id}
                  item={item}
                  key={item.id}
                  onCancelEdit={() => setEditingId(null)}
                  onDelete={async () => {
                    await onDelete(item);
                    if (editingId === item.id) setEditingId(null);
                  }}
                  onEdit={() => setEditingId((current) => current === item.id ? null : item.id)}
                  onUpdate={async (payload) => {
                    await onUpdate(item, payload);
                    setEditingId(null);
                  }}
                  scale={scale}
                />
              ))}
            </div>
          </details>
        ))}
        {!groups.length ? (
          <div className="production-schedule-empty">
            <CalendarDays size={24} />
            <strong>{scheduleItems.length ? "По текущему фильтру работ нет" : "График пока пуст"}</strong>
            <span>{scheduleItems.length ? "Измените фильтр или поисковый запрос." : "Работы можно добавить вручную или сформировать из загруженной ВОР."}</span>
          </div>
        ) : null}
      </div>

      <div className="production-schedule-disclosures">
        <details>
          <summary><span><CalendarDays size={17} /><strong>Недельный контроль</strong><small>по датам подтверждённого графика</small></span><ChevronDown className="production-disclosure-chevron" size={17} /></summary>
          <div className="production-week-list">
            {weeklyControl.map((row) => (
              <article className={`tone-${row.tone}`} key={row.id}>
                <span><strong>{row.title}</strong><small>{row.hint}</small></span>
                <p>{row.items.slice(0, 4).map((item) => item.name).join(", ") || "Нет работ"}</p>
                <b>{row.items.length}</b>
                {row.items.length > 4 ? <em>Ещё {row.items.length - 4}</em> : <em className="good">{row.items.length ? "Открыть этапы для деталей" : "Действий нет"}</em>}
              </article>
            ))}
          </div>
        </details>

        <details>
          <summary><span><AlertTriangle size={17} /><strong>Риски и зависимости</strong><small>{model.risks.length + scheduleItems.filter((item) => item.dependency).length} сигналов</small></span><ChevronDown className="production-disclosure-chevron" size={17} /></summary>
          <div className="production-risk-list">
            {model.risks.map((risk) => <div key={`${risk.title}-${risk.detail}`}><span className={`badge ${risk.severity === "high" ? "red" : risk.severity === "medium" ? "yellow" : "blue"}`}>{risk.severity === "high" ? "Высокий" : risk.severity === "medium" ? "Средний" : "Низкий"}</span><strong>{risk.title}</strong><p>{risk.detail}</p></div>)}
            {scheduleItems.filter((item) => item.dependency).map((item) => <div key={`dependency-${item.id}`}><span className="badge gray">Связь</span><strong>{item.name}</strong><p>{item.dependency}</p></div>)}
            {!model.risks.length && !scheduleItems.some((item) => item.dependency) ? <p className="muted">Риски и зависимости не зафиксированы.</p> : null}
          </div>
        </details>

        <details>
          <summary><span><Landmark size={17} /><strong>Расчётная финансовая нагрузка</strong><small>{model.summary.peakCashNeed ? `оценочный пик ${money(model.summary.peakCashNeed)}` : "нет расчёта"}</small></span><ChevronDown className="production-disclosure-chevron" size={17} /></summary>
          <div className="production-cashflow-section">
            <p className="production-method-note">Оценка строится по ВОР и не заменяет подтверждённый платёжный план.</p>
            <div className="production-cashflow-list">
              {model.cashflow.slice(0, 12).map((week) => {
                const maximum = Math.max(...model.cashflow.map((item) => Math.abs(item.net)), 1);
                return <div className={`tone-${week.tone}`} key={week.week}><span>{week.week}</span><i><em style={{ width: `${Math.max(4, (Math.abs(week.net) / maximum) * 100)}%` }} /></i><strong>{money(week.net)}</strong><small>{week.label}</small></div>;
              })}
              {!model.cashflow.length ? <p className="muted">Cashflow появится после распределения работ.</p> : null}
            </div>
            <div className="production-secondary-actions">
              <button className="button secondary compact-button" disabled={Boolean(loading)} onClick={onCashflowPreview} type="button">{loading === "cashflow-preview" ? "Готовлю..." : "Preview cashflow"}</button>
              <button className="button primary compact-button" disabled={!canCashflowCommit} onClick={onCashflowCommit} type="button">Сохранить cashflow</button>
              <button className="button secondary compact-button" onClick={() => onNavigate("Финансы")} type="button">Открыть финансы</button>
            </div>
            <DraftRows draft={draft} kind="cashflow" />
          </div>
        </details>

        <details className="production-auto-plan">
          <summary><span><PackageCheck size={17} /><strong>Автопланирование из ВОР</strong><small>{model.summary.packageCount} пакетов · {model.readiness.label}</small></span><ChevronDown className="production-disclosure-chevron" size={17} /></summary>
          <div className="production-auto-plan-body">
            <div className="production-auto-plan-status">
              <span className={`badge ${toneClass(model.tone)}`}>{model.readiness.label}</span>
              <strong>{model.readiness.nextStep}</strong>
              {model.readiness.blockers.length ? <ul>{model.readiness.blockers.map((item) => <li key={item}>{item}</li>)}</ul> : null}
            </div>
            <div className="production-secondary-actions">
              <button className="button secondary compact-button" disabled={Boolean(loading)} onClick={onSchedulePreview} type="button"><TimerReset size={15} />{loading === "schedule-preview" ? "Готовлю..." : "Сформировать preview"}</button>
              <button className="button primary compact-button" disabled={!canScheduleCommit} onClick={onScheduleCommit} type="button">Сохранить график</button>
              <button className="button secondary compact-button" onClick={() => onNavigate("Бюджет / ВОР")} type="button">Открыть ВОР</button>
            </div>
            <DraftRows draft={draft} kind="schedule" />
          </div>
        </details>
      </div>
    </section>
  );
}
