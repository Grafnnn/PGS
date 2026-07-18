"use client";

import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  FileText,
  GitBranch,
  ListChecks,
  Plus,
  RefreshCw,
  ShieldAlert,
  ShieldCheck,
  Trash2,
  XCircle
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type {
  DailyReport,
  ProjectCostCode,
  ProjectDocument,
  ProjectQualityInspection,
  ProjectQualityIssue,
  QualityCheckResult,
  ScheduleItem
} from "@/lib/types";

type Props = {
  projectId: string;
  scheduleItems: ScheduleItem[];
  dailyReports: DailyReport[];
  documents: ProjectDocument[];
  canEdit: boolean;
  canApprove: boolean;
  onNavigate: (tab: string) => void;
};

type Summary = {
  inspections: number;
  inspectionsDue: number;
  failedInspections: number;
  openIssues: number;
  criticalIssues: number;
  overdueIssues: number;
  acceptanceBlockers: number;
  costExposure: number;
  scheduleExposureDays: number;
};

type InspectionForm = {
  type: ProjectQualityInspection["type"];
  title: string;
  location: string;
  inspector: string;
  responsibleParty: string;
  scheduledAt: string;
  linkedScheduleItemId: string;
  costCodeId: string;
  linkedDocumentId: string;
  checks: Array<{ title: string; requirement: string }>;
};

type IssueForm = {
  type: ProjectQualityIssue["type"];
  title: string;
  description: string;
  location: string;
  severity: ProjectQualityIssue["severity"];
  responsibleParty: string;
  dueAt: string;
  acceptanceBlocker: boolean;
  costImpact: number;
  scheduleImpactDays: number;
  linkedScheduleItemId: string;
  costCodeId: string;
  sourceDailyReportId: string;
  linkedDocumentId: string;
};

type IssueDraft = {
  comment: string;
  rootCause: string;
  correctiveAction: string;
  workflowTemplateId: string;
  evidenceDocumentId: string;
  evidencePhase: "opening" | "corrective" | "closure";
  evidenceNote: string;
};

const blankSummary: Summary = {
  inspections: 0,
  inspectionsDue: 0,
  failedInspections: 0,
  openIssues: 0,
  criticalIssues: 0,
  overdueIssues: 0,
  acceptanceBlockers: 0,
  costExposure: 0,
  scheduleExposureDays: 0
};

const blankInspection = (): InspectionForm => ({
  type: "work",
  title: "",
  location: "",
  inspector: "",
  responsibleParty: "",
  scheduledAt: "",
  linkedScheduleItemId: "",
  costCodeId: "",
  linkedDocumentId: "",
  checks: [{ title: "", requirement: "" }]
});

const blankIssue = (): IssueForm => ({
  type: "punch",
  title: "",
  description: "",
  location: "",
  severity: "medium",
  responsibleParty: "",
  dueAt: "",
  acceptanceBlocker: false,
  costImpact: 0,
  scheduleImpactDays: 0,
  linkedScheduleItemId: "",
  costCodeId: "",
  sourceDailyReportId: "",
  linkedDocumentId: ""
});

const blankIssueDraft = (): IssueDraft => ({
  comment: "",
  rootCause: "",
  correctiveAction: "",
  workflowTemplateId: "",
  evidenceDocumentId: "",
  evidencePhase: "opening",
  evidenceNote: ""
});

const inspectionTypes: Record<ProjectQualityInspection["type"], string> = {
  incoming: "Входной контроль",
  work: "Контроль работ",
  hold_point: "Hold point",
  final: "Итоговая приемка"
};

const inspectionStatuses: Record<ProjectQualityInspection["status"], string> = {
  planned: "Запланировано",
  in_progress: "В работе",
  passed: "Пройдено",
  failed: "Не пройдено",
  closed: "Закрыто",
  void: "Аннулировано"
};

const issueTypes: Record<ProjectQualityIssue["type"], string> = {
  observation: "Наблюдение",
  punch: "Punch",
  ncr: "NCR",
  defect: "Дефект"
};

const issueStatuses: Record<ProjectQualityIssue["status"], string> = {
  open: "Открыто",
  in_progress: "Устранение",
  ready_for_verification: "На проверке",
  verified: "Проверено",
  closed: "Закрыто",
  void: "Аннулировано"
};

function toIso(value: string) {
  return value ? new Date(`${value}T12:00:00`).toISOString() : "";
}

