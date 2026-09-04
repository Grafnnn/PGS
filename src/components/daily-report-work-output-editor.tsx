"use client";

import {
  BriefcaseBusiness,
  Check,
  ChevronDown,
  Clock3,
  Gauge,
  Plus,
  Trash2,
  UserRoundCheck,
  Users,
  WandSparkles
} from "lucide-react";
import React, { useMemo } from "react";
import {
  allocateDailyReportLabor,
  autoAssignDailyReportCrew,
  dailyReportAssignableCrew,
  dailyReportCrewProfession,
  dailyReportLaborCapacity,
  dailyReportWorkOutputAllocation,
  dailyReportWorkOutputIssues,
  dailyReportWorkOutputTotals,
  toggleDailyReportCrewAssignment
} from "@/lib/daily-report-work-outputs";
import type { DailyReportCrewMember, DailyReportWorkOutput, ScheduleItem } from "@/lib/types";

type Props = {
  outputs: DailyReportWorkOutput[];
  onChange: (outputs: DailyReportWorkOutput[]) => void;
  scheduleItems?: ScheduleItem[];
  scheduleUnits?: ReadonlyMap<string, string>;
  crewMembers?: DailyReportCrewMember[];
  crewHeadcount?: number;
  shiftHours?: number;
  onShiftHoursChange?: (hours: number) => void;
};

const emptyOutput = (): DailyReportWorkOutput => ({
  profession: "Рабочий",
  workName: "",
  quantity: 0,
  unit: "",
  laborHours: 0,
  laborAllocationMode: "auto"
});

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function outputKey(output: DailyReportWorkOutput, index: number) {
  return output.scheduleItemId ? `schedule:${output.scheduleItemId}` : `manual:${index}`;
}

