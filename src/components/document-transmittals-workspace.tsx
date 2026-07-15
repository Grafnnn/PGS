"use client";

import { AlertTriangle, CheckCircle2, ClipboardCheck, Download, FileClock, PackageCheck, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { DocumentTransmittalStatus, ProjectDocument, ProjectDocumentTransmittal } from "@/lib/types";

type Summary = { total: number; active: number; overdue: number; approved: number; revisionsRequired: number };
type FormState = { subject: string; purpose: string; recipient: string; ccRecipients: string; reviewer: string; dueAt: string; documentIds: string[] };

const emptySummary: Summary = { total: 0, active: 0, overdue: 0, approved: 0, revisionsRequired: 0 };
const emptyForm: FormState = { subject: "", purpose: "", recipient: "", ccRecipients: "", reviewer: "", dueAt: "", documentIds: [] };
const statusLabels: Record<DocumentTransmittalStatus, string> = {
  draft: "Черновик",
  issued: "Выдан",
  acknowledged: "Получен",
  approved: "Согласован",
  revise_required: "На доработку",
  closed: "Закрыт"
};

function localDate(value?: string | null) {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function apiError(status: number, fallback?: string) {
  if (status === 401 || status === 403) return "Войдите в систему с правом доступа к проекту.";
  if (status === 503) return "База данных временно недоступна.";
  return fallback || "Операция не выполнена.";
}

export function DocumentTransmittalsWorkspace({ projectId, documents, canEdit, canDelete }: { projectId: string; documents: ProjectDocument[]; canEdit: boolean; canDelete: boolean }) {
  const [items, setItems] = useState<ProjectDocumentTransmittal[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editing, setEditing] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [filter, setFilter] = useState("active");
  const [reviews, setReviews] = useState<Record<string, { decision: "approved" | "revise_required"; comment: string }>>({});
  const [acknowledgements, setAcknowledgements] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/transmittals`);
      const data = await response.json() as { items?: ProjectDocumentTransmittal[]; summary?: Summary; error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setItems(data.items ?? []);
      setSummary(data.summary ?? emptySummary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал выдачи.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const visibleItems = useMemo(() => items.filter((item) => filter === "all" || (filter === "active" ? item.status !== "closed" : item.status === filter)), [filter, items]);

  function resetForm() {
    setForm(emptyForm);
    setEditing(null);
    setShowForm(false);
  }

  function edit(item: ProjectDocumentTransmittal) {
    setEditing(item.id);
    setForm({
      subject: item.subject,
      purpose: item.purpose ?? "",
      recipient: item.recipient ?? "",
      ccRecipients: item.ccRecipients ?? "",
      reviewer: item.reviewer ?? "",
      dueAt: item.dueAt?.slice(0, 10) ?? "",
      documentIds: item.items.map((entry) => entry.documentId).filter((id): id is string => Boolean(id))
    });
    setShowForm(true);
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setSaving(editing ?? "create");
    try {
      const response = await fetch(editing ? `/api/projects/${projectId}/transmittals/${editing}` : `/api/projects/${projectId}/transmittals`, {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).toISOString() : null })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      resetForm();
      setNotice(editing ? "Черновик пакета обновлён." : "Черновик выдачи создан.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить пакет.");
    } finally {
      setSaving("");
    }
  }

  async function update(item: ProjectDocumentTransmittal, body: Record<string, unknown>) {
    setSaving(item.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/transmittals/${item.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setNotice(`${item.number}: операция выполнена.`);
      setError("");
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось изменить статус выдачи.");
    } finally {
      setSaving("");
    }
  }

  async function remove(item: ProjectDocumentTransmittal) {
    if (!window.confirm(`Удалить черновик ${item.number}?`)) return;
    setSaving(item.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/transmittals/${item.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить черновик.");
    } finally {
      setSaving("");
    }
  }

  async function escalate(item: ProjectDocumentTransmittal) {
    setSaving(`action-${item.id}`);
    try {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);
      const response = await fetch(`/api/projects/${projectId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: `Просрочен ${item.number}: ${item.subject}`,
          description: "Получить подтверждение получения или формальное решение по выданному пакету документов.",
          sourceModule: "document_transmittals",
          targetTab: "Документы",
          priority: "high",
          assignee: item.reviewer || item.recipient || null,
          dueAt: dueAt.toISOString(),
          requiresApproval: false
        })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setNotice(`Действие по ${item.number} добавлено в Центр действий.`);
      setError("");
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось создать действие.");
    } finally {
      setSaving("");
    }
  }

  function toggleDocument(documentId: string) {
    setForm((current) => ({
      ...current,
      documentIds: current.documentIds.includes(documentId) ? current.documentIds.filter((id) => id !== documentId) : [...current.documentIds, documentId]
    }));
  }

  return (
    <section className="transmittal-workspace" aria-label="Document Transmittals & Approval">
      <header className="transmittal-header">
        <div>
          <div className="eyebrow">Document Transmittals & Approval</div>
          <h3>Выдача пакетов и формальные решения</h3>
          <p>Версии файлов фиксируются в момент выдачи. Получение, решение, повторная выдача и закрытие сохраняются в истории.</p>
        </div>
        {canEdit && <button className="button primary" type="button" onClick={() => { resetForm(); setShowForm(true); }}><Plus size={16} /> Новая выдача</button>}
      </header>

      <div className="transmittal-metrics">
        <article><small>Активные</small><strong>{summary.active}</strong><span>ждут решения</span></article>
        <article><small>Просрочены</small><strong>{summary.overdue}</strong><span>нужно ускорить</span></article>
        <article><small>На доработку</small><strong>{summary.revisionsRequired}</strong><span>нужна новая ревизия</span></article>
        <article><small>Согласованы</small><strong>{summary.approved}</strong><span>включая закрытые</span></article>
      </div>

      {showForm && canEdit && <form className="rfi-form transmittal-form" onSubmit={save}>
        <div className="section-title"><PackageCheck size={18} /><h4>{editing ? "Редактировать пакет" : "Новый пакет документов"}</h4></div>
        <div className="rfi-form-grid">
          <label className="field field-wide"><span>Тема выдачи</span><input required minLength={3} maxLength={180} value={form.subject} onChange={(event) => setForm({ ...form, subject: event.target.value })} placeholder="Комплект исполнительной документации за июль" /></label>
          <label className="field field-wide"><span>Назначение</span><textarea rows={2} maxLength={1200} value={form.purpose} onChange={(event) => setForm({ ...form, purpose: event.target.value })} placeholder="На согласование / для производства работ / к КС" /></label>
          <label className="field"><span>Получатель</span><input maxLength={240} value={form.recipient} onChange={(event) => setForm({ ...form, recipient: event.target.value })} placeholder="Заказчик / технадзор" /></label>
          <label className="field"><span>Копия</span><input maxLength={600} value={form.ccRecipients} onChange={(event) => setForm({ ...form, ccRecipients: event.target.value })} placeholder="ПТО, проектировщик" /></label>
          <label className="field"><span>Проверяющий</span><input maxLength={240} value={form.reviewer} onChange={(event) => setForm({ ...form, reviewer: event.target.value })} placeholder="ФИО / роль" /></label>
          <label className="field"><span>Срок решения</span><input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })} /></label>
        </div>
        <fieldset className="transmittal-document-picker">
          <legend>Состав пакета · выбрано {form.documentIds.length}</legend>
          {documents.length ? <div className="transmittal-document-grid">{documents.map((document) => (
            <label key={document.id} className={form.documentIds.includes(document.id) ? "selected" : ""}>
              <input type="checkbox" checked={form.documentIds.includes(document.id)} onChange={() => toggleDocument(document.id)} />
              <span><strong>{document.title}</strong><small>{document.category} · текущая v{document.version}</small></span>
            </label>
          ))}</div> : <div className="empty-state">Сначала загрузите документы проекта.</div>}
        </fieldset>
        <div className="form-actions"><button className="button primary" disabled={Boolean(saving)} type="submit">Сохранить черновик</button><button className="button secondary" type="button" onClick={resetForm}>Отмена</button></div>
      </form>}

      <div className="rfi-toolbar" role="group" aria-label="Фильтр журнала выдачи">
        {["active", "all", "draft", "issued", "acknowledged", "approved", "revise_required", "closed"].map((value) => <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>{value === "active" ? "Активные" : value === "all" ? "Все" : statusLabels[value as DocumentTransmittalStatus]}</button>)}
      </div>
      {notice && <div className="rfi-notice">{notice}</div>}
      {error && <div className="error-box">{error}</div>}

      {loading ? <div className="empty-state">Загрузка журнала выдачи...</div> : visibleItems.length ? <div className="transmittal-register">
        {visibleItems.map((item) => <TransmittalCard
          key={item.id}
          projectId={projectId}
          item={item}
          canEdit={canEdit}
          canDelete={canDelete}
          saving={saving}
          review={reviews[item.id] ?? { decision: "approved", comment: "" }}
          acknowledgement={acknowledgements[item.id] ?? ""}
          setReview={(value) => setReviews({ ...reviews, [item.id]: value })}
          setAcknowledgement={(value) => setAcknowledgements({ ...acknowledgements, [item.id]: value })}
          onEdit={() => edit(item)}
          onUpdate={(body) => update(item, body)}
          onDelete={() => remove(item)}
          onEscalate={() => escalate(item)}
        />)}
      </div> : <div className="empty-state">Пакетов пока нет. Создайте черновик и выберите документы для формальной выдачи.</div>}
    </section>
  );
}

