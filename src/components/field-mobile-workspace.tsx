"use client";

import {
  AlertTriangle,
  Camera,
  CheckCircle2,
  ClipboardPlus,
  CloudUpload,
  HardDrive,
  RefreshCw,
  RotateCcw,
  Trash2,
  Wifi,
  WifiOff
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  FIELD_QUEUE_CHANGED_EVENT,
  enqueueFieldOperation,
  listFieldQueue,
  removeFieldQueueItem,
  retryFieldQueueItem,
  syncFieldQueue,
  type FieldQueueItem
} from "@/lib/field-offline-queue";
import { fieldSyncKindLabel } from "@/lib/field-sync";
import type { DailyReport, ProjectDocument } from "@/lib/types";

type UserContext = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
  name?: string;
};

type Props = {
  projectId: string;
  projectName: string;
  currentUser: UserContext | null;
  currentUserLoaded: boolean;
  onReportSynced: (item: DailyReport) => void;
  onDocumentSynced: (item: ProjectDocument) => void;
};

type Mode = "daily_report" | "field_issue" | "photo_evidence";

const emptyReport = (author = "Прораб") => ({
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

const emptyIssue = { title: "", description: "", priority: "medium" as const, assignee: "", dueAt: "" };

const statusLabels: Record<FieldQueueItem["state"], string> = {
  pending: "В очереди",
  syncing: "Отправляется",
  failed: "Нужна повторная отправка",
  conflict: "Нужна проверка"
};

function queueItemTitle(item: FieldQueueItem) {
  if (item.kind === "daily_report") return `${item.payload.date} · ${item.payload.completedWorks || "Полевой рапорт"}`;
  if (item.kind === "field_issue") return item.payload.title;
  return item.payload.fileName;
}

function queueItemDetail(item: FieldQueueItem) {
  if (item.kind === "daily_report") return `${item.payload.workers} рабочих · ${item.payload.engineers} ИТР`;
  if (item.kind === "field_issue") return `${item.payload.priority} · ${item.payload.assignee || "без ответственного"}`;
  return `${item.payload.category} · ${(item.payload.file.size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ`;
}

export function FieldMobileWorkspace({ projectId, projectName, currentUser, currentUserLoaded, onReportSynced, onDocumentSynced }: Props) {
  const [mode, setMode] = useState<Mode>("daily_report");
  const [online, setOnline] = useState(true);
  const [queue, setQueue] = useState<FieldQueueItem[]>([]);
  const [report, setReport] = useState(() => emptyReport(currentUser?.name));
  const [issue, setIssue] = useState(emptyIssue);
  const [photo, setPhoto] = useState<File | null>(null);
  const [photoCategory, setPhotoCategory] = useState("фотофиксация");
  const [busy, setBusy] = useState("");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [storagePersistent, setStoragePersistent] = useState<boolean | null>(null);
  const [capabilities, setCapabilities] = useState<{ capture: boolean; upload: boolean } | null>(null);

  const conflicts = useMemo(() => queue.filter((item) => item.state === "conflict").length, [queue]);

  const loadQueue = useCallback(async () => {
    try {
      setQueue(await listFieldQueue(projectId));
      setError("");
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Локальная очередь недоступна.");
    }
  }, [projectId]);

  useEffect(() => {
    setOnline(navigator.onLine);
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    window.addEventListener(FIELD_QUEUE_CHANGED_EVENT, loadQueue);
    void loadQueue();
    void navigator.storage?.persisted?.().then(setStoragePersistent).catch(() => undefined);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener(FIELD_QUEUE_CHANGED_EVENT, loadQueue);
    };
  }, [loadQueue]);

  useEffect(() => {
    const cacheKey = `pgs-field-capabilities:${projectId}`;
    try {
      const cached = window.localStorage.getItem(cacheKey);
      if (cached) setCapabilities(JSON.parse(cached) as { capture: boolean; upload: boolean });
    } catch {
      setCapabilities(null);
    }
    if (!navigator.onLine || !currentUser) return;
    fetch(`/api/projects/${projectId}/field-sync`, { cache: "no-store" })
      .then(async (response) => {
        const body = (await response.json()) as { capabilities?: { capture: boolean; upload: boolean } };
        if (!response.ok || !body.capabilities) return;
        setCapabilities(body.capabilities);
        window.localStorage.setItem(cacheKey, JSON.stringify(body.capabilities));
      })
      .catch(() => undefined);
  }, [currentUser, online, projectId]);

  useEffect(() => {
    if (capabilities?.upload === false && mode === "photo_evidence") setMode("daily_report");
  }, [capabilities?.upload, mode]);

  useEffect(() => {
    if (currentUser?.name && report.author === "Прораб") setReport((value) => ({ ...value, author: currentUser.name! }));
  }, [currentUser?.name, report.author]);

  async function persistStorage() {
    setBusy("storage");
    try {
      const persistent = await navigator.storage?.persist?.();
      setStoragePersistent(Boolean(persistent));
      setNotice(persistent ? "Браузер подтвердил устойчивое хранение очереди." : "Браузер управляет очисткой хранилища автоматически.");
    } finally {
      setBusy("");
    }
  }

  async function queueReport(event: React.FormEvent) {
    event.preventDefault();
    setBusy("queue-report");
    setNotice("");
    setError("");
    try {
      await enqueueFieldOperation({ projectId, kind: "daily_report", payload: report });
      setReport(emptyReport(currentUser?.name || "Прораб"));
      setNotice("Рапорт сохранен на устройстве. Отправьте очередь, когда будете готовы.");
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Не удалось сохранить рапорт на устройстве.");
    } finally {
      setBusy("");
    }
  }

  async function queueIssue(event: React.FormEvent) {
    event.preventDefault();
    setBusy("queue-issue");
    setNotice("");
    setError("");
    try {
      await enqueueFieldOperation({
        projectId,
        kind: "field_issue",
        payload: { ...issue, dueAt: issue.dueAt ? new Date(`${issue.dueAt}T12:00:00`).toISOString() : null }
      });
      setIssue(emptyIssue);
      setNotice("Замечание сохранено на устройстве и попадет в Центр действий после синхронизации.");
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Не удалось сохранить замечание.");
    } finally {
      setBusy("");
    }
  }

  async function queuePhoto(event: React.FormEvent) {
    event.preventDefault();
    if (!photo) return;
    if (photo.size > 25 * 1024 * 1024) {
      setError("Файл больше 25 МБ. Уменьшите размер перед сохранением в offline-очередь.");
      return;
    }
    setBusy("queue-photo");
    setNotice("");
    setError("");
    try {
      await enqueueFieldOperation({
        projectId,
        kind: "photo_evidence",
        payload: { category: photoCategory, fileName: photo.name, mimeType: photo.type, file: photo }
      });
      setPhoto(null);
      setNotice("Файл сохранен на устройстве. После синхронизации он появится в Документах проекта.");
      const input = document.getElementById("field-evidence-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (queueError) {
      setError(queueError instanceof Error ? queueError.message : "Не удалось сохранить файл на устройстве.");
    } finally {
      setBusy("");
    }
  }

  async function runSync() {
    if (!online) {
      setError("Нет соединения. Записи останутся на устройстве.");
      return;
    }
    setBusy("sync");
    setNotice("");
    setError("");
    try {
      const result = await syncFieldQueue(projectId, {
        onSynced: (queueItem, serverItem) => {
          if (queueItem.kind === "daily_report") onReportSynced(serverItem as DailyReport);
          if (queueItem.kind === "photo_evidence") onDocumentSynced(serverItem as ProjectDocument);
        }
      });
      setNotice(result.synced ? `Синхронизировано записей: ${result.synced}. Осталось: ${result.remaining}.` : "Очередь проверена. Новых отправленных записей нет.");
      await loadQueue();
    } catch (syncError) {
      setError(syncError instanceof Error ? syncError.message : "Синхронизация не завершена.");
    } finally {
      setBusy("");
    }
  }

  async function retryItem(item: FieldQueueItem) {
    await retryFieldQueueItem(item);
    setNotice("Запись возвращена в очередь. Запустите синхронизацию.");
  }

  async function discardItem(item: FieldQueueItem) {
    if (!window.confirm(`Удалить локальную запись «${queueItemTitle(item)}»? На сервер она отправлена не будет.`)) return;
    await removeFieldQueueItem(item.id);
  }

  if (!currentUserLoaded) return <div className="field-mobile-empty">Проверяем доступ к полевому режиму...</div>;
  if (!currentUser || capabilities?.capture === false) {
    return <div className="field-mobile-empty"><AlertTriangle size={18} /> Полевые записи доступны руководителю проекта, администратору или владельцу.</div>;
  }

  return (
    <section className="field-mobile-workspace" aria-label="Field Mobile Offline v1">
      <header className="field-mobile-header">
        <div>
          <div className="eyebrow">Field Mobile / Offline v1</div>
          <h3>Площадка · {projectName}</h3>
          <p>Фиксируйте события без связи. Сервер получит их только после явного запуска синхронизации.</p>
        </div>
        <div className="field-mobile-health" aria-live="polite">
          <span className={online ? "good" : "warn"}>{online ? <Wifi size={15} /> : <WifiOff size={15} />}{online ? "Сеть доступна" : "Offline"}</span>
          <span className={queue.length ? "warn" : "good"}><HardDrive size={15} />{queue.length} в очереди</span>
          {conflicts > 0 && <span className="bad"><AlertTriangle size={15} />{conflicts} конфликтов</span>}
        </div>
      </header>

      <div className="field-mobile-toolbar">
        <div className="field-mobile-mode" role="tablist" aria-label="Тип полевой записи">
          <button className={mode === "daily_report" ? "active" : ""} onClick={() => setMode("daily_report")} role="tab" type="button"><ClipboardPlus size={16} /> Рапорт</button>
          <button className={mode === "field_issue" ? "active" : ""} onClick={() => setMode("field_issue")} role="tab" type="button"><AlertTriangle size={16} /> Замечание</button>
          <button className={mode === "photo_evidence" ? "active" : ""} disabled={capabilities?.upload === false} onClick={() => setMode("photo_evidence")} role="tab" title={capabilities?.upload === false ? "Нет права загрузки документов" : "Фото / документ"} type="button"><Camera size={16} /> Фото</button>
        </div>
        <div className="field-mobile-sync-actions">
          {storagePersistent === false && <button className="button secondary compact-button" disabled={busy === "storage"} onClick={persistStorage} type="button"><HardDrive size={15} /> Защитить очередь</button>}
          <button className="button primary" disabled={!queue.length || busy === "sync" || !online} onClick={runSync} type="button"><CloudUpload size={16} /> {busy === "sync" ? "Отправляю..." : `Синхронизировать (${queue.length})`}</button>
        </div>
      </div>

      {notice && <div className="field-mobile-notice"><CheckCircle2 size={17} />{notice}</div>}
      {error && <div className="form-error" role="alert">{error}</div>}

      <div className="field-mobile-layout">
        <div className="field-mobile-capture">
          {mode === "daily_report" && (
            <form onSubmit={queueReport}>
              <div className="section-title"><ClipboardPlus size={18} /><h4>Быстрый рапорт</h4></div>
              <div className="field-mobile-form-grid">
                <label className="field"><span>Дата</span><input required type="date" value={report.date} onChange={(event) => setReport({ ...report, date: event.target.value })} /></label>
                <label className="field"><span>Автор</span><input required minLength={2} value={report.author} onChange={(event) => setReport({ ...report, author: event.target.value })} /></label>
                <label className="field"><span>Погода</span><input value={report.weather} onChange={(event) => setReport({ ...report, weather: event.target.value })} placeholder="Ясно, +18 °C" /></label>
                <label className="field"><span>Рабочих</span><input min={0} type="number" value={report.workers} onChange={(event) => setReport({ ...report, workers: Number(event.target.value) })} /></label>
                <label className="field"><span>ИТР</span><input min={0} type="number" value={report.engineers} onChange={(event) => setReport({ ...report, engineers: Number(event.target.value) })} /></label>
                <label className="field"><span>Техника</span><input value={report.equipment} onChange={(event) => setReport({ ...report, equipment: event.target.value })} placeholder="Кран, экскаватор" /></label>
                <label className="field wide"><span>Выполненные работы</span><textarea required rows={3} value={report.completedWorks} onChange={(event) => setReport({ ...report, completedWorks: event.target.value })} placeholder="Что сделано и в каком объеме" /></label>
                <label className="field wide"><span>Проблемы / отклонения</span><textarea rows={3} value={report.issues} onChange={(event) => setReport({ ...report, issues: event.target.value })} placeholder="Что мешает работам или требует решения" /></label>
                <details className="field-mobile-details wide">
                  <summary>Материалы и простои</summary>
                  <div className="field-mobile-details-grid">
                    <label className="field"><span>Получено</span><textarea rows={2} value={report.materialsReceived} onChange={(event) => setReport({ ...report, materialsReceived: event.target.value })} /></label>
                    <label className="field"><span>Израсходовано</span><textarea rows={2} value={report.materialsConsumed} onChange={(event) => setReport({ ...report, materialsConsumed: event.target.value })} /></label>
                    <label className="field"><span>Простои</span><textarea rows={2} value={report.downtime} onChange={(event) => setReport({ ...report, downtime: event.target.value })} /></label>
                  </div>
                </details>
              </div>
              <button className="button primary" disabled={busy === "queue-report"} type="submit"><HardDrive size={16} /> Сохранить на устройстве</button>
            </form>
          )}

          {mode === "field_issue" && (
            <form onSubmit={queueIssue}>
              <div className="section-title"><AlertTriangle size={18} /><h4>Замечание площадки</h4></div>
              <div className="field-mobile-form-grid">
                <label className="field wide"><span>Кратко</span><input required minLength={3} maxLength={180} value={issue.title} onChange={(event) => setIssue({ ...issue, title: event.target.value })} placeholder="Например: отсутствует ограждение зоны" /></label>
                <label className="field wide"><span>Описание</span><textarea rows={4} maxLength={2000} value={issue.description} onChange={(event) => setIssue({ ...issue, description: event.target.value })} placeholder="Место, обстоятельства и требуемый результат" /></label>
                <label className="field"><span>Приоритет</span><select value={issue.priority} onChange={(event) => setIssue({ ...issue, priority: event.target.value as typeof issue.priority })}><option value="low">Низкий</option><option value="medium">Средний</option><option value="high">Высокий</option><option value="critical">Критический</option></select></label>
                <label className="field"><span>Ответственный</span><input value={issue.assignee} onChange={(event) => setIssue({ ...issue, assignee: event.target.value })} placeholder="ФИО или роль" /></label>
                <label className="field"><span>Срок</span><input type="date" value={issue.dueAt} onChange={(event) => setIssue({ ...issue, dueAt: event.target.value })} /></label>
              </div>
              <button className="button primary" disabled={busy === "queue-issue"} type="submit"><HardDrive size={16} /> Сохранить на устройстве</button>
            </form>
          )}

          {mode === "photo_evidence" && (
            <form onSubmit={queuePhoto}>
              <div className="section-title"><Camera size={18} /><h4>Фото / evidence</h4></div>
              <div className="field-mobile-form-grid">
                <label className="field wide"><span>Файл</span><input accept="image/*,application/pdf" capture="environment" id="field-evidence-file" required type="file" onChange={(event) => setPhoto(event.target.files?.[0] ?? null)} /></label>
                <label className="field"><span>Категория</span><select value={photoCategory} onChange={(event) => setPhotoCategory(event.target.value)}><option>фотофиксация</option><option>исполнительная документация</option><option>качество</option><option>охрана труда</option><option>прочее</option></select></label>
                <div className="field-mobile-file-note">{photo ? <><strong>{photo.name}</strong><span>{(photo.size / 1024 / 1024).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} МБ · файл останется только в очереди до синхронизации</span></> : <span>Сделайте снимок камерой или выберите файл до 25 МБ.</span>}</div>
              </div>
              <button className="button primary" disabled={!photo || busy === "queue-photo"} type="submit"><HardDrive size={16} /> Сохранить на устройстве</button>
            </form>
          )}
        </div>

        <aside className="field-mobile-queue" aria-label="Очередь синхронизации">
          <div className="field-mobile-queue-heading"><div><strong>Очередь</strong><span>FIFO · только явная отправка</span></div><span>{queue.length}</span></div>
          {queue.length ? queue.map((item) => (
            <article className={`field-mobile-queue-item state-${item.state}`} key={item.id}>
              <div className="field-mobile-queue-title"><span>{fieldSyncKindLabel(item.kind)}</span><small>{statusLabels[item.state]}</small></div>
              <strong>{queueItemTitle(item)}</strong>
              <p>{queueItemDetail(item)}</p>
              {item.lastError && <div className="field-mobile-queue-error">{item.lastError}</div>}
              <div className="field-mobile-queue-actions">
                {(item.state === "failed" || item.state === "conflict") && <button className="button secondary compact-button" onClick={() => retryItem(item)} type="button"><RotateCcw size={14} /> Повторить</button>}
                <button aria-label={`Удалить из очереди: ${queueItemTitle(item)}`} className="icon-button danger" onClick={() => discardItem(item)} title="Удалить из очереди" type="button"><Trash2 size={15} /></button>
              </div>
            </article>
          )) : <div className="field-mobile-queue-empty"><CheckCircle2 size={20} /><strong>Очередь пуста</strong><span>Новые записи сохраняются здесь до отправки.</span></div>}
          <div className="field-mobile-queue-foot"><RefreshCw size={14} /> Редактирование серверных записей offline не выполняется.</div>
        </aside>
      </div>
    </section>
  );
}
