"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Activity, CalendarClock, CheckCheck, CircleDollarSign, Gauge, History, LockKeyhole, RefreshCw, Save, ShieldCheck } from "lucide-react";
import type {
  ProjectControlBaselinePreview,
  ProjectControlBaselineRecord,
  ProjectControlPeriodLinePreview,
  ProjectControlPeriodPreview,
  ProjectControlPeriodRecord,
  ProjectControlsResponse,
  ProjectControlTone
} from "@/lib/project-controls";

type Props = {
  projectId: string;
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  onNavigate: (tab: string) => void;
};

type ApiError = { error?: string | { message?: string } };

function todayValue() {
  return new Date().toISOString().slice(0, 10);
}

function money(value: number | null) {
  if (value === null) return "—";
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function indexValue(value: number | null) {
  return value === null ? "—" : value.toFixed(2);
}

function dateValue(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleDateString("ru-RU");
}

function badge(tone: ProjectControlTone) {
  return tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : tone === "info" ? "blue" : "gray";
}

function performanceTone(cpi: number | null, spi: number | null, coverage: number): ProjectControlTone {
  if (coverage < 80) return "warn";
  if ((cpi !== null && cpi < 0.85) || (spi !== null && spi < 0.85)) return "bad";
  if ((cpi !== null && cpi < 0.95) || (spi !== null && spi < 0.95)) return "warn";
  if (cpi === null && spi === null) return "info";
  return "good";
}

function errorMessage(payload: ApiError, fallback: string) {
  const message = typeof payload.error === "string" ? payload.error : payload.error?.message;
  return message && /[А-Яа-яЁё]/.test(message) ? message : fallback;
}

async function readJson<T>(response: Response, fallback: string): Promise<T> {
  const payload = await response.json().catch(() => ({})) as T & ApiError;
  if (!response.ok) throw new Error(errorMessage(payload, fallback));
  return payload;
}

export function ProjectControlsWorkspace({ projectId, role, onNavigate }: Props) {
  const [data, setData] = useState<ProjectControlsResponse | null>(null);
  const [selectedBaselineId, setSelectedBaselineId] = useState("");
  const [baselineName, setBaselineName] = useState("Управленческий baseline");
  const [baselineDate, setBaselineDate] = useState(todayValue);
  const [reportDate, setReportDate] = useState(todayValue);
  const [baselinePreview, setBaselinePreview] = useState<ProjectControlBaselinePreview | null>(null);
  const [periodPreview, setPeriodPreview] = useState<ProjectControlPeriodPreview | null>(null);
  const [loading, setLoading] = useState("load");
  const [error, setError] = useState("");
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const canApprove = role === "OWNER" || role === "ADMIN";

  const load = useCallback(async (signal?: AbortSignal) => {
    setLoading((current) => current || "load");
    try {
      const response = await fetch(`/api/projects/${projectId}/project-controls`, { cache: "no-store", signal });
      const next = await readJson<ProjectControlsResponse>(response, "Данные Project Controls временно недоступны");
      setData(next);
      setSelectedBaselineId((current) => current || next.activeBaselineId || next.baselines[0]?.id || "");
      setError("");
    } catch (loadError) {
      if (loadError instanceof DOMException && loadError.name === "AbortError") return;
      setError(loadError instanceof Error ? loadError.message : "Данные Project Controls временно недоступны");
    } finally {
      setLoading("");
    }
  }, [projectId]);

  useEffect(() => {
    const controller = new AbortController();
    void load(controller.signal);
    return () => controller.abort();
  }, [load]);

  const selectedBaseline = useMemo(
    () => data?.baselines.find((item) => item.id === selectedBaselineId) ?? null,
    [data?.baselines, selectedBaselineId]
  );
  const latestPeriod = data?.periods.find((item) => item.status !== "void") ?? null;
  const displayedPeriod = periodPreview;
  const displayedLines = displayedPeriod?.topVariances ?? latestPeriod?.lines.slice(0, 8) ?? [];
  const displayedTone = displayedPeriod?.summary.tone ?? performanceTone(
    latestPeriod?.costPerformanceIndex ?? null,
    latestPeriod?.schedulePerformanceIndex ?? null,
    latestPeriod?.actualCost ? latestPeriod.actualCostCoveragePercent : 100
  );

  async function baselineRequest(mode: "preview" | "create") {
    setLoading(`baseline-${mode}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/project-controls/baselines`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, name: baselineName, dataDate: baselineDate, activate: mode === "create" && canApprove, confirm: mode === "create" })
      });
      const payload = await readJson<{ preview?: ProjectControlBaselinePreview; baseline?: ProjectControlBaselineRecord }>(response, "Baseline не сформирован");
      if (payload.preview) setBaselinePreview(payload.preview);
      if (payload.baseline) {
        setBaselinePreview(null);
        setSelectedBaselineId(payload.baseline.id);
        await load();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Baseline не сформирован");
    } finally {
      setLoading("");
    }
  }

  async function activateBaseline(baseline: ProjectControlBaselineRecord) {
    setLoading(`activate-${baseline.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/project-controls/baselines/${baseline.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "activate", confirm: true })
      });
      await readJson(response, "Baseline не активирован");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Baseline не активирован");
    } finally {
      setLoading("");
    }
  }

  async function periodRequest(mode: "preview" | "publish") {
    if (!selectedBaselineId) return;
    setLoading(`period-${mode}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/project-controls/periods`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, baselineId: selectedBaselineId, dataDate: reportDate, confirm: mode === "publish" })
      });
      const payload = await readJson<{ preview?: ProjectControlPeriodPreview; period?: ProjectControlPeriodRecord }>(response, "Отчетный период не рассчитан");
      if (payload.preview) setPeriodPreview(payload.preview);
      if (payload.period) {
        setPeriodPreview(null);
        await load();
      }
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Отчетный период не рассчитан");
    } finally {
      setLoading("");
    }
  }

  async function lockPeriod(period: ProjectControlPeriodRecord) {
    setLoading(`lock-${period.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/project-controls/periods/${period.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "lock", confirm: true })
      });
      await readJson(response, "Период не заблокирован");
      await load();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Период не заблокирован");
    } finally {
      setLoading("");
    }
  }

  return <section className="quality-issues-workspace project-controls-workspace" aria-label="Project Controls and Earned Value">
    <div className={`quality-issues-header tone-${displayedTone}`}>
      <div>
        <div className="eyebrow">Project Controls &amp; Earned Value</div>
        <h3>Baseline, отчётные периоды и прогноз завершения</h3>
        <p>PV, EV и AC связывают утверждённый план, подтверждённое выполнение и оплаченный факт. Расчёт не меняет ВОР, график или платежи.</p>
        <div className="quality-issues-badges">
          <span className={`badge ${badge(displayedTone)}`}>{displayedPeriod?.summary.headline ?? (latestPeriod ? `Период ${latestPeriod.label}` : "Отчётный период ещё не опубликован")}</span>
          <span className="badge blue">baseline {selectedBaseline ? `#${selectedBaseline.sequence}` : "не выбран"}</span>
          <span className="badge gray">AC: оплаченные исходящие</span>
        </div>
      </div>
      <div className="quality-issues-actions">
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Бюджет / ВОР")}><CircleDollarSign size={16} />ВОР</button>
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("График")}><CalendarClock size={16} />График</button>
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Финансы")}><Activity size={16} />Финансы</button>
      </div>
    </div>

    {error && <div className="alert error" role="alert">{error}</div>}

    <div className="project-controls-setup">
      <section className="project-controls-step">
        <div className="section-title"><ShieldCheck size={18} /><h4>1. Зафиксировать baseline</h4></div>
        <div className="form-grid form-surface compact-form-grid">
          <label>Название<input value={baselineName} onChange={(event) => setBaselineName(event.target.value)} disabled={!canEdit} /></label>
          <label>Дата среза<input type="date" value={baselineDate} onChange={(event) => setBaselineDate(event.target.value)} disabled={!canEdit} /></label>
          <label>&nbsp;<button className="button secondary" type="button" disabled={!canEdit || Boolean(loading)} onClick={() => void baselineRequest("preview")}><RefreshCw size={16} />Проверить</button></label>
          <label>&nbsp;<button className="button primary" type="button" disabled={!canEdit || !baselinePreview?.summary.budgetAtCompletion || Boolean(loading)} onClick={() => void baselineRequest("create")}><Save size={16} />{canApprove ? "Зафиксировать и активировать" : "Сохранить draft"}</button></label>
        </div>
        {baselinePreview && <BaselinePreview model={baselinePreview} />}
      </section>

      <section className="project-controls-step">
        <div className="section-title"><CalendarClock size={18} /><h4>2. Выпустить отчётный период</h4></div>
        <div className="form-grid form-surface compact-form-grid">
          <label>Baseline<select value={selectedBaselineId} onChange={(event) => { setSelectedBaselineId(event.target.value); setPeriodPreview(null); }}>
            <option value="">Выберите baseline</option>
            {data?.baselines.map((baseline) => <option key={baseline.id} value={baseline.id}>#{baseline.sequence} · {baseline.name} · {baseline.status}</option>)}
          </select></label>
          <label>Data date<input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} disabled={!canEdit} /></label>
          <label>&nbsp;<button className="button secondary" type="button" disabled={!canEdit || !selectedBaselineId || Boolean(loading)} onClick={() => void periodRequest("preview")}><Gauge size={16} />Рассчитать</button></label>
          <label>&nbsp;<button className="button primary" type="button" disabled={!canEdit || !periodPreview || selectedBaseline?.status !== "active" || Boolean(loading)} onClick={() => void periodRequest("publish")}><CheckCheck size={16} />Опубликовать</button></label>
        </div>
        {selectedBaseline && <div className="project-controls-baseline-row">
          <span className={`badge ${selectedBaseline.status === "active" ? "green" : selectedBaseline.status === "draft" ? "yellow" : "gray"}`}>{selectedBaseline.status}</span>
          <span>BAC {money(selectedBaseline.budgetAtCompletion)}</span>
          <span>связано с графиком {selectedBaseline.scheduleCoveragePercent.toFixed(1)}%</span>
          {canApprove && selectedBaseline.status === "draft" && <button className="button secondary compact-button" type="button" disabled={Boolean(loading)} onClick={() => void activateBaseline(selectedBaseline)}><ShieldCheck size={15} />Активировать</button>}
        </div>}
      </section>
    </div>

    {(displayedPeriod || latestPeriod) ? <>
      <div className="quality-issues-grid metrics project-controls-metrics">
        <Metric title="BAC" value={money(displayedPeriod?.summary.budgetAtCompletion ?? latestPeriod?.budgetAtCompletion ?? 0)} detail="утверждённая себестоимость" tone="neutral" />
        <Metric title="PV" value={money(displayedPeriod?.summary.plannedValue ?? latestPeriod?.plannedValue ?? 0)} detail={`${(displayedPeriod?.summary.plannedProgressPercent ?? latestPeriod?.plannedProgressPercent ?? 0).toFixed(1)}% плана`} tone="info" />
        <Metric title="EV" value={money(displayedPeriod?.summary.earnedValue ?? latestPeriod?.earnedValue ?? 0)} detail={`${(displayedPeriod?.summary.earnedProgressPercent ?? latestPeriod?.earnedProgressPercent ?? 0).toFixed(1)}% освоено`} tone={displayedTone} />
        <Metric title="AC" value={money(displayedPeriod?.summary.actualCost ?? latestPeriod?.actualCost ?? 0)} detail={`${(displayedPeriod?.coverage.actualCostCoveragePercent ?? latestPeriod?.actualCostCoveragePercent ?? 0).toFixed(1)}% распределено`} tone={displayedTone} />
        <Metric title="CPI" value={indexValue(displayedPeriod?.summary.costPerformanceIndex ?? latestPeriod?.costPerformanceIndex ?? null)} detail={`CV ${money(displayedPeriod?.summary.costVariance ?? latestPeriod?.costVariance ?? 0)}`} tone={displayedTone} />
        <Metric title="SPI" value={indexValue(displayedPeriod?.summary.schedulePerformanceIndex ?? latestPeriod?.schedulePerformanceIndex ?? null)} detail={`SV ${money(displayedPeriod?.summary.scheduleVariance ?? latestPeriod?.scheduleVariance ?? 0)}`} tone={displayedTone} />
        <Metric title="EAC" value={money(displayedPeriod?.summary.estimateAtCompletion ?? latestPeriod?.estimateAtCompletion ?? null)} detail={`VAC ${money(displayedPeriod?.summary.varianceAtCompletion ?? latestPeriod?.varianceAtCompletion ?? null)}`} tone={displayedTone} />
        <Metric title="Forecast finish" value={dateValue(displayedPeriod?.summary.forecastFinish ?? latestPeriod?.forecastFinish ?? null)} detail={`${displayedPeriod?.summary.scheduleVarianceDays ?? latestPeriod?.scheduleVarianceDays ?? 0} дн. к baseline`} tone={displayedTone} />
      </div>

      <div className="project-controls-body">
        <article className="project-controls-section">
          <div className="section-title"><Activity size={18} /><h4>План / освоение / факт</h4></div>
          <ValueBars
            bac={displayedPeriod?.summary.budgetAtCompletion ?? latestPeriod?.budgetAtCompletion ?? 0}
            planned={displayedPeriod?.summary.plannedValue ?? latestPeriod?.plannedValue ?? 0}
            earned={displayedPeriod?.summary.earnedValue ?? latestPeriod?.earnedValue ?? 0}
            actual={displayedPeriod?.summary.actualCost ?? latestPeriod?.actualCost ?? 0}
          />
        </article>
        <article className="project-controls-section">
          <div className="section-title"><History size={18} /><h4>История периодов</h4></div>
          <PeriodHistory items={data?.periods ?? []} canLock={canApprove} loading={loading} onLock={lockPeriod} />
        </article>
      </div>

      <article className="project-controls-section">
        <div className="section-title"><Gauge size={18} /><h4>Ключевые отклонения по работам</h4></div>
        <VarianceTable items={displayedLines} />
      </article>

      <details className="project-controls-limitations">
        <summary>Покрытие и ограничения расчёта</summary>
        <ul>
          {(displayedPeriod?.limitations ?? latestPeriod?.limitations ?? selectedBaseline?.limitations ?? []).map((item) => <li key={item}>{item}</li>)}
        </ul>
      </details>
    </> : <div className="empty-state project-controls-empty"><Gauge size={26} /><strong>Нет опубликованного периода</strong><span>Сначала проверьте и зафиксируйте baseline, затем рассчитайте период на выбранную дату.</span></div>}
  </section>;
}

