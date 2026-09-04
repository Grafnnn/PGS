"use client";

import React, { useMemo, useState } from "react";
import { ArrowRight, Bot, Copy, Database, Play, ShieldCheck } from "lucide-react";
import { aiLifecycleStages, aiScenarioCatalog, type AiLifecycleStage, type AiScenarioConfig } from "@/lib/ai-command/catalog";
import type { AiInsightResponse, AiScenario } from "@/lib/ai-command/types";

function toneForStatus(value?: AiInsightResponse["overallStatus"]) {
  if (value === "critical") return "red";
  if (value === "attention") return "yellow";
  if (value === "on_track") return "green";
  return "gray";
}

function statusLabel(value?: AiInsightResponse["overallStatus"]) {
  if (value === "critical") return "Критично";
  if (value === "attention") return "Требует внимания";
  if (value === "on_track") return "По доступным данным в норме";
  return "Недостаточно данных";
}

function severityLabel(value: string) {
  if (value === "critical") return "Критично";
  if (value === "high") return "Высокий";
  if (value === "medium") return "Средний";
  return "Низкий";
}

export function AiLifecycleCopilot({
  prompt,
  loading,
  results,
  errors,
  onPromptChange,
  onRun,
  onNavigate
}: {
  prompt: string;
  loading: AiScenario | null;
  results: Partial<Record<AiScenario, AiInsightResponse>>;
  errors: Partial<Record<AiScenario, string>>;
  onPromptChange: (value: string) => void;
  onRun: (scenario: AiScenario) => void;
  onNavigate: (tab: string) => void;
}) {
  const [stage, setStage] = useState<AiLifecycleStage>("overview");
  const scenarios = useMemo(() => aiScenarioCatalog.filter((item) => item.stage === stage && item.scenario !== "summary"), [stage]);
  const summary = results.summary;

  return (
    <section className="ai-copilot" aria-label="PGS Copilot">
      <header className="ai-copilot-hero">
        <div className="ai-copilot-identity">
          <span className="ai-copilot-mark" aria-hidden="true"><Bot size={22} /></span>
          <div>
            <div className="eyebrow">PGS Copilot</div>
            <h3>Помощник по жизненному циклу проекта</h3>
            <p>Расчеты PGS остаются источником истины. Copilot объясняет отклонения, показывает источники и готовит решения без автоматического изменения проекта.</p>
          </div>
        </div>
        <div className="ai-copilot-safety">
          <ShieldCheck size={18} />
          <span>Только по команде</span>
          <small>Запись в проект требует отдельного подтверждения</small>
        </div>
      </header>

      <div className="ai-copilot-brief">
        <div>
          <small>Рекомендуемый первый запуск</small>
          <strong>Сводка проекта</strong>
          <span>{summary?.summary ?? "Проверит сроки, деньги, снабжение, ресурсы, качество и коммерческие обязательства."}</span>
        </div>
        <button className="button primary" disabled={loading !== null} type="button" onClick={() => onRun("summary")}>
          <Play size={16} />
          {loading === "summary" ? "Проверяю проект..." : summary ? "Обновить сводку" : "Проверить проект"}
        </button>
      </div>
      {errors.summary && <p className="error-text" role="alert">{errors.summary}</p>}
      {summary && <AiScenarioResult result={summary} compact onNavigate={onNavigate} />}

      <label className="ai-copilot-instructions">
        <span>Уточнение для анализа</span>
        <textarea
          maxLength={1200}
          placeholder="Например: сфокусируйся на ближайших 14 днях и рисках приемки"
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
        />
        <small>{prompt.length}/1200 · указание применяется к следующему запуску</small>
      </label>

      <nav className="ai-lifecycle-tabs" aria-label="Этапы проекта">
        {aiLifecycleStages.map((item) => (
          <button
            aria-current={stage === item.id ? "page" : undefined}
            className={stage === item.id ? "active" : ""}
            key={item.id}
            onClick={() => setStage(item.id)}
            type="button"
          >
            <span>{item.label}</span>
            <small>{item.description}</small>
          </button>
        ))}
      </nav>

      <div className="ai-copilot-scenario-list">
        {scenarios.map((scenario) => (
          <AiScenarioRow
            config={scenario}
            error={errors[scenario.scenario]}
            key={scenario.scenario}
            loading={loading === scenario.scenario}
            result={results[scenario.scenario]}
            onNavigate={onNavigate}
            onRun={() => onRun(scenario.scenario)}
          />
        ))}
      </div>
    </section>
  );
}

