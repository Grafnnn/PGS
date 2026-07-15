"use client";

import React, { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, CircleDot, GitBranch, PauseCircle, Play, Plus, RotateCcw, ShieldCheck, Trash2, XCircle } from "lucide-react";

type Role = "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
type StepDraft = { name: string; description: string; stepType: "work" | "review" | "approval"; assigneeRole: "MANAGER" | "ADMIN" | "OWNER"; dueDays: number };
type WorkflowTemplate = {
  id: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  steps: Array<StepDraft & { id: string; sequence: number }>;
};
type WorkflowStep = StepDraft & {
  id: string;
  sequence: number;
  status: string;
  dueAt: string | null;
  decisionComment: string | null;
  actedByName: string | null;
  actedAt: string | null;
};
type WorkflowRun = {
  id: string;
  templateId: string | null;
  title: string;
  description: string | null;
  sourceModule: string;
  targetTab: string | null;
  status: string;
  currentStep: number;
  updatedAt: string;
  steps: WorkflowStep[];
};
type Summary = { total: number; active: number; awaitingApproval: number; overdue: number; approved: number; rejected: number };

const emptySummary: Summary = { total: 0, active: 0, awaitingApproval: 0, overdue: 0, approved: 0, rejected: 0 };
const presets: Array<{ id: string; name: string; category: string; description: string; steps: StepDraft[] }> = [
  {
    id: "contract",
    name: "Согласование договора",
    category: "contract",
    description: "Проверка условий, финансовое согласование и решение владельца.",
    steps: [
      { name: "Проверка проекта договора", description: "Объём, сроки, документы и договорные риски.", stepType: "review", assigneeRole: "MANAGER", dueDays: 2 },
      { name: "Финансовое согласование", description: "Цена, маржа, аванс, платежи и обеспечительные меры.", stepType: "approval", assigneeRole: "ADMIN", dueDays: 2 },
      { name: "Финальное решение", description: "Утвердить, отклонить или вернуть условия на доработку.", stepType: "approval", assigneeRole: "OWNER", dueDays: 1 }
    ]
  },
  {
    id: "billing",
    name: "Пакет КС к предъявлению",
    category: "billing",
    description: "Подготовка объёмов, проверка комплекта и выпуск пакета заказчику.",
    steps: [
      { name: "Подготовить объёмы", description: "Сверить ВОР, факт и подтверждающие документы.", stepType: "work", assigneeRole: "MANAGER", dueDays: 3 },
      { name: "Проверить комплект КС", description: "Проверить сумму, документы и замечания.", stepType: "review", assigneeRole: "ADMIN", dueDays: 2 },
      { name: "Разрешить предъявление", description: "Финальное внутреннее согласование пакета.", stepType: "approval", assigneeRole: "OWNER", dueDays: 1 }
    ]
  },
  {
    id: "procurement",
    name: "Крупная закупка",
    category: "procurement",
    description: "Проверка потребности, предложения поставщика и финансового обязательства.",
    steps: [
      { name: "Подтвердить потребность", description: "Проверить объём, срок и связь с графиком.", stepType: "review", assigneeRole: "MANAGER", dueDays: 2 },
      { name: "Проверить коммерческие условия", description: "Сравнить цену, поставку и риски контрагента.", stepType: "review", assigneeRole: "ADMIN", dueDays: 2 },
      { name: "Утвердить обязательство", description: "Разрешить размещение заказа.", stepType: "approval", assigneeRole: "OWNER", dueDays: 1 }
    ]
  }
];

const runStatusLabels: Record<string, string> = { active: "В работе", approved: "Согласован", rejected: "Отклонён", cancelled: "Отменён" };
const stepStatusLabels: Record<string, string> = { pending: "Ожидает", active: "На ходе", approved: "Пройден", revision_required: "На доработке", rejected: "Отклонён", cancelled: "Отменён" };
const roleLabels: Record<string, string> = { MANAGER: "Руководитель проекта", ADMIN: "Администратор / финконтроль", OWNER: "Владелец", VIEWER: "Наблюдатель" };

