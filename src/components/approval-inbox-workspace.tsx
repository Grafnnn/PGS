"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  Archive,
  ArchiveRestore,
  BellRing,
  Check,
  CheckCheck,
  ChevronRight,
  Clock3,
  Inbox,
  Mail,
  MailOpen,
  RefreshCw,
  RotateCcw,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  TriangleAlert,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  filterApprovalInbox,
  inboxDecisionRequest,
  type ApprovalInboxFilters,
  type ApprovalInboxItem,
  type ApprovalInboxSummary,
  type InboxDecisionAction,
  type InboxSourceType,
  type InboxStateAction
} from "@/lib/approval-inbox";

type InboxPayload = {
  items: ApprovalInboxItem[];
  summary: ApprovalInboxSummary;
  projects: Array<{ id: string; name: string; code: string | null }>;
};

type PendingDecision = {
  itemKey: string;
  action: InboxDecisionAction;
  comment: string;
};

const emptySummary: ApprovalInboxSummary = {
  active: 0,
  approvals: 0,
  overdue: 0,
  blocked: 0,
  unread: 0,
  snoozed: 0,
  archived: 0
};

const views: Array<{ value: NonNullable<ApprovalInboxFilters["view"]>; label: string }> = [
  { value: "active", label: "Активные" },
  { value: "approvals", label: "Решения" },
  { value: "overdue", label: "Просрочено" },
  { value: "blocked", label: "Блокеры" },
  { value: "snoozed", label: "Отложено" },
  { value: "archived", label: "Архив" }
];

const sourceOptions: Array<{ value: InboxSourceType | "all"; label: string }> = [
  { value: "all", label: "Все источники" },
  { value: "workflow_step", label: "Процессы" },
  { value: "project_action", label: "Действия" },
  { value: "change_order", label: "Изменения" },
  { value: "commitment", label: "Обязательства" },
  { value: "payment_application", label: "Заявки на оплату" },
  { value: "closeout_package", label: "Сдача объекта" },
  { value: "warranty_obligation", label: "Гарантии" },
  { value: "daily_report", label: "Рапорты площадки" }
];

const decisionLabels: Record<InboxDecisionAction, string> = {
  approve: "Согласовать",
  request_revision: "На доработку",
  reject: "Отклонить"
};

const statusLabels: Record<ApprovalInboxItem["status"], string> = {
  pending: "Ожидает",
  overdue: "Просрочено",
  blocked: "Заблокировано"
};

const priorityLabels: Record<ApprovalInboxItem["priority"], string> = {
  critical: "Критично",
  high: "Высокий",
  medium: "Средний",
  low: "Низкий"
};

function readableError(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error || fallback;
}

