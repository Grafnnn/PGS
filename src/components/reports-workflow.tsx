"use client";

import {
  Activity,
  AlertOctagon,
  Check,
  CheckCircle2,
  ClipboardCopy,
  Eye,
  FileDown,
  FilePlus2,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Save,
  Send,
  ShieldCheck,
  Trash2,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { DailyReportActualsEditor } from "@/components/daily-report-actuals-editor";
import { DailyReportWorkOutputEditor } from "@/components/daily-report-work-output-editor";
import {
  dailyReportEquipmentActualsComplete,
  dailyReportMaterialActualsComplete
} from "@/lib/daily-report-actuals";
import type { DailyProgressImpactPreview } from "@/lib/daily-progress-impact";
import { dailyReportWorkOutputNorm, dailyReportWorkOutputsComplete } from "@/lib/daily-report-work-outputs";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { SerializedExecutiveReport } from "@/lib/executive-reports";
import type {
  DailyReport,
  DailyReportEquipmentActual,
  DailyReportMaterialActual,
  DailyReportWorkOutput,
  Material,
  ScheduleItem
} from "@/lib/types";

type UserContext = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
  name?: string;
};

type Props = {
  projectId: string;
  reports: DailyReport[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  currentUser: UserContext | null;
  currentUserLoaded: boolean;
  onReportsChange: (items: DailyReport[]) => void;
  onScheduleItemsChange: (items: ScheduleItem[]) => void;
  onMaterialsChange: (items: Material[]) => void;
};

type ReportForm = Omit<
  DailyReport,
  | "id"
  | "projectId"
  | "status"
  | "workOutputs"
  | "materialActuals"
  | "equipmentActuals"
  | "impactStatus"
  | "impactAppliedAt"
  | "impactAppliedBy"
  | "impactSummary"
> & {
  workOutputs: DailyReportWorkOutput[];
  materialActuals: DailyReportMaterialActual[];
  equipmentActuals: DailyReportEquipmentActual[];
};

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
  issues: "",
  workOutputs: [],
  materialActuals: [],
  equipmentActuals: []
});