function BaselinePreview({ model }: { model: ProjectControlBaselinePreview }) {
  return <div className="project-controls-preview">
    <span className={`badge ${badge(model.summary.tone)}`}>{model.summary.status}</span>
    <span>BAC {money(model.summary.budgetAtCompletion)}</span>
    <span>покрытие графиком {model.summary.scheduleCoveragePercent.toFixed(1)}%</span>
    <span>{model.summary.unlinkedBudgetItemCount} строк ВОР без связи</span>
    <span>{model.summary.unlinkedScheduleItemCount} работ без бюджета</span>
  </div>;
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ProjectControlTone }) {
  return <div className={`quality-issues-card metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function ValueBars({ bac, planned, earned, actual }: { bac: number; planned: number; earned: number; actual: number }) {
  const maximum = Math.max(bac, planned, earned, actual, 1);
  const rows = [
    { label: "BAC", value: bac, className: "bac" },
    { label: "PV", value: planned, className: "planned" },
    { label: "EV", value: earned, className: "earned" },
    { label: "AC", value: actual, className: "actual" }
  ];
  return <div className="project-controls-bars">{rows.map((row) => <div className="project-controls-bar-row" key={row.label}>
    <span>{row.label}</span>
    <div className="project-controls-bar-track"><span className={row.className} style={{ width: `${Math.max((row.value / maximum) * 100, row.value ? 2 : 0)}%` }} /></div>
    <strong>{money(row.value)}</strong>
  </div>)}</div>;
}

function PeriodHistory({ items, canLock, loading, onLock }: { items: ProjectControlPeriodRecord[]; canLock: boolean; loading: string; onLock: (period: ProjectControlPeriodRecord) => Promise<void> }) {
  if (!items.length) return <p className="muted">Первый опубликованный период появится здесь.</p>;
  return <div className="table-wrap"><table><thead><tr><th>Период</th><th>CPI</th><th>SPI</th><th>Статус</th><th /></tr></thead><tbody>{items.slice(0, 6).map((period) => <tr key={period.id}>
    <td><strong>{dateValue(period.dataDate)}</strong><small>{period.label}</small></td>
    <td>{indexValue(period.costPerformanceIndex)}</td><td>{indexValue(period.schedulePerformanceIndex)}</td><td><span className={`badge ${period.status === "locked" ? "green" : period.status === "void" ? "gray" : "blue"}`}>{period.status}</span></td>
    <td>{canLock && period.status === "published" && <button className="icon-button" type="button" title="Заблокировать период" aria-label={`Заблокировать ${period.label}`} disabled={Boolean(loading)} onClick={() => void onLock(period)}><LockKeyhole size={16} /></button>}</td>
  </tr>)}</tbody></table></div>;
}

function VarianceTable({ items }: { items: Array<ProjectControlPeriodLinePreview | ProjectControlPeriodRecord["lines"][number]> }) {
  if (!items.length) return <p className="muted">Отклонения появятся после расчёта периода.</p>;
  return <div className="table-wrap"><table><thead><tr><th>Работа</th><th className="numeric">План</th><th className="numeric">Освоено</th><th className="numeric">SV</th><th className="numeric">CV</th><th>Статус</th></tr></thead><tbody>{items.map((item) => <tr key={`${item.baselineLineId}-${item.sequence}`}>
    <td><strong>{item.code}</strong><small>{item.name}</small></td>
    <td className="numeric">{item.plannedProgress.toFixed(1)}%</td><td className="numeric">{item.earnedProgress.toFixed(1)}%</td><td className="numeric">{money(item.scheduleVariance)}</td><td className="numeric">{item.actualCostAllocated ? money(item.costVariance) : "не распределён"}</td><td><span className={`badge ${item.status === "complete" || item.status === "on_plan" ? "green" : item.status === "limited" || item.status === "not_started" ? "gray" : "yellow"}`}>{item.status}</span></td>
  </tr>)}</tbody></table></div>;
}
