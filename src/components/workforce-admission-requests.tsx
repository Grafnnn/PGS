"use client";

import { CheckCircle2, ClipboardCheck, Plus, ShieldCheck, Trash2, UserPlus, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type { Project, WorkforceAdmissionRequest } from "@/lib/types";

type MemberDraft = {
  id: string;
  fullName: string;
  profession: string;
  kind: "worker" | "engineer";
  birthDate: string;
  citizenship: string;
  documentType: string;
  documentLast4: string;
};

type RequestDraft = {
  requestNumber: string;
  title: string;
  contractor: string;
  objectName: string;
  validFrom: string;
  validUntil: string;
  workScope: string;
  employmentType: "staff" | "hired" | "subcontract";
  sourceFileName: string;
  notes: string;
  members: MemberDraft[];
};

type Props = {
  projectId: string;
  project: Partial<Project>;
  onResourcesChanged: () => Promise<void> | void;
};

function localDate(value?: string) {
  return value?.slice(0, 10) ?? new Date().toISOString().slice(0, 10);
}

function newMember(): MemberDraft {
  return {
    id: crypto.randomUUID(),
    fullName: "",
    profession: "Кровельщик",
    kind: "worker",
    birthDate: "",
    citizenship: "",
    documentType: "",
    documentLast4: ""
  };
}

function requestNumber() {
  const now = new Date();
  return `ЗД-${now.toISOString().slice(0, 10).replaceAll("-", "")}-${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
}

function emptyRequest(project: Partial<Project>): RequestDraft {
  return {
    requestNumber: requestNumber(),
    title: "Заявка на допуск работников",
    contractor: "",
    objectName: project.object || project.name || "",
    validFrom: localDate(project.startsAt),
    validUntil: localDate(project.endsAt),
    workScope: "",
    employmentType: "subcontract",
    sourceFileName: "",
    notes: "",
    members: [newMember()]
  };
}

function statusLabel(value: WorkforceAdmissionRequest["status"]) {
  if (value === "approved") return "Согласована";
  if (value === "rejected") return "Отклонена";
  return "Черновик";
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для заявок на персонал.";
  return body.error ?? fallback;
}

export function WorkforceAdmissionRequests({ projectId, project, onResourcesChanged }: Props) {
  const [items, setItems] = useState<WorkforceAdmissionRequest[]>([]);
  const [form, setForm] = useState<RequestDraft>(() => emptyRequest(project));
  const [formOpen, setFormOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pastedNames, setPastedNames] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const validMembers = useMemo(() => form.members.filter((member) => member.fullName.trim().length >= 3 && member.profession.trim().length >= 2), [form.members]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/workforce-admission-requests`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить заявки на персонал."));
      const body = (await response.json()) as { items?: WorkforceAdmissionRequest[] };
      setItems(body.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить заявки на персонал.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  function updateMember(id: string, patch: Partial<MemberDraft>) {
    setForm((current) => ({
      ...current,
      members: current.members.map((member) => member.id === id ? { ...member, ...patch } : member)
    }));
  }

  function addPastedNames() {
    const names = pastedNames
      .split(/\r?\n/)
      .map((line) => line.replace(/^\s*\d+[.)]?\s*/, "").trim())
      .filter((line) => line.length >= 3)
      .slice(0, 200);
    if (!names.length) return;
    setForm((current) => ({
      ...current,
      members: [
        ...current.members.filter((member) => member.fullName.trim()),
        ...names.map((fullName) => ({ ...newMember(), fullName }))
      ]
    }));
    setPastedNames("");
    setPasteOpen(false);
  }

  async function saveDraft(event: React.FormEvent) {
    event.preventDefault();
    setBusy("create");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/workforce-admission-requests`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...form,
          validUntil: form.validUntil || null,
          sourceFileName: form.sourceFileName || null,
          notes: form.notes || null,
          members: validMembers.map(({ id: _id, ...member }) => ({
            ...member,
            birthDate: member.birthDate || null,
            citizenship: member.citizenship || null,
            documentType: member.documentType || null,
            documentLast4: member.documentLast4 || null
          }))
        })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить заявку."));
      setNotice(`Заявка ${form.requestNumber} сохранена. Сотрудники появятся в Плане дня после согласования.`);
      setForm(emptyRequest(project));
      setFormOpen(false);
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить заявку.");
    } finally {
      setBusy("");
    }
  }

  async function approve(item: WorkforceAdmissionRequest) {
    if (!window.confirm(`Согласовать заявку ${item.requestNumber} и добавить ${item.members.length} чел. в состав проекта?`)) return;
    setBusy(item.id);
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/workforce-admission-requests/${item.id}/approve`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось согласовать заявку."));
      const body = (await response.json()) as { result?: { created?: number; assigned?: number; reused?: number } };
      setNotice(`Заявка согласована: создано ${body.result?.created ?? 0}, назначено ${body.result?.assigned ?? 0}, найдено в реестре ${body.result?.reused ?? 0}.`);
      await Promise.all([load(), onResourcesChanged()]);
    } catch (approveError) {
      setError(approveError instanceof Error ? approveError.message : "Не удалось согласовать заявку.");
    } finally {
      setBusy("");
    }
  }

  async function remove(item: WorkforceAdmissionRequest) {
    if (!window.confirm(`Удалить черновик заявки ${item.requestNumber}?`)) return;
    setBusy(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/workforce-admission-requests/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить черновик."));
      await load();
    } catch (removeError) {
      setError(removeError instanceof Error ? removeError.message : "Не удалось удалить черновик.");
    } finally {
      setBusy("");
    }
  }

  return (
    <section className="workforce-admission-workspace" aria-label="Заявки на допуск сотрудников">
      <div className="reports-workflow-heading compact">
        <div>
          <div className="eyebrow">Personnel admission</div>
          <h3>Заявки на допуск сотрудников</h3>
          <p className="muted">Сначала сохраните состав заявки, затем согласуйте его. Только после согласования люди попадут в штат проекта и поле «Кто работает».</p>
        </div>
        <button className="button primary compact-button" type="button" onClick={() => { setForm(emptyRequest(project)); setFormOpen(true); setError(""); setNotice(""); }}><UserPlus size={16} /> Новая заявка</button>
      </div>

      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {notice ? <div className="alert success" role="status"><CheckCircle2 size={17} />{notice}</div> : null}

      {formOpen ? (
        <form className="workforce-admission-form" onSubmit={saveDraft}>
          <div className="reports-workflow-heading compact">
            <div><strong>Новая заявка</strong><span>Документные реквизиты сохраняются только в маскированном виде.</span></div>
            <button className="icon-button" title="Закрыть" type="button" onClick={() => setFormOpen(false)}><X size={18} /></button>
          </div>
          <div className="workforce-admission-meta">
            <label className="field"><span>Номер заявки</span><input required value={form.requestNumber} onChange={(event) => setForm({ ...form, requestNumber: event.target.value })} /></label>
            <label className="field field-wide"><span>Название</span><input required value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} /></label>
            <label className="field field-wide"><span>Подрядчик / работодатель</span><input required value={form.contractor} onChange={(event) => setForm({ ...form, contractor: event.target.value })} /></label>
            <label className="field field-wide"><span>Объект</span><input required value={form.objectName} onChange={(event) => setForm({ ...form, objectName: event.target.value })} /></label>
            <label className="field"><span>Допуск с</span><input required type="date" value={form.validFrom} onChange={(event) => setForm({ ...form, validFrom: event.target.value })} /></label>
            <label className="field"><span>Допуск до</span><input type="date" value={form.validUntil} onChange={(event) => setForm({ ...form, validUntil: event.target.value })} /></label>
            <label className="field"><span>Тип привлечения</span><select value={form.employmentType} onChange={(event) => setForm({ ...form, employmentType: event.target.value as RequestDraft["employmentType"] })}><option value="subcontract">Субподряд</option><option value="hired">Привлечённые</option><option value="staff">Штат</option></select></label>
            <label className="field field-wide"><span>Вид работ</span><input required value={form.workScope} onChange={(event) => setForm({ ...form, workScope: event.target.value })} placeholder="Например: устройство кровли" /></label>
            <label className="field field-wide"><span>Основание / имя файла</span><input value={form.sourceFileName} onChange={(event) => setForm({ ...form, sourceFileName: event.target.value })} placeholder="Например: Заявка на допуск.docx" /></label>
            <label className="field field-wide"><span>Примечание</span><input value={form.notes} onChange={(event) => setForm({ ...form, notes: event.target.value })} /></label>
          </div>

          <div className="workforce-admission-members-heading">
            <div><strong>Состав заявки</strong><span>{validMembers.length} заполнено · максимум 200</span></div>
            <div>
              <button className="button secondary compact-button" type="button" onClick={() => setPasteOpen((current) => !current)}><ClipboardCheck size={15} /> Вставить список</button>
              <button className="button secondary compact-button" type="button" onClick={() => setForm((current) => ({ ...current, members: [...current.members, newMember()] }))}><Plus size={15} /> Строка</button>
            </div>
          </div>
          {pasteOpen ? <div className="workforce-admission-paste"><label className="field field-wide"><span>ФИО, по одному на строку</span><textarea rows={5} value={pastedNames} onChange={(event) => setPastedNames(event.target.value)} /></label><button className="button secondary" disabled={!pastedNames.trim()} type="button" onClick={addPastedNames}>Добавить в заявку</button></div> : null}

          <div className="workforce-admission-members" role="table" aria-label="Сотрудники в заявке">
            <div className="workforce-admission-member head" role="row"><span>ФИО / профессия</span><span>Категория</span><span>Дата рождения</span><span>Гражданство</span><span>Документ</span><span /></div>
            {form.members.map((member) => (
              <div className="workforce-admission-member" key={member.id} role="row">
                <span><input aria-label="ФИО" required value={member.fullName} onChange={(event) => updateMember(member.id, { fullName: event.target.value })} placeholder="Фамилия Имя Отчество" /><input aria-label="Профессия" required value={member.profession} onChange={(event) => updateMember(member.id, { profession: event.target.value })} placeholder="Профессия" /></span>
                <select aria-label="Категория" value={member.kind} onChange={(event) => updateMember(member.id, { kind: event.target.value as MemberDraft["kind"] })}><option value="worker">Рабочий</option><option value="engineer">ИТР</option></select>
                <input aria-label="Дата рождения" type="date" value={member.birthDate} onChange={(event) => updateMember(member.id, { birthDate: event.target.value })} />
                <input aria-label="Гражданство" value={member.citizenship} onChange={(event) => updateMember(member.id, { citizenship: event.target.value })} placeholder="Не указано" />
                <span><input aria-label="Тип документа" value={member.documentType} onChange={(event) => updateMember(member.id, { documentType: event.target.value })} placeholder="Тип" /><input aria-label="Последние 4 символа документа" maxLength={4} value={member.documentLast4} onChange={(event) => updateMember(member.id, { documentLast4: event.target.value.toUpperCase().replace(/[^A-Z0-9]/g, "") })} placeholder="••••" /></span>
                <button className="icon-button danger" disabled={form.members.length === 1} title="Удалить строку" type="button" onClick={() => setForm((current) => ({ ...current, members: current.members.filter((item) => item.id !== member.id) }))}><Trash2 size={15} /></button>
              </div>
            ))}
          </div>
          <p className="form-hint">Полные серии и номера паспортов, патентов и виз в PGS не сохраняются. Для сверки используйте исходную заявку в защищённом документообороте.</p>
          <div className="form-actions">
            <button className="button primary" disabled={busy === "create" || !validMembers.length} type="submit">{busy === "create" ? "Сохраняю..." : `Сохранить заявку (${validMembers.length})`}</button>
            <button className="button secondary" type="button" onClick={() => setFormOpen(false)}>Отмена</button>
          </div>
        </form>
      ) : null}

      {loading ? <div className="empty-state">Загрузка заявок...</div> : items.length ? (
        <div className="workforce-admission-list">
          {items.map((item) => (
            <details className="workforce-admission-request" key={item.id}>
              <summary>
                <span><ClipboardCheck size={17} /><strong>{item.requestNumber}</strong><small>{item.contractor} · {item.workScope}</small></span>
                <span><strong>{item.members.length} чел.</strong><small>{new Date(item.validFrom).toLocaleDateString("ru-RU")} – {item.validUntil ? new Date(item.validUntil).toLocaleDateString("ru-RU") : "без срока"}</small></span>
                <span className={`badge ${item.status === "approved" ? "green" : item.status === "rejected" ? "red" : "yellow"}`}>{statusLabel(item.status)}</span>
              </summary>
              <div className="workforce-admission-request-body">
                <div className="workforce-admission-request-meta"><span>Объект <strong>{item.objectName}</strong></span><span>Основание <strong>{item.sourceFileName || "не указано"}</strong></span><span>Тип <strong>{item.employmentType === "subcontract" ? "Субподряд" : item.employmentType === "hired" ? "Привлечённые" : "Штат"}</strong></span></div>
                <div className="workforce-admission-approved-members">
                  {item.members.map((member) => <span key={member.id}><strong>{member.fullName}</strong><small>{member.profession} · {member.citizenship || "гражданство не указано"}{member.documentLast4 ? ` · документ ••••${member.documentLast4}` : ""}</small></span>)}
                </div>
                {item.status === "draft" ? <div className="form-actions"><button className="button primary" disabled={busy === item.id} type="button" onClick={() => void approve(item)}><ShieldCheck size={16} />{busy === item.id ? "Согласовываю..." : "Согласовать и завести"}</button><button className="button secondary" disabled={busy === item.id} type="button" onClick={() => void remove(item)}><Trash2 size={15} /> Удалить черновик</button></div> : <p className="form-hint">Сотрудники назначены на проект и доступны в «Плане дня» → «Кто работает».</p>}
              </div>
            </details>
          ))}
        </div>
      ) : <div className="empty-state">Заявок пока нет. Создайте первую заявку и согласуйте состав проекта.</div>}
    </section>
  );
}
