"use client";

import { AlertTriangle, CheckCircle2, GitBranch, Link2, Plus, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import type { ProjectCostCode } from "@/lib/types";

type CategoryKey = "budget" | "schedule" | "materials" | "procurement" | "payments" | "changes";
type EntityType = "budget_item" | "schedule_item" | "material" | "procurement_item" | "payment" | "change_order_item";
type AssignableEntity = { id: string; label: string; detail: string; costCodeId: string | null };
type CoverageItem = { total: number; linked: number };
type CostCodeState = {
  items: ProjectCostCode[];
  coverage: {
    codes: number;
    activeCodes: number;
    total: number;
    linked: number;
    percent: number;
    categories: Record<CategoryKey, CoverageItem>;
  };
  entities: Record<CategoryKey, AssignableEntity[]>;
};
type BaselinePreview = {
  nodes: Array<{ key: string; parentKey: string | null; code: string; name: string; segment: "wbs" | "cost" }>;
  assignments: Array<{ entityId: string; code: string; reason: string }>;
  summary: { budgetItems: number; sections: number; codes: number; leafCodes: number; assignments: number };
  conflicts: Array<{ code: string; existingName: string; proposedName: string }>;
};

const categories: Array<{ key: CategoryKey; entityType: EntityType; label: string }> = [
  { key: "budget", entityType: "budget_item", label: "ВОР" },
  { key: "schedule", entityType: "schedule_item", label: "График" },
  { key: "materials", entityType: "material", label: "Материалы" },
  { key: "procurement", entityType: "procurement_item", label: "Закупки" },
  { key: "payments", entityType: "payment", label: "Платежи" },
  { key: "changes", entityType: "change_order_item", label: "Изменения" }
];

type CostCodeForm = { parentId: string; code: string; name: string; segment: "wbs" | "cost"; costType: "capital" | "expense" };
const emptyForm: CostCodeForm = { parentId: "", code: "", name: "", segment: "cost", costType: "expense" };

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `HTTP ${response.status}`;
}

