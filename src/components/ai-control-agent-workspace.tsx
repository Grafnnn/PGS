"use client";

import { Bot, CheckSquare2, RefreshCw, ShieldCheck, Sparkles } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { AiControlPreview } from "@/lib/ai-control-agent";

type AiNarrative = {
  provider: "openai" | "deterministic";
  summary: string;
  findings: Array<{ severity: string; title: string; description: string }>;
  limitations: string[];
};

function priorityLabel(priority: string) {
  if (priority === "critical") return "Критический";
  if (priority === "high") return "Высокий";
  if (priority === "medium") return "Средний";
  return "Низкий";
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для AI Control Agent.";
  return body.error ?? fallback;
}

export function AiControlAgentWorkspace({
  projectId,
  canEdit,
  onNavigate
}: {
  projectId: string;
  canEdit: boolean;
  onNavigate: (tab: string) => void;
}) {
  const [preview, setPreview] = useState<AiControlPreview | null>(null);
  const [narrative, setNarrative] = useState<AiNarrative | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState("");
  const selectedCount = selected.length;
  const selectedCritical = useMemo(() => preview?.proposals.filter((item) => selected.includes(item.id) && item.priority === "critical").length ?? 0, [preview, selected]);

  async function buildPreview(includeAi: boolean) {
    setBusy(includeAi ? "preview-ai" : "preview");
    setError("");
    setResult("");
    setConfirmed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/control-agent/preview`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ includeAi })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось собрать план управления."));
      const body = (await response.json()) as { preview: AiControlPreview; aiNarrative?: AiNarrative | null };
      setPreview(body.preview);
      setNarrative(body.aiNarrative ?? null);
      setSelected(body.preview.proposals.map((item) => item.id));
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Не удалось собрать план управления.");
    } finally {
      setBusy("");
    }
  }

  async function confirmActions() {
    if (!preview || !confirmed || !selected.length) return;
    setBusy("confirm");
    setError("");
    setResult("");
    try {
      const response = await fetch(`/api/projects/${projectId}/control-agent/confirm`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          previewId: preview.previewId,
          generatedAt: preview.generatedAt,
          selectedProposalIds: selected,
          confirmed: true
        })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось создать подтверждённые действия."));
      const body = (await response.json()) as { created?: unknown[]; skippedProposalIds?: string[] };
      const message = `Создано действий: ${body.created?.length ?? 0}${body.skippedProposalIds?.length ? ` · пропущено дублей: ${body.skippedProposalIds.length}` : ""}.`;
      setConfirmed(false);
      window.dispatchEvent(new CustomEvent("pgs:actions-changed"));
      await buildPreview(false);
      setResult(message);
    } catch (confirmError) {
      setError(confirmError instanceof Error ? confirmError.message : "Не удалось создать подтверждённые действия.");
    } finally {
      setBusy("");
    }
  }

  function toggleProposal(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    setConfirmed(false);
  }

  return (
    <section className="ai-control-agent" aria-label="AI Control Agent v2">
      <header className="ai-control-agent-header">
        <div>
          <div className="eyebrow">AI-агент проектного контроля v2</div>
          <h3>План управленческих действий</h3>
          <p>Собирает отклонения проекта в проверяемый preview. Запись выполняется только после выбора и отдельного подтверждения.</p>
        </div>
        <div className="ai-control-agent-buttons">
          <button className="button secondary" disabled={Boolean(busy)} type="button" onClick={() => void buildPreview(false)}>
            <RefreshCw className={busy === "preview" ? "spin" : ""} size={16} /> {preview ? "Пересобрать" : "Собрать план"}
          </button>
          <button className="button primary" disabled={Boolean(busy)} type="button" onClick={() => void buildPreview(true)}>
            <Sparkles size={16} /> {busy === "preview-ai" ? "Анализирую..." : "Добавить AI-пояснение"}
          </button>
        </div>
      </header>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {result ? <div className="success-box" role="status">{result}</div> : null}

      {!preview ? (
        <div className="ai-control-agent-empty">
          <Bot size={24} />
          <strong>План ещё не сформирован</strong>
          <span>До команды данные проекта не анализируются и действия не создаются.</span>
        </div>
      ) : (
        <>
          <div className="ai-control-agent-summary">
            <div><small>Статус</small><strong>{preview.status === "critical" ? "Критично" : preview.status === "attention" ? "Требует внимания" : preview.status === "controlled" ? "Под контролем" : "Недостаточно данных"}</strong></div>
            <div><small>Предложения</small><strong>{preview.proposals.length}</strong></div>
            <div><small>Уже в работе</small><strong>{preview.skippedExisting}</strong></div>
            <div><small>Выбрано</small><strong>{selectedCount}</strong></div>
          </div>

          {narrative ? (
            <article className="ai-control-narrative">
              <div><Sparkles size={17} /><strong>Пояснение · {narrative.provider === "openai" ? "OpenAI" : "расчётный режим"}</strong></div>
              <p>{narrative.summary}</p>
              {narrative.findings.slice(0, 3).map((item) => <span key={`${item.severity}:${item.title}`}><b>{item.title}</b> · {item.description}</span>)}
            </article>
          ) : null}

          <div className="ai-control-proposal-list">
            {preview.proposals.length ? preview.proposals.map((item) => (
              <article className={`ai-control-proposal priority-${item.priority} ${selected.includes(item.id) ? "selected" : ""}`} key={item.id}>
                <label>
                  <input checked={selected.includes(item.id)} type="checkbox" onChange={() => toggleProposal(item.id)} />
                  <span className="ai-control-proposal-main">
                    <span><b>{item.title}</b><em className={`priority-${item.priority}`}>{priorityLabel(item.priority)}</em></span>
                    <small>{item.description}</small>
                    <small className="evidence">{item.evidence}</small>
                  </span>
                </label>
                <button className="button secondary compact-button" type="button" onClick={(event) => { event.preventDefault(); onNavigate(item.targetTab); }}>Открыть {item.targetTab}</button>
              </article>
            )) : <div className="empty-state">Новых действий по текущим сигналам не требуется.</div>}
          </div>

          {preview.proposals.length ? (
            <div className="ai-control-confirm">
              <div className="ai-control-policy">
                <ShieldCheck size={18} />
                <span><strong>Без скрытых изменений</strong><small>Будут созданы только задачи в «Центре действий». Бюджет, график, закупки, документы и платежи не меняются.</small></span>
              </div>
              {canEdit ? (
                <>
                  <label><input checked={confirmed} type="checkbox" onChange={(event) => setConfirmed(event.target.checked)} /> Подтверждаю создание {selectedCount} выбранных действий{selectedCritical ? `, включая критических: ${selectedCritical}` : ""}</label>
                  <button className="button primary" disabled={!confirmed || !selectedCount || busy === "confirm"} type="button" onClick={() => void confirmActions()}>
                    <CheckSquare2 size={17} /> {busy === "confirm" ? "Создаю..." : "Создать выбранные действия"}
                  </button>
                </>
              ) : <span className="muted">Для создания действий нужны права редактирования проекта.</span>}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
