"use client";

import { AlertTriangle, BarChart3, CircleDollarSign, FileCheck2, Landmark, ListChecks, RefreshCw, TrendingDown, Users, WalletCards } from "lucide-react";
import React, { useEffect, useState } from "react";
import { buildCostToCompleteIntelligence, type CostForecastTone } from "@/lib/cost-to-complete-intelligence";
import type {
  BudgetItem,
  DailyReport,
  Material,
  Payment,
  ProcurementRequest,
  Project,
  ProjectLaborDemand,
  ProjectPayrollPolicy,
  Risk,
  ScheduleItem,
  WorkforceResource
} from "@/lib/types";

type ExpenseSummary = { count: number; grossAmount: number; taxAmount: number; receipts: number; withoutReceipt: number; byCategory: Record<string, number> };
type Props = { project: Partial<Project>; budgetItems: BudgetItem[]; scheduleItems: ScheduleItem[]; materials: Material[]; procurementRequests: ProcurementRequest[]; payments: Payment[]; risks: Risk[]; dailyReports: DailyReport[]; onNavigate: (tab: string) => void };
function badge(tone: CostForecastTone) { return tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : tone === "info" ? "blue" : "gray"; }
function money(value: number) { return `${Math.round(value).toLocaleString("ru-RU")} ₽`; }