export function DailyReportWorkOutputEditor({
  outputs,
  onChange,
  scheduleItems = [],
  scheduleUnits = new Map(),
  crewMembers = [],
  crewHeadcount = 0,
  shiftHours = 8,
  onShiftHoursChange
}: Props) {
  const scheduleById = useMemo(() => new Map(scheduleItems.map((item) => [item.id, item])), [scheduleItems]);
  const assignableCrew = useMemo(() => dailyReportAssignableCrew(crewMembers), [crewMembers]);
  const hasNamedCrew = assignableCrew.length > 0;
  const totals = dailyReportWorkOutputTotals(outputs);
  const incompleteRows = outputs.filter((output) => Object.keys(dailyReportWorkOutputIssues(output)).length > 0).length;
  const availableHeadcount = hasNamedCrew
    ? assignableCrew.reduce((sum, member) => sum + member.headcount, 0)
    : crewHeadcount;
  const capacity = dailyReportLaborCapacity(availableHeadcount, shiftHours);
  const assignedIds = new Set(outputs.flatMap((output) => output.crewResourceIds ?? []));
  const assignedHeadcount = hasNamedCrew
    ? assignableCrew.filter((member) => assignedIds.has(member.resourceId)).reduce((sum, member) => sum + member.headcount, 0)
    : outputs.reduce((sum, output) => sum + dailyReportWorkOutputAllocation(output, shiftHours).workerCount, 0);
  const remainingHours = Math.max(0, capacity - totals.laborHours);
  const assignmentByResource = new Map<string, number>();
  outputs.forEach((output, index) => output.crewResourceIds?.forEach((resourceId) => assignmentByResource.set(resourceId, index)));

  function update(index: number, patch: Partial<DailyReportWorkOutput>) {
    onChange(outputs.map((item, itemIndex) => itemIndex === index ? { ...item, ...patch } : item));
  }

  function updateManualHeadcount(index: number, workerCount: number) {
    const safeCount = Math.max(0, Math.floor(workerCount));
    update(index, {
      profession: outputs[index].profession.trim() || "Рабочий",
      workerCount: safeCount || undefined,
      hoursPerWorker: safeCount ? shiftHours : undefined,
      laborHours: safeCount ? safeCount * shiftHours : 0,
      laborAllocationMode: "manual"
    });
  }

  function autoAllocate() {
    onChange(hasNamedCrew
      ? autoAssignDailyReportCrew(outputs, crewMembers, shiftHours, true)
      : allocateDailyReportLabor(outputs, crewHeadcount, shiftHours, true));
  }

  function addOutput() {
    const next = [...outputs, emptyOutput()];
    onChange(hasNamedCrew
      ? autoAssignDailyReportCrew(next, crewMembers, shiftHours)
      : allocateDailyReportLabor(next, crewHeadcount, shiftHours));
  }

  return (
    <section className="daily-report-output-editor" aria-label="Закрытие выполненных работ">
      <header>
        <div>
          <Gauge size={18} />
          <span>
            <strong>Работы за смену</strong>
            <small>Для каждой работы укажите фактический объём и назначьте людей. Единицы, профессии и трудозатраты система заполнит сама.</small>
          </span>
        </div>
        <button className="button secondary compact-button" disabled={outputs.length >= 40} type="button" onClick={addOutput}>
          <Plus size={15} /> Добавить работу
        </button>
      </header>

      <div className="daily-closeout-summary">
        <span><Users size={16} /><small>Рабочие</small><strong>{availableHeadcount ? `${number(availableHeadcount)} чел.` : "не выбраны"}</strong></span>
        <label><Clock3 size={16} /><span><small>Смена</small><strong><input aria-label="Продолжительность смены, часов" inputMode="decimal" min={0.5} max={24} step={0.5} type="number" value={shiftHours || ""} onChange={(event) => onShiftHoursChange?.(Number(event.target.value))} /> ч</strong></span></label>
        <span><UserRoundCheck size={16} /><small>Распределено</small><strong>{availableHeadcount > 0 ? `${number(assignedHeadcount)} из ${number(availableHeadcount)}` : assignedHeadcount > 0 ? `${number(assignedHeadcount)} чел.` : "нет"}</strong></span>
        <span><Gauge size={16} /><small>Трудозатраты</small><strong>{number(totals.laborHours)} чел.-ч</strong></span>
        <button className="button secondary compact-button" disabled={!outputs.length || availableHeadcount <= 0} type="button" onClick={autoAllocate}><WandSparkles size={14} /> Распределить автоматически</button>
      </div>
      {remainingHours > 0 && outputs.length ? <p className="form-hint">Свободный фонд смены: {number(remainingHours)} чел.-ч. Назначьте оставшихся работников или оставьте их без выработки, если они не выполняли измеримые работы.</p> : null}

      {outputs.length ? (
        <div className="daily-report-output-list">
          <p className="form-hint" role="status">
            {totals.rows} {totals.rows === 1 ? "работа" : "работы"} · {number(totals.laborHours)} чел.-ч
            {incompleteRows ? ` · требуют заполнения: ${incompleteRows}` : " · готово к сохранению"}
          </p>
          {outputs.map((output, index) => {
            const issues = dailyReportWorkOutputIssues(output);
            const messages = Object.values(issues);
            const allocation = dailyReportWorkOutputAllocation(output, shiftHours);
            const scheduleItem = output.scheduleItemId ? scheduleById.get(output.scheduleItemId) : undefined;
            const scheduleUnit = (output.scheduleItemId ? scheduleUnits.get(output.scheduleItemId) : undefined) ?? scheduleItem?.unit;
            const plannedQty = scheduleItem?.plannedQty ?? 0;
            const actualQty = scheduleItem?.actualQty ?? 0;
            const remainingQty = Math.max(0, plannedQty - actualQty);
            const assigned = assignableCrew.filter((member) => output.crewResourceIds?.includes(member.resourceId));
            const profession = assigned.length ? dailyReportCrewProfession(assigned) : output.profession;
            return (
              <article className={`daily-closeout-work${messages.length ? " is-incomplete" : ""}`} key={outputKey(output, index)}>
                <header>
                  <div className="daily-closeout-work-title">
                    <span>{output.scheduleItemId ? "Работа из графика" : "Дополнительная работа"} · {index + 1} из {outputs.length}</span>
                    {output.scheduleItemId ? <strong>{output.workName}</strong> : <input aria-invalid={Boolean(issues.workName)} aria-label={`Название работы ${index + 1}`} maxLength={240} minLength={2} placeholder="Название выполненной работы" required value={output.workName} onChange={(event) => update(index, { workName: event.target.value })} />}
                    {scheduleItem ? (
                      <small>Всего: {number(plannedQty)} {scheduleUnit || "ед."} · выполнено ранее: {number(actualQty)} · осталось: {number(remainingQty)}</small>
                    ) : <small>Работа добавлена вручную: проверьте название и единицу.</small>}
                  </div>
                  <button aria-label={`Удалить работу ${index + 1}`} className="icon-button danger" type="button" title="Удалить работу" onClick={() => onChange(outputs.filter((_, itemIndex) => itemIndex !== index))}>
                    <Trash2 size={16} />
                  </button>
                </header>

                <div className="daily-closeout-work-main">
                  <label className="daily-closeout-quantity">
                    <span>Выполнено за смену</span>
                    <span className="daily-closeout-quantity-control">
                      <input aria-invalid={Boolean(issues.quantity)} inputMode="decimal" min={0.001} max={1_000_000_000} required step="0.001" type="number" value={output.quantity || ""} onChange={(event) => update(index, { quantity: Number(event.target.value) })} />
                      {scheduleUnit ? <b>{scheduleUnit}</b> : <input aria-invalid={Boolean(issues.unit)} aria-label={`Единица работы ${index + 1}`} maxLength={40} placeholder="ед." required value={output.unit} onChange={(event) => update(index, { unit: event.target.value })} />}
                    </span>
                  </label>
                  <div className="daily-closeout-assignment-summary">
                    <span><Users size={16} /><small>На этой работе</small><strong>{allocation.workerCount ? `${number(allocation.workerCount)} чел. × ${number(allocation.hoursPerWorker)} ч` : "люди не назначены"}</strong></span>
                    <span><BriefcaseBusiness size={16} /><small>Профессии из базы</small><strong>{assigned.length || !hasNamedCrew ? profession || "не определены" : "назначьте людей"}</strong></span>
                    <span><Gauge size={16} /><small>Трудозатраты</small><strong>{number(output.laborHours)} чел.-ч</strong></span>
                  </div>
                </div>

                {hasNamedCrew ? (
                  <details className="daily-closeout-crew-picker">
                    <summary>
                      <Users size={16} />
                      <span>{assigned.length ? `Назначено: ${assigned.map((member) => member.name).join(", ")}` : "Назначить работников"}</span>
                      <b>{assigned.reduce((sum, member) => sum + member.headcount, 0)}</b>
                      <ChevronDown size={15} />
                    </summary>
                    <div className="daily-closeout-crew-options" role="listbox" aria-label={`Работники для: ${output.workName}`} aria-multiselectable="true">
                      {assignableCrew.map((member) => {
                        const selected = output.crewResourceIds?.includes(member.resourceId) ?? false;
                        const otherIndex = assignmentByResource.get(member.resourceId);
                        const assignedElsewhere = otherIndex !== undefined && otherIndex !== index ? outputs[otherIndex]?.workName : "";
                        return (
                          <button aria-selected={selected} className={selected ? "selected" : ""} key={member.resourceId} role="option" type="button" onClick={() => onChange(toggleDailyReportCrewAssignment(outputs, index, member.resourceId, crewMembers, shiftHours))}>
                            <span className="daily-closeout-crew-check">{selected ? <Check size={14} /> : null}</span>
                            <span><strong>{member.name}</strong><small>{member.profession || "Рабочий"}{member.headcount > 1 ? ` · ${member.headcount} чел.` : ""}{assignedElsewhere ? ` · сейчас: ${assignedElsewhere}` : ""}</small></span>
                          </button>
                        );
                      })}
                    </div>
                    <small>Выбор сотрудника на другой работе автоматически переносит его. Продолжительность по умолчанию: {number(shiftHours)} ч.</small>
                  </details>
                ) : (
                  <label className="daily-closeout-manual-crew">
                    <span>Рабочих на этой работе</span>
                    <input aria-invalid={Boolean(issues.workerCount)} inputMode="numeric" min={1} max={Math.max(1, crewHeadcount)} required step={1} type="number" value={allocation.workerCount || ""} onChange={(event) => updateManualHeadcount(index, Number(event.target.value))} />
                    <small>По {number(shiftHours)} ч на человека. Добавьте сотрудников в ФОТ, чтобы назначать людей поимённо.</small>
                  </label>
                )}

                <footer>
                  {messages.length ? <span className="daily-closeout-error" role="alert">{messages[0]}</span> : <span className="daily-closeout-ready"><Check size={14} /> Работа заполнена</span>}
                </footer>
              </article>
            );
          })}
        </div>
      ) : (
        <p className="daily-report-output-empty">Добавьте выполненную работу. Для позиций из графика единица и общий объём появятся автоматически.</p>
      )}
    </section>
  );
}
