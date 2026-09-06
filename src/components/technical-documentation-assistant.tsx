"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  Database,
  ExternalLink,
  FileSearch,
  FolderSync,
  Loader2,
  RefreshCw,
  Search,
  Sparkles
} from "lucide-react";
import React, { FormEvent, useCallback, useEffect, useState } from "react";

type KnowledgeStatus = {
  canEdit: boolean;
  aiConfigured: boolean;
  summary: {
    sourceDocuments: number;
    indexedDocuments: number;
    chunks: number;
    staleDocuments: number;
    unavailableDocuments: number;
    lastIndexedAt: string | null;
  };
  documents: Array<{
    id: string;
    sourceKind: string;
    title: string;
    fileName: string | null;
    status: string;
    error: string | null;
    chunkCount: number;
    indexedAt: string;
    sourceUrl: string | null;
  }>;
  drive: {
    enabled: boolean;
    mode: string;
    authentication: string;
    folderUrl: string;
    folderName: string;
    syncStatus: string;
    syncError: string | null;
    lastSyncedAt: string | null;
  };
};

type TechnicalAnswer = {
  answer: string;
  confidence: "low" | "medium" | "high";
  notFound: boolean;
  followUps: string[];
  citations: Array<{
    sourceId: string;
    title: string;
    locator: string;
    excerpt: string;
    sourceUrl: string | null;
    sourceKind: string;
  }>;
  cached: boolean;
  provider: string;
};

const QUICK_QUESTIONS = [
  "Какие материалы и марки предусмотрены проектом?",
  "Какие требования к выполнению и приёмке работ указаны в документации?",
  "Какие проектные решения требуют уточнения перед производством работ?"
];

async function errorMessage(response: Response, fallback: string) {
  const payload = (await response.json().catch(() => null)) as { error?: string } | null;
  return payload?.error || fallback;
}

function dateTime(value: string | null) {
  return value ? new Date(value).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" }) : "ещё не обновлялась";
}