function formatDate(value?: string | null) {
  return value ? new Date(value).toLocaleDateString("ru-RU") : "без срока";
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function badge(status: string) {
  if (["passed", "verified", "closed"].includes(status)) return "green";
  if (["failed", "void"].includes(status)) return "red";
  if (["in_progress", "ready_for_verification"].includes(status)) return "yellow";
  return "blue";
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `HTTP ${response.status}`;
}

export function QualityManagementWorkspace(props: Props) {
  const [mode, setMode] = useState<"issues" | "inspections">("issues");
  const [inspections, setInspections] = useState<ProjectQualityInspection[]>([]);
  const [issues, setIssues] = useState<ProjectQualityIssue[]>([]);
  const [summary, setSummary] = useState<Summary>(blankSummary);
  const [costCodes, setCostCodes] = useState<ProjectCostCode[]>([]);
  const [templates, setTemplates] = useState<Array<{ id: string; name: string; status: string }>>([]);
  const [inspectionForm, setInspectionForm] = useState<InspectionForm>(blankInspection);
  const [issueForm, setIssueForm] = useState<IssueForm>(blankIssue);
  const [inspectionFormOpen, setInspectionFormOpen] = useState(false);
  const [issueFormOpen, setIssueFormOpen] = useState(false);
  const [checkResults, setCheckResults] = useState<Record<string, Record<string, { result: QualityCheckResult; comment: string }>>>({});
  const [issueDrafts, setIssueDrafts] = useState<Record<string, IssueDraft>>({});
  const [loading, setLoading] = useState("load");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading("load");
    setError("");
    try {
      const [inspectionResponse, issueResponse, costCodeResponse, templateResponse] = await Promise.all([
        fetch(`/api/projects/${props.projectId}/quality-inspections`, { cache: "no-store" }),
        fetch(`/api/projects/${props.projectId}/quality-issues`, { cache: "no-store" }),
        fetch(`/api/projects/${props.projectId}/cost-codes`, { cache: "no-store" }),
        fetch(`/api/projects/${props.projectId}/workflow-templates`, { cache: "no-store" })
      ]);
      if (!inspectionResponse.ok) throw new Error(await responseError(inspectionResponse));
      if (!issueResponse.ok) throw new Error(await responseError(issueResponse));
      const inspectionPayload = await inspectionResponse.json() as { items?: ProjectQualityInspection[]; summary?: Summary };
      const issuePayload = await issueResponse.json() as { items?: ProjectQualityIssue[]; summary?: Summary };
      setInspections(inspectionPayload.items ?? []);
      setIssues(issuePayload.items ?? []);
      setSummary(issuePayload.summary ?? inspectionPayload.summary ?? blankSummary);
      if (costCodeResponse.ok) {
        const payload = await costCodeResponse.json() as { items?: ProjectCostCode[] };
        setCostCodes((payload.items ?? []).filter((item) => item.status === "active"));
      }
      if (templateResponse.ok) {
        const payload = await templateResponse.json() as { templates?: Array<{ id: string; name: string; status: string }> };
        setTemplates((payload.templates ?? []).filter((item) => item.status === "active"));
      }
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить Quality Management.");
    } finally {
      setLoading("");
    }
  }, [props.projectId]);

  useEffect(() => { void load(); }, [load]);

  const overdue = useMemo(() => new Set(issues
    .filter((item) => item.dueAt && new Date(item.dueAt) < new Date() && !["closed", "void"].includes(item.status))
    .map((item) => item.id)), [issues]);

  function issueDraft(id: string) {
    return issueDrafts[id] ?? blankIssueDraft();
  }

  function patchIssueDraft(id: string, patch: Partial<IssueDraft>) {
    setIssueDrafts((current) => ({ ...current, [id]: { ...issueDraft(id), ...patch } }));
  }

  async function saveInspection(event: React.FormEvent) {
    event.preventDefault();
    setLoading("inspection-form");
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-inspections`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...inspectionForm,
          scheduledAt: toIso(inspectionForm.scheduledAt),
          checks: inspectionForm.checks.filter((item) => item.title.trim())
        })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setInspectionForm(blankInspection());
      setInspectionFormOpen(false);
      setNotice("Инспекция создана как плановая.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Инспекция не создана.");
    } finally {
      setLoading("");
    }
  }

  async function inspectionAction(item: ProjectQualityInspection, action: string) {
    if (action === "void" && !window.confirm(`Аннулировать ${item.number}?`)) return;
    const results = checkResults[item.id] ?? {};
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-inspections/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          comment: action === "void" ? "Аннулировано ответственным пользователем." : "",
          checks: action === "complete" ? item.checks.map((check) => ({
            id: check.id,
            result: results[check.id]?.result ?? check.result,
            comment: results[check.id]?.comment ?? check.comment ?? ""
          })) : []
        })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(action === "complete" ? `${item.number}: результаты зафиксированы; failed-пункты создали NCR.` : `${item.number}: статус обновлён.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Статус инспекции не изменён.");
    } finally {
      setLoading("");
    }
  }

  async function deleteInspection(item: ProjectQualityInspection) {
    if (!window.confirm(`Удалить плановую инспекцию ${item.number}?`)) return;
    setLoading(item.id);
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-inspections/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${item.number} удалена.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Инспекция не удалена.");
    } finally {
      setLoading("");
    }
  }

  async function saveIssue(event: React.FormEvent) {
    event.preventDefault();
    setLoading("issue-form");
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-issues`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...issueForm, dueAt: toIso(issueForm.dueAt) })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setIssueForm(blankIssue());
      setIssueFormOpen(false);
      setNotice("Замечание добавлено в контролируемый реестр.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Замечание не создано.");
    } finally {
      setLoading("");
    }
  }

  async function issueAction(item: ProjectQualityIssue, action: string) {
    if (action === "void" && !window.confirm(`Аннулировать ${item.number}?`)) return;
    const draft = issueDraft(item.id);
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-issues/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action,
          comment: draft.comment,
          rootCause: draft.rootCause,
          correctiveAction: draft.correctiveAction,
          workflowTemplateId: draft.workflowTemplateId
        })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${item.number}: статус обновлён.`);
      await load();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Статус замечания не изменён.");
    } finally {
      setLoading("");
    }
  }

  async function addEvidence(item: ProjectQualityIssue) {
    const draft = issueDraft(item.id);
    setLoading(`evidence-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-issues/${item.id}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentId: draft.evidenceDocumentId, phase: draft.evidencePhase, note: draft.evidenceNote })
      });
      if (!response.ok) throw new Error(await responseError(response));
      patchIssueDraft(item.id, { evidenceDocumentId: "", evidenceNote: "" });
      setNotice(`${item.number}: evidence зафиксировано по точной версии документа.`);
      await load();
    } catch (evidenceError) {
      setError(evidenceError instanceof Error ? evidenceError.message : "Evidence не добавлено.");
    } finally {
      setLoading("");
    }
  }

  async function deleteIssue(item: ProjectQualityIssue) {
    if (!window.confirm(`Удалить неиспользуемое замечание ${item.number}?`)) return;
    setLoading(item.id);
    try {
      const response = await fetch(`/api/projects/${props.projectId}/quality-issues/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`${item.number} удалено.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Замечание не удалено.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="quality-management-workspace" aria-label="Quality Management">
      <header className="quality-management-header">
        <div>
          <div className="eyebrow">Quality Management v2</div>
          <h3>Инспекции, NCR и Punch List</h3>
          <p>План контроля, ответственные, сроки, evidence и проверка устранения с полной историей решений.</p>
        </div>
        <div className="quality-management-header-actions">
          <button className="icon-button" disabled={Boolean(loading)} onClick={() => void load()} title="Обновить" type="button"><RefreshCw size={17} /></button>
          <button className="button secondary compact-button" onClick={() => props.onNavigate("КС")} type="button"><FileCheck2 size={15} />Блокеры КС</button>
        </div>
      </header>

      <div className="quality-management-metrics">
        <Metric label="Открытые NCR / Punch" value={String(summary.openIssues)} detail={`${summary.overdueIssues} просрочено`} tone={summary.overdueIssues ? "bad" : summary.openIssues ? "warn" : "good"} />
        <Metric label="Критичные" value={String(summary.criticalIssues)} detail={`${summary.acceptanceBlockers} блокируют КС`} tone={summary.criticalIssues || summary.acceptanceBlockers ? "bad" : "good"} />
        <Metric label="Инспекции" value={String(summary.inspections)} detail={`${summary.inspectionsDue} требуют внимания`} tone={summary.inspectionsDue ? "warn" : "info"} />
        <Metric label="Экспозиция" value={money(summary.costExposure)} detail={`${summary.scheduleExposureDays} дн. влияния`} tone={summary.costExposure || summary.scheduleExposureDays ? "warn" : "neutral"} />
      </div>

      {error ? <div className="alert error"><AlertTriangle size={17} />{error}</div> : null}
      {notice ? <div className="alert success"><CheckCircle2 size={17} />{notice}</div> : null}

      <div className="quality-management-toolbar">
        <div className="segmented-control" aria-label="Режим реестра">
          <button aria-pressed={mode === "issues"} onClick={() => setMode("issues")} type="button"><ShieldAlert size={15} />NCR / Punch</button>
          <button aria-pressed={mode === "inspections"} onClick={() => setMode("inspections")} type="button"><ClipboardCheck size={15} />Инспекции</button>
        </div>
        {props.canEdit ? (
          <button className="button primary compact-button" onClick={() => mode === "issues" ? setIssueFormOpen((value) => !value) : setInspectionFormOpen((value) => !value)} type="button">
            <Plus size={15} />{mode === "issues" ? "Замечание" : "Инспекция"}
          </button>
        ) : null}
      </div>

      {mode === "inspections" ? (
        <>
          {inspectionFormOpen && props.canEdit ? <InspectionCreateForm form={inspectionForm} setForm={setInspectionForm} costCodes={costCodes} documents={props.documents} scheduleItems={props.scheduleItems} loading={loading} onCancel={() => setInspectionFormOpen(false)} onSubmit={saveInspection} /> : null}
          {loading === "load" ? <div className="empty-state">Загрузка инспекций...</div> : inspections.length ? (
            <div className="quality-inspection-register">
              {inspections.map((item) => (
                <InspectionRow
                  canApprove={props.canApprove}
                  canEdit={props.canEdit}
                  item={item}
                  key={item.id}
                  results={checkResults[item.id] ?? {}}
                  onAction={(action) => void inspectionAction(item, action)}
                  onDelete={() => void deleteInspection(item)}
                  onResults={(checkId, value) => setCheckResults((current) => ({ ...current, [item.id]: { ...(current[item.id] ?? {}), [checkId]: value } }))}
                  onShowIssues={() => setMode("issues")}
                />
              ))}
            </div>
          ) : <div className="empty-state">Инспекций пока нет. Создайте план входного, операционного или итогового контроля.</div>}
        </>
      ) : (
        <>
          {issueFormOpen && props.canEdit ? <IssueCreateForm form={issueForm} setForm={setIssueForm} costCodes={costCodes} documents={props.documents} reports={props.dailyReports} scheduleItems={props.scheduleItems} loading={loading} onCancel={() => setIssueFormOpen(false)} onSubmit={saveIssue} /> : null}
          {loading === "load" ? <div className="empty-state">Загрузка NCR и Punch List...</div> : issues.length ? (
            <div className="quality-issue-register">
              {issues.map((item) => (
                <IssueRow
                  canApprove={props.canApprove}
                  canEdit={props.canEdit}
                  documents={props.documents}
                  draft={issueDraft(item.id)}
                  item={item}
                  key={item.id}
                  loading={loading}
                  overdue={overdue.has(item.id)}
                  templates={templates}
                  onAction={(action) => void issueAction(item, action)}
                  onAddEvidence={() => void addEvidence(item)}
                  onDelete={() => void deleteIssue(item)}
                  onDraft={(patch) => patchIssueDraft(item.id, patch)}
                  onNavigate={props.onNavigate}
                />
              ))}
            </div>
          ) : <div className="empty-state">Контролируемых NCR/Punch записей пока нет. Непройденная инспекция создаст NCR автоматически.</div>}
        </>
      )}
    </section>
  );
}

function InspectionCreateForm(props: {
  form: InspectionForm;
  setForm: React.Dispatch<React.SetStateAction<InspectionForm>>;
  costCodes: ProjectCostCode[];
  documents: ProjectDocument[];
  scheduleItems: ScheduleItem[];
  loading: string;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const { form, setForm } = props;
  return (
    <form className="quality-management-form" onSubmit={props.onSubmit}>
      <SectionTitle icon={<ClipboardCheck size={18} />} title="Новая инспекция" detail="Чек-лист фиксируется до начала проверки" />
      <div className="quality-management-form-grid">
        <label className="field field-wide"><span>Название</span><input minLength={3} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
        <label className="field"><span>Тип</span><select onChange={(event) => setForm({ ...form, type: event.target.value as InspectionForm["type"] })} value={form.type}>{Object.entries(inspectionTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Дата</span><input onChange={(event) => setForm({ ...form, scheduledAt: event.target.value })} type="date" value={form.scheduledAt} /></label>
        <label className="field"><span>Локация</span><input onChange={(event) => setForm({ ...form, location: event.target.value })} value={form.location} /></label>
        <label className="field"><span>Инспектор</span><input onChange={(event) => setForm({ ...form, inspector: event.target.value })} value={form.inspector} /></label>
        <label className="field"><span>Ответственный</span><input onChange={(event) => setForm({ ...form, responsibleParty: event.target.value })} value={form.responsibleParty} /></label>
        <label className="field"><span>Работа графика</span><select onChange={(event) => setForm({ ...form, linkedScheduleItemId: event.target.value })} value={form.linkedScheduleItemId}><option value="">Без связи</option>{props.scheduleItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Cost Code</span><select onChange={(event) => setForm({ ...form, costCodeId: event.target.value })} value={form.costCodeId}><option value="">Наследовать / без кода</option>{props.costCodes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="field field-wide"><span>ITP / документ</span><select onChange={(event) => setForm({ ...form, linkedDocumentId: event.target.value })} value={form.linkedDocumentId}><option value="">Без документа</option>{props.documents.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>
      </div>
      <div className="quality-check-editor">
        <div><strong>Пункты проверки</strong><button className="button secondary compact-button" onClick={() => setForm({ ...form, checks: [...form.checks, { title: "", requirement: "" }] })} type="button"><Plus size={14} />Пункт</button></div>
        {form.checks.map((check, index) => (
          <div className="quality-check-edit-row" key={index}>
            <input aria-label={`Пункт ${index + 1}`} onChange={(event) => setForm({ ...form, checks: form.checks.map((item, itemIndex) => itemIndex === index ? { ...item, title: event.target.value } : item) })} placeholder="Что проверяем" required value={check.title} />
            <input aria-label={`Требование ${index + 1}`} onChange={(event) => setForm({ ...form, checks: form.checks.map((item, itemIndex) => itemIndex === index ? { ...item, requirement: event.target.value } : item) })} placeholder="Критерий / допуск" value={check.requirement} />
            <button aria-label={`Удалить пункт ${index + 1}`} className="icon-button danger" disabled={form.checks.length === 1} onClick={() => setForm({ ...form, checks: form.checks.filter((_, itemIndex) => itemIndex !== index) })} type="button"><Trash2 size={15} /></button>
          </div>
        ))}
      </div>
      <FormActions loading={props.loading === "inspection-form"} onCancel={props.onCancel} submitLabel="Создать план" />
    </form>
  );
}

function InspectionRow(props: {
  item: ProjectQualityInspection;
  canEdit: boolean;
  canApprove: boolean;
  results: Record<string, { result: QualityCheckResult; comment: string }>;
  onResults: (checkId: string, value: { result: QualityCheckResult; comment: string }) => void;
  onAction: (action: string) => void;
  onDelete: () => void;
  onShowIssues: () => void;
}) {
  const item = props.item;
  return (
    <article className={`quality-inspection-row status-${item.status}`}>
      <header>
        <div><span>{item.number} · {inspectionTypes[item.type]}</span><strong>{item.title}</strong><small>{item.location || "Локация не указана"} · {formatDate(item.scheduledAt)}</small></div>
        <span className={`badge ${badge(item.status)}`}>{inspectionStatuses[item.status]}</span>
      </header>
      <div className="quality-record-meta">
        <span>Инспектор: {item.inspector || "не назначен"}</span>
        <span>Ответственный: {item.responsibleParty || "не назначен"}</span>
        {item.costCode ? <span>{item.costCode.code} · {item.costCode.name}</span> : null}
        {item.linkedScheduleItem ? <span>{item.linkedScheduleItem.name}</span> : null}
      </div>
      <details open={item.status === "in_progress"}>
        <summary><ListChecks size={15} />Чек-лист: {item.checks.length}</summary>
        <div className="quality-inspection-checks">
          {item.checks.map((check) => {
            const value = props.results[check.id] ?? { result: check.result, comment: check.comment ?? "" };
            return (
              <div className={`quality-inspection-check result-${value.result}`} key={check.id}>
                <span>{String(check.sequence).padStart(2, "0")}</span>
                <div><strong>{check.title}</strong><small>{check.requirement || "Критерий не указан"}</small></div>
                {item.status === "in_progress" && props.canEdit ? (
                  <>
                    <select aria-label={`Результат ${check.title}`} onChange={(event) => props.onResults(check.id, { ...value, result: event.target.value as QualityCheckResult })} value={value.result}><option value="pending">Не проверено</option><option value="pass">Пройдено</option><option value="fail">Не пройдено</option><option value="na">Не применимо</option></select>
                    <input aria-label={`Комментарий ${check.title}`} onChange={(event) => props.onResults(check.id, { ...value, comment: event.target.value })} placeholder="Комментарий / факт" value={value.comment} />
                  </>
                ) : <span className={`badge ${check.result === "pass" ? "green" : check.result === "fail" ? "red" : "gray"}`}>{check.result}</span>}
              </div>
            );
          })}
        </div>
      </details>
      {item.issues.length ? <div className="quality-linked-issues">{item.issues.map((issue) => <button key={issue.id} onClick={props.onShowIssues} type="button">{issue.number} · {issue.title}</button>)}</div> : null}
      <div className="quality-record-controls">
        {item.status === "planned" && props.canEdit ? <button className="button primary compact-button" onClick={() => props.onAction("start")} type="button"><ClipboardCheck size={14} />Начать</button> : null}
        {item.status === "in_progress" && props.canEdit ? <button className="button primary compact-button" onClick={() => props.onAction("complete")} type="button"><FileCheck2 size={14} />Завершить</button> : null}
        {["passed", "failed"].includes(item.status) && props.canApprove ? <button className="button primary compact-button" onClick={() => props.onAction("close")} type="button"><CheckCircle2 size={14} />Закрыть</button> : null}
        {item.status === "planned" && props.canApprove ? <button className="icon-button danger" onClick={props.onDelete} title="Удалить план" type="button"><Trash2 size={15} /></button> : null}
        {!["closed", "void"].includes(item.status) && props.canApprove ? <button className="button secondary compact-button danger" onClick={() => props.onAction("void")} type="button"><XCircle size={14} />Аннулировать</button> : null}
      </div>
    </article>
  );
}

function IssueCreateForm(props: {
  form: IssueForm;
  setForm: React.Dispatch<React.SetStateAction<IssueForm>>;
  costCodes: ProjectCostCode[];
  documents: ProjectDocument[];
  reports: DailyReport[];
  scheduleItems: ScheduleItem[];
  loading: string;
  onCancel: () => void;
  onSubmit: (event: React.FormEvent) => void;
}) {
  const { form, setForm } = props;
  return (
    <form className="quality-management-form" onSubmit={props.onSubmit}>
      <SectionTitle icon={<ShieldAlert size={18} />} title="Новое замечание" detail="Ручная запись NCR, Punch, дефекта или наблюдения" />
      <div className="quality-management-form-grid">
        <label className="field field-wide"><span>Название</span><input minLength={3} onChange={(event) => setForm({ ...form, title: event.target.value })} required value={form.title} /></label>
        <label className="field"><span>Тип</span><select onChange={(event) => setForm({ ...form, type: event.target.value as IssueForm["type"] })} value={form.type}>{Object.entries(issueTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
        <label className="field"><span>Критичность</span><select onChange={(event) => setForm({ ...form, severity: event.target.value as IssueForm["severity"] })} value={form.severity}><option value="low">Низкая</option><option value="medium">Средняя</option><option value="high">Высокая</option><option value="critical">Критичная</option></select></label>
        <label className="field field-wide"><span>Описание несоответствия</span><textarea minLength={3} onChange={(event) => setForm({ ...form, description: event.target.value })} required rows={3} value={form.description} /></label>
        <label className="field"><span>Локация</span><input onChange={(event) => setForm({ ...form, location: event.target.value })} value={form.location} /></label>
        <label className="field"><span>Ответственный</span><input onChange={(event) => setForm({ ...form, responsibleParty: event.target.value })} value={form.responsibleParty} /></label>
        <label className="field"><span>Срок устранения</span><input onChange={(event) => setForm({ ...form, dueAt: event.target.value })} type="date" value={form.dueAt} /></label>
        <label className="field"><span>Влияние, ₽</span><input min="0" onChange={(event) => setForm({ ...form, costImpact: Number(event.target.value) })} step="0.01" type="number" value={form.costImpact} /></label>
        <label className="field"><span>Влияние, дней</span><input min="0" onChange={(event) => setForm({ ...form, scheduleImpactDays: Number(event.target.value) })} type="number" value={form.scheduleImpactDays} /></label>
        <label className="field checkbox-field"><input checked={form.acceptanceBlocker} onChange={(event) => setForm({ ...form, acceptanceBlocker: event.target.checked })} type="checkbox" /><span>Блокирует КС / приемку</span></label>
        <label className="field"><span>Работа графика</span><select onChange={(event) => setForm({ ...form, linkedScheduleItemId: event.target.value })} value={form.linkedScheduleItemId}><option value="">Без связи</option>{props.scheduleItems.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label className="field"><span>Cost Code</span><select onChange={(event) => setForm({ ...form, costCodeId: event.target.value })} value={form.costCodeId}><option value="">Наследовать / без кода</option>{props.costCodes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
        <label className="field"><span>Рапорт-источник</span><select onChange={(event) => setForm({ ...form, sourceDailyReportId: event.target.value })} value={form.sourceDailyReportId}><option value="">Без рапорта</option>{props.reports.map((item) => <option key={item.id} value={item.id}>{formatDate(item.date)} · {item.author}</option>)}</select></label>
        <label className="field"><span>Исходный документ</span><select onChange={(event) => setForm({ ...form, linkedDocumentId: event.target.value })} value={form.linkedDocumentId}><option value="">Без документа</option>{props.documents.map((item) => <option key={item.id} value={item.id}>{item.title} · v{item.version}</option>)}</select></label>
      </div>
      <FormActions loading={props.loading === "issue-form"} onCancel={props.onCancel} submitLabel="Создать замечание" />
    </form>
  );
}

function IssueRow(props: {
  item: ProjectQualityIssue;
  draft: IssueDraft;
  documents: ProjectDocument[];
  templates: Array<{ id: string; name: string }>;
  canEdit: boolean;
  canApprove: boolean;
  overdue: boolean;
  loading: string;
  onDraft: (patch: Partial<IssueDraft>) => void;
  onAction: (action: string) => void;
  onAddEvidence: () => void;
  onDelete: () => void;
  onNavigate: (tab: string) => void;
}) {
  const { item, draft } = props;
  return (
    <article className={`quality-managed-issue severity-${item.severity} status-${item.status}`}>
      <header>
        <div><span>{item.number} · {issueTypes[item.type]}</span><strong>{item.title}</strong><small>{item.location || "Локация не указана"} · срок {formatDate(item.dueAt)}</small></div>
        <div className="quality-issue-statuses">{props.overdue ? <span className="badge red">Просрочено</span> : null}<span className={`badge ${badge(item.status)}`}>{issueStatuses[item.status]}</span></div>
      </header>
      <p>{item.description}</p>
      <div className="quality-record-meta">
        <span>Ответственный: {item.responsibleParty || "не назначен"}</span>
        <span>Влияние: {money(item.costImpact)} · {item.scheduleImpactDays} дн.</span>
        {item.acceptanceBlocker ? <span className="quality-blocker"><ShieldAlert size={14} />Блокирует КС</span> : null}
        {item.costCode ? <span>{item.costCode.code} · {item.costCode.name}</span> : null}
        {item.inspection ? <span>{item.inspection.number} · {item.inspection.title}</span> : null}
      </div>
      {item.verificationWorkflowRun ? <button className="quality-workflow-link" onClick={() => props.onNavigate("Процессы")} type="button"><GitBranch size={14} />{item.verificationWorkflowRun.title}: {item.verificationWorkflowRun.status}</button> : null}
      <details className="quality-evidence-panel">
        <summary><FileText size={15} />Evidence и история</summary>
        <div className="quality-evidence-list">
          {item.evidence.length ? item.evidence.map((evidence) => <div key={evidence.id}><span className={`badge ${evidence.phase === "closure" ? "green" : evidence.phase === "corrective" ? "yellow" : "blue"}`}>{evidence.phase}</span><strong>{evidence.titleSnapshot} · v{evidence.documentVersion ?? "?"}</strong><small>{evidence.note || evidence.fileNameSnapshot || "Без комментария"}</small></div>) : <span className="muted">Evidence пока не приложено.</span>}
        </div>
        {props.canEdit && !["closed", "void"].includes(item.status) ? (
          <div className="quality-evidence-form">
            <select aria-label={`Фаза evidence ${item.number}`} onChange={(event) => props.onDraft({ evidencePhase: event.target.value as IssueDraft["evidencePhase"] })} value={draft.evidencePhase}><option value="opening">Исходное</option><option value="corrective">Устранение</option><option value="closure">Закрытие</option></select>
            <select aria-label={`Документ evidence ${item.number}`} onChange={(event) => props.onDraft({ evidenceDocumentId: event.target.value })} value={draft.evidenceDocumentId}><option value="">Выберите документ</option>{props.documents.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.version}</option>)}</select>
            <input aria-label={`Комментарий evidence ${item.number}`} onChange={(event) => props.onDraft({ evidenceNote: event.target.value })} placeholder="Что подтверждает документ" value={draft.evidenceNote} />
            <button className="button secondary compact-button" disabled={!draft.evidenceDocumentId || props.loading === `evidence-${item.id}`} onClick={props.onAddEvidence} type="button"><Plus size={14} />Evidence</button>
          </div>
        ) : null}
        <div className="quality-event-list">{item.events.slice(0, 8).map((event) => <div key={event.id}><strong>{event.eventType}</strong><span>{event.createdByName || "Система"} · {new Date(event.createdAt).toLocaleString("ru-RU")}</span><small>{event.comment || `${event.statusBefore || "—"} → ${event.statusAfter || "—"}`}</small></div>)}</div>
      </details>
      {["open", "in_progress", "ready_for_verification", "verified"].includes(item.status) ? (
        <div className="quality-corrective-form">
          {["open", "in_progress"].includes(item.status) ? <><textarea aria-label={`Причина ${item.number}`} onChange={(event) => props.onDraft({ rootCause: event.target.value })} placeholder="Корневая причина" rows={2} value={draft.rootCause || item.rootCause || ""} /><textarea aria-label={`Действие ${item.number}`} onChange={(event) => props.onDraft({ correctiveAction: event.target.value })} placeholder="Корректирующее действие" rows={2} value={draft.correctiveAction || item.correctiveAction || ""} /></> : null}
          <input aria-label={`Комментарий решения ${item.number}`} onChange={(event) => props.onDraft({ comment: event.target.value })} placeholder="Комментарий решения" value={draft.comment} />
          {["open", "in_progress"].includes(item.status) ? <select aria-label={`Процесс проверки ${item.number}`} onChange={(event) => props.onDraft({ workflowTemplateId: event.target.value })} value={draft.workflowTemplateId}><option value="">Проверка без отдельного workflow</option>{props.templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select> : null}
        </div>
      ) : null}
      <div className="quality-record-controls">
        {item.status === "open" && props.canEdit ? <button className="button secondary compact-button" onClick={() => props.onAction("start")} type="button"><RefreshCw size={14} />В работу</button> : null}
        {["open", "in_progress"].includes(item.status) && props.canEdit ? <button className="button primary compact-button" onClick={() => props.onAction("submit_verification")} type="button"><FileCheck2 size={14} />На проверку</button> : null}
        {item.status === "ready_for_verification" && props.canApprove ? <button className="button primary compact-button" disabled={Boolean(item.verificationWorkflowRun && item.verificationWorkflowRun.status !== "approved")} onClick={() => props.onAction("verify")} type="button"><ShieldCheck size={14} />Подтвердить</button> : null}
        {item.status === "verified" && props.canApprove ? <button className="button primary compact-button" onClick={() => props.onAction("close")} type="button"><CheckCircle2 size={14} />Закрыть</button> : null}
        {["verified", "closed"].includes(item.status) && props.canApprove ? <button className="button secondary compact-button" onClick={() => props.onAction("reopen")} type="button"><RefreshCw size={14} />Переоткрыть</button> : null}
        {item.status === "open" && props.canApprove && !item.inspectionId && !item.evidence.length ? <button className="icon-button danger" onClick={props.onDelete} title="Удалить черновую запись" type="button"><Trash2 size={15} /></button> : null}
        {!["closed", "void"].includes(item.status) && props.canApprove ? <button className="button secondary compact-button danger" onClick={() => props.onAction("void")} type="button"><XCircle size={14} />Аннулировать</button> : null}
      </div>
    </article>
  );
}

function SectionTitle({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="quality-management-section-title">{icon}<div><h4>{title}</h4><span>{detail}</span></div></div>;
}

function FormActions({ loading, onCancel, submitLabel }: { loading: boolean; onCancel: () => void; submitLabel: string }) {
  return <div className="quality-management-form-actions"><button className="button primary" disabled={loading} type="submit"><ShieldCheck size={16} />{submitLabel}</button><button className="button secondary" onClick={onCancel} type="button"><XCircle size={16} />Отмена</button></div>;
}

function Metric({ label, value, detail, tone }: { label: string; value: string; detail: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }) {
  return <article className={`tone-${tone}`}><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}
