"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Check, CircleAlert, Clock3, Flag, History, ListPlus, RefreshCw, ShieldCheck, ThumbsUp } from "lucide-react";
import type { AiInsightResponse, AiScenario } from "@/lib/ai-command/types";

type AiRunJournalItem = {
  id: string;
  projectId: string;
  scenario: AiScenario;
  promptVersion: string;
  input: { instructions?: string; topic?: string } | null;
  output: AiInsightResponse | null;
  status: "running" | "succeeded" | "degraded" | "failed";
  provider: "deterministic" | "openai" | "degraded" | "none";
  durationMs: number | null;
  error: string | null;
  feedback: "helpful" | "needs_review" | null;
  feedbackComment: string | null;
  feedbackAt: string | null;
  completedAt: string | null;
  createdAt: string;
  actionLinks: Array<{ actionIndex: number; actionItemId: string }>;
};

type JournalSummary = {
  total: number;
  succeeded: number;
  degraded: number;
  failed: number;
  needsReview: number;
};

const scenarioLabels: Record<AiScenario, string> = {
  summary: "Сводка проекта",
  "budget-review": "Проверка ВОР",
  "schedule-review": "Проверка графика",
  "procurement-review": "Проверка снабжения",
  "finance-review": "Финансовая проверка",
  "contract-review": "Проверка договора",
  "risk-review": "Проверка рисков",
  "document-review": "Проверка документов",
  "daily-report-summary": "Сводка рапортов",
  "executive-report": "Отчет руководителю",
  "draft-text": "Подготовка текста"
};

function statusLabel(status: AiRunJournalItem["status"]) {
  if (status === "succeeded") return "Готово";
  if (status === "degraded") return "Резервный режим";
  if (status === "failed") return "Ошибка";
  return "Выполняется";
}

function statusTone(status: AiRunJournalItem["status"]) {
  if (status === "succeeded") return "good";
  if (status === "degraded") return "warn";
  if (status === "failed") return "bad";
  return "info";
}

function formatDuration(value: number | null) {
  if (value === null) return "время не записано";
  if (value < 1000) return `${value} мс`;
  return `${(value / 1000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} с`;
}

