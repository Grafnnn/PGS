"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, FileQuestion, Pencil, Plus, RotateCcw, Send, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectDocument, ProjectRfi, ProjectSubmittal, RiskPriority } from "@/lib/types";

type Summary = { rfiTotal: number; rfiOpen: number; rfiOverdue: number; submittalTotal: number; submittalPending: number; submittalOverdue: number; revisionsRequired: number };
type RegisterMode = "rfi" | "submittal";

const emptySummary: Summary = { rfiTotal: 0, rfiOpen: 0, rfiOverdue: 0, submittalTotal: 0, submittalPending: 0, submittalOverdue: 0, revisionsRequired: 0 };
const priorityLabels: Record<RiskPriority, string> = { low: "Низкий", medium: "Средний", high: "Высокий", critical: "Критический" };
const rfiStatusLabels: Record<ProjectRfi["status"], string> = { draft: "Черновик", open: "Ожидает ответа", answered: "Ответ получен", closed: "Закрыт" };
const submittalStatusLabels: Record<ProjectSubmittal["status"], string> = { draft: "Черновик", submitted: "На рассмотрении", approved: "Согласовано", rejected: "Отклонено", revise_required: "На доработку", closed: "Закрыто" };

function localDate(value?: string | null) {
  if (!value) return "Без срока";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function apiError(status: number, fallback?: string) {
  if (status === 401 || status === 403) return "Войдите в систему с правом доступа к проекту.";
  if (status === 503) return "База данных временно недоступна. Повторите после запуска локальной БД или восстановления сервиса.";
  return fallback || "Операция не выполнена.";
}

const initialRfi = { subject: "", question: "", discipline: "", location: "", priority: "medium" as RiskPriority, assignee: "", dueAt: "", linkedDocumentId: "" };
const initialSubmittal = { title: "", category: "Материалы", specSection: "", reviewer: "", dueAt: "", linkedDocumentId: "" };

export function RfiSubmittalsWorkspace({ projectId, documents, canEdit, canDelete }: { projectId: string; documents: ProjectDocument[]; canEdit: boolean; canDelete: boolean }) {
  const [mode, setMode] = useState<RegisterMode>("rfi");
  const [rfis, setRfis] = useState<ProjectRfi[]>([]);
  const [submittals, setSubmittals] = useState<ProjectSubmittal[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [rfiForm, setRfiForm] = useState(initialRfi);
  const [submittalForm, setSubmittalForm] = useState(initialSubmittal);
  const [editingRfi, setEditingRfi] = useState<string | null>(null);
  const [editingSubmittal, setEditingSubmittal] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [reviews, setReviews] = useState<Record<string, { decision: "approved" | "rejected" | "revise_required"; comment: string }>>({});
  const [filter, setFilter] = useState("active");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [rfiResponse, submittalResponse] = await Promise.all([
        fetch(`/api/projects/${projectId}/rfis`),
        fetch(`/api/projects/${projectId}/submittals`)
      ]);
      const rfiData = await rfiResponse.json() as { items?: ProjectRfi[]; summary?: Summary; error?: string };
      const submittalData = await submittalResponse.json() as { items?: ProjectSubmittal[]; summary?: Summary; error?: string };
      if (!rfiResponse.ok) throw new Error(apiError(rfiResponse.status, rfiData.error));
      if (!submittalResponse.ok) throw new Error(apiError(submittalResponse.status, submittalData.error));
      setRfis(rfiData.items ?? []);
      setSubmittals(submittalData.items ?? []);
      setSummary(rfiData.summary ?? submittalData.summary ?? emptySummary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить реестры.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const visibleRfis = useMemo(() => rfis.filter((item) => filter === "all" || (filter === "active" ? item.status !== "closed" : item.status === filter)), [filter, rfis]);
  const visibleSubmittals = useMemo(() => submittals.filter((item) => filter === "all" || (filter === "active" ? item.status !== "closed" : item.status === filter)), [filter, submittals]);

  async function saveRfi(event: React.FormEvent) {
    event.preventDefault();
    setSaving(editingRfi ?? "rfi-create");
    try {
      const response = await fetch(editingRfi ? `/api/projects/${projectId}/rfis/${editingRfi}` : `/api/projects/${projectId}/rfis`, {
        method: editingRfi ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...rfiForm, dueAt: rfiForm.dueAt ? new Date(`${rfiForm.dueAt}T12:00:00`).toISOString() : null })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setRfiForm(initialRfi); setEditingRfi(null); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить RFI."); }
    finally { setSaving(""); }
  }

  async function saveSubmittal(event: React.FormEvent) {
    event.preventDefault();
    setSaving(editingSubmittal ?? "submittal-create");
    try {
      const response = await fetch(editingSubmittal ? `/api/projects/${projectId}/submittals/${editingSubmittal}` : `/api/projects/${projectId}/submittals`, {
        method: editingSubmittal ? "PATCH" : "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...submittalForm, dueAt: submittalForm.dueAt ? new Date(`${submittalForm.dueAt}T12:00:00`).toISOString() : null })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setSubmittalForm(initialSubmittal); setEditingSubmittal(null); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить submittal."); }
    finally { setSaving(""); }
  }

  async function update(kind: RegisterMode, id: string, body: Record<string, unknown>) {
    setSaving(id);
    try {
      const response = await fetch(`/api/projects/${projectId}/${kind === "rfi" ? "rfis" : "submittals"}/${id}`, {
        method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body)
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setAnswers((current) => ({ ...current, [id]: "" }));
      await load();
    } catch (updateError) { setError(updateError instanceof Error ? updateError.message : "Не удалось изменить статус."); }
    finally { setSaving(""); }
  }

  async function remove(kind: RegisterMode, id: string, number: string) {
    if (!window.confirm(`Удалить черновик ${number}?`)) return;
    setSaving(id);
    try {
      const response = await fetch(`/api/projects/${projectId}/${kind === "rfi" ? "rfis" : "submittals"}/${id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      await load();
    } catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить черновик."); }
    finally { setSaving(""); }
  }

  async function createEscalation(kind: RegisterMode, number: string, title: string, assignee?: string | null) {
    setSaving(`action-${number}`);
    try {
      const dueAt = new Date();
      dueAt.setDate(dueAt.getDate() + 1);
      const response = await fetch(`/api/projects/${projectId}/actions`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
          title: `Просрочен ${number}: ${title}`, description: `Проверить просроченный ${kind === "rfi" ? "RFI" : "submittal"} и получить формальное решение.`,
          sourceModule: kind === "rfi" ? "rfi" : "submittals", targetTab: "RFI / Согласования", priority: "high",
          assignee: assignee || null, dueAt: dueAt.toISOString(), requiresApproval: false
        })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(apiError(response.status, data.error));
      setNotice(`Действие по ${number} добавлено в Центр действий.`);
      setError("");
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Не удалось создать действие по просрочке."); }
    finally { setSaving(""); }
  }

  function editRfi(item: ProjectRfi) {
    setEditingRfi(item.id);
    setRfiForm({ subject: item.subject, question: item.question, discipline: item.discipline ?? "", location: item.location ?? "", priority: item.priority, assignee: item.assignee ?? "", dueAt: item.dueAt?.slice(0, 10) ?? "", linkedDocumentId: item.linkedDocumentId ?? "" });
  }

  function editSubmittal(item: ProjectSubmittal) {
    setEditingSubmittal(item.id);
    setSubmittalForm({ title: item.title, category: item.category, specSection: item.specSection ?? "", reviewer: item.reviewer ?? "", dueAt: item.dueAt?.slice(0, 10) ?? "", linkedDocumentId: item.linkedDocumentId ?? "" });
  }

  return (
    <section className="rfi-workspace" aria-label="RFI и согласования">
      <header className="rfi-workspace-header">
        <div><div className="eyebrow">Formal project communication</div><h3>RFI & Submittals</h3><p>Нумерованные запросы информации, ответы, подача документов и история согласований.</p></div>
        <div className="rfi-health">
          <span className={summary.rfiOverdue ? "bad" : "good"}><Clock3 size={15} /> RFI просрочено: {summary.rfiOverdue}</span>
          <span className={summary.submittalOverdue ? "bad" : "good"}><AlertTriangle size={15} /> Подач просрочено: {summary.submittalOverdue}</span>
        </div>
      </header>
      <div className="rfi-metrics">
        <article><small>Открытые RFI</small><strong>{summary.rfiOpen}</strong><span>ожидают ответа</span></article>
        <article><small>На рассмотрении</small><strong>{summary.submittalPending}</strong><span>submittals</span></article>
        <article><small>На доработку</small><strong>{summary.revisionsRequired}</strong><span>нужна новая ревизия</span></article>
      </div>
      <div className="rfi-mode-switch" role="tablist" aria-label="Тип реестра">
        <button className={mode === "rfi" ? "active" : ""} type="button" onClick={() => { setMode("rfi"); setFilter("active"); }}><FileQuestion size={17} /> RFI</button>
        <button className={mode === "submittal" ? "active" : ""} type="button" onClick={() => { setMode("submittal"); setFilter("active"); }}><FileCheck2 size={17} /> Согласования</button>
      </div>

      {canEdit && mode === "rfi" && <form className="rfi-form" onSubmit={saveRfi}>
        <div className="section-title"><Plus size={18} /><h4>{editingRfi ? "Редактировать черновик RFI" : "Новый RFI"}</h4></div>
        <div className="rfi-form-grid">
          <label className="field field-wide"><span>Тема</span><input required minLength={3} maxLength={180} value={rfiForm.subject} onChange={(e) => setRfiForm({ ...rfiForm, subject: e.target.value })} placeholder="Узел примыкания фасада к кровле" /></label>
          <label className="field"><span>Раздел</span><input maxLength={120} value={rfiForm.discipline} onChange={(e) => setRfiForm({ ...rfiForm, discipline: e.target.value })} placeholder="АР / КР / ОВ" /></label>
          <label className="field"><span>Зона</span><input maxLength={240} value={rfiForm.location} onChange={(e) => setRfiForm({ ...rfiForm, location: e.target.value })} placeholder="Ось 4–6, этаж 2" /></label>
          <label className="field field-wide"><span>Вопрос</span><textarea required minLength={5} maxLength={5000} rows={4} value={rfiForm.question} onChange={(e) => setRfiForm({ ...rfiForm, question: e.target.value })} placeholder="Опишите расхождение и требуемое решение" /></label>
          <label className="field"><span>Приоритет</span><select value={rfiForm.priority} onChange={(e) => setRfiForm({ ...rfiForm, priority: e.target.value as RiskPriority })}>{Object.entries(priorityLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label className="field"><span>Ответственный</span><input maxLength={160} value={rfiForm.assignee} onChange={(e) => setRfiForm({ ...rfiForm, assignee: e.target.value })} placeholder="Проектировщик / ФИО" /></label>
          <label className="field"><span>Срок ответа</span><input type="date" value={rfiForm.dueAt} onChange={(e) => setRfiForm({ ...rfiForm, dueAt: e.target.value })} /></label>
          <DocumentSelect documents={documents} value={rfiForm.linkedDocumentId} onChange={(value) => setRfiForm({ ...rfiForm, linkedDocumentId: value })} />
        </div>
        <div className="form-actions"><button className="button primary" disabled={Boolean(saving)} type="submit"><Plus size={16} /> {editingRfi ? "Сохранить" : "Создать черновик"}</button>{editingRfi && <button className="button secondary" type="button" onClick={() => { setEditingRfi(null); setRfiForm(initialRfi); }}>Отмена</button>}</div>
      </form>}

      {canEdit && mode === "submittal" && <form className="rfi-form" onSubmit={saveSubmittal}>
        <div className="section-title"><Plus size={18} /><h4>{editingSubmittal ? "Редактировать черновик подачи" : "Новая подача на согласование"}</h4></div>
        <div className="rfi-form-grid">
          <label className="field field-wide"><span>Наименование</span><input required minLength={3} maxLength={180} value={submittalForm.title} onChange={(e) => setSubmittalForm({ ...submittalForm, title: e.target.value })} placeholder="Паспорт фасадной системы" /></label>
          <label className="field"><span>Категория</span><select value={submittalForm.category} onChange={(e) => setSubmittalForm({ ...submittalForm, category: e.target.value })}><option>Материалы</option><option>Оборудование</option><option>Рабочая документация</option><option>Образец</option><option>Исполнительная документация</option></select></label>
          <label className="field"><span>Раздел / спецификация</span><input maxLength={120} value={submittalForm.specSection} onChange={(e) => setSubmittalForm({ ...submittalForm, specSection: e.target.value })} placeholder="АР-12 / 07 42 00" /></label>
          <label className="field"><span>Проверяющий</span><input maxLength={160} value={submittalForm.reviewer} onChange={(e) => setSubmittalForm({ ...submittalForm, reviewer: e.target.value })} placeholder="Заказчик / технадзор" /></label>
          <label className="field"><span>Срок решения</span><input type="date" value={submittalForm.dueAt} onChange={(e) => setSubmittalForm({ ...submittalForm, dueAt: e.target.value })} /></label>
          <DocumentSelect documents={documents} value={submittalForm.linkedDocumentId} onChange={(value) => setSubmittalForm({ ...submittalForm, linkedDocumentId: value })} />
        </div>
        <div className="form-actions"><button className="button primary" disabled={Boolean(saving)} type="submit"><Plus size={16} /> {editingSubmittal ? "Сохранить" : "Создать черновик"}</button>{editingSubmittal && <button className="button secondary" type="button" onClick={() => { setEditingSubmittal(null); setSubmittalForm(initialSubmittal); }}>Отмена</button>}</div>
      </form>}

      <div className="rfi-toolbar" role="group" aria-label="Фильтр реестра">
        {["active", "all", ...(mode === "rfi" ? ["draft", "open", "answered", "closed"] : ["draft", "submitted", "approved", "rejected", "revise_required", "closed"])].map((value) => <button className={filter === value ? "active" : ""} key={value} type="button" onClick={() => setFilter(value)}>{value === "active" ? "Активные" : value === "all" ? "Все" : mode === "rfi" ? rfiStatusLabels[value as ProjectRfi["status"]] : submittalStatusLabels[value as ProjectSubmittal["status"]]}</button>)}
      </div>
      {notice && <div className="rfi-notice">{notice}</div>}
      {error && <div className="error-box">{error}</div>}
      {loading ? <div className="empty-state">Загрузка формальных реестров...</div> : mode === "rfi" ? (
        visibleRfis.length ? <div className="rfi-register">{visibleRfis.map((item) => <RfiCard key={item.id} item={item} documents={documents} canEdit={canEdit} canDelete={canDelete} saving={saving} answer={answers[item.id] ?? ""} setAnswer={(value) => setAnswers({ ...answers, [item.id]: value })} onEdit={() => editRfi(item)} onUpdate={(body) => update("rfi", item.id, body)} onDelete={() => remove("rfi", item.id, item.number)} onEscalate={() => createEscalation("rfi", item.number, item.subject, item.assignee)} />)}</div> : <div className="empty-state">RFI пока нет. Создайте черновик для вопроса, который требует формального ответа.</div>
      ) : visibleSubmittals.length ? <div className="rfi-register">{visibleSubmittals.map((item) => <SubmittalCard key={item.id} item={item} documents={documents} canEdit={canEdit} canDelete={canDelete} saving={saving} review={reviews[item.id] ?? { decision: "approved", comment: "" }} setReview={(value) => setReviews({ ...reviews, [item.id]: value })} onEdit={() => editSubmittal(item)} onUpdate={(body) => update("submittal", item.id, body)} onDelete={() => remove("submittal", item.id, item.number)} onEscalate={() => createEscalation("submittal", item.number, item.title, item.reviewer)} />)}</div> : <div className="empty-state">Подач на согласование пока нет. Привяжите проектный документ и создайте первый черновик.</div>}
    </section>
  );
}

function DocumentSelect({ documents, value, onChange, required = false }: { documents: ProjectDocument[]; value: string; onChange: (value: string) => void; required?: boolean }) {
  return <label className="field"><span>Связанный документ{required ? " *" : ""}</span><select required={required} value={value} onChange={(e) => onChange(e.target.value)}><option value="">Не выбран</option>{documents.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.version}</option>)}</select></label>;
}

function DocumentLink({ projectId, documents, documentId, documentVersion, documentVersionId }: { projectId: string; documents: ProjectDocument[]; documentId?: string | null; documentVersion?: number | null; documentVersionId?: string | null }) {
  const document = documents.find((item) => item.id === documentId);
  if (!document) return null;
  const href = documentVersionId
    ? `/api/projects/${projectId}/documents/${document.id}/versions/${documentVersionId}/download`
    : `/api/projects/${projectId}/documents/${document.id}/download`;
  return <a className="rfi-document-link" href={href}><FileCheck2 size={14} /> {document.title} · v{documentVersion ?? document.version}{documentVersion && documentVersion !== document.version ? ` (сейчас v${document.version})` : ""}</a>;
}

type CardCommon = { documents: ProjectDocument[]; canEdit: boolean; canDelete: boolean; saving: string };

function RfiCard({ item, documents, canEdit, canDelete, saving, answer, setAnswer, onEdit, onUpdate, onDelete, onEscalate }: CardCommon & { item: ProjectRfi; answer: string; setAnswer: (value: string) => void; onEdit: () => void; onUpdate: (body: Record<string, unknown>) => void; onDelete: () => void; onEscalate: () => void }) {
  const overdue = item.status === "open" && item.dueAt && new Date(item.dueAt) < new Date();
  return <article className={`rfi-card priority-${item.priority}`}>
    <header><div><span className="rfi-number">{item.number}</span><strong>{item.subject}</strong><small>{item.discipline || "Без раздела"}{item.location ? ` · ${item.location}` : ""}</small></div><span className={`rfi-status status-${item.status}`}>{rfiStatusLabels[item.status]}</span></header>
    <p className="rfi-question">{item.question}</p>
    <div className="rfi-meta"><span className={overdue ? "overdue" : ""}><Clock3 size={14} /> {localDate(item.dueAt)}</span><span>{item.assignee || "Ответственный не назначен"}</span><span>{priorityLabels[item.priority]}</span></div>
    <DocumentLink projectId={item.projectId} documents={documents} documentId={item.linkedDocumentId} documentVersion={item.linkedDocumentVersion} documentVersionId={item.linkedDocumentVersionId} />
    {item.responses.length > 0 && <div className="rfi-history"><strong>История ответов</strong>{item.responses.map((response) => <div key={response.id}><p>{response.body}</p><small>{response.createdByName || "Пользователь"} · {localDate(response.createdAt)}</small></div>)}</div>}
    {canEdit && item.status === "open" && <div className="rfi-inline-action"><textarea rows={3} maxLength={5000} value={answer} onChange={(e) => setAnswer(e.target.value)} placeholder="Формальный ответ на RFI" /><button className="button primary" disabled={saving === item.id || answer.trim().length < 1} type="button" onClick={() => onUpdate({ action: "answer", response: answer })}><Send size={15} /> Ответить</button></div>}
    <footer>{canEdit && overdue && <button className="button secondary compact-button" disabled={saving === `action-${item.number}`} type="button" onClick={onEscalate}><AlertTriangle size={15} /> В действия</button>}{canEdit && item.status === "draft" && <><button className="button secondary compact-button" type="button" onClick={onEdit}><Pencil size={15} /> Изменить</button><button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "send" })}><Send size={15} /> Отправить</button></>}{canEdit && item.status === "answered" && <button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "close" })}><CheckCircle2 size={15} /> Закрыть</button>}{canEdit && item.status === "closed" && <button className="button secondary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "reopen" })}><RotateCcw size={15} /> Открыть снова</button>}{canDelete && item.status === "draft" && <button className="icon-button danger" aria-label={`Удалить ${item.number}`} disabled={saving === item.id} type="button" onClick={onDelete}><Trash2 size={16} /></button>}</footer>
  </article>;
}

function SubmittalCard({ item, documents, canEdit, canDelete, saving, review, setReview, onEdit, onUpdate, onDelete, onEscalate }: CardCommon & { item: ProjectSubmittal; review: { decision: "approved" | "rejected" | "revise_required"; comment: string }; setReview: (value: { decision: "approved" | "rejected" | "revise_required"; comment: string }) => void; onEdit: () => void; onUpdate: (body: Record<string, unknown>) => void; onDelete: () => void; onEscalate: () => void }) {
  const overdue = (item.status === "submitted" || item.status === "revise_required") && item.dueAt && new Date(item.dueAt) < new Date();
  return <article className="rfi-card submittal-card">
    <header><div><span className="rfi-number">{item.number} · Rev {item.revision}</span><strong>{item.title}</strong><small>{item.category}{item.specSection ? ` · ${item.specSection}` : ""}</small></div><span className={`rfi-status status-${item.status}`}>{submittalStatusLabels[item.status]}</span></header>
    <div className="rfi-meta"><span className={overdue ? "overdue" : ""}><Clock3 size={14} /> {localDate(item.dueAt)}</span><span>{item.reviewer || "Проверяющий не назначен"}</span></div>
    <DocumentLink projectId={item.projectId} documents={documents} documentId={item.linkedDocumentId} documentVersion={item.linkedDocumentVersion} documentVersionId={item.linkedDocumentVersionId} />
    {item.reviews.length > 0 && <div className="rfi-history"><strong>История решений</strong>{item.reviews.map((entry) => <div key={entry.id}><p><b>Rev {entry.revision}: {submittalStatusLabels[entry.decision as ProjectSubmittal["status"]] ?? entry.decision}</b>{entry.comment ? ` — ${entry.comment}` : ""}</p><small>{entry.createdByName || "Пользователь"} · {localDate(entry.createdAt)}</small></div>)}</div>}
    {canEdit && item.status === "submitted" && <div className="rfi-inline-action"><select value={review.decision} onChange={(e) => setReview({ ...review, decision: e.target.value as typeof review.decision })}><option value="approved">Согласовать</option><option value="revise_required">Вернуть на доработку</option><option value="rejected">Отклонить</option></select><textarea rows={2} maxLength={3000} value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} placeholder="Комментарий проверяющего" /><button className="button primary" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "review", ...review })}><FileCheck2 size={15} /> Зафиксировать решение</button></div>}
    <footer>{canEdit && overdue && <button className="button secondary compact-button" disabled={saving === `action-${item.number}`} type="button" onClick={onEscalate}><AlertTriangle size={15} /> В действия</button>}{canEdit && item.status === "draft" && <><button className="button secondary compact-button" type="button" onClick={onEdit}><Pencil size={15} /> Изменить</button><button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "submit" })}><Send size={15} /> Отправить</button></>}{canEdit && item.status === "revise_required" && <button className="button primary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "resubmit" })}><RotateCcw size={15} /> Подать Rev {item.revision + 1}</button>}{canEdit && (item.status === "approved" || item.status === "rejected") && <button className="button secondary compact-button" disabled={saving === item.id} type="button" onClick={() => onUpdate({ action: "close" })}><CheckCircle2 size={15} /> Закрыть</button>}{canDelete && item.status === "draft" && <button className="icon-button danger" aria-label={`Удалить ${item.number}`} disabled={saving === item.id} type="button" onClick={onDelete}><Trash2 size={16} /></button>}</footer>
  </article>;
}
