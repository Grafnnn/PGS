"use client";

import Link from "next/link";
import React, { useMemo, useState } from "react";
import { AlertTriangle, ArrowUpRight, Banknote, CalendarClock, CircleGauge, Filter, Users } from "lucide-react";
import type { PortfolioControlModel, PortfolioHealth, PortfolioProjectRow } from "@/lib/portfolio-control";

type FilterValue = "all" | PortfolioHealth;
type SortValue = "attention" | "contract" | "progress" | "margin";

const healthLabels: Record<PortfolioHealth, string> = {
  critical: "Критично",
  attention: "Внимание",
  stable: "Стабильно",
  no_data: "Нет данных"
};

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function formatPercent(value: number | null) {
  return value === null ? "нет данных" : `${value.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%`;
}

function sortProjects(projects: PortfolioProjectRow[], sort: SortValue) {
  const rank: Record<PortfolioHealth, number> = { critical: 0, attention: 1, no_data: 2, stable: 3 };
  return [...projects].sort((a, b) => {
    if (sort === "contract") return b.contractAmount - a.contractAmount;
    if (sort === "progress") return (b.progressPercent ?? -1) - (a.progressPercent ?? -1);
    if (sort === "margin") return (b.forecastMarginPercent ?? -Infinity) - (a.forecastMarginPercent ?? -Infinity);
    return rank[a.health] - rank[b.health] || (a.healthScore ?? -1) - (b.healthScore ?? -1);
  });
}

export function PortfolioControlCenter({ model }: { model: PortfolioControlModel }) {
  const [filter, setFilter] = useState<FilterValue>("all");
  const [sort, setSort] = useState<SortValue>("attention");
  const projects = useMemo(() => sortProjects(
    filter === "all" ? model.projects : model.projects.filter((project) => project.health === filter),
    sort
  ), [filter, model.projects, sort]);

  return (
    <main className="page portfolio-page">
      <div className="page-header portfolio-header">
        <div className="page-header-main">
          <div className="eyebrow">Портфель</div>
          <h1>Portfolio Control Center</h1>
          <p className="muted">Деньги, сроки, риски и управленческая нагрузка по всем доступным объектам.</p>
          <div className="page-header-meta">
            <span className="badge blue">{model.summary.projectCount} объектов</span>
            <span className={`badge ${model.summary.criticalProjects ? "red" : "green"}`}>{model.summary.criticalProjects} критичных</span>
            {model.summary.noDataProjects > 0 && <span className="badge">{model.summary.noDataProjects} без достаточных данных</span>}
          </div>
        </div>
        <div className="page-header-actions">
          <Link className="button secondary" href="/projects">Реестр проектов</Link>
          <Link className="button primary" href="/projects#create-project">Создать проект</Link>
        </div>
      </div>

      <section className="portfolio-kpis" aria-label="Сводные показатели портфеля">
        <PortfolioKpi icon={<Banknote size={18} />} label="Договорный портфель" value={compactMoney(model.summary.contractAmount)} detail={`${model.summary.activeProjects} активных объектов`} />
        <PortfolioKpi icon={<CircleGauge size={18} />} label="Прогноз прибыли" value={compactMoney(model.summary.forecastProfit)} detail={`Себестоимость ${compactMoney(model.summary.forecastCost)}`} tone={model.summary.forecastProfit < 0 ? "bad" : "good"} />
        <PortfolioKpi icon={<CalendarClock size={18} />} label="Cash exposure" value={compactMoney(model.summary.cashExposure)} detail={`Поступило ${compactMoney(model.summary.paidIncoming)}`} tone={model.summary.cashExposure < 0 ? "bad" : "good"} />
        <PortfolioKpi icon={<AlertTriangle size={18} />} label="Просроченные действия" value={String(model.summary.overdueActions)} detail={`${model.summary.attentionProjects} объектов требуют внимания`} tone={model.summary.overdueActions ? "bad" : "good"} />
      </section>

      <section className="portfolio-signal-grid">
        <div className="portfolio-band portfolio-attention-band">
          <div className="portfolio-section-heading">
            <div><AlertTriangle size={18} /><span><strong>Управленческий фокус</strong><small>Приоритетные отклонения по портфелю</small></span></div>
            <span>{model.attention.length}</span>
          </div>
          <div className="portfolio-attention-list">
            {model.attention.length ? model.attention.map((item) => (
              <Link className="portfolio-attention-item" href={`/projects/${item.projectId}`} key={`${item.projectId}-${item.reason}`}>
                <span className={`portfolio-health-dot ${item.health}`} />
                <span><strong>{item.projectName}</strong><small>{item.reason}</small></span>
                <ArrowUpRight size={16} />
              </Link>
            )) : <div className="portfolio-empty">Нет критичных отклонений. Проверьте полноту исходных данных.</div>}
          </div>
        </div>

        <div className="portfolio-band portfolio-cashflow-band">
          <div className="portfolio-section-heading">
            <div><Banknote size={18} /><span><strong>Плановый cash-flow</strong><small>Последние 12 месяцев с данными</small></span></div>
          </div>
          <CashflowChart items={model.cashflow} />
        </div>
      </section>

      <section className="portfolio-band portfolio-projects-band">
        <div className="portfolio-table-toolbar">
          <div className="portfolio-section-heading">
            <div><Filter size={18} /><span><strong>Сравнение объектов</strong><small>Статус не считается зелёным при недостатке данных</small></span></div>
          </div>
          <div className="portfolio-controls">
            <div className="portfolio-segments" role="tablist" aria-label="Фильтр состояния проектов">
              {(["all", "critical", "attention", "stable", "no_data"] as FilterValue[]).map((value) => (
                <button aria-selected={filter === value} className={filter === value ? "active" : ""} key={value} onClick={() => setFilter(value)} role="tab" type="button">
                  {value === "all" ? "Все" : healthLabels[value]}
                </button>
              ))}
            </div>
            <label className="portfolio-sort"><span>Сортировка</span><select onChange={(event) => setSort(event.target.value as SortValue)} value={sort}><option value="attention">По вниманию</option><option value="contract">По сумме договора</option><option value="progress">По готовности</option><option value="margin">По марже</option></select></label>
          </div>
        </div>
        <div className="table-wrap portfolio-table-wrap">
          <table className="portfolio-table">
            <thead><tr><th>Объект</th><th>Состояние</th><th>Готовность</th><th>Прогноз / маржа</th><th>Cash exposure</th><th>Контроль</th><th>Ближайшая веха</th></tr></thead>
            <tbody>
              {projects.map((project) => <PortfolioRow key={project.id} project={project} />)}
            </tbody>
          </table>
          {!projects.length && <div className="portfolio-empty">По выбранному фильтру объектов нет.</div>}
        </div>
      </section>

      <section className="portfolio-band portfolio-workload-band">
        <div className="portfolio-section-heading">
          <div><Users size={18} /><span><strong>Нагрузка руководителей</strong><small>Проекты и открытые отклонения</small></span></div>
        </div>
        <div className="portfolio-workload-list">
          {model.workload.map((item) => (
            <div className="portfolio-workload-row" key={item.manager}>
              <span><strong>{item.manager}</strong><small>{item.projects} проект(а)</small></span>
              <div className="portfolio-workload-meter"><i style={{ width: `${Math.min(100, Math.max(8, item.score))}%` }} /></div>
              <span className="portfolio-workload-values"><b>{item.delayedWorks}</b> просрочек · <b>{item.criticalRisks}</b> крит. рисков · <b>{item.overdueActions}</b> действий</span>
            </div>
          ))}
          {!model.workload.length && <div className="portfolio-empty">Нет проектов для расчёта нагрузки.</div>}
        </div>
      </section>
    </main>
  );
}