function copyPreset(preset = presets[0]) {
  return preset.steps.map((step) => ({ ...step }));
}

function formatDue(value: string | null) {
  if (!value) return "после предыдущего шага";
  return new Date(value).toLocaleDateString("ru-RU", { day: "2-digit", month: "short", year: "numeric" });
}

export function WorkflowDesignerWorkspace({ projectId, role, onNavigate }: { projectId: string; role?: Role; onNavigate: (tab: string) => void }) {
  const [templates, setTemplates] = useState<WorkflowTemplate[]>([]);
  const [runs, setRuns] = useState<WorkflowRun[]>([]);
  const [summary, setSummary] = useState<Summary>(emptySummary);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [presetId, setPresetId] = useState(presets[0].id);
  const [templateForm, setTemplateForm] = useState({ name: presets[0].name, description: presets[0].description, category: presets[0].category, steps: copyPreset() });
  const [runForm, setRunForm] = useState({ templateId: "", title: "", description: "", sourceModule: "manual", targetTab: "Действия" });
  const [comments, setComments] = useState<Record<string, string>>({});
  const canManage = role === "OWNER" || role === "ADMIN";
  const canLaunch = canManage || role === "MANAGER";

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    const [templatesResponse, runsResponse] = await Promise.all([
      fetch(`/api/projects/${projectId}/workflow-templates`, { cache: "no-store" }),
      fetch(`/api/projects/${projectId}/workflows`, { cache: "no-store" })
    ]);
    const templatesData = await templatesResponse.json().catch(() => ({}));
    const runsData = await runsResponse.json().catch(() => ({}));
    if (!templatesResponse.ok || !runsResponse.ok) {
      setError(templatesData.error ?? runsData.error ?? "Не удалось загрузить процессы");
    } else {
      const nextTemplates = (templatesData.templates ?? []) as WorkflowTemplate[];
      setTemplates(nextTemplates);
      setRuns((runsData.runs ?? []) as WorkflowRun[]);
      setSummary((runsData.summary ?? emptySummary) as Summary);
      setRunForm((current) => ({ ...current, templateId: nextTemplates.some((item) => item.id === current.templateId && item.status === "active") ? current.templateId : nextTemplates.find((item) => item.status === "active")?.id ?? "" }));
    }
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const activeTemplates = useMemo(() => templates.filter((item) => item.status === "active"), [templates]);
  const visibleRuns = useMemo(() => [...runs].sort((left, right) => (left.status === "active" ? -1 : right.status === "active" ? 1 : right.updatedAt.localeCompare(left.updatedAt))), [runs]);

  function applyPreset(id: string) {
    const preset = presets.find((item) => item.id === id) ?? presets[0];
    setPresetId(preset.id);
    setTemplateForm({ name: preset.name, description: preset.description, category: preset.category, steps: copyPreset(preset) });
  }

  function updateStep(index: number, patch: Partial<StepDraft>) {
    setTemplateForm((current) => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...patch } : step) }));
  }

  async function createTemplate(event: FormEvent) {
    event.preventDefault();
    setSaving("template"); setError(""); setMessage("");
    const response = await fetch(`/api/projects/${projectId}/workflow-templates`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(templateForm) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Не удалось создать шаблон");
    else { setMessage("Шаблон процесса создан"); await load(); }
    setSaving("");
  }

  async function updateTemplate(template: WorkflowTemplate, status: "active" | "inactive") {
    setSaving(template.id); setError(""); setMessage("");
    const response = await fetch(`/api/projects/${projectId}/workflow-templates/${template.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Не удалось обновить шаблон");
    else { setMessage(status === "active" ? "Шаблон активирован" : "Шаблон приостановлен"); await load(); }
    setSaving("");
  }

  async function deleteTemplate(template: WorkflowTemplate) {
    if (!window.confirm(`Удалить неиспользованный шаблон «${template.name}»?`)) return;
    setSaving(template.id); setError(""); setMessage("");
    const response = await fetch(`/api/projects/${projectId}/workflow-templates/${template.id}`, { method: "DELETE" });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Не удалось удалить шаблон");
    else { setMessage("Шаблон удалён"); await load(); }
    setSaving("");
  }

  async function launchRun(event: FormEvent) {
    event.preventDefault();
    setSaving("run"); setError(""); setMessage("");
    const response = await fetch(`/api/projects/${projectId}/workflows`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(runForm) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Не удалось запустить процесс");
    else { setMessage("Процесс запущен, первый шаг назначен"); setRunForm((current) => ({ ...current, title: "", description: "" })); await load(); }
    setSaving("");
  }

  async function act(run: WorkflowRun, action: "approve" | "request_revision" | "reject" | "cancel") {
    const comment = comments[run.id] ?? "";
    if ((action === "request_revision" || action === "reject") && !comment.trim()) { setError("Для возврата или отказа нужен комментарий"); return; }
    setSaving(run.id); setError(""); setMessage("");
    const response = await fetch(`/api/projects/${projectId}/workflows/${run.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, comment }) });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) setError(data.error ?? "Не удалось выполнить действие");
    else { setComments((current) => ({ ...current, [run.id]: "" })); setMessage(action === "approve" ? "Шаг согласован" : action === "request_revision" ? "Процесс возвращён на доработку" : action === "reject" ? "Процесс отклонён" : "Процесс отменён"); await load(); }
    setSaving("");
  }

  return (
    <section className="workflow-designer" aria-label="Конструктор процессов и матрица согласований">
      <header className="workflow-designer-header">
        <div><div className="eyebrow">Workflow Designer & Approval Matrix</div><h2>Процессы согласования</h2><p>Шаблоны маршрутов, ответственные роли, сроки и неизменяемая история решений по проекту.</p></div>
        <div className="workflow-ball"><CircleDot size={18} /><span>Ball in court</span><strong>{summary.active}</strong></div>
      </header>

      <div className="workflow-metrics">
        <article><small>Активные</small><strong>{summary.active}</strong><span>в работе сейчас</span></article>
        <article><small>Просрочены</small><strong>{summary.overdue}</strong><span>требуют реакции</span></article>
        <article><small>Согласованы</small><strong>{summary.approved}</strong><span>терминальный статус</span></article>
        <article><small>Шаблоны</small><strong>{activeTemplates.length}</strong><span>доступны для запуска</span></article>
      </div>

      {(error || message) && <div className={error ? "notice error" : "notice success"}>{error || message}</div>}

      <div className="workflow-layout">
        <div className="workflow-column">
          <section className="workflow-section">
            <div className="workflow-section-title"><div><small>Настройка</small><h3>Шаблоны маршрутов</h3></div><span>{templates.length}</span></div>
            {canManage && <details className="workflow-builder">
              <summary><Plus size={16} /> Новый шаблон</summary>
              <form onSubmit={createTemplate}>
                <label>Стартовый маршрут<select value={presetId} onChange={(event) => applyPreset(event.target.value)}>{presets.map((preset) => <option key={preset.id} value={preset.id}>{preset.name}</option>)}</select></label>
                <div className="workflow-form-grid"><label>Название<input maxLength={120} required value={templateForm.name} onChange={(event) => setTemplateForm({ ...templateForm, name: event.target.value })} /></label><label>Категория<input maxLength={60} required value={templateForm.category} onChange={(event) => setTemplateForm({ ...templateForm, category: event.target.value })} /></label></div>
                <label>Назначение<textarea rows={2} maxLength={2000} value={templateForm.description} onChange={(event) => setTemplateForm({ ...templateForm, description: event.target.value })} /></label>
                <div className="workflow-step-editor">
                  {templateForm.steps.map((step, index) => <div className="workflow-step-edit" key={`${index}-${step.name}`}><b>{index + 1}</b><input aria-label={`Название шага ${index + 1}`} maxLength={120} required value={step.name} onChange={(event) => updateStep(index, { name: event.target.value })} /><select aria-label={`Тип шага ${index + 1}`} value={step.stepType} onChange={(event) => updateStep(index, { stepType: event.target.value as StepDraft["stepType"] })}><option value="work">Работа</option><option value="review">Проверка</option><option value="approval">Согласование</option></select><select aria-label={`Роль шага ${index + 1}`} value={step.assigneeRole} onChange={(event) => updateStep(index, { assigneeRole: event.target.value as StepDraft["assigneeRole"] })}><option value="MANAGER">Руководитель</option><option value="ADMIN">Администратор</option><option value="OWNER">Владелец</option></select><label className="workflow-days">Дней<input type="number" min={0} max={90} value={step.dueDays} onChange={(event) => updateStep(index, { dueDays: Number(event.target.value) })} /></label>{templateForm.steps.length > 1 && <button className="icon-button danger" aria-label={`Удалить шаг ${index + 1}`} type="button" onClick={() => setTemplateForm({ ...templateForm, steps: templateForm.steps.filter((_item, itemIndex) => itemIndex !== index) })}><Trash2 size={15} /></button>}</div>)}
                </div>
                {templateForm.steps.length < 10 && <button className="button secondary compact-button" type="button" onClick={() => setTemplateForm({ ...templateForm, steps: [...templateForm.steps, { name: "Новый шаг", description: "", stepType: "review", assigneeRole: "MANAGER", dueDays: 2 }] })}><Plus size={15} /> Добавить шаг</button>}
                <button className="button primary" disabled={saving === "template"} type="submit"><GitBranch size={16} /> Сохранить шаблон</button>
              </form>
            </details>}
            <div className="workflow-template-list">
              {templates.length ? templates.map((template) => <article className={template.status === "active" ? "workflow-template active" : "workflow-template"} key={template.id}><header><div><small>{template.category}</small><h4>{template.name}</h4></div><span>{template.status === "active" ? "Активен" : "Пауза"}</span></header><p>{template.description || "Без описания"}</p><ol>{template.steps.map((step) => <li key={step.id}><b>{step.sequence}</b><span>{step.name}<small>{roleLabels[step.assigneeRole]} · {step.dueDays} дн.</small></span></li>)}</ol>{canManage && <footer><button className="button secondary compact-button" disabled={saving === template.id} type="button" onClick={() => void updateTemplate(template, template.status === "active" ? "inactive" : "active")}>{template.status === "active" ? <PauseCircle size={15} /> : <Play size={15} />}{template.status === "active" ? "Приостановить" : "Активировать"}</button><button className="icon-button danger" aria-label={`Удалить шаблон ${template.name}`} disabled={saving === template.id} type="button" onClick={() => void deleteTemplate(template)}><Trash2 size={15} /></button></footer>}</article>) : <div className="empty-state">Шаблонов пока нет. Владелец или администратор может создать первый маршрут из готового пресета.</div>}
            </div>
          </section>

          {canLaunch && <section className="workflow-section workflow-launch">
            <div className="workflow-section-title"><div><small>Явный запуск</small><h3>Новый процесс</h3></div><Play size={18} /></div>
            <form onSubmit={launchRun}><label>Шаблон<select required value={runForm.templateId} onChange={(event) => setRunForm({ ...runForm, templateId: event.target.value })}><option value="">Выберите активный шаблон</option>{activeTemplates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label><label>Предмет процесса<input maxLength={160} required placeholder="Например, Договор №12 или КС за июль" value={runForm.title} onChange={(event) => setRunForm({ ...runForm, title: event.target.value })} /></label><label>Контекст<textarea rows={2} maxLength={3000} value={runForm.description} onChange={(event) => setRunForm({ ...runForm, description: event.target.value })} /></label><div className="workflow-form-grid"><label>Источник<select value={runForm.sourceModule} onChange={(event) => setRunForm({ ...runForm, sourceModule: event.target.value })}><option value="manual">Вручную</option><option value="contract">Договор</option><option value="billing">КС</option><option value="procurement">Закупки</option><option value="documents">Документы</option><option value="risks">Риски</option></select></label><label>Рабочая зона<select value={runForm.targetTab} onChange={(event) => setRunForm({ ...runForm, targetTab: event.target.value })}><option>Действия</option><option>Договор / Тендер</option><option>КС</option><option>Материалы</option><option>Документы</option><option>Риски</option></select></label></div><button className="button primary" disabled={!runForm.templateId || saving === "run"} type="submit"><Play size={16} /> Запустить процесс</button></form>
          </section>}
        </div>

        <section className="workflow-section workflow-runs">
          <div className="workflow-section-title"><div><small>Контроль исполнения</small><h3>Ball in court</h3></div><span>{summary.total}</span></div>
          {loading ? <div className="empty-state">Загрузка процессов...</div> : visibleRuns.length ? <div className="workflow-run-list">{visibleRuns.map((run) => {
            const activeStep = run.steps.find((step) => step.sequence === run.currentStep && step.status === "active");
            const canAct = Boolean(activeStep && (role === "OWNER" || role === "ADMIN" || (role === "MANAGER" && activeStep.assigneeRole === "MANAGER")));
            return <article className={`workflow-run status-${run.status}`} key={run.id}><header><div><small>{run.sourceModule}</small><h4>{run.title}</h4></div><span>{runStatusLabels[run.status] ?? run.status}</span></header>{run.description && <p>{run.description}</p>}<div className="workflow-track">{run.steps.map((step) => <div className={`workflow-track-step ${step.status}`} key={step.id}><b>{step.sequence}</b><span>{step.name}<small>{stepStatusLabels[step.status] ?? step.status} · {roleLabels[step.assigneeRole]}</small></span>{step.sequence < run.steps.length && <ArrowRight size={14} />}</div>)}</div>{activeStep && <div className="workflow-current"><div><small>Сейчас отвечает</small><strong>{roleLabels[activeStep.assigneeRole]}</strong><span>{activeStep.name} · срок {formatDue(activeStep.dueAt)}</span></div>{run.targetTab && <button className="button secondary compact-button" type="button" onClick={() => onNavigate(run.targetTab!)}>Открыть зону</button>}</div>}{activeStep && canAct && <div className="workflow-decision"><textarea rows={2} maxLength={3000} placeholder="Комментарий к решению" value={comments[run.id] ?? ""} onChange={(event) => setComments({ ...comments, [run.id]: event.target.value })} /><div><button className="button primary compact-button" disabled={saving === run.id} type="button" onClick={() => void act(run, "approve")}><CheckCircle2 size={15} /> Согласовать</button><button className="button secondary compact-button" disabled={saving === run.id} type="button" onClick={() => void act(run, "request_revision")}><RotateCcw size={15} /> На доработку</button><button className="button secondary danger compact-button" disabled={saving === run.id} type="button" onClick={() => void act(run, "reject")}><XCircle size={15} /> Отклонить</button>{canManage && <button className="icon-button danger" aria-label={`Отменить процесс ${run.title}`} disabled={saving === run.id} type="button" onClick={() => void act(run, "cancel")}><PauseCircle size={16} /></button>}</div></div>}{run.status !== "active" && <div className="workflow-terminal"><ShieldCheck size={16} /><span>{runStatusLabels[run.status] ?? run.status}</span></div>}</article>;
          })}</div> : <div className="empty-state">Запущенных процессов пока нет. Выберите активный шаблон и создайте первый маршрут согласования.</div>}
        </section>
      </div>
    </section>
  );
}
