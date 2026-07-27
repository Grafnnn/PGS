"use client";

import { AlertTriangle, BarChart3, RefreshCw, TrendingDown, TrendingUp } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { CostCodeForecastLine } from "@/lib/cost-forecast-by-code";

type ForecastResponse = {
  summary: {
    status: string;
    budgetAtCompletion: number;
    approvedChanges: number;
    revisedBudget: number;
    earnedValue: number;
    actualCost: number;
    openCommitments: number;
    estimateToComplete: number;
    estimateAtCompletion: number;
    varianceAtCompletion: number;
    controlledLines: number;
    lineCount: number;
  };
  lines: CostCodeForecastLine[];
  limitations: string[];
  dataDate: string | null;
  error?: string;
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function toneBadge(tone: CostCodeForecastLine["tone"]) {
  return tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : "gray";
}

export function CostForecastByCodeWorkspace({ projectId }: { projectId: string }) {
  const [model, setModel] = useState<ForecastResponse | null>(null);
  const [filter, setFilter] = useState<"all" | "attention">("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-forecast`);
      const data = await response.json() as ForecastResponse;
      if (!response.ok) throw new Error(data.error || "Не удалось рассчитать прогноз.");
      setModel(data);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось рассчитать прогноз.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const rows = useMemo(() => (model?.lines ?? []).filter((item) => filter === "all" || item.tone === "warn" || item.tone === "bad"), [filter, model]);
  const summary = model?.summary;

  return (
    <section className="cost-code-forecast" aria-label="Прогноз затрат по кодам">
      <header className="cost-code-forecast-header">
        <div><div className="eyebrow">Cost Forecast by Cost Code</div><h3>Прогноз затрат по кодам</h3><p>BAC, обязательства, факт и EAC в одном срезе. Расчёт read-only и не создаёт финансовых операций.</p></div>
        <button className="icon-button" aria-label="Обновить прогноз" title="Обновить" type="button" onClick={() => void load()}><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
      </header>
      {summary && (
        <div className="cost-code-forecast-metrics">
          <Metric title="Revised budget" value={money(summary.revisedBudget)} detail={`изменения ${money(summary.approvedChanges)}`} />
          <Metric title="Actual cost" value={money(summary.actualCost)} detail={`EV ${money(summary.earnedValue)}`} />
          <Metric title="EAC" value={money(summary.estimateAtCompletion)} detail={`ETC ${money(summary.estimateToComplete)}`} />
          <Metric title="VAC" value={money(summary.varianceAtCompletion)} detail={`${summary.controlledLines}/${summary.lineCount} строк с EV`} tone={summary.varianceAtCompletion < 0 ? "bad" : "good"} />
        </div>
      )}
      <div className="cost-code-forecast-toolbar">
        <div className="segmented-control" role="group" aria-label="Фильтр прогноза">
          <button className={filter === "all" ? "active" : ""} type="button" onClick={() => setFilter("all")}>Все коды</button>
          <button className={filter === "attention" ? "active" : ""} type="button" onClick={() => setFilter("attention")}>Отклонения</button>
        </div>
        {model?.dataDate && <span className="muted">Срез на {new Date(model.dataDate).toLocaleDateString("ru-RU")}</span>}
      </div>
      {error && <div className="error-box">{error}</div>}
      {!error && loading && !model && <div className="empty-state compact">Собираем прогноз по кодам...</div>}
      {!loading && model && (
        <div className="table-wrap cost-code-forecast-table">
          <table>
            <thead><tr><th>Код затрат</th><th className="numeric">Budget</th><th className="numeric">Факт</th><th className="numeric">Open commitments</th><th className="numeric">EAC</th><th className="numeric">VAC</th><th>CPI</th></tr></thead>
            <tbody>
              {rows.map((item) => (
                <tr key={item.costCodeId}>
                  <td><strong>{item.code}</strong><span>{item.name}</span></td>
                  <td className="numeric">{money(item.revisedBudget)}</td>
                  <td className="numeric">{money(item.actualCost)}</td>
                  <td className="numeric">{money(item.openCommitments)}</td>
                  <td className="numeric">{money(item.estimateAtCompletion)}</td>
                  <td className={`numeric variance-${item.tone}`}>{item.varianceAtCompletion >= 0 ? <TrendingUp size={14} /> : <TrendingDown size={14} />}{money(item.varianceAtCompletion)}</td>
                  <td><span className={`badge ${toneBadge(item.tone)}`}>{item.costPerformanceIndex?.toFixed(2) ?? "нет EV"}</span></td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={7}>По выбранному фильтру строк нет.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
      {model?.limitations.length ? <div className="cost-code-forecast-limitations"><AlertTriangle size={17} /><div><strong>Качество прогноза</strong><ul>{model.limitations.map((item) => <li key={item}>{item}</li>)}</ul></div></div> : null}
    </section>
  );
}

function Metric({ title, value, detail, tone = "neutral" }: { title: string; value: string; detail: string; tone?: "good" | "bad" | "neutral" }) {
  return <article className={`cost-code-forecast-metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span><BarChart3 size={14} /> {detail}</span></article>;
}
