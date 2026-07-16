"use client";

import { AlertTriangle, CheckCircle2, FileText, GitBranch, Pencil, Plus, RotateCcw, Send, Trash2, XCircle } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { buildChangeOrdersIntelligence } from "@/lib/change-orders-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectChangeOrder, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type Props = {
  projectId: string; project: Partial<Project>; budgetItems: BudgetItem[]; scheduleItems: ScheduleItem[]; materials: Material[];
  procurementRequests: ProcurementRequest[]; payments: Payment[]; risks: Risk[]; documents: ProjectDocument[];
  canEdit: boolean; canApprove: boolean; onNavigate: (tab: string) => void;
};
type Summary = { total: number; active: number; submitted: number; approved: number; committed: number; overdue: number };
type LineDraft = { budgetItemId: string; code: string; description: string; quantity: number; unit: string; estimatedUnitPrice: number; proposedUnitPrice: number; submittedUnitPrice: number };
type FormState = { kind: ProjectChangeOrder["kind"]; scope: ProjectChangeOrder["scope"]; title: string; description: string; reason: string; sourceType: string; sourceRef: string; counterparty: string; scheduleImpactDays: number; linkedDocumentId: string; dueAt: string; items: LineDraft[] };
const emptyLine = (): LineDraft => ({ budgetItemId: "", code: "", description: "", quantity: 1, unit: "компл.", estimatedUnitPrice: 0, proposedUnitPrice: 0, submittedUnitPrice: 0 });
const emptyForm = (): FormState => ({ kind: "potential", scope: "out_of_scope", title: "", description: "", reason: "", sourceType: "manual", sourceRef: "", counterparty: "", scheduleImpactDays: 0, linkedDocumentId: "", dueAt: "", items: [emptyLine()] });
const statusLabels: Record<ProjectChangeOrder["status"], string> = { draft: "Черновик", open: "Открыто", submitted: "На согласовании", revision_required: "На доработке", approved: "Согласовано", executed: "Исполнено", rejected: "Отклонено", void: "Аннулировано" };
const kindLabels = { potential: "Потенциальное изменение", request: "Запрос на изменение", owner: "Изменение заказчика", subcontract: "Изменение подрядчика", directive: "Директива" };
const scopeLabels = { in_scope: "В пределах договора", budget_only: "Только бюджет", out_of_scope: "Вне исходного объема", contingency: "За счет резерва" };
function money(value: number) { return `${Math.round(value).toLocaleString("ru-RU")} ₽`; }

