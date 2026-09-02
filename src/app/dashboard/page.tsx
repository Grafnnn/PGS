import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, CalendarClock, FolderKanban, Layers3, PackageCheck, Sparkles } from "lucide-react";
import { InteractiveChart } from "@/components/charts/interactive-chart";
import { budgetTotals, financeTotals, materialTotals, money, percent } from "@/lib/calculations";
import { loadDashboardData } from "@/lib/project-page-data";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjectsFromDb } from "@/lib/project-data";
import { loadPortfolioProjectsForPage } from "@/lib/portfolio-data";
import { buildPortfolioControlModel } from "@/lib/portfolio-control";

export const dynamic = "force-dynamic";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

export default async function DashboardPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projects, bundle: loadedBundle, primaryProjectHref } = await loadDashboardData({
    loadProjects: () => listProjectsFromDb(user)
  });
  const portfolioSources = await loadPortfolioProjectsForPage(user);
  const portfolio = buildPortfolioControlModel(portfolioSources);
  const primaryProjectRoute = primaryProjectHref as Route;
  const bundle = loadedBundle ?? {
    project: { contractAmount: 0 },
    budgetItems: [],
    scheduleItems: [],
    materials: [],
    procurementRequests: [],
    payments: [],
    dailyReports: [],
    risks: [],
    aiMessages: []
  };
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const finance = financeTotals(bundle.payments);
  const materials = materialTotals(bundle.materials);
  const portfolioBudgetDeviation = portfolioSources.reduce((total, project) => total + project.budgetItems.reduce(
    (projectTotal, item) => projectTotal + item.qty * (item.forecastUnitPrice - item.plannedUnitPrice),
    0
  ), 0);
  const portfolioProgressValues = portfolio.projects.flatMap((project) => project.progressPercent === null ? [] : [project.progressPercent]);
  const portfolioProgress = portfolioProgressValues.length
    ? portfolioProgressValues.reduce((total, value) => total + value, 0) / portfolioProgressValues.length
    : 0;
  const attentionCount = portfolio.summary.criticalProjects + portfolio.summary.attentionProjects;
  const portfolioAttention = portfolio.attention.length
    ? portfolio.attention.slice(0, 4).map((item) => `${item.projectName}: ${item.reason}`)
    : ["Критичных отклонений по портфелю не выявлено"];
  const cashFlowSeries = portfolio.cashflow.map((item) => ({ label: item.label, value: item.net }));
  const costStructure = Object.entries(
    bundle.budgetItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.kind] = (acc[item.kind] ?? 0) + item.qty * item.forecastUnitPrice;
      return acc;
    }, {})
  ).map(([label, value]) => ({
    label: ({ work: "Работы", material: "Материалы", subcontract: "Субподряд", overhead: "Накладные" } as Record<string, string>)[label] ?? label,
    value
  }));

  return (
    <main className="page">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">Портфель проектов</div>
          <h1>Центр управления строительными проектами</h1>
          <p className="muted">Главные отклонения, деньги и сроки по портфелю.</p>
          <div className="page-header-meta">
            <span className="badge blue">{projects.length} проекта в реестре</span>
            <span className={`badge ${portfolioBudgetDeviation > 0 ? "red" : "green"}`}>Отклонение бюджета: {money(portfolioBudgetDeviation)}</span>
          </div>
        </div>
        <div className="page-header-actions">
          <Link className="button secondary" href={"/portfolio" as Route}>
            <Layers3 size={18} />
            Весь портфель
          </Link>
          <Link className="button secondary" href={primaryProjectRoute}>
            <PackageCheck size={18} />
            Импорт ВОР
          </Link>
          <Link className="button primary" href={primaryProjectRoute}>
            <FolderKanban size={18} />
            Открыть объект
          </Link>
        </div>
      </div>

      <section className="grid grid-4 dashboard-primary-kpis">
        <Kpi title="Активные проекты" value={String(portfolio.summary.activeProjects)} hint={compactMoney(portfolio.summary.contractAmount)} icon={<FolderKanban size={18} />} />
        <Kpi title="Общий бюджет" value={compactMoney(portfolio.summary.contractAmount)} hint="Договорная база" icon={<Banknote size={18} />} />
        <Kpi title="Готовность работ" value={portfolioProgressValues.length ? percent(portfolioProgress) : "—"} hint="Среднее по проектам с графиком" icon={<CalendarClock size={18} />} />
        <Kpi title="Требуют внимания" value={String(attentionCount)} hint="Проекты с отклонениями" tone={attentionCount ? "bad" : "good"} icon={<AlertTriangle size={18} />} />
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
            <Link className="button secondary" href={primaryProjectRoute}>Сформировать отчет</Link>
            <Link className="button secondary" href={primaryProjectRoute}>Проверить риски</Link>
            <Link className="button secondary" href={primaryProjectRoute}>Собрать заявку</Link>
            <Link className="button secondary" href={primaryProjectRoute}>Подготовить письмо</Link>
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
          description="Прогнозная себестоимость по видам затрат из ВОР. Серии можно скрывать, данные — открыть таблицей."
          height={290}
          series={[{ key: "value", label: "Себестоимость", color: "#b84721", type: "bar", format: "money" }]}
          title="Структура затрат"
          xKey="label"
        />
      </section>

      <details className="panel compact-details dashboard-secondary-details">
        <summary>Дополнительные показатели <span>финансы и снабжение</span></summary>
        <div className="grid grid-3 compact-metric-grid">
          <Kpi title="Поступления" value={compactMoney(finance.incomingPayments)} tone="good" />
          <Kpi title="Платежи" value={compactMoney(finance.outgoingPayments)} />
          <Kpi title="Потребность" value={compactMoney(finance.financingNeed)} tone={finance.financingNeed ? "bad" : "good"} />
          <Kpi title="Прогнозная прибыль" value={compactMoney(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
          <Kpi title="Дефицит материалов" value={String(materials.deficitItems.length)} tone={materials.deficitItems.length ? "bad" : "good"} />
          <Kpi title="Материалы доставлены" value={percent(materials.deliveryPercent)} hint={`${materials.deficitItems.length} поз. с дефицитом`} />
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
