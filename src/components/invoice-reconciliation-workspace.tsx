"use client";

import { AlertTriangle, CheckCircle2, FileCheck2, Link2, Plus, ReceiptText, RefreshCw, Scale, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type Invoice = {
  id: string;
  number: string;
  direction: "AP" | "AR";
  invoiceType: "invoice" | "credit_note";
  counterparty: string;
  issueDate: string;
  dueDate: string;
  grossAmount: number;
  taxAmount: number;
  currency: string;
  status: "received" | "approved" | "disputed" | "paid" | "void";
  matchStatus: "unmatched" | "matched" | "variance" | "blocked";
  matchSnapshot: null | {
    checks?: Array<{ key: string; label: string; status: "pass" | "variance" | "blocked" | "info"; detail: string }>;
  };
  notes: string | null;
  costCodeId: string | null;
  commitmentId: string | null;
  paymentApplicationId: string | null;
  paymentId: string | null;
  linkedDocumentId: string | null;
  costCode?: { code: string; name: string } | null;
  commitment?: { number: string; title: string; counterparty: string } | null;
  paymentApplication?: { number: string; status: string } | null;
  payment?: { title: string; status: string } | null;
  linkedDocument?: { title: string; fileName: string | null } | null;
};

type Options = {
  costCodes: Array<{ id: string; code: string; name: string }>;
  commitments: Array<{ id: string; number: string; title: string; counterparty: string; status: string; amount: number }>;
  paymentApplications: Array<{ id: string; commitmentId: string; number: string; status: string; netAmount: number }>;
  payments: Array<{ id: string; title: string; counterparty: string; direction: string; status: string; amount: number }>;
  documents: Array<{ id: string; title: string; fileName: string | null; category: string }>;
};

type ResponseData = {
  items?: Invoice[];
  options?: Options;
  summary?: { total: number; unmatched: number; variance: number; overdue: number; apOpen: number; arOpen: number };
  error?: string;
};

const emptyOptions: Options = { costCodes: [], commitments: [], paymentApplications: [], payments: [], documents: [] };

function dateInput(value = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function isoFromDateInput(value: string) {
  return new Date(`${value}T12:00:00`).toISOString();
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

const initialForm = {
  number: "",
  direction: "AP" as "AP" | "AR",
  invoiceType: "invoice" as "invoice" | "credit_note",
  counterparty: "",
  issueDate: dateInput(),
  dueDate: dateInput(new Date(Date.now() + 14 * 86_400_000)),
  grossAmount: "",
  taxAmount: "0",
  costCodeId: "",
  commitmentId: "",
  paymentApplicationId: "",
  paymentId: "",
  linkedDocumentId: "",
  notes: ""
};

const statusLabels: Record<Invoice["status"], string> = {
  received: "Получен",
  approved: "Утверждён",
  disputed: "Спор",
  paid: "Оплачен",
  void: "Аннулирован"
};

const matchLabels: Record<Invoice["matchStatus"], string> = {
  unmatched: "Не сверено",
  matched: "Сверено",
  variance: "Есть отклонение",
  blocked: "Не хватает основания"
};

export function InvoiceReconciliationWorkspace({ projectId, canEdit, canDelete }: { projectId: string; canEdit: boolean; canDelete: boolean }) {
  const [items, setItems] = useState<Invoice[]>([]);
  const [options, setOptions] = useState<Options>(emptyOptions);
  const [summary, setSummary] = useState<ResponseData["summary"]>();
  const [form, setForm] = useState(initialForm);
  const [mode, setMode] = useState<"AP" | "AR">("AP");
  const [showForm, setShowForm] = useState(false);
  const [confirmingId, setConfirmingId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices`);
      const data = await response.json() as ResponseData;
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить счета.");
      setItems(data.items ?? []);
      setOptions(data.options ?? emptyOptions);
      setSummary(data.summary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить счета.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const visible = useMemo(() => items.filter((item) => item.direction === mode), [items, mode]);
  const paymentApplications = useMemo(() => options.paymentApplications.filter((item) => !form.commitmentId || item.commitmentId === form.commitmentId), [form.commitmentId, options.paymentApplications]);
  const payments = useMemo(() => options.payments.filter((item) => item.direction === (form.direction === "AP" ? "outgoing" : "incoming")), [form.direction, options.payments]);

  async function create(event: React.FormEvent) {
    event.preventDefault();
    setSaving("create");
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...form,
          issueDate: isoFromDateInput(form.issueDate),
          dueDate: isoFromDateInput(form.dueDate),
          grossAmount: Number(form.grossAmount),
          taxAmount: Number(form.taxAmount)
        })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось создать счёт.");
      setForm({ ...initialForm, direction: mode });
      setShowForm(false);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось создать счёт.");
    } finally {
      setSaving("");
    }
  }

  async function reconcile(invoiceId: string) {
    setSaving(invoiceId);
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices/${invoiceId}/reconcile`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmed: true })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Сверка не выполнена.");
      setConfirmingId("");
      await load();
    } catch (reconcileError) {
      setError(reconcileError instanceof Error ? reconcileError.message : "Сверка не выполнена.");
    } finally {
      setSaving("");
    }
  }

  async function setStatus(invoice: Invoice, status: Invoice["status"]) {
    setSaving(invoice.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status })
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Статус не изменён.");
      await load();
    } catch (statusError) {
      setError(statusError instanceof Error ? statusError.message : "Статус не изменён.");
    } finally {
      setSaving("");
    }
  }

  async function remove(invoice: Invoice) {
    if (!window.confirm(`Удалить счёт ${invoice.number}?`)) return;
    setSaving(invoice.id);
    try {
      const response = await fetch(`/api/projects/${projectId}/invoices/${invoice.id}`, { method: "DELETE" });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Счёт не удалён.");
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Счёт не удалён.");
    } finally {
      setSaving("");
    }
  }

  function selectCommitment(commitmentId: string) {
    const commitment = options.commitments.find((item) => item.id === commitmentId);
    setForm((current) => ({
      ...current,
      commitmentId,
      paymentApplicationId: "",
      counterparty: commitment?.counterparty || current.counterparty
    }));
  }

  return (
    <section className="invoice-reconciliation" aria-label="Счета AP и AR">
      <header className="invoice-reconciliation-header">
        <div><div className="eyebrow">Invoice / AP-AR Reconciliation</div><h3>Счета и сверка AP / AR</h3><p>Сопоставление счёта, обязательства или КС, документа и платежа. Платежи автоматически не создаются.</p></div>
        <div className="invoice-reconciliation-actions">
          <button className="icon-button" aria-label="Обновить счета" title="Обновить" type="button" onClick={() => void load()}><RefreshCw size={17} className={loading ? "spin" : ""} /></button>
          {canEdit && <button className="button primary compact-button" type="button" onClick={() => { setForm({ ...initialForm, direction: mode }); setShowForm((value) => !value); }}><Plus size={16} /> Новый счёт</button>}
        </div>
      </header>
      <div className="invoice-reconciliation-metrics">
        <Metric title="AP к оплате" value={money(summary?.apOpen ?? 0)} detail="исходящие счета" />
        <Metric title="AR к получению" value={money(summary?.arOpen ?? 0)} detail="входящие деньги" />
        <Metric title="Не сверено" value={String(summary?.unmatched ?? 0)} detail="нужны связи" tone={(summary?.unmatched ?? 0) ? "warn" : "good"} />
        <Metric title="Просрочено" value={String(summary?.overdue ?? 0)} detail="не закрыто" tone={(summary?.overdue ?? 0) ? "bad" : "good"} />
      </div>

      <div className="invoice-reconciliation-toolbar">
        <div className="segmented-control" role="tablist" aria-label="Направление счетов">
          <button className={mode === "AP" ? "active" : ""} type="button" onClick={() => setMode("AP")}>AP · К оплате</button>
          <button className={mode === "AR" ? "active" : ""} type="button" onClick={() => setMode("AR")}>AR · К получению</button>
        </div>
      </div>

      {showForm && canEdit && (
        <form className="invoice-form" onSubmit={create}>
          <div className="section-title"><ReceiptText size={18} /><h4>Новый {form.direction} счёт</h4></div>
          <div className="invoice-form-grid">
            <label className="field"><span>Направление</span><select value={form.direction} onChange={(event) => setForm({ ...form, direction: event.target.value as "AP" | "AR", paymentId: "" })}><option value="AP">AP · к оплате</option><option value="AR">AR · к получению</option></select></label>
            <label className="field"><span>Тип документа</span><select value={form.invoiceType} onChange={(event) => setForm({ ...form, invoiceType: event.target.value as "invoice" | "credit_note" })}><option value="invoice">Счёт</option><option value="credit_note">Корректировочный счёт</option></select></label>
            <label className="field"><span>Номер</span><input required maxLength={120} value={form.number} onChange={(event) => setForm({ ...form, number: event.target.value })} /></label>
            <label className="field field-wide"><span>Контрагент</span><input required minLength={2} maxLength={180} value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} /></label>
            <label className="field"><span>Дата счёта</span><input required type="date" value={form.issueDate} onChange={(event) => setForm({ ...form, issueDate: event.target.value })} /></label>
            <label className="field"><span>Срок оплаты</span><input required type="date" value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} /></label>
            <label className="field"><span>Сумма с НДС</span><input required min={0} step="0.01" type="number" value={form.grossAmount} onChange={(event) => setForm({ ...form, grossAmount: event.target.value })} /></label>
            <label className="field"><span>НДС</span><input min={0} step="0.01" type="number" value={form.taxAmount} onChange={(event) => setForm({ ...form, taxAmount: event.target.value })} /></label>
            <label className="field"><span>Код затрат</span><select value={form.costCodeId} onChange={(event) => setForm({ ...form, costCodeId: event.target.value })}><option value="">Не выбран</option>{options.costCodes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label className="field"><span>Обязательство</span><select value={form.commitmentId} onChange={(event) => selectCommitment(event.target.value)}><option value="">Не выбрано</option>{options.commitments.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.counterparty} · {money(item.amount)}</option>)}</select></label>
            <label className="field"><span>КС / заявка на оплату</span><select value={form.paymentApplicationId} onChange={(event) => setForm({ ...form, paymentApplicationId: event.target.value })}><option value="">Не выбрана</option>{paymentApplications.map((item) => <option key={item.id} value={item.id}>{item.number} · {money(item.netAmount)} · {item.status}</option>)}</select></label>
            <label className="field"><span>Платёж</span><select value={form.paymentId} onChange={(event) => setForm({ ...form, paymentId: event.target.value })}><option value="">Не привязан</option>{payments.map((item) => <option key={item.id} value={item.id}>{item.title} · {money(item.amount)} · {item.status}</option>)}</select></label>
            <label className="field"><span>Документ</span><select value={form.linkedDocumentId} onChange={(event) => setForm({ ...form, linkedDocumentId: event.target.value })}><option value="">Не выбран</option>{options.documents.map((item) => <option key={item.id} value={item.id}>{item.title}{item.fileName ? ` · ${item.fileName}` : ""}</option>)}</select></label>
            <label className="field field-wide"><span>Комментарий</span><textarea maxLength={3000} rows={3} value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>
          <div className="form-actions"><button className="button primary" disabled={saving === "create"} type="submit"><Plus size={16} /> Сохранить счёт</button><button className="button secondary" type="button" onClick={() => setShowForm(false)}>Отмена</button></div>
        </form>
      )}

      {error && <div className="error-box">{error}</div>}
      {loading && !items.length ? <div className="empty-state compact">Загрузка реестра счетов...</div> : (
        <div className="invoice-list">
          {visible.map((invoice) => (
            <article className="invoice-row" key={invoice.id}>
              <header>
                <div><span className="invoice-direction">{invoice.direction}</span><strong>{invoice.number} · {invoice.counterparty}</strong><small>{new Date(invoice.issueDate).toLocaleDateString("ru-RU")} → {new Date(invoice.dueDate).toLocaleDateString("ru-RU")}</small></div>
                <div><span className={`badge ${invoice.matchStatus === "matched" ? "green" : invoice.matchStatus === "variance" ? "yellow" : invoice.matchStatus === "blocked" ? "red" : "gray"}`}>{matchLabels[invoice.matchStatus]}</span><strong>{money(invoice.grossAmount)}</strong></div>
              </header>
              <div className="invoice-links">
                <span><Link2 size={14} /> {invoice.commitment ? `${invoice.commitment.number} · ${invoice.commitment.title}` : "Обязательство не связано"}</span>
                <span><FileCheck2 size={14} /> {invoice.linkedDocument?.title || "Документ не связан"}</span>
                <span><Scale size={14} /> {invoice.payment ? `${invoice.payment.title} · ${invoice.payment.status}` : "Платёж не связан"}</span>
              </div>
              {invoice.matchSnapshot?.checks?.length ? <div className="invoice-checks">{invoice.matchSnapshot.checks.map((check) => <div className={`invoice-check status-${check.status}`} key={check.key}>{check.status === "pass" ? <CheckCircle2 size={15} /> : <AlertTriangle size={15} />}<span><strong>{check.label}</strong><small>{check.detail}</small></span></div>)}</div> : null}
              <footer>
                <span className={`badge ${invoice.status === "paid" ? "green" : invoice.status === "disputed" ? "red" : invoice.status === "approved" ? "blue" : "gray"}`}>{statusLabels[invoice.status]}</span>
                {canEdit && !["paid", "void"].includes(invoice.status) && (
                  <>
                    {confirmingId === invoice.id
                      ? <button className="button primary compact-button" disabled={saving === invoice.id} type="button" onClick={() => void reconcile(invoice.id)}><CheckCircle2 size={15} /> Подтвердить сверку</button>
                      : <button className="button secondary compact-button" type="button" onClick={() => setConfirmingId(invoice.id)}><Scale size={15} /> Сверить</button>}
                    {["received", "disputed"].includes(invoice.status) && invoice.matchStatus === "matched" && <button className="button secondary compact-button" disabled={saving === invoice.id} type="button" onClick={() => void setStatus(invoice, "approved")}>Утвердить</button>}
                    {invoice.status === "disputed" && <button className="button secondary compact-button" disabled={saving === invoice.id} type="button" onClick={() => void setStatus(invoice, "received")}>Вернуть в работу</button>}
                    {!["disputed", "paid"].includes(invoice.status) && <button className="button secondary compact-button" disabled={saving === invoice.id} type="button" onClick={() => void setStatus(invoice, "disputed")}>В спор</button>}
                    {invoice.status === "approved" && invoice.payment?.status === "paid" && <button className="button secondary compact-button" disabled={saving === invoice.id} type="button" onClick={() => void setStatus(invoice, "paid")}>Отметить оплату</button>}
                  </>
                )}
                {canDelete && ["received", "disputed"].includes(invoice.status) && <button className="icon-button danger" disabled={saving === invoice.id} aria-label={`Удалить счёт ${invoice.number}`} title="Удалить" type="button" onClick={() => void remove(invoice)}><Trash2 size={16} /></button>}
              </footer>
            </article>
          ))}
          {!visible.length && <div className="empty-state compact">{mode === "AP" ? "Счетов к оплате пока нет." : "Счетов к получению пока нет."}</div>}
        </div>
      )}
    </section>
  );
}

function Metric({ title, value, detail, tone = "neutral" }: { title: string; value: string; detail: string; tone?: "good" | "warn" | "bad" | "neutral" }) {
  return <article className={`invoice-metric tone-${tone}`}><small>{title}</small><strong>{value}</strong><span>{detail}</span></article>;
}
