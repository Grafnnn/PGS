"use client";

import { Box, ExternalLink, Link2, Maximize2, X } from "lucide-react";
import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { getProject3dModel, getProject3dPresentation } from "@/lib/project-3d-model";
import type { Project } from "@/lib/types";

type ProjectModelViewerProps = {
  project: Partial<Project>;
};

const PROJECT_MODEL_OPEN_EVENT = "pgs:project-model-open";

export function openProjectModelViewer(projectId: string, returnFocusTo?: HTMLElement | null) {
  window.dispatchEvent(new CustomEvent(PROJECT_MODEL_OPEN_EVENT, { detail: { projectId, returnFocusTo } }));
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
  const presentation = getProject3dPresentation(project);
  const model = presentation?.model;
  const [open, setOpen] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const previewNoteId = useId();
  const openViewer = useCallback((returnFocusTo?: HTMLElement | null) => {
    previousFocusRef.current = returnFocusTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setLoaded(false);
    setOpen(true);
  }, []);

  useEffect(() => {
    setOpen(false);
  }, [project.id]);

  useEffect(() => {
    const openFromShortcut = (event: Event) => {
      const detail = (event as CustomEvent<{ projectId?: string; returnFocusTo?: HTMLElement | null }>).detail;
      const requestedProjectId = detail?.projectId;
      if (requestedProjectId !== project.id) return;
      openViewer(detail?.returnFocusTo);
    };
    window.addEventListener(PROJECT_MODEL_OPEN_EVENT, openFromShortcut);
    return () => window.removeEventListener(PROJECT_MODEL_OPEN_EVENT, openFromShortcut);
  }, [openViewer, project.id]);

  useEffect(() => {
    if (!open) return;
    const closeFromModel = (event: MessageEvent) => {
      // The sandbox has an opaque origin; trust only this specific iframe window.
      if (frameRef.current?.contentWindow && event.source === frameRef.current.contentWindow && event.data?.type === "pgs:project-model-close") setOpen(false);
    };
    window.addEventListener("message", closeFromModel);
    return () => window.removeEventListener("message", closeFromModel);
  }, [open]);

  useEffect(() => {
    if (!open || !project.id || !dialogRef.current) return;

    const dialog = dialogRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    dialog.showModal();
    closeButtonRef.current?.focus();

    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      const candidates = [previousFocusRef.current, ...document.querySelectorAll<HTMLElement>('[data-project-mobile-switcher-trigger], [data-project-all-modules-trigger]')];
      const target = candidates.find((element) => element?.isConnected && element.getClientRects().length > 0 && !element.closest("[inert]"));
      target?.focus({ preventScroll: true });
    };
  }, [open, project.id]);

  if (!project.id) return null;

  const viewerUrl = presentation?.url;

  return open && typeof document !== "undefined" ? createPortal(
        <dialog
          aria-describedby={presentation?.isPreview ? previewNoteId : undefined}
          aria-labelledby={titleId}
          aria-modal="true"
          className="project-model-overlay project-model-dialog"
          onCancel={(event) => { event.preventDefault(); setOpen(false); }}
          onClose={() => setOpen(false)}
          ref={dialogRef}
        >
            <header className="project-model-dialog-header">
              <div>
                <span><Box size={18} aria-hidden="true" /> {presentation?.isPreview ? `Пример · Троицк · здание 24 · ${model?.revision}` : model ? `Координационная модель · ${model.revision}` : "3D-модель проекта"}</span>
                <strong id={titleId}>{model?.title ?? project.name ?? "Модель проекта"}</strong>
                {presentation?.isPreview ? <small className="project-model-preview-note" id={previewNoteId}>У текущего объекта модель не подключена. Показан пример другого объекта.</small> : null}
              </div>
              <div className="project-model-dialog-actions">
                {model && !presentation?.isPreview ? <a className="button secondary" href={model.publicUrl} rel="noreferrer" target="_blank" title="Общая ссылка на модель, без пароля">
                  <Link2 size={17} />
                  Общая ссылка
                </a> : null}
                {viewerUrl ? <a className="button secondary" href={viewerUrl} rel="noreferrer" target="_blank">
                  <ExternalLink size={17} />
                  В новой вкладке
                </a> : null}
                <button aria-label="Закрыть 3D-модель" className="icon-button" onClick={() => setOpen(false)} ref={closeButtonRef} title="Закрыть" type="button">
                  <X size={20} />
                </button>
              </div>
            </header>
            <div className="project-model-stage">
              {viewerUrl && !loaded ? <div className="project-model-loading" role="status">Загружаю геометрию модели...</div> : null}
              {viewerUrl && model ? <iframe
                allow="fullscreen"
                allowFullScreen
                onLoad={() => setLoaded(true)}
                ref={frameRef}
                referrerPolicy="same-origin"
                sandbox="allow-downloads allow-scripts"
                src={viewerUrl}
                title={`${model.title}, ${model.revision}`}
              /> : <div className="project-model-empty">
                <Box size={40} aria-hidden="true" />
                <h2>Модель этого проекта пока не подключена</h2>
                <p>Когда модель будет добавлена к объекту, она появится здесь. Раздел 3D всегда доступен из верхнего меню.</p>
                <button className="button secondary" onClick={() => setOpen(false)} type="button">Вернуться к проекту</button>
              </div>}
            </div>
        </dialog>,
        document.body
      ) : null;
}