function AiScenarioRow({
  config,
  loading,
  result,
  error,
  onRun,
  onNavigate
}: {
  config: AiScenarioConfig;
  loading: boolean;
  result?: AiInsightResponse;
  error?: string;
  onRun: () => void;
  onNavigate: (tab: string) => void;
}) {
  return (
    <article className={`ai-copilot-scenario ${result ? "has-result" : ""}`}>
      <div className="ai-copilot-scenario-main">
        <div className="ai-copilot-scenario-copy">
          <div className="ai-copilot-scenario-title">
            <h4>{config.title}</h4>
            {result?.overallStatus && <span className={`badge ${toneForStatus(result.overallStatus)}`}>{statusLabel(result.overallStatus)}</span>}
          </div>
          <p>{config.description}</p>
          <span className="ai-copilot-outcome">Результат: {config.outcome}</span>
          <div className="ai-data-used" aria-label="Источники сценария">
            <Database size={14} aria-hidden="true" />
            {config.data.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <div className="ai-copilot-scenario-actions">
          <button className="button primary" disabled={loading} type="button" onClick={onRun}>
            <Bot size={16} />
            {loading ? "Анализ..." : result ? "Повторить" : "Запустить"}
          </button>
          <button className="button secondary" type="button" onClick={() => onNavigate(config.target)}>
            Открыть раздел <ArrowRight size={15} />
          </button>
        </div>
      </div>
      {error && <p className="error-text" role="alert">{error}</p>}
      {result && <AiScenarioResult result={result} onNavigate={onNavigate} />}
    </article>
  );
}

export function AiScenarioResult({
  result,
  compact = false,
  onNavigate
}: {
  result: AiInsightResponse;
  compact?: boolean;
  onNavigate?: (tab: string) => void;
}) {
  return (
    <div className={`ai-result ${compact ? "is-compact" : ""}`} aria-live="polite" aria-busy="false">
      <div className="ai-result-summary">
        <div className="ai-result-meta">
          <span className={`badge ${toneForStatus(result.overallStatus)}`}>{statusLabel(result.overallStatus)}</span>
          <span>{new Date(result.generatedAt).toLocaleString("ru-RU")} · {result.provider === "openai" ? "AI + проверки PGS" : result.provider === "degraded" ? "Проверки PGS, AI недоступен" : "Проверки PGS"}</span>
        </div>
        <p>{result.summary}</p>
        <div className="row-actions">
          <button className="button secondary compact-button" type="button" onClick={() => void navigator.clipboard?.writeText(formatAiResultForCopy(result))}>
            <Copy size={15} /> Копировать
          </button>
        </div>
      </div>

      {!!result.findings.length && (
        <details open={!compact}>
          <summary>Сигналы и доказательства · {result.findings.length}</summary>
          <div className="ai-result-list">
            {result.findings.map((finding, index) => (
              <div className="ai-result-item" key={`${finding.title}-${index}`}>
                <div className="ai-result-item-head">
                  <span className={`badge ${finding.severity === "critical" ? "red" : finding.severity === "high" || finding.severity === "medium" ? "yellow" : "blue"}`}>{severityLabel(finding.severity)}</span>
                  <strong>{finding.title}</strong>
                  {finding.source && <code>{finding.source}</code>}
                </div>
                <p>{finding.description}</p>
                {finding.recommendation && <span>{finding.recommendation}</span>}
              </div>
            ))}
          </div>
        </details>
      )}

      {!!result.recommendedActions.length && !compact && (
        <details open>
          <summary>Рекомендованные действия · {result.recommendedActions.length}</summary>
          <div className="ai-result-list">
            {result.recommendedActions.map((item, index) => (
              <div className="ai-result-item" key={`${item.title}-${index}`}>
                <div className="ai-result-item-head">
                  <span className={`badge ${item.priority === "high" ? "yellow" : "blue"}`}>{severityLabel(item.priority)}</span>
                  <strong>{item.title}</strong>
                </div>
                <p>{item.description}</p>
              </div>
            ))}
          </div>
        </details>
      )}

      {result.draftText && !compact && (
        <details open>
          <summary>Черновик текста</summary>
          <pre className="ai-draft-text">{result.draftText}</pre>
        </details>
      )}

      {!!result.recommendedAttachments?.length && !compact && (
        <details>
          <summary>Материалы для проверки · {result.recommendedAttachments.length}</summary>
          <ul className="action-list">
            {result.recommendedAttachments.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      )}

      {!!result.dataLimitations.length && (
        <details className="ai-limitations" open={result.overallStatus === "unknown"}>
          <summary>Ограничения данных · {result.dataLimitations.length}</summary>
          <ul className="action-list">
            {result.dataLimitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </details>
      )}

      {onNavigate && !compact && (
        <button className="project-section-link" type="button" onClick={() => onNavigate(aiScenarioCatalog.find((item) => item.scenario === result.scenario)?.target ?? "Действия")}>
          Перейти к данным <ArrowRight size={15} />
        </button>
      )}
    </div>
  );
}

export function formatAiResultForCopy(result: AiInsightResponse) {
  return [
    result.title,
    result.summary,
    "",
    "Сигналы:",
    ...result.findings.map((item) => `- [${item.severity}] ${item.title}: ${item.description}${item.source ? ` Источник: ${item.source}.` : ""}${item.recommendation ? ` Рекомендация: ${item.recommendation}` : ""}`),
    "",
    "Действия:",
    ...result.recommendedActions.map((item) => `- [${item.priority}] ${item.title}: ${item.description}`),
    result.draftText ? `\nЧерновик:\n${result.draftText}` : "",
    result.dataLimitations.length ? `\nОграничения:\n${result.dataLimitations.map((item) => `- ${item}`).join("\n")}` : ""
  ].join("\n");
}