export function TechnicalDocumentationAssistant({ projectId }: { projectId: string }) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<TechnicalAnswer | null>(null);
  const [driveUrl, setDriveUrl] = useState("");
  const [driveName, setDriveName] = useState("");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadStatus = useCallback(async () => {
    setBusy((current) => current || "status");
    try {
      const response = await fetch(`/api/projects/${projectId}/technical-docs`, { cache: "no-store" });
      if (!response.ok) throw new Error(await errorMessage(response, "Не удалось загрузить состояние базы знаний."));
      const payload = await response.json() as KnowledgeStatus;
      setStatus(payload);
      setDriveUrl(payload.drive.folderUrl);
      setDriveName(payload.drive.folderName);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить базу знаний.");
    } finally {
      setBusy((current) => current === "status" ? "" : current);
    }
  }, [projectId]);

  useEffect(() => { void loadStatus(); }, [loadStatus]);

  async function refreshIndex(source: "pgs" | "google_drive") {
    setBusy(source);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/technical-docs/index`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ source })
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Не удалось обновить индекс."));
      const payload = await response.json() as { status: KnowledgeStatus; result?: { pgs?: { indexed: number; unchanged: number } | null; drive?: { indexed: number; unchanged: number } | null } };
      setStatus({ ...payload.status, canEdit: status?.canEdit ?? true });
      const result = source === "pgs" ? payload.result?.pgs : payload.result?.drive;
      setNotice(`База обновлена: ${result?.indexed ?? 0} новых версий, ${result?.unchanged ?? 0} без изменений.`);
    } catch (refreshError) {
      setError(refreshError instanceof Error ? refreshError.message : "Не удалось обновить индекс.");
    } finally {
      setBusy("");
    }
  }

  async function saveDriveFolder(event: FormEvent) {
    event.preventDefault();
    setBusy("drive-save");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/technical-docs`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ folderUrl: driveUrl, folderName: driveName })
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Не удалось сохранить папку."));
      const payload = await response.json() as { status: KnowledgeStatus };
      setStatus({ ...payload.status, canEdit: true });
      setNotice(driveUrl ? "Папка подключена. Запустите read-only синхронизацию." : "Папка Google Drive отключена.");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить папку.");
    } finally {
      setBusy("");
    }
  }

  async function ask(event: FormEvent) {
    event.preventDefault();
    if (question.trim().length < 3) return;
    setBusy("ask");
    setError("");
    setNotice("");
    setAnswer(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/technical-docs/ask`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question })
      });
      if (!response.ok) throw new Error(await errorMessage(response, "Не удалось получить ответ."));
      const payload = await response.json() as { result: TechnicalAnswer };
      setAnswer(payload.result);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Не удалось получить ответ.");
    } finally {
      setBusy("");
    }
  }

  const hasIndex = Boolean(status?.summary.indexedDocuments);
  const indexNeedsRefresh = Boolean(status?.summary.staleDocuments);

  return (
    <section className="technical-docs-assistant" aria-label="Технический помощник по проектной документации">
      <div className="technical-docs-summary">
        <div>
          <div className="eyebrow">Project knowledge</div>
          <h4><BookOpenCheck size={20} /> Поиск по документации</h4>
          <p>Ищет ответ только в документации этого проекта и показывает файл и точное место, на котором основан вывод.</p>
        </div>
        <div className="technical-docs-actions">
          <span className={`badge ${status?.aiConfigured ? "green" : "yellow"}`}><Bot size={13} /> {status?.aiConfigured ? "AI готов" : "Только поиск"}</span>
          {status?.canEdit ? (
            <button className="button secondary compact-button" disabled={Boolean(busy)} type="button" onClick={() => void refreshIndex("pgs")}>
              {busy === "pgs" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />}
              {hasIndex ? "Обновить базу" : "Подготовить базу"}
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}

      <div className="technical-docs-metrics" aria-label="Состояние базы знаний">
        <div><Database size={17} /><span><small>Документов</small><strong>{status?.summary.indexedDocuments ?? 0} / {status?.summary.sourceDocuments ?? 0}</strong></span></div>
        <div><FileSearch size={17} /><span><small>Фрагментов для поиска</small><strong>{status?.summary.chunks ?? 0}</strong></span></div>
        <div className={indexNeedsRefresh ? "needs-attention" : ""}><RefreshCw size={17} /><span><small>Актуальность</small><strong>{indexNeedsRefresh ? `${status?.summary.staleDocuments} требуют обновления` : dateTime(status?.summary.lastIndexedAt ?? null)}</strong></span></div>
      </div>

      <div className="technical-docs-layout">
        <form className="technical-question-panel" onSubmit={ask}>
          <label className="field">
            <span>Вопрос по проекту</span>
            <textarea
              maxLength={1_000}
              placeholder="Например: какая марка утеплителя предусмотрена для кровли и какой должна быть его толщина?"
              rows={4}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
            />
          </label>
          <div className="technical-question-suggestions">
            {QUICK_QUESTIONS.map((item) => <button key={item} type="button" onClick={() => setQuestion(item)}>{item}</button>)}
          </div>
          <div className="technical-question-submit">
            <span>{hasIndex ? status?.aiConfigured ? "В AI передаются только найденные короткие фрагменты." : "AI отключён: покажем релевантные места без внешнего запроса." : "Сначала подготовьте базу документов."}</span>
            <button className="button primary" disabled={busy === "ask" || !hasIndex || question.trim().length < 3} type="submit">
              {busy === "ask" ? <Loader2 className="spin" size={17} /> : status?.aiConfigured ? <Sparkles size={17} /> : <Search size={17} />}
              {busy === "ask" ? "Ищу ответ..." : status?.aiConfigured ? "Ответить по документам" : "Найти в документах"}
            </button>
          </div>
        </form>

        <div className={`technical-answer-panel ${answer ? "has-answer" : "is-empty"}`} aria-live="polite">
          {answer ? (
            <>
              <div className="technical-answer-heading">
                <span><Bot size={18} /> Ответ</span>
                <div><span className={`badge ${answer.confidence === "high" ? "green" : answer.confidence === "medium" ? "blue" : "yellow"}`}>{answer.confidence === "high" ? "Высокая опора" : answer.confidence === "medium" ? "Средняя опора" : "Нужно уточнение"}</span>{answer.cached ? <span className="badge gray">из кэша</span> : null}</div>
              </div>
              <p className="technical-answer-text">{answer.answer}</p>
              {answer.citations.length ? (
                <div className="technical-citations">
                  <strong>Источники</strong>
                  {answer.citations.map((citation) => (
                    <a href={citation.sourceUrl ?? "#"} key={`${citation.sourceId}-${citation.locator}`} rel="noreferrer" target={citation.sourceUrl?.startsWith("http") ? "_blank" : undefined}>
                      <span><FileSearch size={16} /><b>{citation.title}</b><small>{citation.locator}</small></span>
                      <ExternalLink size={15} />
                      <q>{citation.excerpt}</q>
                    </a>
                  ))}
                </div>
              ) : null}
              {answer.followUps.length ? <div className="technical-follow-ups"><strong>Что уточнить</strong>{answer.followUps.map((item) => <span key={item}>{item}</span>)}</div> : null}
            </>
          ) : (
            <div className="technical-answer-empty"><Search size={27} /><strong>Ответ появится здесь</strong><span>Если в документах нет подтверждения, помощник честно предложит уточнение или RFI.</span></div>
          )}
        </div>
      </div>

      <details className="technical-source-settings">
        <summary><FolderSync size={17} /><span><strong>Источники документации</strong><small>PGS и read-only Google Drive</small></span><span className="badge gray">{status?.documents.length ?? 0}</span></summary>
        <div className="technical-source-body">
          <div className="technical-indexed-files">
            {(status?.documents ?? []).length ? status?.documents.map((document) => (
              <div key={document.id}>
                <FileSearch size={15} />
                <span>
                  <strong>{document.title}</strong>
                  <small>{document.sourceKind === "google_drive" ? "Google Drive" : "Документы PGS"} · {document.chunkCount} фрагм.</small>
                  {document.error ? <small className="technical-source-error">{document.error}</small> : null}
                </span>
                <span className={`badge ${document.status === "ready" ? "green" : document.status === "unsupported" ? "gray" : "yellow"}`}>{document.status === "ready" ? "Готов" : document.status === "unsupported" ? "Без текста" : "Ошибка"}</span>
              </div>
            )) : <div className="empty-state">Индекс пока пуст. Документы загружаются во вкладке «Документы».</div>}
          </div>

          {status?.canEdit ? (
            <form className="technical-drive-form" onSubmit={saveDriveFolder}>
              <div className="payroll-section-heading">
                <div><FolderSync size={18} /><span><strong>Папка Google Drive</strong><small>Только чтение; файлы и папка не изменяются.</small></span></div>
                <span className={`badge ${status.drive.enabled ? "green" : "yellow"}`}>{status.drive.enabled ? "Коннектор готов" : "Нужна настройка сервера"}</span>
              </div>
              <div className="technical-drive-fields">
                <label className="field"><span>Название</span><input placeholder="Рабочая документация" value={driveName} onChange={(event) => setDriveName(event.target.value)} /></label>
                <label className="field field-wide"><span>Ссылка или ID общей папки</span><input placeholder="https://drive.google.com/drive/folders/..." value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} /></label>
              </div>
              {!status.drive.enabled ? <div className="technical-drive-note"><AlertTriangle size={16} />Google Drive заработает после включения read-only коннектора и передачи папки service account. Документы PGS уже доступны без этой настройки.</div> : null}
              <div className="form-actions">
                <button className="button secondary compact-button" disabled={Boolean(busy)} type="submit">Сохранить папку</button>
                <button className="button secondary compact-button" disabled={Boolean(busy) || !status.drive.enabled || !driveUrl} type="button" onClick={() => void refreshIndex("google_drive")}>
                  {busy === "google_drive" ? <Loader2 className="spin" size={16} /> : <FolderSync size={16} />} Синхронизировать
                </button>
                <span className="muted">Последняя синхронизация: {dateTime(status.drive.lastSyncedAt)}</span>
              </div>
            </form>
          ) : null}
        </div>
      </details>
    </section>
  );
}
