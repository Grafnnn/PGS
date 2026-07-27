"use client";

import { Check, Copy, ExternalLink, Link2, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type EligibleItem = {
  id: string;
  entityType: "rfi" | "submittal";
  number: string;
  title: string;
  recipientHint: string | null;
  dueAt: string | null;
};

type LinkItem = {
  id: string;
  entityType: "rfi" | "submittal";
  entityId: string;
  recipientName: string | null;
  recipientEmail: string;
  status: "active" | "responded" | "revoked" | "expired";
  expiresAt: string;
  responseCount: number;
  responseLimit: number;
  createdAt: string;
};

const statusLabels: Record<LinkItem["status"], string> = {
  active: "Активна",
  responded: "Ответ получен",
  revoked: "Отозвана",
  expired: "Истекла"
};

function localDate(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(new Date(value));
}

export function ExternalCollaborationWorkspace({ projectId, canManage }: { projectId: string; canManage: boolean }) {
  const [eligible, setEligible] = useState<EligibleItem[]>([]);
  const [links, setLinks] = useState<LinkItem[]>([]);
  const [entityKey, setEntityKey] = useState("");
  const [recipientName, setRecipientName] = useState("");
  const [recipientEmail, setRecipientEmail] = useState("");
  const [expiresInHours, setExpiresInHours] = useState("72");
  const [freshUrl, setFreshUrl] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (!canManage) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/external-collaboration`);
      const data = await response.json() as { eligible?: EligibleItem[]; links?: LinkItem[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить внешние ссылки.");
      setEligible(data.eligible ?? []);
      setLinks(data.links ?? []);
      setEntityKey((current) => current || (data.eligible?.[0] ? `${data.eligible[0].entityType}:${data.eligible[0].id}` : ""));
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить внешние ссылки.");
    } finally {
      setLoading(false);
    }
  }, [canManage, projectId]);

  useEffect(() => void load(), [load]);

  const selected = useMemo(() => {
    const [entityType, entityId] = entityKey.split(":");
    return eligible.find((item) => item.entityType === entityType && item.id === entityId) ?? null;
  }, [eligible, entityKey]);

  if (!canManage) return null;

  async function createLink(event: React.FormEvent) {
    event.preventDefault();
    if (!selected) return;
    setSaving("create");
    setFreshUrl("");
    setCopied(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/external-collaboration`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          entityType: selected.entityType,
          entityId: selected.id,
          recipientName,
          recipientEmail,
          expiresInHours: Number(expiresInHours),
          responseLimit: 1
        })
      });
      const data = await response.json() as { responseUrl?: string; error?: string };
      if (!response.ok || !data.responseUrl) throw new Error(data.error || "Не удалось создать ссылку.");
      setFreshUrl(data.responseUrl);
      setRecipientName("");
      setRecipientEmail("");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать ссылку.");
    } finally {
      setSaving("");
    }
  }

  async function copyUrl() {
    if (!freshUrl) return;
    await navigator.clipboard.writeText(freshUrl);
    setCopied(true);
  }

  async function revoke(linkId: string) {
    setSaving(linkId);
    try {
      const response = await fetch(`/api/projects/${projectId}/external-collaboration/${linkId}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось отозвать ссылку.");
      await load();
    } catch (revokeError) {
      setError(revokeError instanceof Error ? revokeError.message : "Не удалось отозвать ссылку.");
    } finally {
      setSaving("");
    }
  }

  return (
    <section className="external-collaboration" aria-label="Внешние согласования">
      <header className="external-collaboration-header">
        <div>
          <div className="eyebrow">Scoped external response</div>
          <h3>Внешние согласования</h3>
          <p>Одноразовая ссылка открывает только выбранный RFI или подачу. Остальные данные проекта недоступны.</p>
        </div>
        <button className="icon-button" aria-label="Обновить ссылки" title="Обновить" type="button" onClick={() => void load()}>
          <RefreshCw size={17} className={loading ? "spin" : ""} />
        </button>
      </header>

      <div className="external-collaboration-layout">
        <form className="external-collaboration-form" onSubmit={createLink}>
          <div className="section-title"><Link2 size={18} /><h4>Новая ссылка для ответа</h4></div>
          <label className="field field-wide">
            <span>RFI или согласование</span>
            <select required value={entityKey} onChange={(event) => setEntityKey(event.target.value)}>
              {!eligible.length && <option value="">Нет элементов, ожидающих внешнего ответа</option>}
              {eligible.map((item) => (
                <option key={`${item.entityType}:${item.id}`} value={`${item.entityType}:${item.id}`}>
                  {item.number} · {item.title}
                </option>
              ))}
            </select>
          </label>
          <div className="external-collaboration-fields">
            <label className="field"><span>Имя получателя</span><input maxLength={160} value={recipientName} onChange={(event) => setRecipientName(event.target.value)} placeholder={selected?.recipientHint || "Заказчик / проектировщик"} /></label>
            <label className="field"><span>Email получателя</span><input required type="email" maxLength={320} value={recipientEmail} onChange={(event) => setRecipientEmail(event.target.value)} placeholder="reviewer@example.com" /></label>
            <label className="field"><span>Срок действия</span><select value={expiresInHours} onChange={(event) => setExpiresInHours(event.target.value)}><option value="24">24 часа</option><option value="72">3 дня</option><option value="168">7 дней</option><option value="336">14 дней</option></select></label>
          </div>
          <button className="button primary" disabled={!selected || saving === "create"} type="submit"><ExternalLink size={16} /> Создать одноразовую ссылку</button>
          {freshUrl && (
            <div className="external-link-once" role="status">
              <ShieldCheck size={18} />
              <div><strong>Ссылка показана один раз</strong><span>{freshUrl}</span></div>
              <button className="icon-button" type="button" aria-label="Копировать ссылку" title="Копировать" onClick={() => void copyUrl()}>
                {copied ? <Check size={17} /> : <Copy size={17} />}
              </button>
            </div>
          )}
        </form>

        <div className="external-collaboration-register">
          <div className="section-title"><ShieldCheck size={18} /><h4>Журнал ссылок</h4></div>
          {links.length ? links.map((item) => (
            <article className="external-link-row" key={item.id}>
              <div>
                <strong>{item.recipientName || item.recipientEmail}</strong>
                <span>{item.recipientName ? item.recipientEmail : `${item.entityType === "rfi" ? "RFI" : "Submittal"} · внешний участник`}</span>
                <small>до {localDate(item.expiresAt)}</small>
              </div>
              <span className={`badge ${item.status === "active" ? "blue" : item.status === "responded" ? "green" : "gray"}`}>{statusLabels[item.status]}</span>
              {item.status === "active" && (
                <button className="icon-button danger" disabled={saving === item.id} type="button" aria-label="Отозвать ссылку" title="Отозвать ссылку" onClick={() => void revoke(item.id)}>
                  <Trash2 size={16} />
                </button>
              )}
            </article>
          )) : <div className="empty-state compact">Внешние ссылки ещё не создавались.</div>}
        </div>
      </div>
      {error && <div className="error-box">{error}</div>}
    </section>
  );
}
