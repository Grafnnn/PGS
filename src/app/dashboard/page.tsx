import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, ClipboardList, FolderKanban, PackageCheck, Sparkles } from "lucide-react";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import { demoState, getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb, listProjectsFromDb } from "@/lib/project-data";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

export default async function DashboardPage() {
  const bundle = (await getProjectBundleFromDb("project-demo").catch(() => null)) ?? getProjectBundle("project-demo");
  const projects = (await listProjectsFromDb().catch(() => null)) ?? demoState.projects;
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

  return (
    <main className="page">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">Демо Строй</div>
          <h1>Центр управления строительными проектами</h1>
          <p className="muted">Операционный контур: бюджет, график, факт, снабжение, финансы, рапорты, риски и AI.</p>
          <div className="page-header-meta">
            <span className="badge green">Рабочая область активна</span>
            <span className="badge blue">{projects.length} проекта в реестре</span>
            <span className={`badge ${budgetDeviation > 0 ? "red" : "green"}`}>Отклонение бюджета: {money(budgetDeviation)}</span>
          </div>
        </div>
        <div className="page-header-actions">
          <Link className="button secondary" href="/projects/project-demo">
            <PackageCheck size={18} />
            Импорт ВОР
          </Link>
          <Link className="button secondary" href="/projects/project-demo">
            <ClipboardList size={18} />
            Добавить рапорт
          </Link>
          <Link className="button primary" href="/projects/project-demo">
            <FolderKanban size={18} />
            Открыть объект
          </Link>
        </div>
      </div>

      <section className="grid grid-4">
        <Kpi title="Активные проекты" value={String(projects.length)} hint={compactMoney(totalContractAmount)} icon={<FolderKanban size={18} />} />
        <Kpi title="Общий бюджет" value={compactMoney(totalContractAmount)} hint="Договорная база" icon={<Banknote size={18} />} />
        <Kpi title="Отклонение бюджета" value={compactMoney(budgetDeviation)} hint={budgetDeviation > 0 ? "Требует решения" : "В норме"} tone={budgetDeviation > 0 ? "bad" : "good"} />
        <Kpi title="Ближайшие просрочки" value={String(delayedWorks.length)} hint={delayedWorks[0]?.name ?? "Нет критичных"} tone={delayedWorks.length ? "bad" : "good"} icon={<CalendarClock size={18} />} />
        <Kpi title="Открытые риски" value={String(activeRisks.length)} hint={activeRisks[0]?.title ?? "Без открытых рисков"} tone={activeRisks.length ? "bad" : "good"} icon={<AlertTriangle size={18} />} />
        <Kpi title="Заявки в работе" value={String(activeRequests.length)} hint={activeRequests[0]?.title ?? "Нет срочных"} tone={activeRequests.length ? "warn" : "good"} icon={<ClipboardList size={18} />} />
        <Kpi title="Готовность работ" value={percent(works.completionPercent)} hint="План / факт" icon={<CalendarClock size={18} />} />
        <Kpi title="Прогнозная прибыль" value={compactMoney(budget.forecastProfit)} hint="Маржинальность проекта" tone={budget.forecastProfit > 0 ? "good" : "bad"} />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel stack panel-accent">
          <div className="section-title">
            <Banknote size={18} />
            <h2>Финансовая сводка</h2>
          </div>
          <div className="grid grid-3">
            <Kpi title="Поступления" value={compactMoney(finance.incomingPayments)} tone="good" />
            <Kpi title="Платежи" value={compactMoney(finance.outgoingPayments)} />
            <Kpi title="Потребность" value={compactMoney(finance.financingNeed)} tone={finance.financingNeed ? "bad" : "good"} />
          </div>
        </div>
        <div className="panel stack panel-accent">
          <div className="section-title">
            <PackageCheck size={18} />
            <h2>Снабжение</h2>
          </div>
          <div className="grid grid-3">
            <Kpi title="Дефицитные позиции" value={String(materials.deficitItems.length)} tone="bad" />
            <Kpi title="Перерасход материалов" value={compactMoney(materials.materialOverrun)} tone={materials.materialOverrun > 0 ? "bad" : "good"} />
            <Kpi title="Доставлено" value={`${materials.deliveredQty.toLocaleString("ru-RU")} ед.`} />
          </div>
        </div>
      </section>

      <section className="panel stack" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <div>
            <h2>Требует внимания</h2>
            <p className="muted">Сводка по просрочкам, рискам, заявкам и перерасходу, которые стоит разобрать первыми.</p>
          </div>
          <Link className="button secondary" href="/projects/project-demo">
            <Sparkles size={18} />
            Открыть AI-анализ
          </Link>
        </div>
        <div className="grid grid-4">
          <Attention title="Просроченные работы" value={String(delayedWorks.length)} tone={delayedWorks.length ? "bad" : "good"} detail={delayedWorks[0]?.name ?? "Критичных просрочек нет"} />
          <Attention title="Риски" value={String(activeRisks.length)} tone={activeRisks.length ? "bad" : "good"} detail={activeRisks[0]?.title ?? "Открытых рисков нет"} />
          <Attention title="Заявки" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} detail={activeRequests[0]?.title ?? "Снабжение без срочных заявок"} />
          <Attention title="Перерасход" value={compactMoney(Math.max(budgetDeviation, materials.materialOverrun, 0))} tone={budgetDeviation > 0 || materials.materialOverrun > 0 ? "bad" : "good"} detail="Бюджет и материалы" />
        </div>
      </section>

      <section className="panel" style={{ marginTop: 16 }}>
        <div className="toolbar">
          <div>
            <h2>Проекты организации</h2>
            <p className="muted">Все цифры привязаны к проекту, разделу, периоду и источнику данных.</p>
          </div>
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Проект</th>
                <th>Заказчик</th>
                <th>Статус</th>
                <th className="numeric">Договор</th>
                <th>Готовность</th>
                <th>Менеджер</th>
                <th>Период</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td data-label="Проект">
                    <Link href={`/projects/${project.id}`}>
                      <strong>{project.name}</strong>
                    </Link>
                  </td>
                  <td data-label="Заказчик">{project.customer}</td>
                  <td data-label="Статус">
                    <span className="badge green">В работе</span>
                  </td>
                  <td className="numeric" data-label="Договор">{compactMoney(project.contractAmount)}</td>
                  <td data-label="Готовность">
                    <span className="badge blue">{percent(works.completionPercent)}</span>
                  </td>
                  <td data-label="Менеджер">{project.manager}</td>
                  <td data-label="Период">
                    {project.startsAt} - {project.endsAt}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
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

function Attention({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "good" | "warn" | "bad" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{title}</div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : "delta-bad"}`}>{value}</div>
      <div className="kpi-hint">{detail}</div>
    </div>
  );
}
