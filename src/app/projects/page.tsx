import Link from "next/link";
import { AlertTriangle, Plus, Search } from "lucide-react";
import { demoState } from "@/lib/demo-data";
import { money } from "@/lib/calculations";
import { listProjectsFromDb } from "@/lib/project-data";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

export default async function ProjectsPage() {
  const projects = (await listProjectsFromDb().catch(() => null)) ?? demoState.projects;

  return (
    <main className="page">
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">Реестр</div>
          <h1>Проекты</h1>
          <p className="muted">Фильтры, статусы, ответственные и быстрый переход в центр управления объектом.</p>
          <div className="page-header-meta">
            <span className="badge green">В работе</span>
            <span className="badge blue">{projects.length} объекта</span>
            <span className="badge gray">Сумма договоров: {compactMoney(projects.reduce((total, project) => total + project.contractAmount, 0))}</span>
          </div>
        </div>
        <button className="button primary" type="button">
          <Plus size={18} />
          Создать проект
        </button>
      </div>

      <section className="panel stack">
        <div className="toolbar">
          <label className="search-label">
            Поиск
            <span className="search-field">
              <Search size={17} />
              <input placeholder="Название, заказчик, адрес" />
            </span>
          </label>
          <label>
            Статус
            <select defaultValue="active">
              <option value="active">В работе</option>
              <option value="planning">Планирование</option>
              <option value="paused">Приостановлен</option>
              <option value="completed">Завершен</option>
            </select>
          </label>
          <label>
            Ответственный
            <select defaultValue="all">
              <option value="all">Все руководители</option>
              {projects.map((project) => (
                <option key={project.id} value={project.manager}>{project.manager}</option>
              ))}
            </select>
          </label>
        </div>
        {projects.length ? (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Название</th>
                  <th>Объект</th>
                  <th>Заказчик</th>
                  <th className="numeric">Договорная сумма</th>
                  <th>Руководитель</th>
                  <th>Контроль</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {projects.map((project) => (
                  <tr key={project.id}>
                    <td data-label="Название">
                      <Link href={`/projects/${project.id}`}>
                        <strong>{project.name}</strong>
                      </Link>
                      <div className="muted">{project.address}</div>
                    </td>
                    <td data-label="Объект">{project.object}</td>
                    <td data-label="Заказчик">{project.customer}</td>
                    <td className="numeric" data-label="Договорная сумма">{compactMoney(project.contractAmount)}</td>
                    <td data-label="Руководитель">{project.manager}</td>
                    <td data-label="Контроль">
                      <span className="badge yellow">
                        <AlertTriangle size={13} />
                        План-факт
                      </span>
                    </td>
                    <td data-label="Статус">
                      <span className="badge green">В работе</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="empty-state">Проекты пока не заведены. Создайте первый объект или импортируйте демо-данные.</div>
        )}
      </section>
    </main>
  );
}