export function AiRunJournal({
  projectId,
  refreshToken,
  canCreateActions
}: {
  projectId: string;
  refreshToken: number;
  canCreateActions: boolean;
}) {
  const [items, setItems] = useState<AiRunJournalItem[]>([]);
  const [summary, setSummary] = useState<JournalSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [updating, setUpdating] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});

  const loadRuns = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/ai-runs?limit=20`);
      const data = (await response.json()) as { items?: AiRunJournalItem[]; summary?: JournalSummary; error?: string };
      if (response.status === 503) throw new Error("Журнал станет доступен после подключения базы данных.");
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить журнал AI.");
      setItems(data.items ?? []);
      setSummary(data.summary ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал AI.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadRuns();
  }, [loadRuns, refreshToken]);

  const providerSummary = useMemo(() => {
    const openAi = items.filter((item) => item.provider === "openai").length;
    const deterministic = items.filter((item) => item.provider === "deterministic" || item.provider === "degraded").length;
    return { openAi, deterministic };
  }, [items]);

  async function updateFeedback(runId: string, feedback: AiRunJournalItem["feedback"]) {
    setUpdating(`feedback-${runId}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/ai-runs/${runId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ feedback, comment: feedback === "needs_review" ? comments[runId] || null : null })
      });
      const data = (await response.json()) as { item?: AiRunJournalItem; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось сохранить оценку.");
      setItems((current) => current.map((item) => (item.id === runId ? data.item! : item)));
      setSummary((current) =>
        current
          ? {
              ...current,
              needsReview: items.filter((item) => (item.id === runId ? data.item?.feedback === "needs_review" : item.feedback === "needs_review")).length
            }
          : current
      );
    } catch (feedbackError) {
      setError(feedbackError instanceof Error ? feedbackError.message : "Не удалось сохранить оценку.");
    } finally {
      setUpdating("");
    }
  }

  async function createAction(runId: string, actionIndex: number) {
    setUpdating(`action-${runId}-${actionIndex}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/ai-runs/${runId}/actions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionIndex })
      });
      const data = (await response.json()) as { item?: { id: string }; actionIndex?: number; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось создать действие.");
      setItems((current) =>
        current.map((item) =>
          item.id === runId && !item.actionLinks.some((link) => link.actionIndex === actionIndex)
            ? { ...item, actionLinks: [...item.actionLinks, { actionIndex, actionItemId: data.item!.id }] }
            : item
        )
      );
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Не удалось создать действие.");
    } finally {
      setUpdating("");
    }
  }

  return (
    <section className="ai-run-journal" aria-label="Журнал AI-решений">
      <header className="ai-run-journal-header">
        <div>
          <div className="eyebrow">Контроль и воспроизводимость</div>
          <h3>
            <History size={18} />
            Журнал AI-решений
          </h3>
          <p className="muted">Каждый запуск сохраняет сценарий, версию инструкции, источник результата, ограничения и длительность.</p>
        </div>
        <button className="button secondary compact-button" type="button" disabled={loading} onClick={() => void loadRuns()} title="Обновить журнал">
          <RefreshCw size={16} />
          Обновить
        </button>
      </header>

      {summary && (
        <div className="ai-run-summary" aria-label="Сводка журнала AI">
          <span><strong>{summary.total}</strong> запусков</span>
          <span><strong>{summary.succeeded}</strong> успешно</span>
          <span><strong>{summary.degraded}</strong> резервный режим</span>
          <span><strong>{summary.needsReview}</strong> требуют проверки</span>
          <span><strong>{providerSummary.openAi}</strong> OpenAI · <strong>{providerSummary.deterministic}</strong> локально</span>
        </div>
      )}

      {loading && !items.length && <div className="ai-run-empty">Загружаю историю запусков...</div>}
      {!loading && !items.length && !error && (
        <div className="ai-run-empty">
          <ShieldCheck size={20} />
          <div>
            <strong>История пока пуста</strong>
            <span>Запустите любой AI-сценарий выше. Данные проекта не будут изменены автоматически.</span>
          </div>
        </div>
      )}
      {error && (
        <div className="ai-run-empty">
          <CircleAlert size={20} />
          <div>
            <strong>Журнал временно недоступен</strong>
            <span>{error}</span>
          </div>
        </div>
      )}

      <div className="ai-run-list">
        {items.map((item) => {
          const output = item.output;
          return (
            <details className={`ai-run-item status-${item.status}`} key={item.id}>
              <summary>
                <span className={`badge ${statusTone(item.status)}`}>{statusLabel(item.status)}</span>
                <span className="ai-run-title">
                  <strong>{scenarioLabels[item.scenario] ?? item.scenario}</strong>
                  <small>{new Date(item.createdAt).toLocaleString("ru-RU")} · {item.provider} · {formatDuration(item.durationMs)}</small>
                </span>
                <span className="ai-run-version">{item.promptVersion}</span>
              </summary>
              <div className="ai-run-detail">
                {output ? (
                  <>
                    <div className="ai-run-result-copy">
                      <strong>{output.title}</strong>
                      <p>{output.summary}</p>
                    </div>
                    <div className="ai-run-evidence">
                      <div>
                        <span>Использованы данные</span>
                        <p>{output.dataUsed.length ? output.dataUsed.join(" · ") : "Источник не указан"}</p>
                      </div>
                      <div>
                        <span>Ограничения</span>
                        <p>{output.dataLimitations.length ? output.dataLimitations.join(" · ") : "Явные ограничения не зафиксированы"}</p>
                      </div>
                    </div>
                    {!!output.recommendedActions.length && (
                      <div className="ai-run-actions">
                        <strong>Рекомендованные действия</strong>
                        {output.recommendedActions.map((action, index) => {
                          const created = item.actionLinks.some((link) => link.actionIndex === index);
                          return (
                            <div className="ai-run-action-row" key={`${action.title}-${index}`}>
                              <span>
                                <strong>{action.title}</strong>
                                <small>{action.description}</small>
                              </span>
                              {canCreateActions && (
                                <button
                                  className="button secondary compact-button"
                                  type="button"
                                  disabled={created || updating === `action-${item.id}-${index}`}
                                  onClick={() => void createAction(item.id, index)}
                                >
                                  {created ? <Check size={15} /> : <ListPlus size={15} />}
                                  {created ? "Создано" : "В действия"}
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </>
                ) : (
                  <p className="error-text">{item.error ?? "Результат запуска не сохранен."}</p>
                )}

                <div className="ai-run-feedback">
                  <div className="row-actions">
                    <button
                      className={`button compact-button ${item.feedback === "helpful" ? "primary" : "secondary"}`}
                      type="button"
                      disabled={updating === `feedback-${item.id}`}
                      onClick={() => void updateFeedback(item.id, item.feedback === "helpful" ? null : "helpful")}
                    >
                      <ThumbsUp size={15} />
                      Полезно
                    </button>
                    <button
                      className={`button compact-button ${item.feedback === "needs_review" ? "primary" : "secondary"}`}
                      type="button"
                      disabled={updating === `feedback-${item.id}`}
                      onClick={() => void updateFeedback(item.id, item.feedback === "needs_review" ? null : "needs_review")}
                    >
                      <Flag size={15} />
                      Нужна проверка
                    </button>
                  </div>
                  <label>
                    Комментарий к проверке
                    <input
                      value={comments[item.id] ?? item.feedbackComment ?? ""}
                      maxLength={500}
                      placeholder="Например: перепроверить срок поставки"
                      onChange={(event) => setComments((current) => ({ ...current, [item.id]: event.target.value }))}
                    />
                  </label>
                </div>
                <div className="ai-run-policy">
                  <Clock3 size={15} />
                  <span>AI не меняет проект сам. Создание действия выше всегда требует отдельного клика.</span>
                </div>
              </div>
            </details>
          );
        })}
      </div>
    </section>
  );
}
