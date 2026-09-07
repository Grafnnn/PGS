"use client";

import { Box, ExternalLink, Maximize2, X } from "lucide-react";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProject3dModel, project3dModelViewerUrl } from "@/lib/project-3d-model";
import type { Project } from "@/lib/types";

type ProjectModelViewerProps = {
  project: Partial<Project>;
};

const PROJECT_MODEL_OPEN_EVENT = "pgs:project-model-open";

export function openProjectModelViewer(projectId: string) {
  window.dispatchEvent(new CustomEvent(PROJECT_MODEL_OPEN_EVENT, { detail: { projectId } }));
}

export function ProjectModelLauncher({ project }: ProjectModelViewerProps) {
  const model = getProject3dModel(project);
  const projectId = project.id;

  if (!model || !projectId) return null;

  return (
    <section className="project-model-launcher" aria-label="3D-модель проекта">
      <span className="project-model-launcher-icon" aria-hidden="true"><Box size={22} /></span>
      <div className="project-model-launcher-copy">
        <div className="project-model-launcher-heading">
          <strong>{model.title}</strong>
          <span className="badge blue">{model.revision}</span>
          <span className="badge gray">только просмотр</span>
        </div>
        <span>{model.subtitle} · редакция от {model.updatedAt}</span>
        <small>{model.disclaimer}</small>
      </div>
      <button className="button primary project-model-open" type="button" onClick={() => openProjectModelViewer(projectId)}>
        <Maximize2 size={18} />
        Открыть 3D-модель
      </button>
    </section>
  );
}

export function ProjectModelViewer({ project }: ProjectModelViewerProps) {
  const model = getProject3dModel(project);
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const openViewer = useCallback(() => {
    previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setLoaded(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    const openFromShortcut = (event: Event) => {
      const requestedProjectId = (event as CustomEvent<{ projectId?: string }>).detail?.projectId;
      if (requestedProjectId !== project.id) return;
      openViewer();
    };
    window.addEventListener(PROJECT_MODEL_OPEN_EVENT, openFromShortcut);
    return () => window.removeEventListener(PROJECT_MODEL_OPEN_EVENT, openFromShortcut);
  }, [openViewer, project.id]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeButtonRef.current?.focus();

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", closeOnEscape);

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener("keydown", closeOnEscape);
      previousFocusRef.current?.focus();
    };
  }, [open]);

  if (!model || !project.id) return null;

  const viewerUrl = project3dModelViewerUrl(project.id);

  return open && typeof document !== "undefined" ? createPortal(
        <div className="project-model-overlay">
          <section aria-labelledby={titleId} aria-modal="true" className="project-model-dialog" role="dialog">
            <header className="project-model-dialog-header">
              <div>
                <span><Box size={18} aria-hidden="true" /> Координационная модель · {model.revision}</span>
                <strong id={titleId}>{model.title}</strong>
              </div>
              <div className="project-model-dialog-actions">
                <a className="button secondary" href={viewerUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={17} />
                  В новой вкладке
                </a>
                <button aria-label="Закрыть 3D-модель" className="icon-button" onClick={() => setOpen(false)} ref={closeButtonRef} title="Закрыть" type="button">
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="project-model-stage">
              {!loaded ? <div className="project-model-loading" role="status">Загружаю геометрию модели...</div> : null}
              <iframe
                allow="fullscreen"
                allowFullScreen
                onLoad={() => setLoaded(true)}
                referrerPolicy="same-origin"
                sandbox="allow-downloads allow-scripts"
                src={viewerUrl}
                title={`${model.title}, ${model.revision}`}
              />
            </div>
          </section>
        </div>,
        document.body
      ) : null;
}
