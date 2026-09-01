"use client";

import { Archive, CalendarClock, Check, ChevronDown, ClipboardCheck, Download, PackageCheck, RefreshCw, Send, Truck } from "lucide-react";
import React, { useMemo, useState } from "react";
import { buildMaterialSupplyWorkflow } from "@/lib/material-supply-workflow";
import type { Material, ProcurementRequest, ScheduleItem } from "@/lib/types";

type PipelineDraft = {
  kind: string;
  mode: "preview" | "commit";
  draft: { summary: Record<string, unknown>; items: Array<Record<string, unknown>> };
} | null;

type Props = {
  projectId: string;
  projectName: string;
  materials: Material[];
  scheduleItems: ScheduleItem[];
  requests: ProcurementRequest[];
  draft: PipelineDraft;
  pipelineLoading: string;
  canEdit: boolean;
  canApprove: boolean;
  onPreview: () => void;
  onCommit: () => void;
  onRequestUpdated: (request: ProcurementRequest) => void;
  onMaterialsUpdated: (materials: Material[]) => void;
  onNavigate: (tab: string) => void;
};

type SupplyView = "plan" | "approval" | "expected" | "warehouse";

const statusLabels: Record<string, string> = {
  draft: "Черновик",
  submitted: "На подтверждении",
  approved: "Подтверждена",
  ordered: "Заказано",
  expected: "Ожидается",
  partially_received: "Принято частично",
  received: "На складе",
  closed: "Закрыто",
  rejected: "Отклонено"
};

function formatDate(value: string | undefined) {
  if (!value) return "не указана";
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "short" });
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function requestProgress(request: ProcurementRequest) {
  const total = request.items.reduce((sum, item) => sum + item.qty, 0);
  const received = request.items.reduce((sum, item) => sum + (item.receivedQty ?? 0), 0);
  return { total, received, percent: total > 0 ? Math.min(100, Math.round((received / total) * 100)) : 0 };
}