export function CostToCompleteWorkspace(props: Props) {
  const [workforce, setWorkforce] = useState<{ resources: WorkforceResource[]; demands: ProjectLaborDemand[]; policy: ProjectPayrollPolicy | null }>({
    resources: [],
    demands: [],
    policy: null
  });
  const [expenseSummary, setExpenseSummary] = useState<ExpenseSummary | null>(null);
  const [actualsLoading, setActualsLoading] = useState(Boolean(props.project.id));
  const [actualsError, setActualsError] = useState("");
  const [actualsProjectId, setActualsProjectId] = useState("");
  useEffect(() => {
    if (!props.project.id) return;
    let active = true;
    setActualsLoading(true);
    setActualsProjectId("");
    Promise.all([
      fetch(`/api/projects/${props.project.id}/resources`, { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{ items?: WorkforceResource[]; demands?: ProjectLaborDemand[]; policy?: ProjectPayrollPolicy }> : null)
        .catch(() => null),
      fetch(`/api/projects/${props.project.id}/expenses`, { cache: "no-store" })
        .then(async (response) => response.ok ? response.json() as Promise<{ summary?: ExpenseSummary }> : null)
        .catch(() => null)
    ]).then(([resourceBody, expenseBody]) => {
      if (!active) return;
      if (resourceBody) setWorkforce({ resources: resourceBody.items ?? [], demands: resourceBody.demands ?? [], policy: resourceBody.policy ?? null });
      if (expenseBody?.summary) setExpenseSummary(expenseBody.summary);
      setActualsError(resourceBody && expenseBody?.summary ? "" : "Часть фактических данных временно недоступна; итог помечен как неполный.");
      setActualsProjectId(props.project.id ?? "");
    }).finally(() => {
      if (active) setActualsLoading(false);
    });
    return () => {
      active = false;
    };
  }, [props.project.id]);
  const actualsReady = Boolean(props.project.id) && actualsProjectId === props.project.id;
  const model = buildCostToCompleteIntelligence({
    ...props,
    workforceResources: actualsReady ? workforce.resources : [],
    laborDemands: actualsReady ? workforce.demands : [],
    payrollPolicy: actualsReady ? workforce.policy : null,
    dailyReports: props.dailyReports,
    expenseSummary: actualsReady ? expenseSummary : null
  });
  const summary = model.summary;
  return <section className="quality-issues-workspace cost-to-complete-workspace" aria-label="Cost to Complete and Margin Forecast">
    <div className={`quality-issues-header tone-${summary.tone}`}><div><div className="eyebrow">Cost-to-Complete &amp; Margin Forecast</div><h3>Прогноз затрат до завершения и маржи</h3><p>Управленческий прогноз из ВОР, графика, снабжения и платежей. Он не создает проводок и не меняет рабочие данные.</p><div className="quality-issues-badges"><span className={`badge ${badge(summary.tone)}`}>{summary.headline}</span><span className="badge blue">{summary.completionPercent.toFixed(0)}% факт работ</span><span className="badge gray">остаток {money(summary.costToComplete)}</span></div></div><div className="quality-issues-actions"><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Бюджет / ВОР")}><TrendingDown size={16} />ВОР</button><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("График")}><ListChecks size={16} />График</button></div></div>
    <div className="quality-issues-grid metrics"><Metric title="Прогноз затрат" value={money(summary.forecastCost)} detail={`план ${money(summary.plannedCost)}`} tone={summary.tone} /><Metric title="До завершения" value={money(summary.costToComplete)} detail={`${summary.remainingWorkPercent.toFixed(0)}% работ осталось`} tone={summary.tone} /><Metric title="Прогноз маржи" value={`${summary.forecastMarginPercent.toFixed(1)}%`} detail={money(summary.forecastMargin)} tone={summary.forecastMarginPercent < 5 ? "bad" : summary.tone} /><Metric title="ФОТ работодателя" value={money(summary.payrollEmployerCost)} detail={summary.payrollUncoveredCost ? `вне бюджета ${money(summary.payrollUncoveredCost)}` : `начисления ${money(summary.payrollContributions)}`} tone={summary.payrollUncoveredCost ? "warn" : summary.payrollEmployerCost ? "info" : "neutral"} /><Metric title="Ликвидность" value={summary.cashGap < 0 ? money(summary.cashGap) : "без разрыва"} detail={`потребность ${money(summary.financingNeed)}`} tone={summary.cashGap < 0 ? "bad" : "good"} /></div>
    <CostActualSnapshot model={model} loading={Boolean(props.project.id) && (actualsLoading || !actualsReady)} error={actualsReady ? actualsError : ""} onNavigate={props.onNavigate} />
    <div className="quality-issues-grid"><article className="quality-issues-card wide"><div className="section-title"><Landmark size={18} /><h4>Прогноз затрат по категориям</h4><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("ФОТ")}><Users size={15} />ФОТ</button></div><div className="table-wrap"><table><thead><tr><th>Категория</th><th className="numeric">План</th><th className="numeric">Факт</th><th className="numeric">Прогноз</th><th className="numeric">Отклонение</th></tr></thead><tbody>{model.categories.length ? model.categories.map((item) => <tr key={item.key}><td><span className={`badge ${badge(item.tone)}`}>{item.label}</span></td><td className="numeric">{money(item.planned)}</td><td className="numeric">{money(item.actual)}</td><td className="numeric">{money(item.forecast)}</td><td className="numeric">{item.deviation > 0 ? "+" : ""}{money(item.deviation)}</td></tr>) : <tr><td colSpan={5}>ВОР пока не загружен: прогноз не рассчитывается.</td></tr>}</tbody></table></div></article><article className="quality-issues-card"><div className="section-title"><AlertTriangle size={18} /><h4>Сигналы прогноза</h4></div><div className="quality-issues-list">{model.signals.length ? model.signals.map((item) => <button className={`quality-issue-item tone-${item.tone}`} key={item.id} type="button" onClick={() => props.onNavigate(item.targetTab)}><strong>{item.title}</strong><small>{item.detail}</small></button>) : <span className="muted">Критичных сигналов в доступном срезе нет.</span>}</div></article><article className="quality-issues-card"><div className="section-title"><WalletCards size={18} /><h4>Действия для защиты маржи</h4></div><div className="quality-issues-action-list">{model.actions.map((item) => <button className={`quality-issues-action priority-${item.priority}`} key={item.title} type="button" onClick={() => props.onNavigate(item.targetTab)}><strong>{item.title}</strong><span>{item.ownerRole} · {item.detail}</span></button>)}</div></article><article className="quality-issues-card wide"><div className="section-title"><AlertTriangle size={18} /><h4>Ограничения v1</h4></div><p className="quality-issues-handoff-copy">{summary.nextStep}</p><ul className="quality-issues-limitations">{model.limitations.map((item) => <li key={item}>{item}</li>)}</ul></article></div>
  </section>;
}

type CostModel = ReturnType<typeof buildCostToCompleteIntelligence>;

