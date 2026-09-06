"use client";

import {
  AlertTriangle,
  BookOpenCheck,
  Bot,
  CheckCircle2,
  Cloud,
  Database,
  ExternalLink,
  FileSearch,
  FolderSync,
  HardDrive,
  Link2,
  Loader2,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";

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
    primarySource: "google_drive" | "pgs";
    driveSourceDocuments: number;
    driveIndexedDocuments: number;
    driveChunks: number;
    pgsSourceDocuments: number;
    pgsIndexedDocuments: number;
    pgsChunks: number;
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
    configured: boolean;
    mode: string;
    authentication: string;
    shareWith: string | null;
    folderUrl: string;
    folderName: string;
    syncStatus: string;
    syncError: string | null;
    lastSyncedAt: string | null;
    needsSync: boolean;
    autoRefreshMinutes: number;
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
  knowledge?: {
    configured: boolean;
    checked: boolean;
    refreshed: boolean;
    warning: string | null;
  };
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

  async function requestIndex(source: "pgs" | "google_drive") {
    const response = await fetch(`/api/projects/${projectId}/technical-docs/index`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ source })
    });
    if (!response.ok) throw new Error(await errorMessage(response, "Не удалось обновить индекс."));
    return response.json() as Promise<{ status: KnowledgeStatus; result?: { pgs?: { indexed: number; unchanged: number } | null; drive?: { indexed: number; unchanged: number } | null } }>;
  }

  async function refreshIndex(source: "pgs" | "google_drive") {
    setBusy(source);
    setError("");
    setNotice("");
    try {
      const payload = await requestIndex(source);
      setStatus({ ...payload.status, canEdit: status?.canEdit ?? true });
      const result = source === "pgs" ? payload.result?.pgs : payload.result?.drive;
      const label = source === "google_drive" ? "Google Drive синхронизирован" : "Документы PGS обновлены";
      setNotice(`${label}: ${result?.indexed ?? 0} новых версий, ${result?.unchanged ?? 0} без изменений.`);
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
      if (!driveUrl) {
        setNotice("Папка Google Drive отключена.");
      } else if (!payload.status.drive.enabled) {
        setNotice("Папка сохранена. Для синхронизации администратору нужно включить read-only коннектор Google Drive.");
      } else {
        setBusy("google_drive");
        const indexed = await requestIndex("google_drive");
        setStatus({ ...indexed.status, canEdit: true });
        const result = indexed.result?.drive;
        setNotice(`Папка подключена и синхронизирована: ${result?.indexed ?? 0} новых версий, ${result?.unchanged ?? 0} без изменений.`);
      }
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
      if (payload.result.knowledge?.refreshed) void loadStatus();
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Не удалось получить ответ.");
    } finally {
      setBusy("");
    }
  }

  const hasIndex = Boolean(status?.summary.indexedDocuments);
  const indexNeedsRefresh = Boolean(status?.summary.staleDocuments);
  const driveConfigured = Boolean(status?.drive.configured);
  const driveIndexed = Boolean(status?.summary.driveIndexedDocuments);
  const { driveDocuments, pgsDocuments } = useMemo(() => {
    const drive: KnowledgeStatus["documents"] = [];
    const pgs: KnowledgeStatus["documents"] = [];
    for (const document of status?.documents ?? []) (document.sourceKind === "google_drive" ? drive : pgs).push(document);
    return { driveDocuments: drive, pgsDocuments: pgs };
  }, [status?.documents]);

  return (
    <section className="technical-docs-assistant" aria-label="Технический помощник по проектной документации">
      <div className="technical-docs-summary">
        <div>
          <div className="eyebrow">Google Drive knowledge</div>
          <h4><BookOpenCheck size={20} /> Технический помощник проекта</h4>
          <p>Находит ответ в папке проектной документации Google Drive и подтверждает его ссылкой на файл, страницу, лист или строки.</p>
        </div>
        <div className="technical-docs-actions">
          <span className={`badge ${status?.aiConfigured ? "green" : "yellow"}`}><Bot size={13} /> {status?.aiConfigured ? "AI готов" : "Только поиск"}</span>
          {status?.canEdit && driveConfigured ? (
            <button className="button secondary compact-button" disabled={Boolean(busy) || !status.drive.enabled} type="button" onClick={() => void refreshIndex("google_drive")}>
              {busy === "google_drive" ? <Loader2 className="spin" size={16} /> : <FolderSync size={16} />}
              Синхронизировать Drive
            </button>
          ) : null}
        </div>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}

      <section className={`technical-drive-primary ${driveConfigured && driveIndexed ? "is-ready" : "needs-setup"}`} aria-label="Основная база знаний Google Drive">
        <div className="technical-drive-heading">
          <div className="technical-drive-title">
            <span className="technical-drive-icon"><Cloud size={21} /></span>
            <span>
              <small>Основная база знаний</small>
              <strong>{driveConfigured ? status?.drive.folderName || "Папка проекта Google Drive" : "Подключите папку проекта"}</strong>
              <em>{driveConfigured ? `Автопроверка изменений перед вопросом — не чаще раза в ${status?.drive.autoRefreshMinutes ?? 15} минут.` : "PGS один раз извлечёт текст и дальше будет скачивать только новые или изменённые файлы."}</em>
            </span>
          </div>
          <div className="technical-drive-badges">
            <span className={`badge ${status?.drive.enabled ? "green" : "yellow"}`}>{status?.drive.enabled ? "Read-only доступ готов" : "Нужна настройка доступа"}</span>
            {driveConfigured ? <span className={`badge ${driveIndexed ? "blue" : "gray"}`}>{driveIndexed ? "База готова" : "Ожидает синхронизации"}</span> : null}
          </div>
        </div>

        <div className="technical-drive-stats">
          <span><strong>{status?.summary.driveIndexedDocuments ?? 0}</strong><small>файлов Drive в поиске</small></span>
          <span><strong>{status?.summary.driveChunks ?? 0}</strong><small>фрагментов Drive</small></span>
          <span><strong>{dateTime(status?.drive.lastSyncedAt ?? null)}</strong><small>последняя синхронизация</small></span>
        </div>

        {status?.canEdit ? (
          <form className="technical-drive-form" onSubmit={saveDriveFolder}>
            <div className="technical-drive-fields">
              <label className="field"><span>Название базы</span><input placeholder="Рабочая документация" value={driveName} onChange={(event) => setDriveName(event.target.value)} /></label>
              <label className="field field-wide"><span>Ссылка на общую папку Google Drive</span><input placeholder="https://drive.google.com/drive/folders/..." value={driveUrl} onChange={(event) => setDriveUrl(event.target.value)} /></label>
            </div>
            {!status?.drive.enabled ? <div className="technical-drive-note"><AlertTriangle size={16} /><span>Серверу нужен read-only service account или API key. После настройки достаточно вставить ссылку на папку проекта.</span></div> : null}
            {status?.drive.shareWith ? <div className="technical-drive-note is-ready"><ShieldCheck size={16} /><span>Откройте папку только для чтения сервисному аккаунту <code>{status.drive.shareWith}</code>.</span></div> : null}
            {status?.drive.enabled && status.drive.authentication === "api-key" ? <div className="technical-drive-note is-ready"><ShieldCheck size={16} /><span>Для API key папка должна быть доступна по ссылке только на чтение.</span></div> : null}
            {status?.drive.syncError ? <div className="technical-drive-note"><AlertTriangle size={16} /><span>{status.drive.syncError}</span></div> : null}
            <div className="form-actions technical-drive-actions">
              <button className="button primary compact-button" disabled={Boolean(busy) || !driveUrl.trim()} type="submit">
                {busy === "drive-save" || busy === "google_drive" ? <Loader2 className="spin" size={16} /> : <Link2 size={16} />}
                {driveConfigured ? "Сохранить и обновить" : "Подключить и синхронизировать"}
              </button>
              {driveConfigured ? <a className="button secondary compact-button" href={status?.drive.folderUrl} rel="noreferrer" target="_blank"><ExternalLink size={16} /> Открыть папку</a> : null}
            </div>
          </form>
        ) : null}
      </section>

      <div className="technical-docs-metrics" aria-label="Состояние базы знаний">
        <div><Cloud size={17} /><span><small>Google Drive</small><strong>{status?.summary.driveIndexedDocuments ?? 0} файлов · {status?.summary.driveChunks ?? 0} фрагм.</strong></span></div>
        <div><HardDrive size={17} /><span><small>Дополнительно из PGS</small><strong>{status?.summary.pgsIndexedDocuments ?? 0} файлов · {status?.summary.pgsChunks ?? 0} фрагм.</strong></span></div>
        <div className={indexNeedsRefresh ? "needs-attention" : ""}><RefreshCw size={17} /><span><small>Актуальность</small><strong>{indexNeedsRefresh ? `${status?.summary.staleDocuments} требуют обновления` : dateTime(status?.summary.lastIndexedAt ?? null)}</strong></span></div>
      </div>

      <div className="technical-docs-layout">
        <form className="technical-question-panel" onSubmit={ask}>
          <div className="technical-question-source"><Database size={15} /><span>{driveIndexed ? "Ищем прежде всего в Google Drive" : hasIndex ? "Пока используем документы PGS" : "Подключите и синхронизируйте папку"}</span></div>
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
            <span>{hasIndex ? status?.aiConfigured ? "Перед ответом Drive проверяется на изменения; в AI уходят только найденные короткие фрагменты." : "AI отключён: покажем релевантные места без внешнего запроса." : "Сначала подключите папку с проектной документацией."}</span>
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
              {answer.knowledge?.warning ? <div className="technical-knowledge-warning"><AlertTriangle size={16} /><span>{answer.knowledge.warning}</span></div> : null}
              <p className="technical-answer-text">{answer.answer}</p>
              {answer.citations.length ? (
                <div className="technical-citations">
                  <strong>Источники</strong>
                  {answer.citations.map((citation) => (
                    <a href={citation.sourceUrl ?? "#"} key={`${citation.sourceId}-${citation.locator}`} rel="noreferrer" target={citation.sourceUrl?.startsWith("http") ? "_blank" : undefined}>
                      <span><FileSearch size={16} /><b>{citation.title}</b><small>{citation.sourceKind === "google_drive" ? "Google Drive" : "PGS"} · {citation.locator}</small></span>
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
        <summary><FileSearch size={17} /><span><strong>Файлы базы знаний</strong><small>Google Drive — основной источник; PGS — дополнительный</small></span><span className="badge gray">{status?.documents.length ?? 0}</span></summary>
        <div className="technical-source-body">
          <div className="technical-source-section-heading"><Cloud size={16} /><strong>Google Drive</strong><span>{driveDocuments.length}</span></div>
          <div className="technical-indexed-files">
            {driveDocuments.length ? driveDocuments.map((document) => (
              <div key={document.id}>
                <FileSearch size={15} />
                <span>
                  <strong>{document.title}</strong>
                  <small>Google Drive · {document.chunkCount} фрагм.</small>
                  {document.error ? <small className="technical-source-error">{document.error}</small> : null}
                </span>
                <span className={`badge ${document.status === "ready" ? "green" : document.status === "unsupported" ? "gray" : "yellow"}`}>{document.status === "ready" ? "Готов" : document.status === "unsupported" ? "Без текста" : "Ошибка"}</span>
              </div>
            )) : <div className="empty-state">Папка Google Drive ещё не синхронизирована.</div>}
          </div>
          <div className="technical-source-section-heading"><HardDrive size={16} /><strong>Дополнительные документы PGS</strong><span>{pgsDocuments.length}</span></div>
          <div className="technical-indexed-files">
            {pgsDocuments.length ? pgsDocuments.map((document) => (
              <div key={document.id}>
                <FileSearch size={15} />
                <span>
                  <strong>{document.title}</strong>
                  <small>Документы PGS · {document.chunkCount} фрагм.</small>
                  {document.error ? <small className="technical-source-error">{document.error}</small> : null}
                </span>
                <span className={`badge ${document.status === "ready" ? "green" : document.status === "unsupported" ? "gray" : "yellow"}`}>{document.status === "ready" ? "Готов" : document.status === "unsupported" ? "Без текста" : "Ошибка"}</span>
              </div>
            )) : <div className="empty-state">Дополнительных документов PGS нет.</div>}
          </div>
          {status?.canEdit ? <div className="technical-secondary-source-action"><span>Файлы из вкладки «Документы» могут дополнять основную базу Google Drive.</span><button className="button secondary compact-button" disabled={Boolean(busy)} type="button" onClick={() => void refreshIndex("pgs")}>{busy === "pgs" ? <Loader2 className="spin" size={16} /> : <RefreshCw size={16} />} Обновить документы PGS</button></div> : null}
        </div>
      </details>
    </section>
  );
}
