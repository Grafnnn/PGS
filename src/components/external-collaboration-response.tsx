"use client";

import { AlertTriangle, CheckCircle2, Clock3, FileCheck2, FileQuestion, Send } from "lucide-react";
import React, { useEffect, useState } from "react";

type PublicContext = {
  project: { name: string; customer: string; object: string };
  entityType: "rfi" | "submittal";
  recipientName: string | null;
  expiresAt: string;
  entity: Record<string, string | number | null>;
};

export function ExternalCollaborationResponse({ token }: { token: string }) {
  const [context, setContext] = useState<PublicContext | null>(null);
  const [responseText, setResponseText] = useState("");
  const [decision, setDecision] = useState<"approved" | "rejected" | "revise_required">("approved");
  const [comment, setComment] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let active = true;
    void fetch(`/api/external/collaboration/${encodeURIComponent(token)}`)
      .then(async (response) => {
        const data = await response.json() as PublicContext & { error?: string };
        if (!response.ok) throw new Error(data.error || "Ссылка недоступна.");
        if (active) setContext(data);
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "Ссылка недоступна.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [token]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!context) return;
    setSaving(true);
    setError("");
    try {
      const body = context.entityType === "rfi" ? { response: responseText } : { decision, comment };
      const result = await fetch(`/api/external/collaboration/${encodeURIComponent(token)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      const data = await result.json() as { error?: string };
      if (!result.ok) throw new Error(data.error || "Ответ не отправлен.");
      setDone(true);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Ответ не отправлен.");
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <main className="external-response-page"><div className="external-response-shell"><div className="empty-state">Проверяем защищённую ссылку...</div></div></main>;
  if (error && !context) return <main className="external-response-page"><div className="external-response-shell"><AlertTriangle size={28} /><h1>Ссылка недоступна</h1><p>{error}</p></div></main>;
  if (!context) return null;
  if (done) return <main className="external-response-page"><div className="external-response-shell success"><CheckCircle2 size={32} /><h1>Ответ принят</h1><p>Результат записан в проект. Эта ссылка больше не действует.</p></div></main>;

  const entity = context.entity;
  return (
    <main className="external-response-page">
      <form className="external-response-shell" onSubmit={submit}>
        <header>
          <div className="external-response-brand">PGS</div>
          <span className="badge blue">{context.entityType === "rfi" ? "RFI" : "Согласование"}</span>
        </header>
        <div className="eyebrow">{context.project.name}</div>
        <h1>{String(entity.number)} · {String(entity.subject ?? entity.title)}</h1>
        <p>{context.project.object} · {context.project.customer}</p>
        <div className="external-response-meta">
          <span><Clock3 size={15} /> Ответ до {new Date(context.expiresAt).toLocaleString("ru-RU")}</span>
          <span>{context.recipientName ? `Для: ${context.recipientName}` : "Персональная одноразовая ссылка"}</span>
        </div>

        {context.entityType === "rfi" ? (
          <>
            <section className="external-response-question"><FileQuestion size={18} /><div><strong>Вопрос</strong><p>{String(entity.question)}</p></div></section>
            <label className="field"><span>Ваш официальный ответ</span><textarea required minLength={2} maxLength={5000} rows={8} value={responseText} onChange={(event) => setResponseText(event.target.value)} /></label>
          </>
        ) : (
          <>
            <section className="external-response-question"><FileCheck2 size={18} /><div><strong>Подача на согласование</strong><p>{String(entity.category)}{entity.specSection ? ` · ${String(entity.specSection)}` : ""} · Rev {String(entity.revision)}</p></div></section>
            <label className="field"><span>Решение</span><select value={decision} onChange={(event) => setDecision(event.target.value as typeof decision)}><option value="approved">Согласовать</option><option value="revise_required">Вернуть на доработку</option><option value="rejected">Отклонить</option></select></label>
            <label className="field"><span>Комментарий</span><textarea maxLength={3000} rows={6} value={comment} onChange={(event) => setComment(event.target.value)} /></label>
          </>
        )}
        {error && <div className="error-box">{error}</div>}
        <button className="button primary" disabled={saving} type="submit"><Send size={17} /> {saving ? "Отправляем..." : "Подтвердить и отправить"}</button>
        <small className="external-response-privacy">Ссылка не предоставляет доступ к другим данным проекта и закроется после ответа.</small>
      </form>
    </main>
  );
}
