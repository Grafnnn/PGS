"use client";

import {
  Check,
  ClipboardCopy,
  FileDown,
  FilePlus2,
  Pencil,
  Plus,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { SerializedExecutiveReport } from "@/lib/executive-reports";
import type { DailyReport } from "@/lib/types";

type UserContext = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
  name?: string;
};

type Props = {
  projectId: string;
  reports: DailyReport[];
  currentUser: UserContext | null;
  currentUserLoaded: boolean;
  onReportsChange: (items: DailyReport[]) => void;
};

type ReportForm = Omit<DailyReport, "id" | "projectId" | "status">;

const emptyReport = (author = "Прораб"): ReportForm => ({
  date: new Date().toISOString().slice(0, 10),
  author,
  weather: "",
  workers: 0,
  engineers: 0,
  equipment: "",
  completedWorks: "",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "",
  issues: ""
});

function tone(status: string) {
  if (status === "approved" || status === "published") return "green";
  if (status === "checked") return "blue";
  if (status === "submitted" || status === "partial") return "yellow";
  if (status === "blocked" || status === "no_data") return "red";
  return "gray";
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для этой операции.";
  return body.error ?? fallback;
}

export function ReportsWorkflow({ projectId, reports, currentUser, currentUserLoaded, onReportsChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReportForm>(() => emptyReport(currentUser?.name));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [executiveReports, setExecutiveReports] = useState<SerializedExecutiveReport[]>([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState<string | null>(null);
  const [executiveLoaded, setExecutiveLoaded] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);

  const role = currentUser?.role;
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const canApprove = role === "OWNER" || role === "ADMIN";
  const selectedExecutive = executiveReports.find((item) => item.id === selectedExecutiveId) ?? executiveReports[0] ?? null;
  const sortedReports = useMemo(() => [...reports].sort((a, b) => b.date.localeCompare(a.date)), [reports]);

  const loadExecutiveReports = useCallback(async () => {
    if (!currentUserLoaded || !currentUser?.authenticated) {
      setExecutiveLoaded(true);
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить историю отчетов."));
      const body = (await response.json()) as { items: SerializedExecutiveReport[] };
      setExecutiveReports(body.items);
      setSelectedExecutiveId((current) => current ?? body.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить историю отчетов.");
    } finally {
      setExecutiveLoaded(true);
    }
  }, [currentUser?.authenticated, currentUserLoaded, projectId]);

  useEffect(() => {
    void loadExecutiveReports();
  }, [loadExecutiveReports]);

  function openNewReport() {
    setEditingId(null);
    setForm(emptyReport(currentUser?.name || "Прораб"));
    setFormOpen(true);
    setError("");
  }

  function openEditReport(item: DailyReport) {
    setEditingId(item.id);
    setForm({
      date: item.date,
      author: item.author,
      weather: item.weather,
      workers: item.workers,
      engineers: item.engineers,
      equipment: item.equipment,
      completedWorks: item.completedWorks,
      materialsReceived: item.materialsReceived,
      materialsConsumed: item.materialsConsumed,
      downtime: item.downtime,
      issues: item.issues
    });
    setFormOpen(true);
    setError("");
  }

  async function saveReport() {
    setBusy("daily-save");
    setError("");
    try {
      const response = await fetch(editingId ? `/api/daily-reports/${editingId}` : `/api/projects/${projectId}/daily-reports`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(form)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить рапорт."));
      const body = (await response.json()) as { item: DailyReport };
      onReportsChange(editingId ? reports.map((item) => (item.id === editingId ? body.item : item)) : [body.item, ...reports]);
      setFormOpen(false);
      setEditingId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить рапорт.");
    } finally {
      setBusy("");
    }
  }

  async function transitionReport(item: DailyReport, status: DailyReport["status"]) {
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось изменить статус рапорта."));
      const body = (await response.json()) as { item: DailyReport };
      onReportsChange(reports.map((current) => (current.id === item.id ? body.item : current)));
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "Не удалось изменить статус рапорта.");
    } finally {
      setBusy("");
    }
  }

  async function removeReport(item: DailyReport) {
    if (!window.confirm(`Удалить черновик рапорта за ${item.date}?`)) return;
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить рапорт."));
      onReportsChange(reports.filter((current) => current.id !== item.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить рапорт.");
    } finally {
      setBusy("");
    }
  }

  async function createExecutiveReport() {
    setBusy("executive-create");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportDate: new Date().toISOString().slice(0, 10) })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сформировать отчет."));
      const body = (await response.json()) as { item: SerializedExecutiveReport };
      setExecutiveReports((items) => [body.item, ...items]);
      setSelectedExecutiveId(body.item.id);
      setPublishConfirmed(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось сформировать отчет.");
    } finally {
      setBusy("");
    }
  }

  async function updateExecutiveReport(item: SerializedExecutiveReport, payload: { status: "published" | "archived"; publishConfirmed?: boolean }) {
    setBusy(`executive-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось обновить отчет."));
      const body = (await response.json()) as { item: SerializedExecutiveReport };
      setExecutiveReports((items) => items.map((current) => (current.id === item.id ? body.item : current)));
      setPublishConfirmed(false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить отчет.");
    } finally {
      setBusy("");
    }
  }

  async function removeExecutiveDraft(item: SerializedExecutiveReport) {
    if (!window.confirm(`Удалить черновик отчета v${item.version}?`)) return;
    setBusy(`executive-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить отчет."));
      setExecutiveReports((items) => items.filter((current) => current.id !== item.id));
      setSelectedExecutiveId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить отчет.");
    } finally {
      setBusy("");
    }
  }

  async function copyExecutiveReport() {
    if (!selectedExecutive) return;
    try {
      await navigator.clipboard.writeText(selectedExecutive.content.copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Не удалось скопировать отчет. Используйте скачивание TXT.");
    }
  }

  return (
    <section className="reports-workflow" aria-label="Reports Workflow v2">
      {error ? <div className="form-error" role="alert">{error}</div> : null}

      <div className="reports-workflow-heading">
        <div>
          <div className="eyebrow">Daily report workflow</div>
          <h3>Ежедневные рапорты</h3>
          <p className="muted">Черновик → отправка → проверка → утверждение. Рабочие данные не создаются до сохранения формы.</p>
        </div>
        {canEdit ? (
          <button className="button primary" type="button" onClick={openNewReport}>
            <Plus size={17} /> Новый рапорт
          </button>
        ) : null}
      </div>

      {formOpen ? (
        <div className="daily-report-editor">
          <div className="reports-workflow-heading compact">
            <div><strong>{editingId ? "Редактирование черновика" : "Новый ежедневный рапорт"}</strong><span>Заполните фактические данные смены.</span></div>
            <button className="icon-button" type="button" title="Закрыть" onClick={() => setFormOpen(false)}><X size={18} /></button>
          </div>
          <div className="daily-report-form-grid">
            <label>Дата<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label>Автор<input value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
            <label>Погода<input value={form.weather} onChange={(event) => setForm({ ...form, weather: event.target.value })} placeholder="Температура, осадки, ветер" /></label>
            <label>Рабочие<input min="0" type="number" value={form.workers} onChange={(event) => setForm({ ...form, workers: Number(event.target.value) })} /></label>
            <label>ИТР<input min="0" type="number" value={form.engineers} onChange={(event) => setForm({ ...form, engineers: Number(event.target.value) })} /></label>
            <label className="wide">Техника<input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} placeholder="Наименование и количество" /></label>
            <label className="wide">Выполненные работы<textarea required rows={3} value={form.completedWorks} onChange={(event) => setForm({ ...form, completedWorks: event.target.value })} /></label>
            <label>Материалы получены<textarea rows={2} value={form.materialsReceived} onChange={(event) => setForm({ ...form, materialsReceived: event.target.value })} /></label>
            <label>Материалы израсходованы<textarea rows={2} value={form.materialsConsumed} onChange={(event) => setForm({ ...form, materialsConsumed: event.target.value })} /></label>
            <label>Простои<textarea rows={2} value={form.downtime} onChange={(event) => setForm({ ...form, downtime: event.target.value })} /></label>
            <label>Проблемы / замечания<textarea rows={2} value={form.issues} onChange={(event) => setForm({ ...form, issues: event.target.value })} /></label>
          </div>
          <div className="form-actions">
            <button className="button primary" disabled={busy === "daily-save" || !form.author.trim() || !form.completedWorks.trim()} type="button" onClick={() => void saveReport()}>
              <Save size={17} /> {busy === "daily-save" ? "Сохраняю..." : "Сохранить черновик"}
            </button>
            <button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : null}

      <div className="daily-report-list">
        {sortedReports.length ? sortedReports.map((item) => (
          <article className="daily-report-row" key={item.id}>
            <div className="daily-report-row-main">
              <div><strong>{new Date(item.date).toLocaleDateString("ru-RU")}</strong><span>{item.author} · {item.workers} рабочих / {item.engineers} ИТР</span></div>
              <span className={`badge ${tone(item.status)}`}>{dailyReportStatusLabel(item.status)}</span>
            </div>
            <p>{item.completedWorks || "Выполненные работы не заполнены"}</p>
            <small>{item.weather || "Погода не указана"} · {item.equipment || "Техника не указана"}</small>
            {item.issues || item.downtime ? <div className="daily-report-alert">{item.issues || item.downtime}</div> : null}
            <div className="daily-report-actions">
              {item.status === "draft" && canEdit ? <button className="button secondary compact-button" type="button" onClick={() => openEditReport(item)}><Pencil size={15} /> Редактировать</button> : null}
              {item.status === "draft" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "submitted")}><Send size={15} /> Отправить</button> : null}
              {item.status === "submitted" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "checked")}><Check size={15} /> Проверить</button> : null}
              {item.status === "checked" && canApprove ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "approved")}><ShieldCheck size={15} /> Утвердить</button> : null}
              {item.status === "draft" && canApprove ? <button className="icon-button danger" type="button" title="Удалить черновик" onClick={() => void removeReport(item)}><Trash2 size={16} /></button> : null}
            </div>
          </article>
        )) : <div className="reports-empty">Рапортов пока нет. Первый рапорт создаётся только после заполнения и сохранения формы.</div>}
      </div>

      <div className="reports-workflow-heading executive-heading">
        <div>
          <div className="eyebrow">Versioned executive reporting</div>
          <h3>Управленческие отчеты</h3>
          <p className="muted">Каждый выпуск сохраняет собственную версию и снимок источников. Формирование выполняется только по явной команде, опубликованная версия неизменяема.</p>
        </div>
        {canEdit ? <button className="button primary" disabled={busy === "executive-create"} type="button" onClick={() => void createExecutiveReport()}><FilePlus2 size={17} /> {busy === "executive-create" ? "Формирую..." : "Сформировать версию"}</button> : null}
      </div>

      {!currentUser?.authenticated && executiveLoaded ? <div className="reports-empty">Войдите в систему, чтобы открыть историю управленческих отчетов.</div> : null}
      {currentUser?.authenticated && executiveLoaded && !executiveReports.length ? <div className="reports-empty">Сохранённых версий пока нет. Формирование выполняется только по явной команде.</div> : null}

      {executiveReports.length ? (
        <div className="executive-report-workflow-layout">
          <div className="executive-report-history" role="tablist" aria-label="Версии управленческого отчета">
            {executiveReports.map((item) => (
              <button className={item.id === selectedExecutive?.id ? "active" : ""} key={item.id} type="button" onClick={() => { setSelectedExecutiveId(item.id); setPublishConfirmed(false); }}>
                <strong>v{item.version} · {item.reportDate}</strong>
                <span>{item.title}</span>
                <small className={`badge ${tone(item.status)}`}>{item.status}</small>
              </button>
            ))}
          </div>

          {selectedExecutive ? (
            <article className="executive-report-version">
              <div className="reports-workflow-heading compact">
                <div>
                  <strong>{selectedExecutive.title}</strong>
                  <span>v{selectedExecutive.version} · readiness: {selectedExecutive.content.reportReadiness}</span>
                </div>
                <span className={`badge ${tone(selectedExecutive.status)}`}>{selectedExecutive.status}</span>
              </div>
              <div className="executive-report-sections compact-sections">
                {selectedExecutive.content.sections.map((section) => <div key={section.title}><strong>{section.title}</strong><p>{section.text}</p></div>)}
              </div>
              {selectedExecutive.status === "draft" && canApprove && ["blocked", "no_data"].includes(selectedExecutive.content.reportReadiness) ? (
                <label className="report-publish-confirm"><input checked={publishConfirmed} type="checkbox" onChange={(event) => setPublishConfirmed(event.target.checked)} /> Подтверждаю выпуск отчёта с неполными или блокирующими данными</label>
              ) : null}
              <div className="form-actions">
                <button className="button secondary compact-button" type="button" onClick={() => void copyExecutiveReport()}><ClipboardCopy size={15} /> {copied ? "Скопировано" : "Копировать"}</button>
                <a className="button secondary compact-button" href={`/api/projects/${projectId}/executive-reports/${selectedExecutive.id}/export`}><FileDown size={15} /> Скачать TXT</a>
                {selectedExecutive.status === "draft" && canApprove ? <button className="button primary compact-button" disabled={busy === `executive-${selectedExecutive.id}` || (["blocked", "no_data"].includes(selectedExecutive.content.reportReadiness) && !publishConfirmed)} type="button" onClick={() => void updateExecutiveReport(selectedExecutive, { status: "published", publishConfirmed })}><ShieldCheck size={15} /> Опубликовать</button> : null}
                {selectedExecutive.status === "published" && canApprove ? <button className="button secondary compact-button" type="button" onClick={() => void updateExecutiveReport(selectedExecutive, { status: "archived" })}>В архив</button> : null}
                {selectedExecutive.status === "draft" && canApprove ? <button className="icon-button danger" type="button" title="Удалить черновик" onClick={() => void removeExecutiveDraft(selectedExecutive)}><Trash2 size={16} /></button> : null}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
