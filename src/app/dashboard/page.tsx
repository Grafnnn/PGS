import Link from "next/link";
import { AlertTriangle, Banknote, CalendarClock, FolderKanban } from "lucide-react";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import { demoState, getProjectBundle } from "@/lib/demo-data";
import { getProjectBundleFromDb, listProjectsFromDb } from "@/lib/project-data";

export default async function DashboardPage() {
  const bundle = (await getProjectBundleFromDb("project-demo").catch(() => null)) ?? getProjectBundle("project-demo");
  const projects = (await listProjectsFromDb().catch(() => null)) ?? demoState.projects;
  const budget = budgetTotals(bundle.project.contractAmount, bundle.budgetItems);
  const works = workTotals(bundle.scheduleItems);
  const finance = financeTotals(bundle.payments);
  const materials = materialTotals(bundle.materials);
  const risks = [...bundle.risks, ...deriveAutoRisks(bundle.scheduleItems, bundle.materials, bundle.payments)];

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="eyebrow">Демо Строй</div>
          <h1>Центр управления строительными проектами</h1>
          <p className="muted">Операционный контур: бюджет, график, факт, снабжение, финансы, рапорты, риски и AI.</p>
        </div>
        <Link className="button primary" href="/projects/project-demo">
          <FolderKanban size={18} />
          Открыть объект
        </Link>
      </div>

      <section className="grid grid-4">
        <Kpi title="Сумма договоров" value={money(projects.reduce((total, project) => total + project.contractAmount, 0))} icon={<Banknote size={18} />} />
        <Kpi title="Прогнозная прибыль" value={money(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
        <Kpi title="Готовность работ" value={percent(works.completionPercent)} icon={<CalendarClock size={18} />} />
        <Kpi title="Активные риски" value={String(risks.filter((risk) => risk.status !== "closed").length)} tone="bad" icon={<AlertTriangle size={18} />} />
      </section>

      <section className="grid grid-2" style={{ marginTop: 16 }}>
        <div className="panel stack">
          <h2>Финансовая сводка</h2>
          <div className="grid grid-3">
            <Kpi title="Поступления" value={money(finance.incomingPayments)} tone="good" />
            <Kpi title="Платежи" value={money(finance.outgoingPayments)} />
            <Kpi title="Потребность" value={money(finance.financingNeed)} tone={finance.financingNeed ? "bad" : "good"} />
          </div>
        </div>
        <div className="panel stack">
          <h2>Снабжение</h2>
          <div className="grid grid-3">
            <Kpi title="Дефицитные позиции" value={String(materials.deficitItems.length)} tone="bad" />
            <Kpi title="Перерасход материалов" value={money(materials.materialOverrun)} tone={materials.materialOverrun > 0 ? "bad" : "good"} />
            <Kpi title="Доставлено" value={`${materials.deliveredQty.toLocaleString("ru-RU")} ед.`} />
          </div>
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
                <th>Договор</th>
                <th>Менеджер</th>
                <th>Период</th>
              </tr>
            </thead>
            <tbody>
              {projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.id}`}>
                      <strong>{project.name}</strong>
                    </Link>
                  </td>
                  <td>{project.customer}</td>
                  <td>
                    <span className="badge green">В работе</span>
                  </td>
                  <td>{money(project.contractAmount)}</td>
                  <td>{project.manager}</td>
                  <td>
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

function Kpi({ title, value, tone, icon }: { title: string; value: string; tone?: "good" | "warn" | "bad"; icon?: React.ReactNode }) {
  return (
    <div className="panel kpi">
      <div className="kpi-label" style={{ display: "flex", gap: 8, alignItems: "center" }}>
        {icon}
        {title}
      </div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : tone === "bad" ? "delta-bad" : ""}`}>{value}</div>
    </div>
  );
}
