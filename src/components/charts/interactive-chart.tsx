"use client";

import { useMemo, useState } from "react";
import {
  Area,
  Bar,
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis
} from "recharts";
import { BarChart3, RotateCcw, Table2 } from "lucide-react";

export type InteractiveChartDatum = Record<string, string | number | null | undefined>;

export type InteractiveChartSeries = {
  key: string;
  label: string;
  color: string;
  type?: "line" | "area" | "bar";
  axis?: "left" | "right";
  format?: "number" | "money" | "percent";
  dashed?: boolean;
};

type Props = {
  title: string;
  description?: string;
  data: InteractiveChartDatum[];
  series: InteractiveChartSeries[];
  xKey: string;
  height?: number;
  summary?: string;
  rangeOptions?: Array<{ label: string; value: number }>;
  referenceValue?: number;
  referenceLabel?: string;
};

function valueLabel(value: unknown, format: InteractiveChartSeries["format"] = "number") {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return "—";
  if (format === "money") {
    const absolute = Math.abs(numeric);
    if (absolute >= 1_000_000_000) return `${(numeric / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
    if (absolute >= 1_000_000) return `${(numeric / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
    return `${Math.round(numeric).toLocaleString("ru-RU")} ₽`;
  }
  if (format === "percent") return `${numeric.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
  return numeric.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function axisLabel(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}B`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })}M`;
  if (absolute >= 1_000) return `${(value / 1_000).toLocaleString("ru-RU", { maximumFractionDigits: 0 })}K`;
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
}

export function InteractiveChart({
  title,
  description,
  data,
  series,
  xKey,
  height = 320,
  summary,
  rangeOptions = [
    { label: "Весь период", value: 0 },
    { label: "12 точек", value: 12 },
    { label: "6 точек", value: 6 }
  ],
  referenceValue,
  referenceLabel
}: Props) {
  const [mode, setMode] = useState<"chart" | "table">("chart");
  const [range, setRange] = useState(0);
  const [hidden, setHidden] = useState<string[]>([]);
  const visibleData = useMemo(() => range > 0 ? data.slice(-range) : data, [data, range]);
  const visibleSeries = series.filter((item) => !hidden.includes(item.key));

  function toggleSeries(key: string) {
    setHidden((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  }

  return (
    <section className="atlas-chart-frame" aria-label={title}>
      <header className="atlas-chart-header">
        <div>
          <small>Интерактивная аналитика</small>
          <h3>{title}</h3>
          {description ? <p>{description}</p> : null}
        </div>
        <div className="atlas-chart-actions">
          <label>
            <span className="sr-only">Период графика</span>
            <select aria-label="Период графика" onChange={(event) => setRange(Number(event.target.value))} value={range}>
              {rangeOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
          <div className="atlas-chart-mode" role="group" aria-label="Представление данных">
            <button aria-pressed={mode === "chart"} onClick={() => setMode("chart")} title="График" type="button"><BarChart3 size={16} /></button>
            <button aria-pressed={mode === "table"} onClick={() => setMode("table")} title="Таблица" type="button"><Table2 size={16} /></button>
          </div>
          {hidden.length ? <button className="atlas-chart-reset" onClick={() => setHidden([])} type="button"><RotateCcw size={14} />Сбросить</button> : null}
        </div>
      </header>

      <div className="atlas-chart-legend" aria-label="Серии графика">
        {series.map((item) => (
          <button aria-pressed={!hidden.includes(item.key)} key={item.key} onClick={() => toggleSeries(item.key)} type="button">
            <i style={{ background: item.color }} />
            <span>{item.label}</span>
          </button>
        ))}
      </div>

      {summary ? <p className="atlas-chart-summary">{summary}</p> : null}

      {!visibleData.length ? (
        <div className="atlas-chart-empty">Недостаточно данных для графика.</div>
      ) : mode === "table" ? (
        <div className="atlas-chart-table-wrap">
          <table>
            <thead><tr><th>{xKey}</th>{series.map((item) => <th key={item.key}>{item.label}</th>)}</tr></thead>
            <tbody>{visibleData.map((row, index) => (
              <tr key={`${String(row[xKey])}-${index}`}><th>{String(row[xKey] ?? "—")}</th>{series.map((item) => <td key={item.key}>{valueLabel(row[item.key], item.format)}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div className="atlas-chart-canvas" style={{ height }}>
          <ResponsiveContainer height="100%" width="100%">
            <ComposedChart accessibilityLayer data={visibleData} margin={{ top: 8, right: 12, bottom: 4, left: 2 }}>
              <CartesianGrid stroke="var(--atlas-grid)" strokeDasharray="2 4" vertical={false} />
              <XAxis axisLine={false} dataKey={xKey} minTickGap={24} tick={{ fill: "var(--muted)", fontSize: 11 }} tickLine={false} />
              <YAxis axisLine={false} tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={axisLabel} tickLine={false} width={52} yAxisId="left" />
              {series.some((item) => item.axis === "right") ? <YAxis axisLine={false} orientation="right" tick={{ fill: "var(--muted)", fontSize: 11 }} tickFormatter={axisLabel} tickLine={false} width={52} yAxisId="right" /> : null}
              <Tooltip content={({ active, payload, label }) => (
                <div className="atlas-chart-tooltip" hidden={!active}>
                  <strong>{String(label ?? "")}</strong>
                  {(payload ?? []).map((item) => {
                    const definition = series.find((candidate) => candidate.key === item.dataKey);
                    return <span key={String(item.dataKey)}><i style={{ background: definition?.color }} />{definition?.label ?? String(item.dataKey)}<b>{valueLabel(item.value, definition?.format)}</b></span>;
                  })}
                </div>
              )} cursor={{ stroke: "var(--atlas-focus)", strokeDasharray: "4 4" }} />
              {referenceValue !== undefined ? <ReferenceLine label={{ value: referenceLabel, fill: "var(--muted)", fontSize: 10 }} stroke="var(--atlas-danger)" strokeDasharray="5 4" y={referenceValue} yAxisId="left" /> : null}
              {visibleSeries.map((item) => {
                const common = { dataKey: item.key, name: item.label, stroke: item.color, yAxisId: item.axis ?? "left" };
                if (item.type === "bar") return <Bar {...common} fill={item.color} key={item.key} maxBarSize={34} radius={[3, 3, 0, 0]} />;
                if (item.type === "area") return <Area {...common} fill={item.color} fillOpacity={0.12} key={item.key} strokeWidth={2} type="monotone" />;
                return <Line {...common} dot={{ r: 2 }} key={item.key} strokeDasharray={item.dashed ? "6 5" : undefined} strokeWidth={2} type="monotone" />;
              })}
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}
