"use client";

import { Calculator, Clock3, Gauge, Plus, RefreshCw, Trash2, Users } from "lucide-react";
import React from "react";
import {
  allocateDailyReportLabor,
  dailyReportLaborCapacity,
  dailyReportLaborHours,
  dailyReportWorkOutputIssues,
  dailyReportWorkOutputAllocation,
  dailyReportWorkOutputNorm,
  dailyReportWorkOutputTotals
} from "@/lib/daily-report-work-outputs";
import type { DailyReportWorkOutput } from "@/lib/types";

type Props = {
  outputs: DailyReportWorkOutput[];
  onChange: (outputs: DailyReportWorkOutput[]) => void;
  crewHeadcount?: number;
  shiftHours?: number;
  onShiftHoursChange?: (hours: number) => void;
};

const emptyOutput = (): DailyReportWorkOutput => ({
  profession: "",
  workName: "",
  quantity: 0,
  unit: "",
  laborHours: 0,
  laborAllocationMode: "auto"
});

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function DailyReportWorkOutputEditor({ outputs, onChange, crewHeadcount = 0, shiftHours = 8, onShiftHoursChange }: Props) {
  const totals = dailyReportWorkOutputTotals(outputs);
  const incompleteRows = outputs.filter((output) => Object.keys(dailyReportWorkOutputIssues(output)).length > 0).length;
  const capacity = dailyReportLaborCapacity(crewHeadcount, shiftHours);
  const remaining = Math.round((capacity - totals.laborHours) * 1000) / 1000;

  function update(index: number, patch: Partial<DailyReportWorkOutput>) {
    onChange(outputs.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateLabor(index: number, patch: { workerCount?: number; hoursPerWorker?: number }) {
    const output = outputs[index];
    const current = dailyReportWorkOutputAllocation(output, shiftHours);
    const workerCount = patch.workerCount ?? current.workerCount;
    const hoursPerWorker = patch.hoursPerWorker ?? current.hoursPerWorker;
    const next = outputs.map((item, itemIndex): DailyReportWorkOutput => itemIndex === index ? {
      ...item,
      workerCount: workerCount > 0 ? workerCount : undefined,
      hoursPerWorker: hoursPerWorker > 0 ? hoursPerWorker : undefined,
      laborHours: dailyReportLaborHours(workerCount, hoursPerWorker),
      laborAllocationMode: "manual"
    } : item);
    onChange(allocateDailyReportLabor(next, crewHeadcount, shiftHours));
  }

  function autoAllocate() {
    onChange(allocateDailyReportLabor(outputs, crewHeadcount, shiftHours, true));
  }

  return (
    <section className="daily-report-output-editor" aria-label="Фактическая выработка смены">
      <header>
        <div>
          <Gauge size={18} />
          <span>
            <strong>Фактическая выработка смены</strong>
            <small>Трудозатраты считаются автоматически: люди × фактические часы. После утверждения рапорта строки уточняют норму выработки и ФОТ проекта.</small>
          </span>
        </div>
        <button className="button secondary compact-button" disabled={outputs.length >= 40} type="button" onClick={() => onChange(allocateDailyReportLabor([...outputs, emptyOutput()], crewHeadcount, shiftHours))}>
          <Plus size={15} /> Добавить работу
        </button>
      </header>

      <div className={`daily-labor-capacity${remaining < -0.001 ? " is-over" : ""}`}>
        <div><Users size={16} /><span>Состав смены<strong>{crewHeadcount ? `${number(crewHeadcount)} чел.` : "не выбран"}</strong></span></div>
        <label><Clock3 size={16} /><span>Продолжительность смены<input aria-label="Продолжительность смены, часов" inputMode="decimal" min={0.5} max={24} step={0.5} type="number" value={shiftHours || ""} onChange={(event) => onShiftHoursChange?.(Number(event.target.value))} /></span></label>
        <div><Calculator size={16} /><span>Фонд смены<strong>{number(capacity)} чел.-ч</strong></span></div>
        <div><Gauge size={16} /><span>{remaining < -0.001 ? "Превышение" : "Остаток"}<strong>{number(Math.abs(remaining))} чел.-ч</strong></span></div>
        <button className="button secondary compact-button" disabled={!outputs.length || crewHeadcount <= 0 || shiftHours <= 0} type="button" onClick={autoAllocate}><RefreshCw size={14} /> Распределить</button>
      </div>
      <p className="form-hint">По умолчанию весь выбранный состав делит время смены между работами. Если бригада работала параллельными группами, скорректируйте людей и часы в строках вручную.</p>

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
            const allocation = dailyReportWorkOutputAllocation(output, shiftHours);
            return (
              <div className="daily-report-output-row" key={index}>
                <label className="field output-profession">
                  <span>Профессия</span>
                  <input aria-invalid={Boolean(issues.profession)} required minLength={2} maxLength={160} value={output.profession} onChange={(event) => update(index, { profession: event.target.value })} placeholder="Каменщик" />
                </label>
                <label className="field output-work">
                  <span>{output.scheduleItemId ? "Работа из графика" : "Работа"}</span>
                  <input aria-invalid={Boolean(issues.workName)} required minLength={2} maxLength={240} value={output.workName} onChange={(event) => update(index, { workName: event.target.value })} placeholder="Кладка стен" />
                </label>
                <label className="field output-quantity">
                  <span>Объём</span>
                  <input aria-invalid={Boolean(issues.quantity)} inputMode="decimal" min={0.001} max={1_000_000_000} required step="0.001" type="number" value={output.quantity || ""} onChange={(event) => update(index, { quantity: Number(event.target.value) })} />
                </label>
                <label className="field output-unit">
                  <span>Ед.</span>
                  <input aria-invalid={Boolean(issues.unit)} required maxLength={40} value={output.unit} onChange={(event) => update(index, { unit: event.target.value })} placeholder="м²" />
                </label>
                <button aria-label={`Удалить строку выработки ${index + 1}`} className="icon-button danger" type="button" title="Удалить строку фактической выработки" onClick={() => onChange(allocateDailyReportLabor(outputs.filter((_, itemIndex) => itemIndex !== index), crewHeadcount, shiftHours))}>
                  <Trash2 size={16} />
                </button>
                <div className="daily-report-output-labor">
                  <label className="field">
                    <span>Людей</span>
                    <input aria-invalid={Boolean(issues.workerCount)} inputMode="numeric" min={1} max={Math.max(1, crewHeadcount)} required step={1} type="number" value={allocation.workerCount || ""} onChange={(event) => updateLabor(index, { workerCount: Number(event.target.value) })} />
                  </label>
                  <label className="field">
                    <span>Часов на человека</span>
                    <input aria-invalid={Boolean(issues.hoursPerWorker)} inputMode="decimal" min={0.1} max={Math.max(0.5, shiftHours)} required step="any" type="number" value={allocation.hoursPerWorker || ""} onChange={(event) => updateLabor(index, { hoursPerWorker: Number(event.target.value) })} />
                  </label>
                  <div className="daily-report-output-labor-total">
                    <small>Трудозатраты</small>
                    <strong>{number(output.laborHours)} чел.-ч</strong>
                    <span>{output.laborAllocationMode === "auto" ? "распределено автоматически" : "ручное распределение"}</span>
                  </div>
                  <div className="daily-report-output-norm">
                    <small>Факт. норма</small>
                    <strong>{actual ? `${number(actual.norm)} ${actual.unit}` : "заполните строку"}</strong>
                    {messages.length ? <small role="alert">{messages[0]}</small> : null}
                  </div>
                </div>
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
