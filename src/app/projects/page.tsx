import { Plus } from "lucide-react";
import { demoState } from "@/lib/demo-data";
import { money } from "@/lib/calculations";
import { listProjectsFromDb } from "@/lib/project-data";
import { ProjectsIndex } from "@/components/projects-index";

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

      <ProjectsIndex projects={projects} />
    </main>
  );
}