export function CostCodeWorkspace({ projectId, canEdit, canManage }: { projectId: string; canEdit: boolean; canManage: boolean }) {
  const [state, setState] = useState<CostCodeState | null>(null);
  const [preview, setPreview] = useState<BaselinePreview | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [category, setCategory] = useState<CategoryKey>("budget");
  const [form, setForm] = useState(emptyForm);
  const [assignmentDrafts, setAssignmentDrafts] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading("load");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as CostCodeState;
      setState(payload);
      setAssignmentDrafts(Object.fromEntries(Object.values(payload.entities).flat().map((entity) => [entity.id, entity.costCodeId ?? ""])));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить CBS-WBS.");
    } finally {
      setLoading("");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const activeCodes = useMemo(() => (state?.items ?? []).filter((item) => item.status === "active"), [state]);
  const currentCategory = categories.find((item) => item.key === category) ?? categories[0];
  const entities = state?.entities[category] ?? [];
  const gaps = entities.filter((entity) => !entity.costCodeId).length;

  async function previewBaseline() {
    setLoading("preview");
    setError("");
    setNotice("");
    setConfirmed(false);
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes/baseline`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "preview" })
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as { preview: BaselinePreview };
      setPreview(payload.preview);
      setNotice("Dry-run готов. Коды и строки проекта не изменены.");
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Не удалось построить baseline.");
    } finally {
      setLoading("");
    }
  }

  async function commitBaseline() {
    if (!confirmed || !preview || preview.conflicts.length) return;
    setLoading("commit");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes/baseline`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ mode: "commit", confirm: true })
      });
      if (!response.ok) throw new Error(await responseError(response));
      const payload = await response.json() as { result: { created: number; reused: number; assignments: number } };
      setNotice(`Baseline применён: ${payload.result.created} новых, ${payload.result.reused} существующих кодов; ${payload.result.assignments} строк ВОР связано.`);
      setPreview(null);
      setConfirmed(false);
      await load();
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Baseline не применён.");
    } finally {
      setLoading("");
    }
  }

  async function createCode(event: React.FormEvent) {
    event.preventDefault();
    setLoading("create");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, parentId: form.parentId || null, status: "active", description: "" })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setForm(emptyForm);
      setNotice("Код создан и доступен для привязки.");
      await load();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Код не создан.");
    } finally {
      setLoading("");
    }
  }

  async function toggleCode(item: ProjectCostCode) {
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes/${item.id}`, {
        method: "PATCH", headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: item.status === "active" ? "inactive" : "active" })
      });
      if (!response.ok) throw new Error(await responseError(response));
      await load();
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Статус кода не изменён.");
    } finally {
      setLoading("");
    }
  }

  async function deleteCode(item: ProjectCostCode) {
    if (!window.confirm(`Удалить неиспользуемый код ${item.code}?`)) return;
    setLoading(item.id);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/cost-codes/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(`Код ${item.code} удалён.`);
      await load();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Код не удалён.");
    } finally {
      setLoading("");
    }
  }

  async function assign(entity: AssignableEntity) {
    setLoading(entity.id);
    setError("");
    try {
      const value = assignmentDrafts[entity.id] ?? "";
      const response = await fetch(`/api/projects/${projectId}/cost-codes/assignments`, {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ entityType: currentCategory.entityType, entityId: entity.id, costCodeId: value || null })
      });
      if (!response.ok) throw new Error(await responseError(response));
      setNotice(value ? "Привязка сохранена." : "Привязка снята.");
      await load();
    } catch (assignError) {
      setError(assignError instanceof Error ? assignError.message : "Привязка не сохранена.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="cost-code-workspace" aria-label="Cost Codes CBS-WBS">
      <header className="cost-code-header">
        <div>
          <div className="eyebrow">Cost Codes / CBS-WBS v1</div>
          <h3>Единая классификация стоимости и работ</h3>
          <p>Общий код связывает ВОР, график, материалы, закупки, платежи и изменения. Автоматизация всегда начинается с dry-run.</p>
        </div>
        <button className="icon-button" disabled={Boolean(loading)} onClick={() => void load()} title="Обновить" type="button"><RefreshCw size={17} /></button>
      </header>

      <div className="cost-code-metrics">
        <Metric label="Активные коды" value={String(state?.coverage.activeCodes ?? 0)} detail={`${state?.coverage.codes ?? 0} всего`} />
        <Metric label="Общее покрытие" value={`${state?.coverage.percent ?? 0}%`} detail={`${state?.coverage.linked ?? 0} из ${state?.coverage.total ?? 0} строк`} />
        <Metric label="ВОР" value={coveragePercent(state?.coverage.categories.budget)} detail={coverageLabel(state?.coverage.categories.budget)} />
        <Metric label="Исключения" value={String(gaps)} detail={currentCategory.label} />
      </div>

      {error && <div className="alert error"><AlertTriangle size={17} />{error}</div>}
      {notice && <div className="alert success"><CheckCircle2 size={17} />{notice}</div>}

      <div className="cost-code-layout">
        <section className="cost-code-section">
          <div className="cost-code-section-title">
            <GitBranch size={18} />
            <div><h4>Baseline из ВОР</h4><span>Раздел → подраздел → тип затрат</span></div>
          </div>
          <p className="muted">Предпросмотр не пишет данные. Commit создаёт иерархию и переносит связь в график и изменения, уже связанные с ВОР.</p>
          <button className="button secondary" disabled={!canEdit || Boolean(loading)} onClick={() => void previewBaseline()} type="button"><GitBranch size={16} />Построить dry-run</button>
          {preview && (
            <div className="cost-code-preview">
              <div className="cost-code-preview-summary">
                <span><strong>{preview.summary.codes}</strong> кодов</span>
                <span><strong>{preview.summary.assignments}</strong> привязок</span>
                <span><strong>{preview.summary.sections}</strong> разделов</span>
              </div>
              {preview.conflicts.length ? <div className="cost-code-conflicts"><AlertTriangle size={16} /><span>{preview.conflicts.length} конфликтов: исправьте существующие коды до commit.</span></div> : null}
              <div className="cost-code-preview-tree">{preview.nodes.slice(0, 18).map((node) => <div key={node.key} style={{ paddingLeft: `${node.code.split(".").length * 10}px` }}><code>{node.code}</code><span>{node.name}</span></div>)}</div>
              {preview.nodes.length > 18 ? <small className="muted">Ещё {preview.nodes.length - 18} кодов</small> : null}
              <div className="cost-code-commit">
                <label className="check-row"><input checked={confirmed} disabled={Boolean(preview.conflicts.length)} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>Подтверждаю создание baseline и привязку строк ВОР</span></label>
                <button className="button primary" disabled={!canEdit || !confirmed || Boolean(preview.conflicts.length) || Boolean(loading)} onClick={() => void commitBaseline()} type="button"><ShieldCheck size={16} />Применить baseline</button>
              </div>
            </div>
          )}
        </section>

        <section className="cost-code-section">
          <div className="cost-code-section-title"><Plus size={18} /><div><h4>Ручной код</h4><span>Для накладных, ФОТ и исключений</span></div></div>
          <form className="cost-code-form" onSubmit={createCode}>
            <label className="field"><span>Родитель</span><select disabled={!canEdit} value={form.parentId} onChange={(event) => setForm({ ...form, parentId: event.target.value })}><option value="">Корневой код</option>{activeCodes.map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select></label>
            <label className="field"><span>Код</span><input disabled={!canEdit} required placeholder="10.20.01" value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} /></label>
            <label className="field field-wide"><span>Название</span><input disabled={!canEdit} required minLength={2} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
            <label className="field"><span>Сегмент</span><select disabled={!canEdit} value={form.segment} onChange={(event) => setForm({ ...form, segment: event.target.value as "wbs" | "cost" })}><option value="wbs">WBS / работы</option><option value="cost">CBS / затраты</option></select></label>
            <button className="button primary" disabled={!canEdit || Boolean(loading)} type="submit"><Plus size={16} />Создать код</button>
          </form>
        </section>
      </div>

      <section className="cost-code-register">
        <div className="cost-code-section-title"><GitBranch size={18} /><div><h4>Иерархия</h4><span>{state?.items.length ?? 0} кодов</span></div></div>
        {state?.items.length ? <div className="table-wrap"><table><thead><tr><th>Код</th><th>Название</th><th>Контур</th><th>Источник</th><th>Статус</th><th aria-label="Действия" /></tr></thead><tbody>{state.items.map((item) => <tr key={item.id}><td><code>{item.code}</code></td><td><span className="cost-code-name" style={{ paddingLeft: `${Math.max(item.code.split(".").length - 1, 0) * 14}px` }}>{item.name}</span></td><td>{item.segment === "wbs" ? "WBS" : "CBS"}</td><td>{item.source === "vor_baseline" ? "ВОР baseline" : "Ручной"}</td><td><button className={`badge ${item.status === "active" ? "green" : "neutral"}`} disabled={!canEdit || Boolean(loading)} onClick={() => void toggleCode(item)} type="button">{item.status === "active" ? "Активен" : "Неактивен"}</button></td><td>{canManage ? <button className="icon-button danger" disabled={Boolean(loading)} onClick={() => void deleteCode(item)} title="Удалить неиспользуемый код" type="button"><Trash2 size={15} /></button> : null}</td></tr>)}</tbody></table></div> : <div className="empty-state">Классификатор пуст. Постройте baseline из ВОР или добавьте первый код вручную.</div>}
      </section>

      <section className="cost-code-mapping">
        <div className="cost-code-section-title"><Link2 size={18} /><div><h4>Покрытие модулей</h4><span>Исключения назначаются вручную, без массовых скрытых изменений</span></div></div>
        <div className="segmented-control cost-code-tabs" role="tablist">{categories.map((item) => { const coverage = state?.coverage.categories[item.key]; return <button className={category === item.key ? "active" : ""} key={item.key} onClick={() => setCategory(item.key)} role="tab" type="button">{item.label}<small>{coverage?.linked ?? 0}/{coverage?.total ?? 0}</small></button>; })}</div>
        {entities.length ? <div className="cost-code-assignment-list">{entities.map((entity) => <div className="cost-code-assignment" key={entity.id}><div><strong>{entity.label}</strong><span>{entity.detail}</span></div><select aria-label={`Cost Code для ${entity.label}`} disabled={!canEdit} value={assignmentDrafts[entity.id] ?? ""} onChange={(event) => setAssignmentDrafts({ ...assignmentDrafts, [entity.id]: event.target.value })}><option value="">Без Cost Code</option>{activeCodes.filter((item) => item.segment === "cost").map((item) => <option key={item.id} value={item.id}>{item.code} · {item.name}</option>)}</select><button className="button secondary compact-button" disabled={!canEdit || Boolean(loading) || (assignmentDrafts[entity.id] ?? "") === (entity.costCodeId ?? "")} onClick={() => void assign(entity)} type="button"><Link2 size={15} />Сохранить</button></div>)}</div> : <div className="empty-state">В модуле «{currentCategory.label}» пока нет строк для классификации.</div>}
      </section>
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <article><small>{label}</small><strong>{value}</strong><span>{detail}</span></article>;
}

function coveragePercent(value?: CoverageItem) {
  return value?.total ? `${Math.round((value.linked / value.total) * 100)}%` : "—";
}

function coverageLabel(value?: CoverageItem) {
  return value ? `${value.linked} из ${value.total}` : "нет данных";
}