export function MaterialSupplyWorkspace({
  projectId,
  projectName,
  materials,
  scheduleItems,
  requests,
  draft,
  pipelineLoading,
  canEdit,
  canApprove,
  onPreview,
  onCommit,
  onRequestUpdated,
  onMaterialsUpdated,
  onNavigate
}: Props) {
  const [view, setView] = useState<SupplyView>("plan");
  const [selected, setSelected] = useState<string[]>([]);
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>({});
  const [receivingId, setReceivingId] = useState<string | null>(null);
  const [receiveQty, setReceiveQty] = useState<Record<string, number>>({});
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const model = useMemo(
    () => buildMaterialSupplyWorkflow({ materials, scheduleItems, procurementRequests: requests }),
    [materials, requests, scheduleItems]
  );
  const currentDraft = draft?.kind === "procurement" ? draft : null;
  const previewReady = currentDraft?.mode === "preview" && currentDraft.draft.items.length > 0;

  const lanes: Array<{ id: SupplyView; label: string; count: number; icon: React.ReactNode }> = [
    { id: "plan", label: "План 14 дней", count: model.summary.due, icon: <CalendarClock size={18} /> },
    { id: "approval", label: "Подтверждение", count: model.drafts.length + model.submitted.length, icon: <ClipboardCheck size={18} /> },
    { id: "expected", label: "Ожидается", count: model.awaiting.length, icon: <Truck size={18} /> },
    { id: "warehouse", label: "Склад", count: model.summary.warehousePositions, icon: <Archive size={18} /> }
  ];

  function toggleSelected(id: string) {
    setSelected((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function transition(request: ProcurementRequest, action: "submit" | "approve" | "receive", payload: Record<string, unknown> = {}) {
    setBusy(`${request.id}:${action}`);
    setError("");
    setMessage("");
    try {
      const response = await fetch(`/api/projects/${projectId}/procurement/${request.id}/workflow`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action, ...payload })
      });
      const data = await response.json() as { item?: ProcurementRequest; materials?: Material[]; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось изменить заявку.");
      onRequestUpdated(data.item);
      if (data.materials?.length) onMaterialsUpdated(data.materials);
      setMessage(action === "submit" ? "Заявка передана на подтверждение." : action === "approve" ? "Заявка подтверждена и переведена в ожидание." : "Поставка принята на склад.");
      if (action === "receive") {
        setReceivingId(null);
        setReceiveQty({});
      }
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "Ошибка операции.");
    } finally {
      setBusy("");
    }
  }

  function startReceiving(request: ProcurementRequest) {
    setReceivingId(request.id);
    setReceiveQty(Object.fromEntries(request.items.filter((item) => item.id).map((item) => [item.id!, Math.max(item.qty - (item.receivedQty ?? 0), 0)])));
  }

  const exportHref = `/api/projects/${projectId}/procurement/export${selected.length ? `?ids=${encodeURIComponent(selected.join(","))}` : ""}`;

  return (
    <section className="material-supply-workspace" aria-label="Автоматическое снабжение и склад">
      <header className="material-supply-hero">
        <div>
          <span className="eyebrow">Снабжение по производственной потребности</span>
          <h3>От графика работ до приёмки на склад</h3>
          <p>PGS поднимает потребность за 14 дней до доставки, группирует позиции и не меняет склад без явного подтверждения пользователя.</p>
        </div>
        <div className="material-supply-hero-actions">
          <button className="button secondary compact-button" disabled={!canEdit || Boolean(pipelineLoading)} onClick={onPreview} type="button">
            {pipelineLoading === "procurement-preview" ? <RefreshCw className="spin" size={16} /> : <CalendarClock size={16} />}
            {pipelineLoading === "procurement-preview" ? "Считаю" : "Пересчитать план"}
          </button>
          <button className="button primary compact-button" disabled={!canEdit || !previewReady || Boolean(pipelineLoading)} onClick={onCommit} type="button">
            <PackageCheck size={16} />
            {pipelineLoading === "procurement-commit" ? "Создаю" : `Создать ${model.summary.dueGroups || ""} чернов.`}
          </button>
        </div>
      </header>

      <div className="material-supply-kpis" aria-label="Состояние снабжения">
        <div className={model.summary.due ? "tone-warn" : "tone-good"}><span>Пора формировать</span><strong>{model.summary.due}</strong><small>{model.summary.dueGroups} групп заявок</small></div>
        <div><span>На подтверждении</span><strong>{model.summary.submitted}</strong><small>требуют решения</small></div>
        <div className={model.summary.overdue ? "tone-bad" : ""}><span>Ожидаются</span><strong>{model.summary.awaiting}</strong><small>{model.summary.overdue ? `${model.summary.overdue} просрочено` : "по графику"}</small></div>
        <div><span>Складской остаток</span><strong>{money(model.summary.warehouseValue)}</strong><small>{model.summary.warehousePositions} позиций</small></div>
      </div>

      <nav className="material-supply-lanes" aria-label="Этапы заявки">
        {lanes.map((lane) => (
          <button aria-pressed={view === lane.id} className={view === lane.id ? "active" : ""} key={lane.id} onClick={() => setView(lane.id)} type="button">
            {lane.icon}<span>{lane.label}</span><strong>{lane.count}</strong>
          </button>
        ))}
      </nav>

      {(message || error) && <div className={`material-supply-message ${error ? "error" : "success"}`} role="status">{error || message}</div>}

      {view !== "plan" && view !== "warehouse" && (
        <div className="material-supply-toolbar">
          <span>{selected.length ? `Выбрано: ${selected.length}` : "Отметьте заявки для общей Excel-выгрузки"}</span>
          <a aria-disabled={!selected.length} className={`button secondary compact-button ${selected.length ? "" : "disabled"}`} href={selected.length ? exportHref : undefined}>
            <Download size={16} />Выгрузить выбранные
          </a>
        </div>
      )}

      {view === "plan" && (
        <div className="material-supply-panel">
          <div className="material-supply-panel-heading">
            <div><strong>Потребность, которую пора запускать</strong><span>Дата формирования = дата потребности минус 14 дней.</span></div>
            {currentDraft?.mode === "preview" ? <span className="badge blue">Preview: {currentDraft.draft.items.length} поз.</span> : null}
          </div>
          {model.groups.length ? <div className="material-supply-group-list">{model.groups.map((group) => (
            <article className="material-supply-group" key={group.key}>
              <div><span className={`supply-priority priority-${group.priority}`}>{group.priority === "critical" ? "Срочно" : group.priority === "high" ? "Высокий" : "План"}</span><strong>{group.category}</strong><small>Поставка до {formatDate(group.neededAt)} · заявка с {formatDate(group.requestAt)}</small></div>
              <strong>{group.items.length} поз.</strong>
              <div className="material-supply-lines">{group.items.slice(0, 5).map((item) => <span key={item.id}>{item.name}<b>{item.deficitQty.toLocaleString("ru-RU")} {item.unit}</b></span>)}</div>
            </article>
          ))}</div> : <div className="material-supply-empty"><Check size={22} /><strong>На сегодня новых заявок не требуется</strong><span>Следующая потребность появится автоматически за 14 дней до поставки.</span></div>}
          {model.upcomingDemands.length ? <details className="material-supply-upcoming"><summary>Будущая потребность: {model.upcomingDemands.length} поз. <ChevronDown size={16} /></summary><div>{model.upcomingDemands.slice(0, 12).map((item) => <span key={item.id}>{item.name}<small>формировать {formatDate(item.requestAt)} · доставка {formatDate(item.deliveryAt)}</small></span>)}</div></details> : null}
        </div>
      )}

      {view === "approval" && (
        <div className="material-supply-request-list">
          {[...model.submitted, ...model.drafts].map((request) => {
            const isSubmitted = request.status === "submitted";
            const expectedAt = expectedDates[request.id] ?? request.expectedAt ?? request.neededAt;
            return <article className="material-supply-request" key={request.id}>
              <label className="material-supply-select"><input aria-label={`Выбрать заявку ${request.requestNumber ?? request.title}`} checked={selected.includes(request.id)} onChange={() => toggleSelected(request.id)} type="checkbox" /><span /></label>
              <div className="material-supply-request-main"><div className="material-supply-request-title"><span>{request.requestNumber ?? "Автозаявка"}</span><strong>{request.title}</strong><small>{request.items.length} поз. · нужно до {formatDate(request.neededAt)}</small></div><div className="material-supply-request-lines">{request.items.slice(0, 4).map((item) => <span key={item.id ?? item.name}>{item.name}<b>{item.qty.toLocaleString("ru-RU")} {item.unit}</b></span>)}</div></div>
              <div className="material-supply-request-action"><span className={`badge ${isSubmitted ? "yellow" : "gray"}`}>{statusLabels[request.status]}</span>{isSubmitted ? <><label><span>Ожидаемая дата</span><input type="date" value={expectedAt} onChange={(event) => setExpectedDates((current) => ({ ...current, [request.id]: event.target.value }))} /></label><button className="button primary compact-button" disabled={!canApprove || busy === `${request.id}:approve`} onClick={() => void transition(request, "approve", { expectedAt })} type="button"><Check size={16} />Подтвердить</button></> : <button className="button secondary compact-button" disabled={!canEdit || busy === `${request.id}:submit`} onClick={() => void transition(request, "submit")} type="button"><Send size={16} />На подтверждение</button>}</div>
            </article>;
          })}
          {!model.drafts.length && !model.submitted.length ? <div className="material-supply-empty"><ClipboardCheck size={22} /><strong>Нет заявок на подтверждение</strong><span>Новые черновики появятся из 14-дневного плана.</span></div> : null}
        </div>
      )}

      {view === "expected" && (
        <div className="material-supply-request-list">
          {model.awaiting.map((request) => {
            const progress = requestProgress(request);
            const isReceiving = receivingId === request.id;
            return <article className="material-supply-request expected" key={request.id}>
              <label className="material-supply-select"><input aria-label={`Выбрать заявку ${request.requestNumber ?? request.title}`} checked={selected.includes(request.id)} onChange={() => toggleSelected(request.id)} type="checkbox" /><span /></label>
              <div className="material-supply-request-main"><div className="material-supply-request-title"><span>{request.requestNumber ?? "Заявка"}</span><strong>{request.title}</strong><small>Ожидается {formatDate(request.expectedAt ?? request.neededAt)} · принято {progress.percent}%</small></div><div className="material-supply-progress"><i style={{ width: `${progress.percent}%` }} /></div>{isReceiving ? <div className="material-supply-receive-lines">{request.items.map((item) => { const remaining = Math.max(item.qty - (item.receivedQty ?? 0), 0); return <label key={item.id ?? item.name}><span>{item.name}<small>осталось {remaining.toLocaleString("ru-RU")} {item.unit}</small></span><input max={remaining} min="0" step="0.001" type="number" value={item.id ? receiveQty[item.id] ?? 0 : 0} onChange={(event) => item.id && setReceiveQty((current) => ({ ...current, [item.id!]: Number(event.target.value) }))} /></label>; })}</div> : <div className="material-supply-request-lines">{request.items.slice(0, 4).map((item) => <span key={item.id ?? item.name}>{item.name}<b>{(item.receivedQty ?? 0).toLocaleString("ru-RU")} / {item.qty.toLocaleString("ru-RU")} {item.unit}</b></span>)}</div>}</div>
              <div className="material-supply-request-action"><span className={`badge ${request.status === "partially_received" ? "yellow" : "blue"}`}>{statusLabels[request.status] ?? request.status}</span>{isReceiving ? <><button className="button primary compact-button" disabled={!canEdit || busy === `${request.id}:receive`} onClick={() => void transition(request, "receive", { items: request.items.filter((item) => item.id && (receiveQty[item.id] ?? 0) > 0).map((item) => ({ itemId: item.id, qty: receiveQty[item.id!] })) })} type="button"><PackageCheck size={16} />Принять</button><button className="button secondary compact-button" onClick={() => setReceivingId(null)} type="button">Отмена</button></> : <button className="button secondary compact-button" disabled={!canEdit} onClick={() => startReceiving(request)} type="button"><Archive size={16} />Принять на склад</button>}</div>
            </article>;
          })}
          {!model.awaiting.length ? <div className="material-supply-empty"><Truck size={22} /><strong>Ожидаемых поставок нет</strong><span>Подтверждённые заявки появятся здесь с датой доставки.</span></div> : null}
        </div>
      )}

      {view === "warehouse" && (
        <div className="material-supply-panel warehouse-panel">
          <div className="material-supply-panel-heading"><div><strong>Реестр складских запасов</strong><span>Остаток = поставлено минус израсходовано.</span></div><div><a className="button secondary compact-button" href={`/api/projects/${projectId}/procurement/export`}><Download size={16} />Excel</a><button className="button secondary compact-button" onClick={() => onNavigate("Материалы")} type="button">Открыть материалы</button></div></div>
          {model.warehouse.length ? <div className="material-supply-stock-table"><div className="material-supply-stock-head"><span>Материал</span><span>Поставлено</span><span>Расход</span><span>На складе</span><span>Стоимость</span></div>{model.warehouse.map((item) => <div className="material-supply-stock-row" key={item.id}><span><strong>{item.name}</strong><small>{item.category}</small></span><span>{item.deliveredQty.toLocaleString("ru-RU")} {item.unit}</span><span>{item.consumedQty.toLocaleString("ru-RU")} {item.unit}</span><span><strong>{item.onHandQty.toLocaleString("ru-RU")} {item.unit}</strong></span><span>{money(item.stockValue)}</span></div>)}</div> : <div className="material-supply-empty"><Archive size={22} /><strong>Склад пока пуст</strong><span>Примите подтверждённую поставку, чтобы сформировать остаток.</span></div>}
          {model.received.length ? <details className="material-supply-upcoming"><summary>История принятых заявок: {model.received.length} <ChevronDown size={16} /></summary><div>{model.received.slice(0, 12).map((request) => <span key={request.id}>{request.requestNumber ?? request.title}<small>{request.title} · {formatDate(request.receivedAt)}</small></span>)}</div></details> : null}
        </div>
      )}

      <footer className="material-supply-footer"><span>Проект: {projectName}</span><span>Опережение: 14 дней</span><span>Склад меняется только после приёмки</span></footer>
    </section>
  );
}
