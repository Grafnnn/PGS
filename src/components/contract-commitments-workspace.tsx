"use client";

import {
  AlertTriangle,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  FileText,
  GitBranch,
  Link2,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Trash2,
  Unlink,
  XCircle
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { BudgetItem, Payment, ProcurementRequest, ProjectCommitment, ProjectDocument, ProjectPaymentApplication } from "@/lib/types";

type Props = {
  projectId: string;
  budgetItems: BudgetItem[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  documents: ProjectDocument[];
  canEdit: boolean;
  canApprove: boolean;
  onNavigate: (tab: string) => void;
};
type Summary = { total: number; active: number; awaitingApproval: number; revisedValue: number; approvedApplications: number; paid: number; retentionHeld: number; remaining: number };
type LineDraft = { budgetItemId: string; costCodeId: string; sourceProcurementRequestItemId: string; code: string; description: string; quantity: number; unit: string; unitPrice: number; scheduledValue: number };
type CommitmentForm = {
  type: ProjectCommitment["type"];
  title: string;
  counterparty: string;
  externalNumber: string;
  retentionPercent: number;
  paymentTerms: string;
  startsAt: string;
  endsAt: string;
  sourceProcurementRequestId: string;
  linkedDocumentId: string;
  lines: LineDraft[];
};
type ApplicationLineDraft = { commitmentLineId: string; currentAmount: number; materialsStored: number };
type ApplicationDraft = { periodStart: string; periodEnd: string; notes: string; lines: ApplicationLineDraft[] };
type ChangeOrderOption = { id: string; number: string; title: string; status: string; commitmentId?: string | null };

const emptyLine = (): LineDraft => ({ budgetItemId: "", costCodeId: "", sourceProcurementRequestItemId: "", code: "", description: "", quantity: 1, unit: "компл.", unitPrice: 0, scheduledValue: 0 });
const emptyForm = (): CommitmentForm => ({
  type: "subcontract",
  title: "",
  counterparty: "",
  externalNumber: "",
  retentionPercent: 0,
  paymentTerms: "",
  startsAt: "",
  endsAt: "",
  sourceProcurementRequestId: "",
  linkedDocumentId: "",
  lines: [emptyLine()]
});
const emptySummary: Summary = { total: 0, active: 0, awaitingApproval: 0, revisedValue: 0, approvedApplications: 0, paid: 0, retentionHeld: 0, remaining: 0 };
const typeLabels: Record<ProjectCommitment["type"], string> = {
  owner_contract: "Договор с заказчиком",
  subcontract: "Субподряд",
  purchase_order: "Заказ поставщику",
  service_order: "Услуги"
};
const statusLabels: Record<ProjectCommitment["status"], string> = {
  draft: "Черновик",
  submitted: "На согласовании",
  revision_required: "На доработке",
  approved: "Согласовано",
  active: "Действует",
  completed: "Завершено",
  terminated: "Расторгнуто",
  rejected: "Отклонено",
  void: "Аннулировано"
};
const applicationStatusLabels: Record<ProjectPaymentApplication["status"], string> = {
  draft: "Черновик",
  submitted: "На согласовании",
  approved: "Согласовано",
  rejected: "Отклонено",
  paid: "Оплачено",
  void: "Аннулировано"
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function isoDate(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : "";
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `HTTP ${response.status}`;
}

export function ContractCommitmentsWorkspace(props: Props) {
  const [items, setItems] = useState<ProjectCommitment[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [changeOrders, setChangeOrders] = useState<ChangeOrderOption[]>([]);
  const [form, setForm] = useState<CommitmentForm>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [workflowTemplates, setWorkflowTemplates] = useState<Record<string, string>>({});
  const [changeOrderDrafts, setChangeOrderDrafts] = useState<Record<string, string>>({});
  const [applicationDrafts, setApplicationDrafts] = useState<Record<string, ApplicationDraft>>({});
  const [paymentDrafts, setPaymentDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading("load");
    setError("");
    try {
      const [commitmentsResponse, templatesResponse, changeOrdersResponse] = await Promise.all([
        fetch(`/api/projects/${props.projectId}/commitments`, { cache: "no-store" }),
        fetch(`/api/projects/${props.projectId}/workflow-templates`, { cache: "no-store" }),
        fetch(`/api/projects/${props.projectId}/change-orders`, { cache: "no-store" })
      ]);
      if (!commitmentsResponse.ok) throw new Error(await responseError(commitmentsResponse));
      const commitments = await commitmentsResponse.json() as { items?: ProjectCommitment[]; summary?: Summary };
      setItems(commitments.items ?? []);
      setSummary(commitments.summary ?? emptySummary);
      if (templatesResponse.ok) {
        const payload = await templatesResponse.json() as { templates?: Array<{ id: string; name: string; status: string }> };
        setTemplates((payload.templates ?? []).filter((template) => template.status === "active"));
      }
      if (changeOrdersResponse.ok) {
        const payload = await changeOrdersResponse.json() as { items?: ChangeOrderOption[] };
        setChangeOrders((payload.items ?? []).filter((item) => item.status === "approved" || item.status === "executed"));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить договорные обязательства.");
    } finally {
      setLoading("");
    }
  }, [props.projectId]);

  useEffect(() => { void load(); }, [load]);

  const pricedFormValue = useMemo(() => form.lines.reduce((total, line) => total + (line.scheduledValue || line.quantity * line.unitPrice), 0), [form.lines]);

  function updateLine(index: number, patch: Partial<LineDraft>) {
    setForm((current) => ({
      ...current,
      lines: current.lines.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        if ("quantity" in patch || "unitPrice" in patch) next.scheduledValue = Math.round(next.quantity * next.unitPrice * 100) / 100;
        return next;
      })
    }));
  }

  function fillProcurementRequest(requestId: string) {
    const request = props.procurementRequests.find((item) => item.id === requestId);
    setForm((current) => ({
      ...current,
      sourceProcurementRequestId: requestId,
      title: current.title || request?.title || "",
      lines: request?.items.length ? request.items.map((item) => ({
        budgetItemId: "",
        costCodeId: item.costCodeId ?? "",
        sourceProcurementRequestItemId: item.id ?? "",
        code: "",
        description: item.name,
        quantity: item.qty,
        unit: item.unit,
        unitPrice: 0,
        scheduledValue: 0
      })) : current.lines
    }));
  }

  function edit(item: ProjectCommitment) {
    setEditingId(item.id);
    setFormOpen(true);
    setForm({
      type: item.type,
      title: item.title,
      counterparty: item.counterparty,
      externalNumber: item.externalNumber ?? "",
      retentionPercent: item.retentionPercent,
      paymentTerms: item.paymentTerms ?? "",
      startsAt: item.startsAt?.slice(0, 10) ?? "",
      endsAt: item.endsAt?.slice(0, 10) ?? "",
      sourceProcurementRequestId: item.sourceProcurementRequestId ?? "",
      linkedDocumentId: item.linkedDocumentId ?? "",
      lines: item.lines.map((line) => ({
        budgetItemId: line.budgetItemId ?? "",
        costCodeId: line.costCodeId ?? "",
        sourceProcurementRequestItemId: line.sourceProcurementRequestItemId ?? "",
        code: line.code ?? "",
        description: line.description,
        quantity: line.quantity,
        unit: line.unit,
        unitPrice: line.unitPrice,
        scheduledValue: line.scheduledValue
      }))
    });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault();
    setLoading("form");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments${editingId ? `/${editingId}` : ""}`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, startsAt: isoDate(form.startsAt), endsAt: isoDate(form.endsAt) })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(editingId ? "Черновик обновлён." : "Договорное обязательство создано как черновик.");
      setEditingId("");
      setForm(emptyForm());
      setFormOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Обязательство не сохранено.");
    } finally {
      setLoading("");
    }
  }

  async function commitmentAction(item: ProjectCommitment, action: string, extra: Record<string, string> = {}) {
    if (["terminate", "void"].includes(action) && !window.confirm(action === "terminate" ? `Расторгнуть ${item.number}?` : `Аннулировать ${item.number}?`)) return;
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment: comments[item.id] ?? "", workflowTemplateId: workflowTemplates[item.id] ?? "", ...extra })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${item.number}: статус или связь обновлены.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Операция не выполнена.");
    } finally {
      setLoading("");
    }
  }

  async function remove(item: ProjectCommitment) {
    if (!window.confirm(`Удалить неиспользуемый черновик ${item.number}?`)) return;
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${item.number} удалён.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Черновик не удалён.");
    } finally {
      setLoading("");
    }
  }

  function applicationDraft(item: ProjectCommitment) {
    return applicationDrafts[item.id] ?? {
      periodStart: new Date().toISOString().slice(0, 10),
      periodEnd: new Date().toISOString().slice(0, 10),
      notes: "",
      lines: item.lines.map((line) => ({ commitmentLineId: line.id, currentAmount: 0, materialsStored: 0 }))
    };
  }

  function updateApplicationDraft(item: ProjectCommitment, patch: Partial<ApplicationDraft>) {
    setApplicationDrafts((current) => ({ ...current, [item.id]: { ...applicationDraft(item), ...patch } }));
  }

  async function createApplication(item: ProjectCommitment) {
    const draft = applicationDraft(item);
    setLoading(`app-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments/${item.id}/payment-applications`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...draft, periodStart: isoDate(draft.periodStart), periodEnd: isoDate(draft.periodEnd), lines: draft.lines.filter((line) => line.currentAmount > 0 || line.materialsStored > 0) })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setApplicationDrafts((current) => { const next = { ...current }; delete next[item.id]; return next; });
      setNotice(`${item.number}: создан черновик заявки на оплату.`);
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Заявка не создана.");
    } finally {
      setLoading("");
    }
  }

  async function applicationAction(commitment: ProjectCommitment, application: ProjectPaymentApplication, action: string) {
    if (["mark_paid", "void"].includes(action) && !window.confirm(action === "mark_paid" ? `Связать ${application.number} с фактически оплаченным платежом?` : `Аннулировать ${application.number}?`)) return;
    setLoading(application.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments/${commitment.id}/payment-applications/${application.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, comment: comments[application.id] ?? "", paymentId: paymentDrafts[application.id] ?? "" })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${application.number}: статус обновлён.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Статус заявки не изменён.");
    } finally {
      setLoading("");
    }
  }

  async function removeApplication(commitment: ProjectCommitment, application: ProjectPaymentApplication) {
    if (!window.confirm(`Удалить черновик ${application.number}?`)) return;
    setLoading(application.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/commitments/${commitment.id}/payment-applications/${application.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${application.number}: черновик удалён.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Черновик заявки не удалён.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="commitment-workspace" aria-label="Contract Commitments">
      <header className="commitment-header">
        <div>
          <div className="eyebrow">Contract Commitments v1</div>
          <h3>Договорные обязательства и заявки на оплату</h3>
          <p>СОВ, удержание, изменения и фактическая оплата в одном audit-ready реестре. Система не создаёт платежи и проводки автоматически.</p>
        </div>
        <div className="commitment-header-actions">
          <button className="icon-button" disabled={Boolean(loading)} onClick={() => void load()} title="Обновить" type="button"><RefreshCw size={17} /></button>
          {props.canEdit ? <button className="button primary" onClick={() => { setFormOpen((value) => !value); setEditingId(""); setForm(emptyForm()); }} type="button"><Plus size={16} />Обязательство</button> : null}
        </div>
      </header>

      <div className="commitment-metrics">
        <Metric label="Действует" value={String(summary.active)} detail={`${summary.awaitingApproval} на согласовании`} />
        <Metric label="Пересмотренная цена" value={money(summary.revisedValue)} detail={`${summary.total} обязательств`} />
        <Metric label="Согласовано к оплате" value={money(summary.approvedApplications)} detail={`оплачено ${money(summary.paid)}`} />
        <Metric label="Остаток" value={money(summary.remaining)} detail={`удержание ${money(summary.retentionHeld)}`} />
      </div>

      {error ? <div className="alert error"><AlertTriangle size={17} />{error}</div> : null}
      {notice ? <div className="alert success"><CheckCircle2 size={17} />{notice}</div> : null}

      {formOpen && props.canEdit ? (
        <form className="commitment-form" onSubmit={save}>
          <div className="commitment-section-title"><ClipboardCheck size={18} /><div><h4>{editingId ? "Редактирование черновика" : "Новое обязательство"}</h4><span>Фиксированная СОВ и реквизиты до отправки на согласование</span></div></div>
          <div className="commitment-form-grid">
            <label className="field field-wide"><span>Название</span><input minLength={3} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
            <label className="field"><span>Тип</span><select onChange={(event) => setForm({ ...form, type: event.target.value as CommitmentForm["type"] })} value={form.type}>{Object.entries(typeLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <label className="field"><span>Контрагент</span><input minLength={2} onChange={(event) => setForm({ ...form, counterparty: event.target.value })} required value={form.counterparty} /></label>
            <label className="field"><span>Номер контрагента</span><input onChange={(event) => setForm({ ...form, externalNumber: event.target.value })} value={form.externalNumber} /></label>
            <label className="field"><span>Удержание, %</span><input max="100" min="0" onChange={(event) => setForm({ ...form, retentionPercent: Number(event.target.value) })} step="0.01" type="number" value={form.retentionPercent} /></label>
            <label className="field"><span>Начало</span><input onChange={(event) => setForm({ ...form, startsAt: event.target.value })} type="date" value={form.startsAt} /></label>
            <label className="field"><span>Окончание</span><input onChange={(event) => setForm({ ...form, endsAt: event.target.value })} type="date" value={form.endsAt} /></label>
            <label className="field"><span>Источник закупки</span><select onChange={(event) => fillProcurementRequest(event.target.value)} value={form.sourceProcurementRequestId}><option value="">Без заявки</option>{props.procurementRequests.map((request) => <option key={request.id} value={request.id}>{request.title}</option>)}</select></label>
            <label className="field"><span>Документ</span><select onChange={(event) => setForm({ ...form, linkedDocumentId: event.target.value })} value={form.linkedDocumentId}><option value="">Без документа</option>{props.documents.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.version}</option>)}</select></label>
            <label className="field field-wide"><span>Условия оплаты</span><textarea onChange={(event) => setForm({ ...form, paymentTerms: event.target.value })} rows={2} value={form.paymentTerms} /></label>
          </div>
          <div className="commitment-lines">
            <div className="commitment-lines-head"><div><strong>Schedule of Values</strong><span>{form.lines.length} поз. · {money(pricedFormValue)}</span></div><button className="button secondary compact-button" onClick={() => setForm({ ...form, lines: [...form.lines, emptyLine()] })} type="button"><Plus size={15} />Строка</button></div>
            {form.lines.map((line, index) => (
              <div className="commitment-line" key={index}>
                <label><span>ВОР</span><select onChange={(event) => { const budget = props.budgetItems.find((item) => item.id === event.target.value); updateLine(index, { budgetItemId: event.target.value, costCodeId: budget?.costCodeId ?? "", code: budget?.code ?? line.code, description: budget?.name ?? line.description, quantity: budget?.qty ?? line.quantity, unit: budget?.unit ?? line.unit, unitPrice: budget?.plannedUnitPrice ?? line.unitPrice }); }} value={line.budgetItemId}><option value="">Без связи</option>{props.budgetItems.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
                <label className="wide"><span>Описание</span><input onChange={(event) => updateLine(index, { description: event.target.value })} required value={line.description} /></label>
                <label><span>Кол-во</span><input min="0.001" onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} step="0.001" type="number" value={line.quantity} /></label>
                <label><span>Ед.</span><input onChange={(event) => updateLine(index, { unit: event.target.value })} value={line.unit} /></label>
                <label><span>Цена</span><input min="0" onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) })} step="0.01" type="number" value={line.unitPrice} /></label>
                <label><span>Сумма СОВ</span><input min="0" onChange={(event) => updateLine(index, { scheduledValue: Number(event.target.value) })} step="0.01" type="number" value={line.scheduledValue} /></label>
                <button aria-label={`Удалить строку ${index + 1}`} className="icon-button danger" disabled={form.lines.length === 1} onClick={() => setForm({ ...form, lines: form.lines.filter((_, lineIndex) => lineIndex !== index) })} type="button"><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <div className="commitment-form-actions"><button className="button primary" disabled={loading === "form"} type="submit"><ShieldCheck size={16} />{editingId ? "Сохранить" : "Создать черновик"}</button><button className="button secondary" onClick={() => { setFormOpen(false); setEditingId(""); setForm(emptyForm()); }} type="button"><XCircle size={16} />Отмена</button></div>
        </form>
      ) : null}

      {loading === "load" ? <div className="empty-state">Загрузка договорного реестра...</div> : items.length ? (
        <div className="commitment-register">
          {items.map((item) => {
            const draft = applicationDraft(item);
            const availableChanges = changeOrders.filter((changeOrder) => !changeOrder.commitmentId || changeOrder.commitmentId === item.id);
            const paidPayments = props.payments.filter((payment) => payment.status === "paid" && payment.direction === (item.type === "owner_contract" ? "incoming" : "outgoing"));
            return (
              <article className={`commitment-card status-${item.status}`} key={item.id}>
                <header><div><span>{item.number} · {typeLabels[item.type]}</span><strong>{item.title}</strong><small>{item.counterparty}{item.externalNumber ? ` · ${item.externalNumber}` : ""}</small></div><span className={`badge ${item.status === "active" || item.status === "completed" ? "green" : item.status === "submitted" || item.status === "revision_required" ? "yellow" : item.status === "terminated" || item.status === "rejected" || item.status === "void" ? "red" : "blue"}`}>{statusLabels[item.status]}</span></header>
                <div className="commitment-values"><span>Исходная цена<strong>{money(item.values.original)}</strong></span><span>Изменения<strong>{money(item.values.approvedChanges)}</strong></span><span>Пересмотрено<strong>{money(item.values.revised)}</strong></span><span>Остаток<strong>{money(item.values.remaining)}</strong></span></div>
                <div className="commitment-progress"><div style={{ width: `${Math.min(100, item.values.revised ? item.values.approvedApplications / item.values.revised * 100 : 0)}%` }} /></div>
                <div className="commitment-meta">
                  <span><Banknote size={14} />К оплате {money(item.values.approvedApplications)} · оплачено {money(item.values.paid)}</span>
                  <span>Удержание {item.retentionPercent}% · {money(item.values.retentionHeld)}</span>
                  {item.linkedDocument ? <span><FileText size={14} />{item.linkedDocument.title} · v{item.linkedDocumentVersion}</span> : null}
                  {item.sourceProcurementRequest ? <span><Link2 size={14} />{item.sourceProcurementRequest.title}</span> : null}
                  {item.approvalWorkflowRun ? <button onClick={() => props.onNavigate("Процессы")} type="button"><GitBranch size={14} />{item.approvalWorkflowRun.title}: {item.approvalWorkflowRun.status}</button> : null}
                </div>

                <details className="commitment-sov"><summary>СОВ: {item.lines.length} позиций</summary><div>{item.lines.map((line) => <div key={line.id}><span>{line.code || String(line.sequence).padStart(2, "0")}</span><strong>{line.description}</strong><small>{line.quantity.toLocaleString("ru-RU")} {line.unit} × {money(line.unitPrice)}</small><b>{money(line.scheduledValue)}</b></div>)}</div></details>

                <div className="commitment-relations">
                  <select aria-label={`Изменение для ${item.number}`} onChange={(event) => setChangeOrderDrafts({ ...changeOrderDrafts, [item.id]: event.target.value })} value={changeOrderDrafts[item.id] ?? ""}><option value="">Выбрать согласованное изменение</option>{availableChanges.map((changeOrder) => <option key={changeOrder.id} value={changeOrder.id}>{changeOrder.number} · {changeOrder.title}</option>)}</select>
                  <button className="button secondary compact-button" disabled={!props.canApprove || !changeOrderDrafts[item.id]} onClick={() => void commitmentAction(item, "link_change_order", { changeOrderId: changeOrderDrafts[item.id] ?? "" })} type="button"><Link2 size={15} />Связать</button>
                  {item.changeOrders.map((changeOrder) => <button className="link-button" key={changeOrder.id} onClick={() => void commitmentAction(item, "unlink_change_order", { changeOrderId: changeOrder.id })} type="button"><Unlink size={14} />{changeOrder.number}</button>)}
                </div>

                {["submitted", "approved", "active", "rejected"].includes(item.status) ? <textarea aria-label={`Комментарий решения ${item.number}`} onChange={(event) => setComments({ ...comments, [item.id]: event.target.value })} placeholder="Комментарий решения" value={comments[item.id] ?? ""} /> : null}
                <div className="commitment-controls">
                  {["draft", "revision_required"].includes(item.status) && props.canEdit ? <button className="button secondary compact-button" onClick={() => edit(item)} type="button"><Pencil size={15} />Изменить</button> : null}
                  {["draft", "revision_required"].includes(item.status) && props.canEdit ? <><select aria-label={`Процесс ${item.number}`} onChange={(event) => setWorkflowTemplates({ ...workflowTemplates, [item.id]: event.target.value })} value={workflowTemplates[item.id] ?? ""}><option value="">Без отдельного процесса</option>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select><button className="button primary compact-button" onClick={() => void commitmentAction(item, "submit")} type="button"><Send size={15} />На согласование</button></> : null}
                  {item.status === "submitted" && props.canApprove && !item.approvalWorkflowRun ? <><button className="button secondary compact-button" onClick={() => void commitmentAction(item, "request_revision")} type="button"><RefreshCw size={15} />Доработать</button><button className="button primary compact-button" onClick={() => void commitmentAction(item, "approve")} type="button"><CheckCircle2 size={15} />Согласовать</button><button className="button secondary compact-button danger" onClick={() => void commitmentAction(item, "reject")} type="button"><XCircle size={15} />Отклонить</button></> : null}
                  {item.status === "submitted" && item.approvalWorkflowRun?.status === "approved" && props.canApprove ? <button className="button primary compact-button" onClick={() => void commitmentAction(item, "approve")} type="button"><CheckCircle2 size={15} />Подтвердить workflow</button> : null}
                  {item.status === "submitted" && item.approvalWorkflowRun?.status === "rejected" && props.canApprove ? <button className="button secondary compact-button danger" onClick={() => void commitmentAction(item, "reject")} type="button"><XCircle size={15} />Зафиксировать отказ</button> : null}
                  {item.status === "approved" && props.canApprove ? <button className="button primary compact-button" onClick={() => void commitmentAction(item, "activate")} type="button"><ShieldCheck size={15} />Активировать</button> : null}
                  {item.status === "active" && props.canApprove ? <button className="button secondary compact-button" onClick={() => void commitmentAction(item, "complete")} type="button"><CheckCircle2 size={15} />Завершить</button> : null}
                  {item.status === "draft" && props.canApprove ? <button aria-label={`Удалить ${item.number}`} className="icon-button danger" onClick={() => void remove(item)} type="button"><Trash2 size={16} /></button> : null}
                  {["approved", "active"].includes(item.status) && props.canApprove ? <button className="button secondary compact-button danger" onClick={() => void commitmentAction(item, "terminate")} type="button"><XCircle size={15} />Расторгнуть</button> : null}
                  {!["active", "completed", "terminated", "void"].includes(item.status) && props.canApprove ? <button className="button secondary compact-button danger" onClick={() => void commitmentAction(item, "void")} type="button"><XCircle size={15} />Аннулировать</button> : null}
                </div>

                {["approved", "active"].includes(item.status) && props.canEdit ? (
                  <details className="payment-application-form">
                    <summary><Plus size={15} />Новая заявка на оплату</summary>
                    <div className="payment-application-period"><label className="field"><span>Период с</span><input onChange={(event) => updateApplicationDraft(item, { periodStart: event.target.value })} type="date" value={draft.periodStart} /></label><label className="field"><span>по</span><input onChange={(event) => updateApplicationDraft(item, { periodEnd: event.target.value })} type="date" value={draft.periodEnd} /></label><label className="field"><span>Комментарий</span><input onChange={(event) => updateApplicationDraft(item, { notes: event.target.value })} value={draft.notes} /></label></div>
                    <div className="payment-application-lines">{item.lines.map((line, lineIndex) => { const applicationLine = draft.lines.find((candidate) => candidate.commitmentLineId === line.id) ?? { commitmentLineId: line.id, currentAmount: 0, materialsStored: 0 }; return <div key={line.id}><span>{line.description}</span><label><small>Работы</small><input min="0" onChange={(event) => updateApplicationDraft(item, { lines: draft.lines.map((candidate, index) => index === lineIndex ? { ...candidate, currentAmount: Number(event.target.value) } : candidate) })} step="0.01" type="number" value={applicationLine.currentAmount} /></label><label><small>Материалы на площадке</small><input min="0" onChange={(event) => updateApplicationDraft(item, { lines: draft.lines.map((candidate, index) => index === lineIndex ? { ...candidate, materialsStored: Number(event.target.value) } : candidate) })} step="0.01" type="number" value={applicationLine.materialsStored} /></label><b>{money(line.scheduledValue)}</b></div>; })}</div>
                    <button className="button primary compact-button" disabled={loading === `app-${item.id}`} onClick={() => void createApplication(item)} type="button"><Plus size={15} />Создать черновик</button>
                  </details>
                ) : null}

                {item.paymentApplications.length ? (
                  <div className="payment-application-register">
                    <h4>Заявки на оплату</h4>
                    {item.paymentApplications.map((application) => (
                      <div className={`payment-application-row status-${application.status}`} key={application.id}>
                        <div><strong>{application.number}</strong><span>{new Date(application.periodStart).toLocaleDateString("ru-RU")} — {new Date(application.periodEnd).toLocaleDateString("ru-RU")}</span></div>
                        <span className="payment-application-amount">{money(application.netAmount)}<small>удержание {money(application.retentionAmount)}</small></span>
                        <span className={`badge ${application.status === "paid" ? "green" : application.status === "submitted" ? "yellow" : application.status === "rejected" || application.status === "void" ? "red" : "blue"}`}>{applicationStatusLabels[application.status]}</span>
                        <div className="payment-application-controls">
                          {application.status === "draft" && props.canEdit ? <><button className="button primary compact-button" onClick={() => void applicationAction(item, application, "submit")} type="button"><Send size={14} />Отправить</button><button aria-label={`Удалить ${application.number}`} className="icon-button danger" onClick={() => void removeApplication(item, application)} type="button"><Trash2 size={15} /></button></> : null}
                          {["submitted", "approved", "rejected"].includes(application.status) && props.canApprove ? <input aria-label={`Комментарий решения ${application.number}`} onChange={(event) => setComments({ ...comments, [application.id]: event.target.value })} placeholder="Комментарий решения" value={comments[application.id] ?? ""} /> : null}
                          {application.status === "submitted" && props.canApprove ? (
                            <>
                              <button className="button primary compact-button" onClick={() => void applicationAction(item, application, "approve")} type="button"><CheckCircle2 size={14} />Согласовать</button>
                              <button className="button secondary compact-button danger" disabled={!comments[application.id]?.trim()} onClick={() => void applicationAction(item, application, "reject")} type="button"><XCircle size={14} />Отклонить</button>
                            </>
                          ) : null}
                          {application.status === "approved" && props.canApprove ? (
                            <>
                              <select aria-label={`Платеж для ${application.number}`} onChange={(event) => setPaymentDrafts({ ...paymentDrafts, [application.id]: event.target.value })} value={paymentDrafts[application.id] ?? ""}><option value="">Оплаченный платеж</option>{paidPayments.map((payment) => <option key={payment.id} value={payment.id}>{payment.title} · {money(payment.amount)}</option>)}</select>
                              <button className="button primary compact-button" disabled={!paymentDrafts[application.id]} onClick={() => void applicationAction(item, application, "mark_paid")} type="button"><Banknote size={14} />Оплачено</button>
                            </>
                          ) : null}
                          {["approved", "rejected"].includes(application.status) && props.canApprove ? <button className="button secondary compact-button danger" disabled={!comments[application.id]?.trim()} onClick={() => void applicationAction(item, application, "void")} type="button"><XCircle size={14} />Аннулировать</button> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : <div className="empty-state">Реестр пуст. Создайте договор с заказчиком, субподряд, заказ поставщику или услугу.</div>}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}
