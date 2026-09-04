import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, ArrowRight, Banknote, CalendarClock, ClipboardList, FolderKanban, Layers3, PackageCheck, Sparkles, TimerReset, Truck } from "lucide-react";
import { InteractiveChart } from "@/components/charts/interactive-chart";
import { money, percent } from "@/lib/calculations";
import { loadDashboardData } from "@/lib/project-page-data";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjectsFromDb } from "@/lib/project-data";
import { loadPortfolioProjectsForPage } from "@/lib/portfolio-data";
import { buildPortfolioControlModel, buildPortfolioCostStructure } from "@/lib/portfolio-control";

export const dynamic = "force-dynamic";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

function projectHref(projectId: string | undefined, tab?: string) {
  if (!projectId) return "/projects" as Route;
  return (`/projects/${projectId}${tab ? `?tab=${encodeURIComponent(tab)}` : ""}`) as Route;
}

export default async function DashboardPage(props: { searchParams?: { project?: string } }) {
  const searchParams = props?.searchParams;
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projects, primaryProjectHref } = await loadDashboardData({
    loadProjects: () => listProjectsFromDb(user)
  });
  const portfolioSources = await loadPortfolioProjectsForPage(user);
  const portfolio = buildPortfolioControlModel(portfolioSources);
  const selectedProject = projects.find((project) => project.id === searchParams?.project) ?? projects[0] ?? null;
  const selectedProjectRoute = selectedProject ? projectHref(selectedProject.id) : primaryProjectHref as Route;
  const portfolioBudgetProjects = portfolioSources.filter((project) => project.budgetItems.length > 0).length;
  const portfolioBudgetDeviation = portfolio.projects.reduce((total, project) => total + project.budgetDeviation, 0);
  const portfolioProgressValues = portfolio.projects.flatMap((project) => project.progressPercent === null ? [] : [project.progressPercent]);
  const portfolioProgress = portfolioProgressValues.length
    ? portfolioProgressValues.reduce((total, value) => total + value, 0) / portfolioProgressValues.length
    : 0;
  const attentionCount = portfolio.summary.criticalProjects + portfolio.summary.attentionProjects + portfolio.summary.noDataProjects;
  const portfolioAttention = portfolio.attention.length
    ? portfolio.attention.slice(0, 4).map((item) => `${item.projectName}: ${item.reason}`)
    : portfolio.summary.projectCount === 0
      ? ["Нет доступных проектов. Создайте проект или проверьте права доступа."]
      : portfolio.summary.noDataProjects > 0
        ? ["По части проектов недостаточно данных для надёжной оценки."]
        : ["Критичных отклонений по портфелю не выявлено"];
  const cashFlowSeries = portfolio.cashflow.map((item) => ({ label: item.label, value: item.net }));
  const costStructure = buildPortfolioCostStructure(portfolioSources);
  const materialItems = portfolioSources.flatMap((project) => project.materials);
  const materialRatios = materialItems
    .filter((item) => item.requiredQty > 0)
    .map((item) => Math.min(Math.max(item.deliveredQty / item.requiredQty, 0), 1));
  const materialDeliveryPercent = materialRatios.length
    ? materialRatios.reduce((total, value) => total + value, 0) / materialRatios.length * 100
    : null;
  const materialDeficits = portfolio.projects.reduce((total, project) => total + project.materialDeficits, 0);
  const financingNeed = Math.abs(Math.min(0, portfolio.summary.cashExposure));

  return (
    <main className="page">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">Портфель проектов</div>
          <h1>Центр управления строительными проектами</h1>
          <p className="muted">Главные отклонения, деньги и сроки по портфелю.</p>
          <div className="page-header-meta">
            <span className="badge blue">{portfolio.summary.projectCount} проекта в реестре</span>
            <span className={`badge ${!portfolioBudgetProjects ? "" : portfolioBudgetDeviation > 0 ? "red" : "green"}`}>Отклонение бюджета: {portfolioBudgetProjects ? money(portfolioBudgetDeviation) : "—"}</span>
          </div>
        </div>
        <div className="page-header-actions">
          <Link className="button secondary" href={"/portfolio" as Route}>
            <Layers3 size={18} />
            Весь портфель
          </Link>
          <Link className="button secondary" href={projectHref(selectedProject?.id, "Бюджет / ВОР")}>
            <PackageCheck size={18} />
            Импорт ВОР
          </Link>
          <Link className="button primary" href={selectedProjectRoute}>
            <FolderKanban size={18} />
            Открыть объект
          </Link>
        </div>
      </div>

      <section className="dashboard-project-switcher" aria-label="Выбор рабочего проекта">
        <div className="dashboard-project-switcher-copy">
          <span><FolderKanban size={18} /></span>
          <div>
            <small>Рабочий проект</small>
            <strong>{selectedProject?.name ?? "Проект не выбран"}</strong>
            <p>{selectedProject ? `${selectedProject.customer} · ${selectedProject.manager}` : "Создайте проект или проверьте права доступа."}</p>
          </div>
        </div>
        <form action="/dashboard" className="dashboard-project-switcher-form" method="get">
          <label htmlFor="dashboard-project">Выбрать проект</label>
          <select defaultValue={selectedProject?.id ?? ""} disabled={!projects.length} id="dashboard-project" name="project">
            {!projects.length ? <option value="">Нет доступных проектов</option> : null}
            {projects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}
          </select>
          <button className="button secondary" disabled={!projects.length} type="submit" title="Сделать проект рабочим"><ArrowRight size={17} />Выбрать</button>
        </form>
        <nav className="dashboard-project-switcher-actions" aria-label="Быстрые действия выбранного проекта">
          <Link href={projectHref(selectedProject?.id, "График")}><TimerReset size={15} />График</Link>
          <Link href={projectHref(selectedProject?.id, "Рапорты")}><ClipboardList size={15} />Рапорты</Link>
          <Link href={projectHref(selectedProject?.id, "Заявки")}><Truck size={15} />Снабжение</Link>
        </nav>
      </section>

      <section className="grid grid-4 dashboard-primary-kpis">
        <Kpi title="Активные проекты" value={String(portfolio.summary.activeProjects)} hint={compactMoney(portfolio.summary.contractAmount)} icon={<FolderKanban size={18} />} />
        <Kpi title="Договорный портфель" value={compactMoney(portfolio.summary.contractAmount)} hint="Сумма договоров" icon={<Banknote size={18} />} />
        <Kpi title="Готовность работ" value={portfolioProgressValues.length ? percent(portfolioProgress) : "—"} hint="Среднее по проектам с графиком" icon={<CalendarClock size={18} />} />
        <Kpi title="Требуют внимания" value={String(attentionCount)} hint="Отклонения или недостаточно данных" tone={attentionCount ? "bad" : "good"} icon={<AlertTriangle size={18} />} />
      </section>

      <section className="dashboard-command-grid dashboard-command-single">
        <div className="panel stack ai-command-card">
          <div className="section-title">
            <Sparkles size={18} />
            <h2>Что требует внимания сегодня</h2>
          </div>
          <div className="ai-insight-list">
            {portfolioAttention.map((item, index) => (
              <div className="ai-insight-item" key={item}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="quick-actions">
            <Link className="button secondary" href={projectHref(selectedProject?.id, "Рапорты")}>Сформировать отчет</Link>
            <Link className="button secondary" href={projectHref(selectedProject?.id, "Риски")}>Проверить риски</Link>
            <Link className="button secondary" href={projectHref(selectedProject?.id, "Заявки")}>Собрать заявку</Link>
            <Link className="button secondary" href={projectHref(selectedProject?.id, "Документы")}>Подготовить письмо</Link>
          </div>
        </div>
      </section>

      <section className="dashboard-atlas-charts" aria-label="Портфельная аналитика">
        <InteractiveChart
          data={cashFlowSeries}
          description="Плановые входящие и исходящие платежи по ближайшим датам. Наведите курсор для точного значения."
          height={290}
          series={[{ key: "value", label: "Чистый поток", color: "#087a70", type: "area", format: "money" }]}
          summary={cashFlowSeries.length ? "Отрицательные значения показывают финансовую нагрузку проекта." : "Платёжный календарь ещё не заполнен."}
          title="Денежный поток"
          xKey="label"
        />
        <InteractiveChart
          data={costStructure}
          description="Прогноз по ВОР и зарегистрированные фактические расходы по всему доступному портфелю."
          height={290}
          series={[
            { key: "forecast", label: "Прогноз", color: "#b84721", type: "bar", format: "money" },
            { key: "actual", label: "Факт по реестру", color: "#087a70", type: "bar", format: "money" }
          ]}
          title="Структура затрат"
          xKey="label"
        />
      </section>

      <details className="panel compact-details dashboard-secondary-details">
        <summary>Дополнительные показатели <span>финансы и снабжение</span></summary>
        <div className="grid grid-3 compact-metric-grid">
          <Kpi title="Получено" value={compactMoney(portfolio.summary.paidIncoming)} hint="Оплаченные входящие платежи" tone="good" />
          <Kpi title="Оплачено" value={compactMoney(portfolio.summary.paidOutgoing)} hint="Оплаченные исходящие платежи" />
          <Kpi title="Фактические расходы" value={compactMoney(portfolio.summary.actualExpenses)} hint={portfolio.summary.excludedNonRubExpenses ? `${portfolio.summary.excludedNonRubExpenses} записей не в RUB исключены` : "Рублёвый реестр расходов"} />
          <Kpi title="Потребность" value={compactMoney(financingNeed)} hint="Минимум планового cash-flow" tone={financingNeed ? "bad" : "good"} />
          <Kpi title="Прогнозная прибыль" value={portfolio.summary.financialForecastProjects ? compactMoney(portfolio.summary.forecastProfit) : "—"} hint={`${portfolio.summary.financialForecastProjects} из ${portfolio.summary.projectCount} проектов с финансовым прогнозом`} tone={!portfolio.summary.financialForecastProjects ? undefined : portfolio.summary.forecastProfit > 0 ? "good" : "bad"} />
          <Kpi title="Дефицит материалов" value={String(materialDeficits)} tone={materialDeficits ? "bad" : "good"} hint={materialDeliveryPercent === null ? "нет данных о поставках" : `доставлено в среднем ${percent(materialDeliveryPercent)}`} />
        </div>
      </details>

      <section className="panel dashboard-projects" aria-label="Проекты организации">
        <div className="toolbar">
          <h2>Проекты</h2>
          <div className="toolbar-actions"><Link className="button secondary" href={"/portfolio" as Route}>Сравнить портфель</Link><Link className="button secondary" href="/projects">Весь реестр</Link></div>
        </div>
        <div className="dashboard-project-list">
          {portfolio.projects.slice(0, 5).map((project) => (
            <Link href={`/projects/${project.id}`} className="dashboard-project-row" key={project.id}>
              <span>
                <strong>{project.name}</strong>
                <small>{project.customer} · {project.manager}</small>
              </span>
              <span className="dashboard-project-values">
                <strong>{compactMoney(project.contractAmount)}</strong>
                <small>{project.progressPercent === null ? "нет данных о готовности" : `${percent(project.progressPercent)} готовность`}</small>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function Kpi({ title, value, tone, icon, hint }: { title: string; value: string; tone?: "good" | "warn" | "bad"; icon?: React.ReactNode; hint?: string }) {
  return (
    <div className="panel kpi">
      <div className="kpi-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {icon}
        {title}
      </div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : tone === "bad" ? "delta-bad" : ""}`}>{value}</div>
      {hint && <div className="kpi-hint">{hint}</div>}
    </div>
  );
}