function PortfolioKpi({ icon, label, value, detail, tone }: { icon: React.ReactNode; label: string; value: string; detail: string; tone?: "good" | "bad" }) {
  return <div className={`portfolio-kpi ${tone ?? ""}`}><div>{icon}<span>{label}</span></div><strong>{value}</strong><small>{detail}</small></div>;
}

function PortfolioRow({ project }: { project: PortfolioProjectRow }) {
  return (
    <tr>
      <td data-label="Объект"><Link className="portfolio-project-link" href={`/projects/${project.id}`}><strong>{project.name}</strong><small>{project.code || project.customer} · {project.manager}</small></Link></td>
      <td data-label="Состояние"><span className={`portfolio-health ${project.health}`}>{healthLabels[project.health]}{project.healthScore !== null && <b>{project.healthScore}</b>}</span><small className="portfolio-coverage">Данные: {project.coveragePercent}%</small></td>
      <td data-label="Готовность"><strong>{formatPercent(project.progressPercent)}</strong><div className="portfolio-progress"><i style={{ width: `${project.progressPercent ?? 0}%` }} /></div></td>
      <td data-label="Прогноз / маржа"><strong>{compactMoney(project.forecastCost)}</strong><small className={project.forecastProfit < 0 ? "delta-bad" : "delta-good"}>{formatPercent(project.forecastMarginPercent)}</small></td>
      <td data-label="Cash exposure"><strong className={project.cashExposure < 0 ? "delta-bad" : ""}>{compactMoney(project.cashExposure)}</strong><small>вход {compactMoney(project.paidIncoming)}</small></td>
      <td data-label="Контроль"><strong>{project.criticalRisks} рисков · {project.overdueActions} действий</strong><small>{project.delayedWorks} просрочек · {project.materialDeficits} дефицитов</small></td>
      <td data-label="Ближайшая веха">{project.nextMilestone ? <><strong>{new Date(project.nextMilestone.date).toLocaleDateString("ru-RU")}</strong><small>{project.nextMilestone.name}</small></> : <span className="muted">не определена</span>}</td>
    </tr>
  );
}

function CashflowChart({ items }: { items: PortfolioControlModel["cashflow"] }) {
  const max = Math.max(1, ...items.flatMap((item) => [item.incoming, item.outgoing]));
  if (!items.length) return <div className="portfolio-empty">Нет платежного календаря для портфельного графика.</div>;
  return (
    <div className="portfolio-cashflow-chart" aria-label="Плановый cash-flow по месяцам">
      {items.map((item) => (
        <div className="portfolio-cashflow-column" key={item.month} title={`${item.label}: вход ${compactMoney(item.incoming)}, выход ${compactMoney(item.outgoing)}`}>
          <div className="portfolio-cashflow-bars"><i className="incoming" style={{ height: `${Math.max(4, item.incoming / max * 100)}%` }} /><i className="outgoing" style={{ height: `${Math.max(4, item.outgoing / max * 100)}%` }} /></div>
          <small>{item.label}</small>
        </div>
      ))}
    </div>
  );
}