export function ChangeOrderManagementWorkspace(props: Props) {
  const intelligence = useMemo(() => buildChangeOrdersIntelligence(props), [props]);
  const [items, setItems] = useState<ProjectChangeOrder[]>([]);
  const [summary, setSummary] = useState<Summary>({ total: 0, active: 0, submitted: 0, approved: 0, committed: 0, overdue: 0 });
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState("");
  const [comments, setComments] = useState<Record<string, string>>({});
  const [workflowTemplates, setWorkflowTemplates] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [ordersResponse, templatesResponse] = await Promise.all([fetch(`/api/projects/${props.projectId}/change-orders`), fetch(`/api/projects/${props.projectId}/workflow-templates`)]);
      const orders = await ordersResponse.json() as { items?: ProjectChangeOrder[]; summary?: Summary; error?: string };
      if (!ordersResponse.ok) throw new Error(orders.error ?? "Не удалось загрузить реестр изменений.");
      setItems(orders.items ?? []); if (orders.summary) setSummary(orders.summary);
      if (templatesResponse.ok) { const payload = await templatesResponse.json() as { templates?: Array<{ id: string; name: string; status: string }> }; setTemplates((payload.templates ?? []).filter((template) => template.status === "active")); }
      setError("");
    } catch (loadError) { setError(loadError instanceof Error ? loadError.message : "Ошибка загрузки изменений."); }
    finally { setLoading(false); }
  }, [props.projectId]);
  useEffect(() => void load(), [load]);

  function updateLine(index: number, patch: Partial<LineDraft>) { setForm((current) => ({ ...current, items: current.items.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line) })); }
  function fillCandidate(candidate: (typeof intelligence.candidates)[number]) {
    setEditingId("");
    setForm({ ...emptyForm(), title: candidate.title, reason: candidate.rationale, sourceType: candidate.source, sourceRef: candidate.id, scheduleImpactDays: candidate.estimatedDelayDays, items: [{ ...emptyLine(), description: candidate.title, estimatedUnitPrice: candidate.estimatedAmount, proposedUnitPrice: candidate.estimatedAmount, submittedUnitPrice: candidate.estimatedAmount }] });
  }
  function edit(item: ProjectChangeOrder) {
    setEditingId(item.id);
    setForm({ kind: item.kind, scope: item.scope, title: item.title, description: item.description ?? "", reason: item.reason ?? "", sourceType: item.sourceType ?? "manual", sourceRef: item.sourceRef ?? "", counterparty: item.counterparty ?? "", scheduleImpactDays: item.scheduleImpactDays, linkedDocumentId: item.linkedDocumentId ?? "", dueAt: item.dueAt?.slice(0, 10) ?? "", items: item.items.map((line) => ({ budgetItemId: line.budgetItemId ?? "", code: line.code ?? "", description: line.description, quantity: line.quantity, unit: line.unit, estimatedUnitPrice: line.estimatedUnitPrice, proposedUnitPrice: line.proposedUnitPrice, submittedUnitPrice: line.submittedUnitPrice })) });
  }
  async function save(event: React.FormEvent) {
    event.preventDefault(); setSaving("form");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/change-orders${editingId ? `/${editingId}` : ""}`, { method: editingId ? "PATCH" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...form, dueAt: form.dueAt ? new Date(`${form.dueAt}T12:00:00`).toISOString() : "" }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Не удалось сохранить изменение.");
      setEditingId(""); setForm(emptyForm()); await load();
    } catch (saveError) { setError(saveError instanceof Error ? saveError.message : "Ошибка сохранения изменения."); }
    finally { setSaving(""); }
  }
  async function action(item: ProjectChangeOrder, actionName: string) {
    if (["execute", "void"].includes(actionName) && !window.confirm(actionName === "execute" ? `Зафиксировать исполнение ${item.number}? Это не изменит ВОР автоматически.` : `Аннулировать ${item.number}?`)) return;
    setSaving(item.id);
    try {
      const response = await fetch(`/api/projects/${props.projectId}/change-orders/${item.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: actionName, comment: comments[item.id] ?? "", workflowTemplateId: workflowTemplates[item.id] ?? "" }) });
      const data = await response.json() as { error?: string }; if (!response.ok) throw new Error(data.error ?? "Не удалось изменить статус.");
      await load();
    } catch (actionError) { setError(actionError instanceof Error ? actionError.message : "Ошибка изменения статуса."); }
    finally { setSaving(""); }
  }
  async function remove(item: ProjectChangeOrder) {
    if (!window.confirm(`Удалить черновик ${item.number}?`)) return; setSaving(item.id);
    try { const response = await fetch(`/api/projects/${props.projectId}/change-orders/${item.id}`, { method: "DELETE" }); if (!response.ok) throw new Error("Не удалось удалить черновик."); await load(); }
    catch (deleteError) { setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления."); } finally { setSaving(""); }
  }

  return <section className="change-management" aria-label="Change Order Management">
    <header className="change-management-header"><div><div className="eyebrow">Change Order Management v2</div><h3>Изменения, допработы и договорная цена</h3><p>От кандидата до исполнения: стоимость, доказательства, согласование и audit trail. Утверждение не переписывает ВОР или cashflow автоматически.</p></div><button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Процессы")}><GitBranch size={16}/>Матрица согласования</button></header>
    <div className="change-management-metrics"><Metric title="Активно" value={String(summary.active)} detail={`${summary.overdue} просрочено`} /><Metric title="На согласовании" value={money(summary.submitted)} detail="submitted value" /><Metric title="Согласовано" value={money(summary.approved)} detail="approved value" /><Metric title="Исполнено" value={money(summary.committed)} detail="без silent writes" /></div>
    {intelligence.candidates.length > 0 && <section className="change-candidates"><div className="section-title"><AlertTriangle size={18}/><h4>Кандидаты из данных проекта</h4></div><div className="change-candidate-list">{intelligence.candidates.slice(0, 5).map((candidate) => <button key={candidate.id} type="button" onClick={() => fillCandidate(candidate)}><span>{candidate.source}</span><strong>{candidate.title}</strong><small>{money(candidate.estimatedAmount)} · {candidate.estimatedDelayDays} дн.</small></button>)}</div></section>}
    {props.canEdit && <form className="change-order-form" onSubmit={save}><div className="section-title"><Plus size={18}/><h4>{editingId ? "Редактирование изменения" : "Новый черновик"}</h4></div><div className="change-order-form-grid">
      <label className="field field-wide"><span>Название</span><input required minLength={3} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })}/></label>
      <label className="field"><span>Тип</span><select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value as FormState["kind"] })}>{Object.entries(kindLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Scope</span><select value={form.scope} onChange={(event) => setForm({ ...form, scope: event.target.value as FormState["scope"] })}>{Object.entries(scopeLabels).map(([value,label]) => <option value={value} key={value}>{label}</option>)}</select></label>
      <label className="field"><span>Источник</span><input value={form.sourceType} onChange={(event) => setForm({ ...form, sourceType: event.target.value })}/></label><label className="field"><span>Ссылка источника</span><input value={form.sourceRef} onChange={(event) => setForm({ ...form, sourceRef: event.target.value })}/></label>
      <label className="field"><span>Контрагент</span><input value={form.counterparty} onChange={(event) => setForm({ ...form, counterparty: event.target.value })}/></label><label className="field"><span>Влияние на срок, дней</span><input min="0" type="number" value={form.scheduleImpactDays} onChange={(event) => setForm({ ...form, scheduleImpactDays: Number(event.target.value) })}/></label>
      <label className="field"><span>Доказательство</span><select value={form.linkedDocumentId} onChange={(event) => setForm({ ...form, linkedDocumentId: event.target.value })}><option value="">Без документа</option>{props.documents.map((doc) => <option value={doc.id} key={doc.id}>{doc.title} · v{doc.version}</option>)}</select></label><label className="field"><span>Срок решения</span><input type="date" value={form.dueAt} onChange={(event) => setForm({ ...form, dueAt: event.target.value })}/></label>
      <label className="field field-wide"><span>Основание</span><textarea rows={2} value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })}/></label><label className="field field-wide"><span>Описание изменения</span><textarea rows={2} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></label>
    </div><div className="change-order-lines"><div className="change-order-lines-head"><strong>Стоимостные позиции</strong><button className="button secondary compact-button" type="button" onClick={() => setForm({ ...form, items: [...form.items, emptyLine()] })}><Plus size={15}/>Позиция</button></div>{form.items.map((line,index) => <div className="change-order-line" key={index}><label><span>ВОР</span><select value={line.budgetItemId} onChange={(event) => { const budget = props.budgetItems.find((item) => item.id === event.target.value); updateLine(index,{budgetItemId:event.target.value,code:budget?.code ?? line.code,description:budget?.name ?? line.description,unit:budget?.unit ?? line.unit}); }}><option value="">Без связи</option>{props.budgetItems.map((item) => <option value={item.id} key={item.id}>{item.code} · {item.name}</option>)}</select></label><label className="wide"><span>Описание</span><input required value={line.description} onChange={(event) => updateLine(index,{description:event.target.value})}/></label><label><span>Кол-во</span><input min="0.001" step="0.001" type="number" value={line.quantity} onChange={(event) => updateLine(index,{quantity:Number(event.target.value)})}/></label><label><span>Ед.</span><input value={line.unit} onChange={(event) => updateLine(index,{unit:event.target.value})}/></label><label><span>Оценка</span><input min="0" type="number" value={line.estimatedUnitPrice} onChange={(event) => updateLine(index,{estimatedUnitPrice:Number(event.target.value)})}/></label><label><span>Предложено</span><input min="0" type="number" value={line.proposedUnitPrice} onChange={(event) => updateLine(index,{proposedUnitPrice:Number(event.target.value)})}/></label><label><span>Подано</span><input min="0" type="number" value={line.submittedUnitPrice} onChange={(event) => updateLine(index,{submittedUnitPrice:Number(event.target.value)})}/></label><button aria-label={`Удалить позицию ${index+1}`} className="icon-button danger" type="button" onClick={() => setForm({ ...form, items: form.items.filter((_,lineIndex) => lineIndex !== index) })}><Trash2 size={15}/></button></div>)}</div>
      <div className="change-order-form-actions"><button className="button primary" disabled={saving === "form"} type="submit"><Plus size={16}/>{editingId ? "Сохранить" : "Создать черновик"}</button>{editingId && <button className="button secondary" type="button" onClick={() => {setEditingId("");setForm(emptyForm());}}><XCircle size={16}/>Отмена</button>}</div>
    </form>}
    {error && <div className="error-box">{error}</div>}
    {loading ? <div className="empty-state">Загрузка реестра изменений...</div> : items.length ? <div className="change-order-register">{items.map((item) => <article className={`change-order-card status-${item.status}`} key={item.id}><header><div><span>{item.number} · {kindLabels[item.kind]}</span><strong>{item.title}</strong><small>{scopeLabels[item.scope]}{item.sourceRef ? ` · ${item.sourceRef}` : ""}</small></div><span className={`badge ${item.status === "executed" ? "green" : item.status === "rejected" || item.status === "void" ? "red" : item.status === "submitted" ? "yellow" : "blue"}`}>{statusLabels[item.status]}</span></header><div className="change-order-values"><span>Оценка<strong>{money(item.estimatedAmount)}</strong></span><span>Подано<strong>{money(item.submittedAmount)}</strong></span><span>Согласовано<strong>{money(item.approvedAmount)}</strong></span><span>Обязательство<strong>{money(item.committedAmount)}</strong></span></div><div className="change-order-meta">{item.linkedDocument && <span><FileText size={14}/>{item.linkedDocument.title} · v{item.linkedDocumentVersion}</span>}{item.approvalWorkflowRun && <button type="button" onClick={() => props.onNavigate("Процессы")}><GitBranch size={14}/>{item.approvalWorkflowRun.title}: {item.approvalWorkflowRun.status}</button>}<span>{item.items.length} позиций · {item.scheduleImpactDays} дн.</span></div>{["submitted","approved","rejected"].includes(item.status) && <textarea aria-label={`Комментарий решения ${item.number}`} placeholder="Комментарий для возврата, отклонения или аннулирования" value={comments[item.id] ?? ""} onChange={(event) => setComments({...comments,[item.id]:event.target.value})}/>}<div className="change-order-controls">{["draft","open","revision_required"].includes(item.status) && props.canEdit && <button className="button secondary compact-button" type="button" onClick={() => edit(item)}><Pencil size={15}/>Изменить</button>}{item.status === "draft" && props.canEdit && <button className="button secondary compact-button" disabled={saving===item.id} type="button" onClick={() => action(item,"open")}><CheckCircle2 size={15}/>Открыть</button>}{item.status === "open" && props.canEdit && <><select aria-label={`Процесс согласования ${item.number}`} value={workflowTemplates[item.id] ?? ""} onChange={(event) => setWorkflowTemplates({...workflowTemplates,[item.id]:event.target.value})}><option value="">Без отдельного процесса</option>{templates.map((template) => <option value={template.id} key={template.id}>{template.name}</option>)}</select><button className="button primary compact-button" disabled={saving===item.id} type="button" onClick={() => action(item,"submit")}><Send size={15}/>На согласование</button></>}{item.status === "revision_required" && props.canEdit && <button className="button secondary compact-button" type="button" onClick={() => action(item,"open")}><RotateCcw size={15}/>Вернуть в работу</button>}{item.status === "submitted" && props.canApprove && !item.approvalWorkflowRun && <><button className="button secondary compact-button" type="button" onClick={() => action(item,"request_revision")}><RotateCcw size={15}/>Доработать</button><button className="button primary compact-button" type="button" onClick={() => action(item,"approve")}><CheckCircle2 size={15}/>Согласовать</button><button className="button secondary compact-button danger" type="button" onClick={() => action(item,"reject")}><XCircle size={15}/>Отклонить</button></>}{item.status === "submitted" && props.canApprove && item.approvalWorkflowRun?.status === "approved" && <button className="button primary compact-button" type="button" onClick={() => action(item,"approve")}><CheckCircle2 size={15}/>Подтвердить workflow</button>}{item.status === "submitted" && props.canApprove && item.approvalWorkflowRun?.status === "rejected" && <button className="button secondary compact-button danger" type="button" onClick={() => action(item,"reject")}><XCircle size={15}/>Зафиксировать отклонение</button>}{item.status === "approved" && props.canApprove && <button className="button primary compact-button" type="button" onClick={() => action(item,"execute")}><CheckCircle2 size={15}/>Зафиксировать исполнение</button>}{item.status === "draft" && props.canApprove && <button className="icon-button danger" aria-label={`Удалить ${item.number}`} type="button" onClick={() => remove(item)}><Trash2 size={16}/></button>}{props.canApprove && !["executed","void"].includes(item.status) && <button className="button secondary compact-button danger" type="button" onClick={() => action(item,"void")}><XCircle size={15}/>Аннулировать</button>}</div></article>)}</div> : <div className="empty-state">Реестр пуст. Создайте изменение вручную или из кандидата системы.</div>}
  </section>;
}
function Metric({title,value,detail}:{title:string;value:string;detail:string}) { return <article><small>{title}</small><strong>{value}</strong><span>{detail}</span></article>; }
