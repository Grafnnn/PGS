"use client";

import { CalendarClock, Check, RefreshCw } from "lucide-react";
import React, { useMemo, useState } from "react";
import type { ProjectCalendarShiftPreview } from "@/lib/project-calendar-shift";
import type { ScheduleItem } from "@/lib/types";

type Props = {
  projectId: string;
  scheduleItems: ScheduleItem[];
  canShift: boolean;
};

function today() {
  return new Date().toLocaleDateString("sv-SE");
}

function formatDate(value: string | undefined) {
  if (!value) return "—";
  return new Date(`${value.slice(0, 10)}T00:00:00`).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

function errorMessage(value: unknown) {
  if (value && typeof value === "object" && "error" in value) {
    const error = (value as { error?: { message?: string } }).error;
    if (error?.message) return error.message;
  }
  return "Не удалось перенести календарь проекта.";
}

export function ProjectCalendarShiftControl({ projectId, scheduleItems, canShift }: Props) {
  const [targetStart, setTargetStart] = useState(today);
  const [preview, setPreview] = useState<ProjectCalendarShiftPreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [busy, setBusy] = useState<"preview" | "commit" | "">("");
  const [error, setError] = useState("");
  const firstScheduleStart = useMemo(
    () => scheduleItems.map((item) => item.startsAt.slice(0, 10)).sort()[0],
    [scheduleItems]
  );

  if (!canShift) return null;

  async function requestShift(mode: "preview" | "commit") {
    setBusy(mode);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/calendar/shift`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ targetStart, mode, confirmed: mode === "commit" ? confirmed : false })
      });
      const data = await response.json() as { preview?: ProjectCalendarShiftPreview; shifted?: boolean; error?: { message?: string } };
      if (!response.ok || !data.preview) throw new Error(errorMessage(data));
      setPreview(data.preview);
      setConfirmed(false);
      if (mode === "commit" && data.shifted) window.location.reload();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Не удалось перенести календарь проекта.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="project-calendar-shift-control" aria-label="Перенос календаря проекта">
      <header>
        <CalendarClock size={18} />
        <div><strong>Перенести календарь</strong><span>Сдвигает график и плановые сроки заказа материалов, сохраняя интервалы.</span></div>
      </header>
      <div className="project-calendar-shift-inputs">
        <label><span>Новое начало работ</span><input max="2099-12-31" min="2000-01-01" onChange={(event) => { setTargetStart(event.target.value); setPreview(null); setConfirmed(false); }} type="date" value={targetStart} /></label>
        <div><span>Сейчас по графику</span><strong>{formatDate(firstScheduleStart)}</strong></div>
        <button className="button secondary compact-button" disabled={!targetStart || Boolean(busy)} onClick={() => void requestShift("preview")} type="button">
          {busy === "preview" ? <RefreshCw className="spin" size={15} /> : <CalendarClock size={15} />}
          Проверить перенос
        </button>
      </div>
      {preview ? (
        <div className="project-calendar-shift-preview">
          <div><span>Сдвиг</span><strong>{preview.deltaDays > 0 ? "+" : ""}{preview.deltaDays} дн.</strong></div>
          <div><span>График</span><strong>{formatDate(preview.schedule.first?.before)} → {formatDate(preview.schedule.first?.after)}</strong><small>{preview.schedule.count} работ</small></div>
          <div><span>Заказать материалы</span><strong>{formatDate(preview.materials.firstOrder?.before)} → {formatDate(preview.materials.firstOrder?.after)}</strong><small>{preview.materials.count} позиций</small></div>
          <div><span>Окончание проекта</span><strong>{formatDate(preview.project.endsAt.before)} → {formatDate(preview.project.endsAt.after)}</strong></div>
          <label className="project-calendar-shift-confirm"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span><Check size={15} />Подтверждаю единый перенос плановых дат</span></label>
          <button className="button primary compact-button" disabled={!confirmed || Boolean(busy) || preview.deltaDays === 0} onClick={() => void requestShift("commit")} type="button">
            {busy === "commit" ? "Переношу..." : "Применить перенос"}
          </button>
        </div>
      ) : null}
      {error ? <p className="error-text" role="alert">{error}</p> : null}
    </section>
  );
}
