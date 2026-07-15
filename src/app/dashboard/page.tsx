import Link from "next/link";
import type { Route } from "next";
import { redirect } from "next/navigation";
import { AlertTriangle, Banknote, BarChart3, CalendarClock, FolderKanban, Layers3, PackageCheck, Sparkles } from "lucide-react";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import { loadDashboardData } from "@/lib/project-page-data";
import { getCurrentUser } from "@/lib/auth/session";
import { listProjectsFromDb } from "@/lib/project-data";

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
  const works = workTotals(bundle.scheduleItems);
  const finance = financeTotals(bundle.payments);
  const materials = materialTotals(bundle.materials);
  const risks = [...bundle.risks, ...deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments)];
  const activeRisks = risks.filter((risk) => risk.status !== "closed");
  const delayedWorks = bundle.scheduleItems.filter((item) => item.status === "delayed");
  const activeRequests = bundle.procurementRequests.filter((request) => request.status !== "closed");
  const budgetDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const totalContractAmount = projects.reduce((total, project) => total + project.contractAmount, 0);
  const attentionCount = delayedWorks.length + activeRisks.length + materials.deficitItems.length + activeRequests.length;
  const portfolioAttention = [
    delayedWorks[0] ? `Просрочка: ${delayedWorks[0].name}` : "График без критичных просрочек",
    materials.deficitItems[0] ? `Материал: закрыть дефицит ${materials.deficitItems[0].name}` : "Дефицит материалов не выявлен",
    activeRisks[0] ? `Риск: ${activeRisks[0].title}` : "Новых критичных рисков нет",
    budgetDeviation > 0 ? `Бюджет: перерасход ${compactMoney(budgetDeviation)}` : "Бюджет в допустимом коридоре"
  ];
  const cashFlowSeries = bundle.payments.slice(0, 6).map((payment) => ({
    label: new Date(payment.plannedAt).toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }),
    value: payment.direction === "incoming" ? payment.amount : -payment.amount
  }));
  const costStructure = Object.entries(
    bundle.budgetItems.reduce<Record<string, number>>((acc, item) => {
      acc[item.kind] = (acc[item.kind] ?? 0) + item.qty * item.forecastUnitPrice;
      return acc;
    }, {})
  ).map(([label, value]) => ({ label, value }));

  return (
    <main className="page">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">Демо Строй</div>
          <h1>Центр управления строительными проектами</h1>
          <p className="muted">Главные отклонения, деньги и сроки по портфелю.</p>
          <div className="page-header-meta">
            <span className="badge blue">{projects.length} проекта в реестре</span>
            <span className={`badge ${budgetDeviation > 0 ? "red" : "green"}`}>Отклонение бюджета: {money(budgetDeviation)}</span>
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
        <Kpi title="Активные проекты" value={String(projects.length)} hint={compactMoney(totalContractAmount)} icon={<FolderKanban size={18} />} />
        <Kpi title="Общий бюджет" value={compactMoney(totalContractAmount)} hint="Договорная база" icon={<Banknote size={18} />} />
        <Kpi title="Готовность работ" value={percent(works.completionPercent)} hint="План / факт" icon={<CalendarClock size={18} />} />
        <Kpi title="Требуют внимания" value={String(attentionCount)} hint="Сроки, риски, заявки, материалы" tone={attentionCount ? "bad" : "good"} icon={<AlertTriangle size={18} />} />
      </section>

      <section className="dashboard-command-grid">
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
        <div className="panel stack portfolio-chart-panel">
          <div className="section-title">
            <BarChart3 size={18} />
            <h2>Портфельная аналитика</h2>
          </div>
          <div className="mini-chart-grid">
            <MiniBars title="Cash-flow" items={cashFlowSeries} />
            <MiniBars title="Структура затрат" items={costStructure} />
          </div>
        </div>
      </section>

      <details className="panel compact-details dashboard-secondary-details">
        <summary>Дополнительные показатели <span>финансы и снабжение</span></summary>
        <div className="grid grid-3 compact-metric-grid">
          <Kpi title="Поступления" value={compactMoney(finance.incomingPayments)} tone="good" />
          <Kpi title="Платежи" value={compactMoney(finance.outgoingPayments)} />
          <Kpi title="Потребность" value={compactMoney(finance.financingNeed)} tone={finance.financingNeed ? "bad" : "good"} />
          <Kpi title="Прогнозная прибыль" value={compactMoney(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
          <Kpi title="Дефицит материалов" value={String(materials.deficitItems.length)} tone={materials.deficitItems.length ? "bad" : "good"} />
          <Kpi title="Доставлено" value={`${materials.deliveredQty.toLocaleString("ru-RU")} ед.`} />
        </div>
      </details>

      <section className="panel dashboard-projects" aria-label="Проекты организации">
        <div className="toolbar">
          <h2>Проекты</h2>
          <div className="toolbar-actions"><Link className="button secondary" href={"/portfolio" as Route}>Сравнить портфель</Link><Link className="button secondary" href="/projects">Весь реестр</Link></div>
        </div>
        <div className="dashboard-project-list">
          {projects.slice(0, 5).map((project) => (
            <Link href={`/projects/${project.id}`} className="dashboard-project-row" key={project.id}>
              <span>
                <strong>{project.name}</strong>
                <small>{project.customer} · {project.manager}</small>
              </span>
              <span className="dashboard-project-values">
                <strong>{compactMoney(project.contractAmount)}</strong>
                <small>{percent(works.completionPercent)} готовность</small>
              </span>
            </Link>
          ))}
        </div>
      </section>
    </main>
  );
}

function MiniBars({ title, items }: { title: string; items: Array<{ label: string; value: number }> }) {
  const max = Math.max(...items.map((item) => Math.abs(item.value)), 1);
  return (
    <div className="mini-chart">
      <div className="mini-chart-title">{title}</div>
      <div className="mini-bars">
        {items.map((item) => (
          <div className="mini-bar" key={item.label} title={`${item.label}: ${compactMoney(item.value)}`}>
            <span className={item.value < 0 ? "negative" : ""} style={{ height: `${Math.max(8, (Math.abs(item.value) / max) * 100)}%` }} />
            <small>{item.label.length > 9 ? `${item.label.slice(0, 8)}...` : item.label}</small>
          </div>
        ))}
      </div>
    </div>
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