function TransmittalCard({ projectId, item, canEdit, canDelete, saving, review, acknowledgement, setReview, setAcknowledgement, onEdit, onUpdate, onDelete, onEscalate }: {
  projectId: string;
  item: ProjectDocumentTransmittal;
  canEdit: boolean;
  canDelete: boolean;
  saving: string;
  review: { decision: "approved" | "revise_required"; comment: string };
  acknowledgement: string;
  setReview: (value: { decision: "approved" | "revise_required"; comment: string }) => void;
  setAcknowledgement: (value: string) => void;
  onEdit: () => void;
  onUpdate: (body: Record<string, unknown>) => void;
  onDelete: () => void;
  onEscalate: () => void;
}) {
  const overdue = ["issued", "acknowledged", "revise_required"].includes(item.status) && item.dueAt && new Date(item.dueAt) < new Date();
  return <article className={`transmittal-card status-${item.status}`}>
    <header>
      <div><span className="rfi-number">{item.number} · Rev {item.revision}</span><strong>{item.subject}</strong><small>{item.purpose || "Назначение не указано"}</small></div>
      <span className={`rfi-status status-${item.status}`}>{statusLabels[item.status]}</span>
    </header>
    <div className="transmittal-meta"><span className={overdue ? "overdue" : ""}><FileClock size={14} /> {localDate(item.dueAt)}</span><span>Кому: {item.recipient || "не указан"}</span><span>Проверяет: {item.reviewer || "не назначен"}</span></div>
    <div className="transmittal-package-list">{item.items.map((entry) => {
      const href = entry.documentId && entry.documentVersionId ? `/api/projects/${projectId}/documents/${entry.documentId}/versions/${entry.documentVersionId}/download` : entry.documentId ? `/api/projects/${projectId}/documents/${entry.documentId}/download` : null;
      const content = <><strong>{entry.titleSnapshot}</strong><small>{entry.categorySnapshot || "без категории"} · v{entry.documentVersion ?? "draft"}{entry.fileNameSnapshot ? ` · ${entry.fileNameSnapshot}` : ""}</small></>;
      return href ? <a key={entry.id} href={href}>{content}</a> : <div key={entry.id}>{content}</div>;
    })}</div>
    {item.events.length > 0 && <details className="compact-details transmittal-history"><summary>История выдачи <span>{item.events.length}</span></summary><div>{item.events.map((event) => <p key={event.id}><strong>Rev {event.revision} · {event.eventType}{event.decision ? ` · ${statusLabels[event.decision as DocumentTransmittalStatus] ?? event.decision}` : ""}</strong>{event.comment ? ` — ${event.comment}` : ""}<small>{event.createdByName || "Пользователь"} · {localDate(event.createdAt)}</small></p>)}</div></details>}
    {canEdit && item.status === "issued" && <div className="rfi-inline-action"><textarea rows={2} maxLength={3000} value={acknowledgement} onChange={(event) => setAcknowledgement(event.target.value)} placeholder="Комментарий о получении (необязательно)" /><button className="button secondary" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "acknowledge", comment: acknowledgement || null })}><ClipboardCheck size={15} /> Подтвердить получение</button></div>}
    {canEdit && (item.status === "issued" || item.status === "acknowledged") && <div className="rfi-inline-action"><select value={review.decision} onChange={(event) => setReview({ ...review, decision: event.target.value as typeof review.decision })}><option value="approved">Согласовать</option><option value="revise_required">Вернуть на доработку</option></select><textarea rows={2} maxLength={3000} value={review.comment} onChange={(event) => setReview({ ...review, comment: event.target.value })} placeholder="Комментарий проверяющего" /><button className="button primary" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "review", ...review })}><CheckCircle2 size={15} /> Зафиксировать решение</button></div>}
    <footer>
      {overdue && canEdit && <button className="button secondary compact-button" disabled={saving === `action-${item.id}`} type="button" onClick={onEscalate}><AlertTriangle size={15} /> В действия</button>}
      {item.status !== "draft" && <a className="button secondary compact-button" href={`/api/projects/${projectId}/transmittals/${item.id}/manifest`}><Download size={15} /> Лист выдачи</a>}
      {canEdit && (item.status === "draft" || item.status === "revise_required") && <button className="button secondary compact-button" type="button" onClick={onEdit}><Pencil size={15} /> Изменить</button>}
      {canEdit && item.status === "draft" && <button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "issue" })}><Send size={15} /> Выдать пакет</button>}
      {canEdit && item.status === "revise_required" && <button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "reissue", comment: "Повторная выдача после доработки" })}><RotateCcw size={15} /> Выдать Rev {item.revision + 1}</button>}
      {canEdit && item.status === "approved" && <button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "close" })}><PackageCheck size={15} /> Закрыть пакет</button>}
      {canDelete && item.status === "draft" && <button className="icon-button danger" aria-label={`Удалить ${item.number}`} disabled={saving === item.id} type="button" onClick={onDelete}><Trash2 size={16} /></button>}
    </footer>
  </article>;
}
