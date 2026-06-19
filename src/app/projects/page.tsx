import Link from "next/link";
import { Plus, Search } from "lucide-react";
import { demoState } from "@/lib/demo-data";
import { money } from "@/lib/calculations";

export default function ProjectsPage() {
  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="eyebrow">Реестр</div>
          <h1>Проекты</h1>
          <p className="muted">Фильтры, статусы, ответственные и быстрый переход в центр управления объектом.</p>
        </div>
        <button className="button primary">
          <Plus size={18} />
          Создать проект
        </button>
      </div>

      <section className="panel stack">
        <div className="toolbar">
          <label style={{ maxWidth: 420, width: "100%" }}>
            Поиск
            <span style={{ position: "relative" }}>
              <Search size={17} style={{ left: 10, position: "absolute", top: 10 }} />
              <input style={{ paddingLeft: 34 }} placeholder="Название, заказчик, адрес" />
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
        </div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>Название</th>
                <th>Объект</th>
                <th>Заказчик</th>
                <th>Договорная сумма</th>
                <th>Руководитель</th>
                <th>Статус</th>
              </tr>
            </thead>
            <tbody>
              {demoState.projects.map((project) => (
                <tr key={project.id}>
                  <td>
                    <Link href={`/projects/${project.id}`}>
                      <strong>{project.name}</strong>
                    </Link>
                    <div className="muted">{project.address}</div>
                  </td>
                  <td>{project.object}</td>
                  <td>{project.customer}</td>
                  <td>{money(project.contractAmount)}</td>
                  <td>{project.manager}</td>
                  <td>
                    <span className="badge green">В работе</span>
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
