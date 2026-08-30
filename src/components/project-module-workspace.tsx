"use client";

import { ChevronDown } from "lucide-react";
import React, { useEffect, useMemo, useRef, useState } from "react";

export type ProjectModuleView = {
  id: string;
  label: string;
  description?: string;
  content: React.ReactNode;
};

type Props = {
  moduleKey: string;
  title: string;
  icon: React.ReactNode;
  views: ProjectModuleView[];
  initialView?: string;
  className?: string;
};

export function ProjectModuleWorkspace({
  moduleKey,
  title,
  icon,
  views,
  initialView,
  className = ""
}: Props) {
  const defaultView = initialView && views.some((view) => view.id === initialView)
    ? initialView
    : views[0]?.id ?? "";
  const [activeView, setActiveView] = useState(defaultView);
  const bodyRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setActiveView(defaultView);
  }, [defaultView, moduleKey]);

  const selected = useMemo(
    () => views.find((view) => view.id === activeView) ?? views[0],
    [activeView, views]
  );

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: 0 });
  }, [selected?.id]);

  if (!selected) return null;

  return (
    <section className={`project-module-workspace ${className}`} data-module={moduleKey}>
      <header className="project-module-workspace-header">
        <div className="project-module-workspace-title">
          <span aria-hidden="true">{icon}</span>
          <div>
            <small>Рабочая область</small>
            <h2>{title}</h2>
          </div>
        </div>
        {views.length > 1 ? (
          <>
            <nav className="project-module-view-tabs" aria-label={`Представления раздела ${title}`}>
              {views.map((view) => (
                <button
                  aria-pressed={view.id === selected.id}
                  className={view.id === selected.id ? "active" : ""}
                  key={view.id}
                  onClick={() => setActiveView(view.id)}
                  type="button"
                >
                  {view.label}
                </button>
              ))}
            </nav>
            <label className="project-module-view-select">
              <span>Представление</span>
              <select value={selected.id} onChange={(event) => setActiveView(event.target.value)}>
                {views.map((view) => <option key={view.id} value={view.id}>{view.label}</option>)}
              </select>
              <ChevronDown size={16} aria-hidden="true" />
            </label>
          </>
        ) : null}
      </header>
      {selected.description ? <div className="project-module-view-context">{selected.description}</div> : null}
      <div className="project-module-view-body" data-view={selected.id} ref={bodyRef}>
        {selected.content}
      </div>
    </section>
  );
}
