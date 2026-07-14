"use client";

import { AlertTriangle, CheckCircle2, CircleDot, Clock3, ListChecks, Plus, ShieldCheck, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectActionItem, ProjectActionStatus, RiskPriority } from "@/lib/types";

type ActionSummary = { total: number; open: number; blocked: number; waitingApproval: number; overdue: number; done: number };
export type ProjectActionSuggestion = { id: string; title: string; description: string; sourceModule: string; targetTab: string; priority: RiskPriority; assignee?: string | null; dueAt?: string | null };

const modules = ["manual", "ВОР / Бюджет", "График", "Материалы", "Снабжение", "Финансы", "Документы", "Риски", "КС", "Исполнение", "Площадка"];
const targetTabs = ["Обзор", "Бюджет / ВОР", "График", "Материалы", "Заявки", "Финансы", "КС", "Исполнение", "Рапорты", "Риски", "Документы", "Аналитика"];
const statusLabels: Record<ProjectActionStatus, string> = {
  open: "Открыто",
  in_progress: "В работе",
  waiting_approval: "На согласовании",
  blocked: "Заблокировано",
  done: "Выполнено"
};
const priorityLabels: Record<RiskPriority, string> = { low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический" };

function formatDate(value?: string | null) {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

export function ProjectActionCenter({ projectId, canEdit, canApprove = false, onNavigate, suggestions = [] }: { projectId: string; canEdit: boolean; canApprove?: boolean; onNavigate: (tab: string) => void; suggestions?: ProjectActionSuggestion[] }) {
  const [items, setItems] = useState<ProjectActionItem[]>([]);
  const [summary, setSummary] = useState<ActionSummary>({ total: 0, open: 0, blocked: 0, waitingApproval: 0, overdue: 0, done: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"active" | "all" | ProjectActionStatus>("active");
  const [form, setForm] = useState({ title: "", description: "", sourceModule: "manual", targetTab: "Обзор", priority: "medium" as RiskPriority, assignee: "", dueAt: "", requiresApproval: false });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/actions`);
      const data = (await response.json()) as { items?: ProjectActionItem[]; summary?: ActionSummary; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить действия.");
      setItems(data.items ?? []);
      if (data.summary) setSummary(data.summary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки действий.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const visibleItems = useMemo(() => items.filter((item) => {
    if (filter === "all") return true;
    if (filter === "active") return item.status !== "done";
    return item.status === filter;
  }), [filter, items]);

  async function createAction(event: React.FormEvent) {
    event.preventDefault();
    setSaving("create");
    try {
      const response = await fetch(`/api/projects/${projectId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).toISOString() : null })
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось создать действие.");
      setForm({ title: "", description: "", sourceModule: "manual", targetTab: "Обзор", priority: "medium", assignee: "", dueAt: "", requiresApproval: false });
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Ошибка создания действия.");
    } finally {
      setSaving("");
    }
  }

  async function updateAction(item: ProjectActionItem, patch: Record<string, unknown>) {
    setSaving(item.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/actions/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(patch)
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось обновить действие.");
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Ошибка обновления действия.");
    } finally {
      setSaving("");
    }
  }

  async function deleteAction(item: ProjectActionItem) {
    if (!window.confirm(`Удалить действие «${item.title}»?`)) return;
    setSaving(item.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/actions/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error("Не удалось удалить действие.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления действия.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="project-action-center" aria-label="Центр действий проекта">
      <header className="project-action-header">
        <div>
          <div className="eyebrow">Project workflow</div>
          <h3>Центр действий</h3>
          <p>Назначайте ответственных, сроки и согласование для решений из всех модулей проекта.</p>
        </div>
        <div className="project-action-health">
          <span className={summary.overdue ? "bad" : "good"}><Clock3 size={15} /> {summary.overdue} просрочено</span>
          <span className={summary.blocked ? "warn" : "neutral"}><AlertTriangle size={15} /> {summary.blocked} блокеров</span>
          <span className="info"><ShieldCheck size={15} /> {summary.waitingApproval} на согласовании</span>
        </div>
      </header>

      <div className="project-action-metrics">
        <article><small>Всего</small><strong>{summary.total}</strong><span>единый реестр</span></article>
        <article><small>Активно</small><strong>{summary.open}</strong><span>требуют решения</span></article>
        <article><small>Выполнено</small><strong>{summary.done}</strong><span>с audit trail</span></article>
      </div>

      {canEdit && (
        <form className="project-action-form" onSubmit={createAction}>
          {suggestions.length > 0 && (
            <div className="project-action-suggestions">
              <div><strong>Рекомендации системы</strong><span>Подготовьте действие из проверенных сигналов, затем подтвердите сохранение.</span></div>
              <div className="project-action-suggestion-list">
                {suggestions.slice(0, 5).map((suggestion) => (
                  <button key={suggestion.id} type="button" onClick={() => setForm({
                    title: suggestion.title,
                    description: suggestion.description,
                    sourceModule: suggestion.sourceModule,
                    targetTab: suggestion.targetTab,
                    priority: suggestion.priority,
                    assignee: suggestion.assignee ?? "",
                    dueAt: suggestion.dueAt?.slice(0, 10) ?? "",
                    requiresApproval: suggestion.priority === "critical"
                  })}>
                    <span className={`priority-${suggestion.priority}`}>{priorityLabels[suggestion.priority]}</span>
                    <strong>{suggestion.title}</strong>
                    <small>{suggestion.sourceModule}</small>
                  </button>
                ))}
              </div>
            </div>
          )}
          <div className="section-title"><Plus size={18} /><h4>Новое действие</h4></div>
          <div className="project-action-form-grid">
            <label className="field field-wide"><span>Что нужно сделать</span><input required minLength={3} maxLength={180} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder="Например: согласовать замену материала" /></label>
            <label className="field"><span>Источник</span><select value={form.sourceModule} onChange={(event) => setForm({ ...form, sourceModule: event.target.value })}>{modules.map((module) => <option key={module}>{module}</option>)}</select></label>
            <label className="field"><span>Рабочая зона</span><select value={form.targetTab} onChange={(event) => setForm({ ...form, targetTab: event.target.value })}>{targetTabs.map((tab) => <option key={tab}>{tab}</option>)}</select></label>
            <label className="field"><span>Приоритет</span><select value={form.priority} onChange={(event) => setForm({ ...form, priority: event.target.value as RiskPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>Ответственный</span><input maxLength={160} value={form.assignee} onChange={(event) => setForm({ ...form, assignee: event.target.value })} placeholder="ФИО или роль" /></label>
            <label className="field"><span>Срок</span><input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
            <label className="field field-wide"><span>Контекст / результат</span><textarea maxLength={2000} rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })} placeholder="Что проверить, какой результат ожидается" /></label>
            <label className="project-action-check"><input type="checkbox" checked={form.requiresApproval} onChange={(event) => setForm({ ...form, requiresApproval: event.target.checked })} /> Требуется отдельное согласование перед закрытием</label>
          </div>
          <button className="button primary" disabled={saving === "create"} type="submit"><Plus size={16} /> {saving === "create" ? "Сохраняю..." : "Добавить действие"}</button>
        </form>
      )}

      <div className="project-action-toolbar" role="group" aria-label="Фильтр действий">
        {(["active", "all", "blocked", "waiting_approval", "done"] as const).map((value) => <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>{value === "active" ? "Активные" : value === "all" ? "Все" : statusLabels[value]}</button>)}
      </div>

      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="empty-state">Загрузка реестра действий...</div> : visibleItems.length ? (
        <div className="project-action-list">
          {visibleItems.map((item) => {
            const overdue = item.status !== "done" && item.dueAt && new Date(item.dueAt) < new Date();
            return (
              <article className={`project-action-item priority-${item.priority} status-${item.status}`} key={item.id}>
                <div className="project-action-item-main">
                  <div className="project-action-item-title">
                    {item.status === "done" ? <CheckCircle2 size={18} /> : <CircleDot size={18} />}
                    <div><strong>{item.title}</strong><span>{item.sourceModule}{item.assignee ? ` · ${item.assignee}` : " · ответственный не назначен"}</span></div>
                  </div>
                  {item.description && <p>{item.description}</p>}
                  <div className="project-action-tags">
                    <span className={`priority-${item.priority}`}>{priorityLabels[item.priority]}</span>
                    <span className={overdue ? "overdue" : ""}>{formatDate(item.dueAt)}</span>
                    {item.requiresApproval && <span>{item.approvedAt ? `Согласовано: ${item.approvedBy}` : "Требуется согласование"}</span>}
                  </div>
                </div>
                <div className="project-action-item-controls">
                  {canEdit ? <select aria-label={`Статус: ${item.title}`} disabled={saving === item.id} value={item.status} onChange={(event) => updateAction(item, { status: event.target.value })}>{Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select> : <span>{statusLabels[item.status]}</span>}
                  {canApprove && item.requiresApproval && !item.approvedAt && <button className="button secondary compact-button" disabled={saving === item.id} type="button" onClick={() => updateAction(item, { approve: true })}><ShieldCheck size={15} /> Согласовать</button>}
                  {item.targetTab && <button className="button secondary compact-button" type="button" onClick={() => onNavigate(item.targetTab!)}><ListChecks size={15} /> Открыть</button>}
                  {canEdit && <button className="icon-button danger" aria-label={`Удалить: ${item.title}`} disabled={saving === item.id} type="button" onClick={() => deleteAction(item)}><Trash2 size={16} /></button>}
                </div>
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state">В выбранном фильтре нет действий. Создайте первое решение проекта.</div>}
    </section>
  );
}