function tone(status: string) {
  if (status === "approved" || status === "published" || status === "ready" || status === "applied") return "green";
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

export function ReportsWorkflow({
  projectId,
  reports,
  scheduleItems,
  materials,
  currentUser,
  currentUserLoaded,
  onReportsChange,
  onScheduleItemsChange,
  onMaterialsChange
}: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReportForm>(() => emptyReport(currentUser?.name));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dailyReportsLoaded, setDailyReportsLoaded] = useState(false);
  const [dailyReportsError, setDailyReportsError] = useState("");
  const [executiveReports, setExecutiveReports] = useState<SerializedExecutiveReport[]>([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState<string | null>(null);
  const [executiveLoaded, setExecutiveLoaded] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [impactByReport, setImpactByReport] = useState<Record<string, DailyProgressImpactPreview>>({});
  const [impactFingerprintByReport, setImpactFingerprintByReport] = useState<Record<string, string>>({});
  const [impactConfirmedId, setImpactConfirmedId] = useState<string | null>(null);

  const role = currentUser?.role;
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const canApprove = role === "OWNER" || role === "ADMIN";
  const selectedExecutive = executiveReports.find((item) => item.id === selectedExecutiveId) ?? executiveReports[0] ?? null;
  const sortedReports = useMemo(() => [...reports].sort((a, b) => b.date.localeCompare(a.date)), [reports]);
  const missingRequiredFields = [
    !form.author.trim() ? "автор" : "",
    !form.completedWorks.trim() ? "выполненные работы" : "",
    !dailyReportWorkOutputsComplete(form.workOutputs) ? "полные строки фактической выработки" : "",
    !dailyReportMaterialActualsComplete(form.materialActuals) ? "полные строки движения материалов" : "",
    !dailyReportEquipmentActualsComplete(form.equipmentActuals) ? "полные строки техники" : ""
  ].filter(Boolean);

  const loadDailyReports = useCallback(async () => {
    if (!currentUserLoaded || !currentUser?.authenticated) {
      setDailyReportsLoaded(true);
      return;
    }
    setBusy((current) => current || "daily-load");
    setDailyReportsError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/daily-reports`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить рапорты."));
      const body = (await response.json()) as { items?: DailyReport[] };
      onReportsChange(body.items ?? []);
    } catch (loadError) {
      setDailyReportsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить рапорты.");
    } finally {
      setDailyReportsLoaded(true);
      setBusy((current) => current === "daily-load" ? "" : current);
    }
  }, [currentUser?.authenticated, currentUserLoaded, onReportsChange, projectId]);

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

  useEffect(() => {
    void loadDailyReports();
  }, [loadDailyReports]);

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
      issues: item.issues,
      workOutputs: item.workOutputs ?? [],
      materialActuals: item.materialActuals ?? [],
      equipmentActuals: item.equipmentActuals ?? []
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

  async function previewImpact(item: DailyReport) {
    setBusy(`impact-preview-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}/impact`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось рассчитать влияние рапорта."));
      const body = (await response.json()) as { preview: DailyProgressImpactPreview; fingerprint: string };
      setImpactByReport((current) => ({ ...current, [item.id]: body.preview }));
      setImpactFingerprintByReport((current) => ({ ...current, [item.id]: body.fingerprint }));
      setImpactConfirmedId(null);
    } catch (impactError) {
      setError(impactError instanceof Error ? impactError.message : "Не удалось рассчитать влияние рапорта.");
    } finally {
      setBusy("");
    }
  }

  async function applyImpact(item: DailyReport) {
    const fingerprint = impactFingerprintByReport[item.id];
    if (impactConfirmedId !== item.id || !fingerprint) return;
    setBusy(`impact-apply-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}/impact`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true, fingerprint })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось применить утвержденный факт."));
      const body = (await response.json()) as {
        report: DailyReport;
        preview: DailyProgressImpactPreview;
        scheduleItems: ScheduleItem[];
        materials: Material[];
      };
      onReportsChange(reports.map((current) => current.id === item.id ? body.report : current));
      const changedSchedule = new Map(body.scheduleItems.map((current) => [current.id, current]));
      const changedMaterials = new Map(body.materials.map((current) => [current.id, current]));
      onScheduleItemsChange(scheduleItems.map((current) => changedSchedule.get(current.id) ?? current));
      onMaterialsChange(materials.map((current) => changedMaterials.get(current.id) ?? current));
      setImpactByReport((current) => ({ ...current, [item.id]: body.preview }));
      setImpactConfirmedId(null);
    } catch (impactError) {
      setError(impactError instanceof Error ? impactError.message : "Не удалось применить утвержденный факт.");
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
      {dailyReportsError ? <div className="form-error" role="alert">{dailyReportsError}</div> : null}

      <div className="reports-workflow-heading">
        <div>
          <div className="eyebrow">Процесс ежедневного рапорта</div>
          <h3>Ежедневные рапорты</h3>
          <p className="muted">Черновик → отправка → проверка → утверждение. Рабочие данные не создаются до сохранения формы.</p>
        </div>
        <div className="form-actions">
          <button className="button secondary" disabled={busy === "daily-load"} type="button" onClick={() => void loadDailyReports()}>
            <RefreshCw className={busy === "daily-load" ? "spin" : ""} size={17} /> {busy === "daily-load" ? "Обновляю..." : "Обновить"}
          </button>
          {canEdit ? (
            <button className="button primary" type="button" onClick={openNewReport}>
              <Plus size={17} /> Новый рапорт
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="daily-report-editor">
          <div className="reports-workflow-heading compact">
            <div><strong>{editingId ? "Редактирование черновика" : "Новый ежедневный рапорт"}</strong><span>Заполните фактические данные смены.</span></div>
            <button className="icon-button" type="button" title="Закрыть" onClick={() => setFormOpen(false)}><X size={18} /></button>
          </div>
          <div className="daily-report-form-grid">
            <label>Дата<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label>Автор <span aria-hidden="true">*</span><input aria-invalid={!form.author.trim()} required value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
            <label>Погода<input value={form.weather} onChange={(event) => setForm({ ...form, weather: event.target.value })} placeholder="Температура, осадки, ветер" /></label>
            <label>Рабочие<input min="0" type="number" value={form.workers} onChange={(event) => setForm({ ...form, workers: Number(event.target.value) })} /></label>
            <label>ИТР<input min="0" type="number" value={form.engineers} onChange={(event) => setForm({ ...form, engineers: Number(event.target.value) })} /></label>
            <label className="wide">Техника<input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} placeholder="Наименование и количество" /></label>
            <label className="wide">Выполненные работы <span aria-hidden="true">*</span><textarea aria-invalid={!form.completedWorks.trim()} required rows={3} value={form.completedWorks} onChange={(event) => setForm({ ...form, completedWorks: event.target.value })} /></label>
            <label>Материалы получены<textarea rows={2} value={form.materialsReceived} onChange={(event) => setForm({ ...form, materialsReceived: event.target.value })} /></label>
            <label>Материалы израсходованы<textarea rows={2} value={form.materialsConsumed} onChange={(event) => setForm({ ...form, materialsConsumed: event.target.value })} /></label>
            <label>Простои<textarea rows={2} value={form.downtime} onChange={(event) => setForm({ ...form, downtime: event.target.value })} /></label>
            <label>Проблемы / замечания<textarea rows={2} value={form.issues} onChange={(event) => setForm({ ...form, issues: event.target.value })} /></label>
          </div>
          <DailyReportWorkOutputEditor outputs={form.workOutputs} scheduleItems={scheduleItems} onChange={(workOutputs) => setForm({ ...form, workOutputs })} />
          <DailyReportActualsEditor
            materials={materials}
            materialActuals={form.materialActuals}
            equipmentActuals={form.equipmentActuals}
            onMaterialsChange={(materialActuals) => setForm({ ...form, materialActuals })}
            onEquipmentChange={(equipmentActuals) => setForm({ ...form, equipmentActuals })}
          />
          {missingRequiredFields.length ? <p className="form-hint" role="status">Для сохранения заполните: {missingRequiredFields.join(", ")}.</p> : null}
          <div className="form-actions">
            <button className="button primary" disabled={busy === "daily-save" || missingRequiredFields.length > 0} type="button" onClick={() => void saveReport()}>
              <Save size={17} /> {busy === "daily-save" ? "Сохраняю..." : "Сохранить черновик"}
            </button>
            <button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </div>
      ) : null}

      <div className="daily-report-list">
        {!dailyReportsLoaded && busy === "daily-load" ? <div className="reports-empty">Загружаю рапорты со стройплощадки...</div> : sortedReports.length ? sortedReports.map((item) => (
          <article className="daily-report-row" key={item.id}>
            <div className="daily-report-row-main">
              <div><strong>{new Date(item.date).toLocaleDateString("ru-RU")}</strong><span>{item.author} · {item.workers} рабочих / {item.engineers} ИТР</span></div>
              <span className={`badge ${tone(item.status)}`}>{dailyReportStatusLabel(item.status)}</span>
            </div>
            <p>{item.completedWorks || "Выполненные работы не заполнены"}</p>
            <small>{item.weather || "Погода не указана"} · {item.equipment || "Техника не указана"}</small>
            {item.workOutputs?.length ? (
              <div className="daily-report-output-summary">
                {item.workOutputs.map((output, index) => {
                  const actual = dailyReportWorkOutputNorm(output);
                  return (
                    <span key={`${output.profession}-${output.workName}-${index}`}>
                      <strong>{output.profession} · {output.workName}</strong>
                      {output.quantity.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} {output.unit}
                      {actual ? ` · ${actual.norm.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ${actual.unit}` : ""}
                      {output.scheduleItemId ? " · график связан" : " · только ФОТ"}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {item.materialActuals?.length || item.equipmentActuals?.length ? (
              <div className="daily-report-structured-facts">
                {item.materialActuals?.length ? <span><Link2 size={14} /> Материалы: {item.materialActuals.length}</span> : null}
                {item.equipmentActuals?.length ? <span><Activity size={14} /> Техника: {item.equipmentActuals.length}</span> : null}
              </div>
            ) : null}
            {item.issues || item.downtime ? <div className="daily-report-alert">{item.issues || item.downtime}</div> : null}
            <div className="daily-report-actions">
              {item.status === "draft" && canEdit ? <button className="button secondary compact-button" type="button" onClick={() => openEditReport(item)}><Pencil size={15} /> Редактировать</button> : null}
              {item.status === "draft" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "submitted")}><Send size={15} /> Отправить</button> : null}
              {item.status === "submitted" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "checked")}><Check size={15} /> Проверить</button> : null}
              {item.status === "checked" && canApprove ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "approved")}><ShieldCheck size={15} /> Утвердить</button> : null}
              {(item.status === "checked" || (item.status === "approved" && item.impactStatus !== "not_applicable")) ? <button className="button secondary compact-button" disabled={busy === `impact-preview-${item.id}`} type="button" onClick={() => void previewImpact(item)}><Eye size={15} /> {item.impactStatus === "applied" ? "Показать применение" : "Проверить влияние"}</button> : null}
              {item.status === "draft" && canApprove ? <button className="icon-button danger" type="button" title="Удалить черновик" onClick={() => void removeReport(item)}><Trash2 size={16} /></button> : null}
              {item.status === "approved" ? <span className={`badge ${item.impactStatus === "applied" ? "green" : item.impactStatus === "not_applicable" ? "gray" : "yellow"}`}>{item.impactStatus === "applied" ? "Факт применен" : item.impactStatus === "not_applicable" ? "Архивный рапорт" : "Ожидает применения"}</span> : null}
            </div>
            {impactByReport[item.id] ? (
              <div className={`daily-progress-impact state-${impactByReport[item.id].status}`}>
                <div className="daily-progress-impact-heading">
                  <div>
                    {impactByReport[item.id].status === "blocked" ? <AlertOctagon size={18} /> : <CheckCircle2 size={18} />}
                    <span><strong>Влияние утвержденного факта</strong><small>{impactByReport[item.id].status === "applied" ? "Изменения уже записаны и повторно не применяются." : "Предпросмотр не меняет данные проекта."}</small></span>
                  </div>
                  <span className={`badge ${tone(impactByReport[item.id].status)}`}>{impactByReport[item.id].status}</span>
                </div>
                <div className="daily-progress-impact-metrics">
                  <span><small>График</small><strong>{impactByReport[item.id].summary.scheduleItemCount}</strong></span>
                  <span><small>Факт работ</small><strong>{impactByReport[item.id].summary.progressEntryCount}</strong></span>
                  <span><small>Материалы</small><strong>{impactByReport[item.id].summary.materialUpdateCount}</strong></span>
                  <span><small>Труд</small><strong>{impactByReport[item.id].summary.laborHours.toLocaleString("ru-RU")} ч</strong></span>
                  <span><small>КС-кандидаты</small><strong>{impactByReport[item.id].summary.acceptanceCandidateCount}</strong></span>
                </div>
                {impactByReport[item.id].scheduleUpdates.length ? <div className="daily-progress-impact-lines">{impactByReport[item.id].scheduleUpdates.map((update) => <span key={update.scheduleItemId}><strong>{update.name}</strong>{update.beforeActualQty.toLocaleString("ru-RU")} → {update.afterActualQty.toLocaleString("ru-RU")} · {update.nextStatus}</span>)}</div> : null}
                {impactByReport[item.id].materialUpdates.length ? <div className="daily-progress-impact-lines">{impactByReport[item.id].materialUpdates.map((update) => <span key={update.materialId}><strong>{update.name}</strong>+{update.receivedQty.toLocaleString("ru-RU")} получено · +{update.consumedQty.toLocaleString("ru-RU")} расход</span>)}</div> : null}
                {impactByReport[item.id].warnings.length ? <div className="daily-progress-impact-notes warn">{impactByReport[item.id].warnings.map((message) => <span key={message}>{message}</span>)}</div> : null}
                {impactByReport[item.id].blockers.length ? <div className="daily-progress-impact-notes bad">{impactByReport[item.id].blockers.map((message) => <span key={message}>{message}</span>)}</div> : null}
                {item.status === "approved" && item.impactStatus !== "applied" && canEdit && impactByReport[item.id].status !== "blocked" ? (
                  <div className="daily-progress-impact-commit">
                    <label><input checked={impactConfirmedId === item.id} type="checkbox" onChange={(event) => setImpactConfirmedId(event.target.checked ? item.id : null)} /> Подтверждаю запись факта в график, материалы и связанные расчеты</label>
                    <button className="button primary compact-button" disabled={impactConfirmedId !== item.id || !impactFingerprintByReport[item.id] || busy === `impact-apply-${item.id}`} type="button" onClick={() => void applyImpact(item)}><CheckCircle2 size={15} /> {busy === `impact-apply-${item.id}` ? "Применяю..." : "Применить факт"}</button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </article>
        )) : <div className="reports-empty">Рапортов пока нет. Первый рапорт создаётся только после заполнения и сохранения формы.</div>}
      </div>

      <div className="reports-workflow-heading executive-heading">
        <div>
          <div className="eyebrow">Версионная управленческая отчетность</div>
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