function formatDue(value: string | null) {
  if (!value) return "Без срока";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Без срока";
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function ApprovalInboxWorkspace() {
  const [payload, setPayload] = useState<InboxPayload>({ items: [], summary: emptySummary, projects: [] });
  const [view, setView] = useState<NonNullable<ApprovalInboxFilters["view"]>>("active");
  const [query, setQuery] = useState("");
  const [projectId, setProjectId] = useState("all");
  const [sourceType, setSourceType] = useState<InboxSourceType | "all">("all");
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingDecision, setPendingDecision] = useState<PendingDecision | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/inbox", { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить Inbox"));
      setPayload((await response.json()) as InboxPayload);
      window.dispatchEvent(new Event("pgs:inbox-updated"));
    } catch (loadError) {
      setError(readableError(loadError, "Не удалось загрузить Inbox"));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleItems = useMemo(
    () => filterApprovalInbox(payload.items, { view, query, projectId, sourceType }),
    [payload.items, projectId, query, sourceType, view]
  );

  const updateState = useCallback(
    async (item: ApprovalInboxItem, action: InboxStateAction, snoozedUntil?: string) => {
      setBusyKey(item.key);
      setError("");
      try {
        const response = await fetch("/api/inbox/state", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ itemKey: item.key, action, snoozedUntil })
        });
        if (!response.ok) throw new Error(await responseError(response, "Не удалось обновить Inbox"));
        setNotice(
          action === "archive"
            ? "Элемент перемещён в архив"
            : action === "snooze"
              ? "Элемент отложен"
              : action === "restore"
                ? "Элемент возвращён"
                : "Состояние обновлено"
        );
        await load();
      } catch (stateError) {
        setError(readableError(stateError, "Не удалось обновить Inbox"));
      } finally {
        setBusyKey("");
      }
    },
    [load]
  );

  const submitDecision = useCallback(
    async (item: ApprovalInboxItem, pending: PendingDecision) => {
      if ((pending.action === "request_revision" || pending.action === "reject") && !pending.comment.trim()) {
        setError("Для возврата или отклонения нужен комментарий");
        return;
      }
      setBusyKey(item.key);
      setError("");
      try {
        const request = inboxDecisionRequest(item, pending.action, pending.comment.trim());
        const response = await fetch(request.url, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(request.body)
        });
        if (!response.ok) throw new Error(await responseError(response, "Не удалось применить решение"));
        setPendingDecision(null);
        setNotice(`Решение «${decisionLabels[pending.action]}» принято`);
        await load();
      } catch (decisionError) {
        setError(readableError(decisionError, "Не удалось применить решение"));
      } finally {
        setBusyKey("");
      }
    },
    [load]
  );

  return (
    <main className="page inbox-page">
      <header className="page-header inbox-header">
        <div className="page-header-main">
          <span className="eyebrow">Notifications &amp; Approval Inbox</span>
          <h1>Мои решения</h1>
          <p>Согласования, просроченные действия и блокеры по доступным проектам.</p>
        </div>
        <button className="button secondary" disabled={loading} onClick={() => void load()} type="button">
          <RefreshCw className={loading ? "spin" : ""} size={16} />
          Обновить
        </button>
      </header>

      <section aria-label="Сводка Inbox" className="inbox-metrics">
        <button className={view === "active" ? "active" : ""} onClick={() => setView("active")} type="button">
          <Inbox size={17} />
          <span>Активные</span>
          <strong>{payload.summary.active}</strong>
        </button>
        <button className={view === "approvals" ? "active" : ""} onClick={() => setView("approvals")} type="button">
          <ShieldCheck size={17} />
          <span>Решения</span>
          <strong>{payload.summary.approvals}</strong>
        </button>
        <button className={view === "overdue" ? "active" : ""} onClick={() => setView("overdue")} type="button">
          <Clock3 size={17} />
          <span>Просрочено</span>
          <strong>{payload.summary.overdue}</strong>
        </button>
        <button className={view === "blocked" ? "active" : ""} onClick={() => setView("blocked")} type="button">
          <TriangleAlert size={17} />
          <span>Блокеры</span>
          <strong>{payload.summary.blocked}</strong>
        </button>
        <button className="unread" onClick={() => setView("active")} type="button">
          <Mail size={17} />
          <span>Непрочитано</span>
          <strong>{payload.summary.unread}</strong>
        </button>
      </section>

      <section className="inbox-toolbar" aria-label="Фильтры Inbox">
        <div className="inbox-view-tabs" role="tablist" aria-label="Представление Inbox">
          {views.map((option) => (
            <button
              aria-selected={view === option.value}
              className={view === option.value ? "active" : ""}
              key={option.value}
              onClick={() => setView(option.value)}
              role="tab"
              type="button"
            >
              {option.label}
              {option.value === "snoozed" && payload.summary.snoozed > 0 && <span>{payload.summary.snoozed}</span>}
              {option.value === "archived" && payload.summary.archived > 0 && <span>{payload.summary.archived}</span>}
            </button>
          ))}
        </div>
        <div className="inbox-filters">
          <label className="inbox-search">
            <Search size={16} />
            <input aria-label="Поиск в Inbox" onChange={(event) => setQuery(event.target.value)} placeholder="Проект, решение, источник" value={query} />
          </label>
          <label>
            <span className="sr-only">Проект</span>
            <select aria-label="Фильтр по проекту" onChange={(event) => setProjectId(event.target.value)} value={projectId}>
              <option value="all">Все проекты</option>
              {payload.projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.code ? `${project.code} · ` : ""}
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            <span className="sr-only">Источник</span>
            <select aria-label="Фильтр по источнику" onChange={(event) => setSourceType(event.target.value as InboxSourceType | "all")} value={sourceType}>
              {sourceOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      {error && (
        <div className="callout danger inbox-feedback" role="alert">
          <TriangleAlert size={17} />
          <span>{error}</span>
          <button aria-label="Закрыть сообщение об ошибке" className="icon-button" onClick={() => setError("")} type="button">
            <X size={15} />
          </button>
        </div>
      )}
      {notice && (
        <div className="callout success inbox-feedback" role="status">
          <CheckCheck size={17} />
          <span>{notice}</span>
          <button aria-label="Закрыть уведомление" className="icon-button" onClick={() => setNotice("")} type="button">
            <X size={15} />
          </button>
        </div>
      )}

      <section className="inbox-list" aria-busy={loading}>
        {loading && !payload.items.length ? (
          <div className="inbox-empty">
            <RefreshCw className="spin" size={24} />
            <strong>Собираем очередь решений</strong>
          </div>
        ) : visibleItems.length ? (
          visibleItems.map((item) => {
            const pending = pendingDecision?.itemKey === item.key ? pendingDecision : null;
            const busy = busyKey === item.key;
            return (
              <article className={`inbox-row status-${item.status} priority-${item.priority} ${item.unread ? "is-unread" : ""}`} key={item.key}>
                <div className="inbox-row-signal" aria-hidden="true" />
                <div className="inbox-row-main">
                  <div className="inbox-row-meta">
                    <span className={`inbox-state status-${item.status}`}>{statusLabels[item.status]}</span>
                    <span>{item.projectCode || "Проект"} · {item.projectName}</span>
                    <span>{item.sourceLabel}</span>
                    {item.unread && <span className="inbox-unread-dot">Новое</span>}
                  </div>
                  <h2>{item.title}</h2>
                  {item.description && <p>{item.description}</p>}
                  <div className="inbox-row-facts">
                    <span><Clock3 size={14} /> {formatDue(item.dueAt)}</span>
                    <span><SlidersHorizontal size={14} /> {priorityLabels[item.priority]}</span>
                    <span><BellRing size={14} /> {item.sourceModule}</span>
                  </div>
                </div>

                <div className="inbox-row-actions">
                  <Link className="button secondary compact-button" href={item.targetHref as Route} onClick={() => void updateState(item, "read")}>
                    Открыть
                    <ChevronRight size={15} />
                  </Link>
                  <div className="inbox-icon-actions">
                    <button
                      aria-label={item.unread ? "Отметить прочитанным" : "Отметить непрочитанным"}
                      className="icon-button"
                      disabled={busy}
                      onClick={() => void updateState(item, item.unread ? "read" : "unread")}
                      title={item.unread ? "Прочитано" : "Непрочитано"}
                      type="button"
                    >
                      {item.unread ? <MailOpen size={16} /> : <Mail size={16} />}
                    </button>
                    {!item.archived && (
                      <button
                        aria-label="Отложить на один день"
                        className="icon-button"
                        disabled={busy}
                        onClick={() => void updateState(item, "snooze", new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString())}
                        title="Отложить на день"
                        type="button"
                      >
                        <Clock3 size={16} />
                      </button>
                    )}
                    <button
                      aria-label={item.archived ? "Вернуть из архива" : "Переместить в архив"}
                      className="icon-button"
                      disabled={busy}
                      onClick={() => void updateState(item, item.archived ? "restore" : "archive")}
                      title={item.archived ? "Вернуть" : "В архив"}
                      type="button"
                    >
                      {item.archived ? <ArchiveRestore size={16} /> : <Archive size={16} />}
                    </button>
                  </div>
                  {item.decision && !item.archived && (
                    <div className="inbox-decision-actions">
                      {item.decision.actions.map((action) => (
                        <button
                          className={action === "approve" ? "button primary compact-button" : action === "reject" ? "button secondary danger compact-button" : "button secondary compact-button"}
                          disabled={busy}
                          key={action}
                          onClick={() => setPendingDecision({ itemKey: item.key, action, comment: "" })}
                          type="button"
                        >
                          {action === "approve" ? <Check size={15} /> : action === "request_revision" ? <RotateCcw size={15} /> : <X size={15} />}
                          {decisionLabels[action]}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                {pending && (
                  <div className="inbox-decision-panel">
                    <div>
                      <strong>{decisionLabels[pending.action]}</strong>
                      <span>{pending.action === "approve" ? "Подтвердите управленческое решение." : "Комментарий обязателен и попадёт в исходный процесс."}</span>
                    </div>
                    <textarea
                      aria-label="Комментарий к решению"
                      maxLength={3000}
                      onChange={(event) => setPendingDecision({ ...pending, comment: event.target.value })}
                      placeholder={pending.action === "approve" ? "Комментарий, если нужен" : "Причина и требуемые исправления"}
                      rows={2}
                      value={pending.comment}
                    />
                    <div>
                      <button className="button primary compact-button" disabled={busy} onClick={() => void submitDecision(item, pending)} type="button">
                        <Check size={15} />
                        Подтвердить
                      </button>
                      <button className="button secondary compact-button" disabled={busy} onClick={() => setPendingDecision(null)} type="button">
                        Отмена
                      </button>
                    </div>
                  </div>
                )}
              </article>
            );
          })
        ) : (
          <div className="inbox-empty">
            <CheckCheck size={26} />
            <strong>Очередь чиста</strong>
            <span>По выбранным фильтрам нет решений и блокеров.</span>
          </div>
        )}
      </section>
    </main>
  );
}
