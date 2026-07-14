import { Plus } from "lucide-react";
import { redirect } from "next/navigation";
import { money } from "@/lib/calculations";
import { loadProjectsForPage } from "@/lib/project-page-data";
import { listProjectsFromDb } from "@/lib/project-data";
import { getCurrentUser } from "@/lib/auth/session";
import { ProjectsIndex } from "@/components/projects-index";

export const dynamic = "force-dynamic";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

export default async function ProjectsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  const { projects } = await loadProjectsForPage(() => listProjectsFromDb(user));

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
        <a className="button primary" href="#create-project">
          <Plus size={18} />
          Создать проект
        </a>
      </div>

      <ProjectsIndex projects={projects} />
    </main>
  );
}