function boundedPercent(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function quantity(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

function CostActualSnapshot({ model, loading, error, onNavigate }: { model: CostModel; loading: boolean; error: string; onNavigate(tab: string): void }) {
  const progress = model.reportProgress;
  const spending = model.spending;
  const visibleWorks = progress.works.filter((item) => item.matched).slice(0, 5);
  return <section aria-label="Выполнение и фактические затраты проекта" className="cost-actual-overview">
    <article className="cost-actual-panel report-progress-panel">
      <header>
        <div><BarChart3 size={19} /><span><small>Утверждённые рапорты</small><h4>Выполнение по смете</h4></span></div>
        <button className="button secondary compact-button" onClick={() => onNavigate("Рапорты")} type="button">Рапорты</button>
      </header>
      <div className="cost-actual-primary">
        <strong>{progress.completionPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</strong>
        <span><b>{money(progress.earnedEstimateCost)}</b> освоено из {money(progress.matchedEstimateCost)} по связанным видам работ</span>
      </div>
      <div className="cost-actual-progress"><span style={{ width: `${boundedPercent(progress.completionPercent)}%` }} /></div>
      <div className="cost-actual-facts">
        <span><small>Рапорты</small><strong>{progress.approvedReports}</strong></span>
        <span><small>Строки связаны</small><strong>{progress.matchedRows} / {progress.outputRows}</strong></span>
        <span><small>Трудозатраты</small><strong>{quantity(progress.laborHours)} чел.-ч</strong></span>
      </div>
      {visibleWorks.length ? <div className="report-cost-work-list">
        {visibleWorks.map((item) => <div className={item.completionPercent > 100 ? "is-over" : ""} key={item.key}>
          <span><strong>{item.name}</strong><small>{quantity(item.reportedQty)} / {quantity(item.plannedQty)} {item.unit} · смета {money(item.estimateCost)}</small></span>
          <b>{item.completionPercent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</b>
          <em><span style={{ width: `${boundedPercent(item.completionPercent)}%` }} /></em>
        </div>)}
        {progress.works.filter((item) => item.matched).length > visibleWorks.length ? <small className="muted">Ещё {progress.works.filter((item) => item.matched).length - visibleWorks.length} видов работ учтено в итоге.</small> : null}
      </div> : <div className="cost-actual-empty"><FileCheck2 size={20} /><span>Нет утверждённых строк рапортов, связанных с графиком или ВОР.</span></div>}
      {progress.unmatchedRows ? <p className="cost-actual-warning"><AlertTriangle size={15} />{progress.unmatchedRows} строк рапортов не сопоставлено со сметой и не включено в процент.</p> : null}
    </article>

    <article className="cost-actual-panel spending-panel">
      <header>
        <div><CircleDollarSign size={19} /><span><small>Фактическая себестоимость</small><h4>Всего учтено затрат</h4></span></div>
        {loading ? <RefreshCw aria-label="Загрузка фактических затрат" className="spin" size={18} /> : <span className={`badge ${error ? "yellow" : "green"}`}>{error ? "неполные данные" : "данные собраны"}</span>}
      </header>
      <div className="cost-actual-primary">
        <strong>{loading ? "—" : money(spending.totalSpent)}</strong>
        <span>реестр расходов + ФОТ по рапортам, ещё не отражённый в реестре</span>
      </div>
      <div className="spending-source-list">
        <span><i className="source-expense" /><small>Чеки и ручные расходы<b>{spending.expenseCount} записей · {spending.receipts} с чеком</b></small><strong>{money(spending.expenseRegisterCost)}</strong></span>
        <span><i className="source-payroll" /><small>Расчётный ФОТ по рапортам<b>чел.-ч × ставки + начисления</b></small><strong>{money(spending.reportPayrollCost)}</strong></span>
        <span><i className="source-gap" /><small>ФОТ вне реестра<b>добавлен в общий факт без повторного учёта</b></small><strong>{money(spending.unregisteredPayrollCost)}</strong></span>
      </div>
      <div className="spending-reconciliation">
        <span><small>Оплачено исходящих</small><strong>{money(spending.paidOutgoingActual)}</strong><em>сверка движения денег</em></span>
        <span><small>Факт по ценам ВОР</small><strong>{money(spending.budgetActualCost)}</strong><em>сверочный минимум</em></span>
      </div>
      {error ? <p className="cost-actual-warning"><AlertTriangle size={15} />{error}</p> : null}
      <p className="cost-actual-note">Платежи и фактические цены ВОР не прибавляются повторно: они используются для сверки уже учтённых затрат.</p>
    </article>
  </section>;
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: CostForecastTone }) { return <div className={`quality-issues-card metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span>{detail}</span></div>; }
