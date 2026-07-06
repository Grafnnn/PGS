"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AlertTriangle, Grid2X2, List, Plus, Search } from "lucide-react";
import { money, percent } from "@/lib/calculations";
import type { Project } from "@/lib/types";

function compactMoney(value: number) {
  const absolute = Math.abs(value);
  if (absolute >= 1_000_000_000) return `${(value / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (absolute >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return money(value);
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

const statusLabels: Record<Project["status"], string> = {
  active: "В работе",
  archived: "Архив",
  completed: "Завершен",
  draft: "Черновик",
  paused: "Пауза",
  planning: "Планирование"
};

export function ProjectsIndex({ projects }: { projects: Project[] }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"all" | Project["status"]>("all");
  const [sort, setSort] = useState<"amount" | "finish" | "name">("amount");
  const [view, setView] = useState<"cards" | "table">("cards");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState("");
  const today = new Date().toISOString().slice(0, 10);
  const finish = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const [draft, setDraft] = useState({
    name: "Новый объект PGS",
    customer: "Новый заказчик",
    object: "Строительный объект",
    address: "Адрес объекта",
    contractAmount: "10000000",
    startsAt: today,
    endsAt: finish,
    manager: "Руководитель проекта",
    status: "planning" as Project["status"]
  });
  const managers = Array.from(new Set(projects.map((project) => project.manager)));

  const filteredProjects = projects
    .filter((project) => {
      const haystack = `${project.name} ${project.customer} ${project.object} ${project.address} ${project.manager}`.toLocaleLowerCase("ru-RU");
      return (!query || haystack.includes(query.toLocaleLowerCase("ru-RU"))) && (status === "all" || project.status === status);
    })
    .sort((left, right) => {
      if (sort === "amount") return right.contractAmount - left.contractAmount;
      if (sort === "finish") return new Date(left.endsAt).getTime() - new Date(right.endsAt).getTime();
      return left.name.localeCompare(right.name, "ru-RU");
    });

  return (
    <div className="stack">
      <section className="panel stack create-project-panel" id="create-project">
        <div className="toolbar">
          <div>
            <div className="eyebrow">Новый объект</div>
            <h2>Создать проект</h2>
            <p className="muted">Минимальная карточка создается в базе и сразу открывается как рабочий объект.</p>
          </div>
        </div>
        <form
          className="project-create-grid"
          onSubmit={async (event) => {
            event.preventDefault();
            setCreating(true);
            setCreateError("");
            try {
              const response = await fetch("/api/projects", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  ...draft,
                  contractAmount: Number(draft.contractAmount),
                  vatMode: "vat"
                })
              });
              const data = (await response.json()) as { project?: Project; error?: string | { message?: string } };
              if (!response.ok || !data.project) {
                const message = typeof data.error === "string" ? data.error : data.error?.message;
                throw new Error(message ?? "Не удалось создать проект.");
              }
              router.push(`/projects/${data.project.id}`);
              router.refresh();
            } catch (error) {
              setCreateError(error instanceof Error ? error.message : "Ошибка создания проекта.");
            } finally {
              setCreating(false);
            }
          }}
        >
          <label>
            Название
            <input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} />
          </label>
          <label>
            Заказчик
            <input value={draft.customer} onChange={(event) => setDraft((current) => ({ ...current, customer: event.target.value }))} />
          </label>
          <label>
            Объект
            <input value={draft.object} onChange={(event) => setDraft((current) => ({ ...current, object: event.target.value }))} />
          </label>
          <label>
            Адрес
            <input value={draft.address} onChange={(event) => setDraft((current) => ({ ...current, address: event.target.value }))} />
          </label>
          <label>
            Договорная сумма
            <input inputMode="numeric" value={draft.contractAmount} onChange={(event) => setDraft((current) => ({ ...current, contractAmount: event.target.value }))} />
          </label>
          <label>
            Начало
            <input type="date" value={draft.startsAt} onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))} />
          </label>
          <label>
            Завершение
            <input type="date" value={draft.endsAt} onChange={(event) => setDraft((current) => ({ ...current, endsAt: event.target.value }))} />
          </label>
          <label>
            Руководитель
            <input value={draft.manager} onChange={(event) => setDraft((current) => ({ ...current, manager: event.target.value }))} />
          </label>
          <label>
            Статус
            <select value={draft.status} onChange={(event) => setDraft((current) => ({ ...current, status: event.target.value as Project["status"] }))}>
              <option value="planning">Планирование</option>
              <option value="active">В работе</option>
              <option value="draft">Черновик</option>
            </select>
          </label>
          <div className="project-create-actions">
            <button className="button primary" disabled={creating} type="submit">
              <Plus size={17} />
              {creating ? "Создаем..." : "Создать и открыть"}
            </button>
            {createError && <span className="error-text">{createError}</span>}
          </div>
        </form>
      </section>

      <section className="panel stack">
        <div className="toolbar project-filterbar">
          <label className="search-label">
            Поиск
            <span className="search-field">
              <Search size={17} />
              <input value={query} placeholder="Название, заказчик, адрес" onChange={(event) => setQuery(event.target.value)} />
            </span>
          </label>
          <label>
            Статус
            <select value={status} onChange={(event) => setStatus(event.target.value as "all" | Project["status"])}>
              <option value="all">Все статусы</option>
              <option value="active">В работе</option>
              <option value="planning">Планирование</option>
              <option value="paused">Приостановлен</option>
              <option value="completed">Завершен</option>
            </select>
          </label>
          <label>
            Сортировка
            <select value={sort} onChange={(event) => setSort(event.target.value as "amount" | "finish" | "name")}>
              <option value="amount">По сумме договора</option>
              <option value="finish">По сроку завершения</option>
              <option value="name">По названию</option>
            </select>
          </label>
          <div className="density-toggle view-toggle" aria-label="Вид списка проектов">
            <button className={view === "cards" ? "active" : ""} type="button" onClick={() => setView("cards")}>
              <Grid2X2 size={15} />
              Карточки
            </button>
            <button className={view === "table" ? "active" : ""} type="button" onClick={() => setView("table")}>
              <List size={15} />
              Таблица
            </button>
          </div>
        </div>

        {filteredProjects.length ? (
          view === "cards" ? (
            <div className="project-card-grid">
              {filteredProjects.map((project, index) => (
                <ProjectCard key={project.id} managerCount={managers.length} project={project} riskCount={index + 2} />
              ))}
            </div>
          ) : (
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
                  {filteredProjects.map((project) => (
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
                        <span className="badge green">{statusLabels[project.status]}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        ) : (
          <div className="empty-state">Проекты не найдены. Измените фильтры или создайте новый объект.</div>
        )}
      </section>
    </div>
  );
}

function ProjectCard({ project, riskCount, managerCount }: { project: Project; riskCount: number; managerCount: number }) {
  const progress = project.status === "completed" ? 100 : project.status === "planning" ? 8 : 42;
  const margin = Math.max(8, 18 - riskCount);

  return (
    <Link className="project-card" href={`/projects/${project.id}`}>
      <div className="project-thumb" aria-hidden="true">
        <span>PGS</span>
      </div>
      <div className="project-card-body">
        <div className="project-card-title">
          <div>
            <strong>{project.name}</strong>
            <span>{project.address}</span>
          </div>
          <span className="badge green">{statusLabels[project.status]}</span>
        </div>
        <div className="project-card-meta">
          <span>{project.object}</span>
          <span>{project.customer}</span>
          <span>РП: {project.manager}</span>
        </div>
        <div className="progress-line" aria-label={`Готовность ${progress}%`}>
          <span style={{ width: `${progress}%` }} />
        </div>
        <div className="project-card-kpis">
          <span>
            Договор
            <strong>{compactMoney(project.contractAmount)}</strong>
          </span>
          <span>
            Срок
            <strong>{formatDate(project.endsAt)}</strong>
          </span>
          <span>
            Маржа
            <strong>{percent(margin)}</strong>
          </span>
          <span>
            Риски
            <strong>{riskCount}</strong>
          </span>
        </div>
        <div className="project-card-footer">
          <span>{managerCount} руководитель в контуре</span>
          <strong>Открыть штаб объекта</strong>
        </div>
      </div>
    </Link>
  );
}
