"use client";

import { Bot, CalendarDays, Camera, Check, Images, Sparkles } from "lucide-react";
import Image from "next/image";
import React, { useEffect, useMemo, useState } from "react";
import type { PhotoQuestionResult } from "@/lib/photo-question";
import type { DailyReport } from "@/lib/types";

type UserContext = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
};

type Props = {
  projectId: string;
  reports: DailyReport[];
  currentUser: UserContext | null;
  currentUserLoaded: boolean;
};

const quickQuestions = [
  "Какие дефекты или отклонения видны на фото?",
  "Какие риски нужно проверить прорабу на месте?",
  "Что нужно исправить до приёмки выполненных работ?"
];

function reportDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU");
}

async function responseError(response: Response) {
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для AI-анализа фотографий.";
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  return body.error ?? "Не удалось проанализировать фотографии. Повторите попытку позже.";
}

export function DailyPhotoAiWorkspace({ projectId, reports, currentUser, currentUserLoaded }: Props) {
  const photoReports = useMemo(() => reports
    .map((report) => ({
      report,
      photos: (report.evidenceDocuments ?? []).filter((document) => (document.mimeType ?? "").startsWith("image/"))
    }))
    .filter((item) => item.photos.length > 0)
    .sort((left, right) => right.report.date.localeCompare(left.report.date)), [reports]);

  const initialReport = photoReports[0];
  const [selectedReportId, setSelectedReportId] = useState(initialReport?.report.id ?? "");
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>(() => initialReport?.photos.slice(0, 4).map((item) => item.id) ?? []);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<PhotoQuestionResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const selectedReport = photoReports.find((item) => item.report.id === selectedReportId) ?? photoReports[0] ?? null;
  const canAsk = currentUser?.authenticated && ["OWNER", "ADMIN", "MANAGER"].includes(currentUser.role ?? "");

  useEffect(() => {
    if (!selectedReport) {
      setSelectedReportId("");
      setSelectedPhotoIds([]);
      return;
    }
    if (selectedReport.report.id !== selectedReportId) setSelectedReportId(selectedReport.report.id);
    setSelectedPhotoIds((current) => {
      const available = new Set(selectedReport.photos.map((item) => item.id));
      const valid = current.filter((id) => available.has(id)).slice(0, 4);
      return valid.length ? valid : selectedReport.photos.slice(0, 4).map((item) => item.id);
    });
  }, [selectedReport, selectedReportId]);

  function chooseReport(reportId: string) {
    const next = photoReports.find((item) => item.report.id === reportId) ?? null;
    setSelectedReportId(reportId);
    setSelectedPhotoIds(next?.photos.slice(0, 4).map((item) => item.id) ?? []);
    setAnswer(null);
    setError("");
  }

  function togglePhoto(documentId: string) {
    setSelectedPhotoIds((current) => {
      if (current.includes(documentId)) return current.filter((id) => id !== documentId);
      return current.length < 4 ? [...current, documentId] : current;
    });
    setAnswer(null);
    setError("");
  }

  async function askAboutPhotos() {
    if (!canAsk || !selectedReport || !selectedPhotoIds.length || question.trim().length < 3) return;
    setBusy(true);
    setError("");
    setAnswer(null);
    try {
      const response = await fetch(`/api/projects/${projectId}/daily-reports/${selectedReport.report.id}/photo-question`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question, documentIds: selectedPhotoIds })
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = (await response.json()) as { result: PhotoQuestionResult };
      setAnswer(body.result);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Не удалось проанализировать фотографии.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="daily-photo-ai-workspace" aria-label="AI-анализ фотографий рапорта">
      <header className="daily-photo-ai-header">
        <div>
          <div className="eyebrow">AI-инструмент прораба</div>
          <h3><Bot size={22} /> Вопрос по фото AI</h3>
          <p>Выберите рапорт и фотографии, затем задайте конкретный вопрос о качестве, рисках или готовности работ.</p>
        </div>
        <span className="badge blue"><Images size={14} /> До 4 фото</span>
      </header>

      {!currentUserLoaded ? <div className="daily-photo-ai-empty">Проверяем доступ...</div> : !photoReports.length ? (
        <div className="daily-photo-ai-empty">
          <Camera size={28} />
          <strong>В рапортах пока нет фотографий</strong>
          <span>Откройте смену в пункте «Рапорты», внесите факт и прикрепите фото. После этого они появятся здесь.</span>
        </div>
      ) : (
        <div className="daily-photo-ai-layout">
          <div className="daily-photo-ai-source">
            <label className="daily-photo-ai-report-select">
              <span>Рапорт с фотографиями</span>
              <select value={selectedReport?.report.id ?? ""} onChange={(event) => chooseReport(event.target.value)}>
                {photoReports.map(({ report, photos }) => (
                  <option key={report.id} value={report.id}>{reportDate(report.date)} · {report.workCategory || "Смена"} · {photos.length} фото</option>
                ))}
              </select>
            </label>
            {selectedReport ? (
              <div className="daily-photo-ai-report-meta">
                <span><CalendarDays size={15} /> {reportDate(selectedReport.report.date)}</span>
                <span>{selectedReport.report.author}</span>
                <span>{selectedReport.report.completedWorks || selectedReport.report.plannedWorks || "Описание работ не заполнено"}</span>
              </div>
            ) : null}
            <div className="daily-photo-ai-selection-heading">
              <strong>Фотографии</strong>
              <span>{selectedPhotoIds.length}/4 выбрано</span>
            </div>
            <div className="daily-photo-ai-grid">
              {selectedReport?.photos.map((document) => {
                const selected = selectedPhotoIds.includes(document.id);
                const disabled = !selected && selectedPhotoIds.length >= 4;
                return (
                  <button aria-pressed={selected} className={selected ? "selected" : ""} disabled={disabled} key={document.id} type="button" onClick={() => togglePhoto(document.id)}>
                    <Image alt={document.title || document.fileName || "Фото рапорта"} height={240} src={`/api/projects/${projectId}/documents/${document.id}/download`} unoptimized width={320} />
                    <span>{document.title || document.fileName || "Фото рапорта"}</span>
                    {selected ? <i aria-hidden="true"><Check size={14} /></i> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="daily-photo-ai-dialog">
            <div className="daily-photo-ai-prompts">
              <span><Sparkles size={15} /> Быстрый вопрос</span>
              <div>
                {quickQuestions.map((item) => <button key={item} type="button" onClick={() => { setQuestion(item); setAnswer(null); }}>{item}</button>)}
              </div>
            </div>
            <label>
              <span>Ваш вопрос</span>
              <textarea maxLength={2000} placeholder="Например: видны ли дефекты примыкания и что проверить на месте?" rows={5} value={question} onChange={(event) => { setQuestion(event.target.value); setAnswer(null); }} />
            </label>
            <button className="button primary daily-photo-ai-submit" disabled={!canAsk || !selectedPhotoIds.length || question.trim().length < 3 || busy} type="button" onClick={() => void askAboutPhotos()}>
              <Bot size={17} /> {busy ? "Анализирую фото..." : "Спросить AI"}
            </button>
            {!canAsk ? <p className="form-hint">AI-анализ доступен владельцу, администратору и руководителю проекта.</p> : <p className="form-hint">Фото передаются AI только после нажатия кнопки. Ответ носит рекомендательный характер и требует проверки специалистом.</p>}
            {error ? <div className="inline-error" role="alert">{error}</div> : null}
            {answer ? (
              <div className="daily-photo-answer" role="status">
                <div><strong>Ответ AI</strong><span className={`badge ${answer.confidence === "high" ? "green" : answer.confidence === "medium" ? "yellow" : "gray"}`}>Уверенность: {answer.confidence}</span></div>
                <p>{answer.answer}</p>
                {answer.observations.length ? <section><strong>Наблюдения</strong><ul>{answer.observations.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                {answer.risks.length ? <section><strong>Риски</strong><ul>{answer.risks.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                {answer.recommendedActions.length ? <section><strong>Что сделать</strong><ul>{answer.recommendedActions.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                {answer.limitations.length ? <small>Ограничения: {answer.limitations.join(" ")}</small> : null}
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}
