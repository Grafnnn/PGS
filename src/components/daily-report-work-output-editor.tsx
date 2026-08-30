"use client";

import { Gauge, Plus, Trash2 } from "lucide-react";
import React from "react";
import {
  dailyReportWorkOutputIssues,
  dailyReportWorkOutputNorm,
  dailyReportWorkOutputTotals
} from "@/lib/daily-report-work-outputs";
import type { DailyReportWorkOutput } from "@/lib/types";

type Props = {
  outputs: DailyReportWorkOutput[];
  onChange: (outputs: DailyReportWorkOutput[]) => void;
};

const emptyOutput = (): DailyReportWorkOutput => ({
  profession: "",
  workName: "",
  quantity: 0,
  unit: "",
  laborHours: 0
});

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function DailyReportWorkOutputEditor({ outputs, onChange }: Props) {
  const totals = dailyReportWorkOutputTotals(outputs);
  const incompleteRows = outputs.filter((output) => Object.keys(dailyReportWorkOutputIssues(output)).length > 0).length;

  function update(index: number, patch: Partial<DailyReportWorkOutput>) {
    onChange(outputs.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  return (
    <section className="daily-report-output-editor" aria-label="Фактическая выработка смены">
      <header>
        <div>
          <Gauge size={18} />
          <span>
            <strong>Фактическая выработка смены</strong>
            <small>После утверждения рапорта строки уточняют среднюю норму. Здесь ориентир рассчитан при 160 ч/мес.; ФОТ применит часы из политики проекта.</small>
          </span>
        </div>
        <button className="button secondary compact-button" disabled={outputs.length >= 40} type="button" onClick={() => onChange([...outputs, emptyOutput()])}>
          <Plus size={15} /> Добавить работу
        </button>
      </header>

      {outputs.length ? (
        <div className="daily-report-output-list">
          <p className="form-hint" role="status">
            {totals.rows} {totals.rows === 1 ? "строка" : "строк"} · {number(totals.laborHours)} чел.-ч
            {incompleteRows ? ` · незавершённых строк: ${incompleteRows}` : " · данные готовы к сохранению"}
          </p>
          {outputs.map((output, index) => {
            const actual = dailyReportWorkOutputNorm(output);
            const issues = dailyReportWorkOutputIssues(output);
            const messages = Object.values(issues);
            return (
              <div className="daily-report-output-row" key={index}>
                <label className="field">
                  <span>Профессия</span>
                  <input aria-invalid={Boolean(issues.profession)} required minLength={2} maxLength={160} value={output.profession} onChange={(event) => update(index, { profession: event.target.value })} placeholder="Каменщик" />
                </label>
                <label className="field output-work">
                  <span>Работа</span>
                  <input aria-invalid={Boolean(issues.workName)} required minLength={2} maxLength={240} value={output.workName} onChange={(event) => update(index, { workName: event.target.value })} placeholder="Кладка стен" />
                </label>
                <label className="field">
                  <span>Объём</span>
                  <input aria-invalid={Boolean(issues.quantity)} inputMode="decimal" min={0.001} max={1_000_000_000} required step="0.001" type="number" value={output.quantity || ""} onChange={(event) => update(index, { quantity: Number(event.target.value) })} />
                </label>
                <label className="field">
                  <span>Ед.</span>
                  <input aria-invalid={Boolean(issues.unit)} required maxLength={40} value={output.unit} onChange={(event) => update(index, { unit: event.target.value })} placeholder="м²" />
                </label>
                <label className="field">
                  <span>Трудозатраты, ч</span>
                  <input aria-invalid={Boolean(issues.laborHours)} inputMode="decimal" min={0.1} max={10_000_000} required step="0.1" type="number" value={output.laborHours || ""} onChange={(event) => update(index, { laborHours: Number(event.target.value) })} />
                </label>
                <div className="daily-report-output-norm">
                  <small>Факт. норма</small>
                  <strong>{actual ? `${number(actual.norm)} ${actual.unit}` : "заполните строку"}</strong>
                  {messages.length ? <small role="alert">{messages[0]}</small> : null}
                </div>
                <button aria-label={`Удалить строку выработки ${index + 1}`} className="icon-button danger" type="button" title="Удалить строку фактической выработки" onClick={() => onChange(outputs.filter((_, itemIndex) => itemIndex !== index))}>
                  <Trash2 size={16} />
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <p className="daily-report-output-empty">Необязательно. Добавьте только измеримый объём и реальные суммарные человеко-часы.</p>
      )}
    </section>
  );
}
