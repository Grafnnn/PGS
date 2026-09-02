"use client";

import { Archive, CalendarClock, Check, ChevronDown, CircleAlert, ClipboardCheck, Download, PackageCheck, RefreshCw, Send, Truck } from "lucide-react";
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

function pluralWord(value: number, one: string, few: string, many: string) {
  const lastTwo = value % 100;
  const last = value % 10;
  return lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many;
}

function countLabel(value: number, one: string, few: string, many: string) {
  return `${value} ${pluralWord(value, one, few, many)}`;
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
  const previewCount = currentDraft?.mode === "preview" ? currentDraft.draft.items.length : null;
  const planHasChanged = previewCount !== null && previewCount !== model.summary.due;
  const canCreateDrafts = canEdit && model.summary.dueGroups > 0 && !pipelineLoading;

  const lanes: Array<{ id: SupplyView; label: string; hint: string; count: number; icon: React.ReactNode }> = [
    { id: "plan", label: "К оформлению", hint: countLabel(model.summary.dueGroups, "заявка", "заявки", "заявок"), count: model.summary.due, icon: <CalendarClock size={18} /> },
    { id: "approval", label: "На согласовании", hint: `${model.summary.drafts} черн. · ${model.summary.submitted} на проверке`, count: model.drafts.length + model.submitted.length, icon: <ClipboardCheck size={18} /> },
    { id: "expected", label: "В пути", hint: model.summary.overdue ? `${model.summary.overdue} просрочено` : "по графику", count: model.awaiting.length, icon: <Truck size={18} /> },
    { id: "warehouse", label: "Склад", hint: money(model.summary.warehouseValue), count: model.summary.warehousePositions, icon: <Archive size={18} /> }
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
      <header className="material-supply-commandbar">
        <div className="material-supply-command-title">
          <span className="material-supply-command-icon"><PackageCheck size={20} /></span>
          <div>
            <span className="eyebrow">Снабжение</span>
            <h3>Заявки и поставки</h3>
            <p>{projectName} · горизонт {model.leadTimeDays} дней · склад после приёмки</p>
          </div>
        </div>
        <div className="material-supply-command-actions">
          <button className="button secondary compact-button" disabled={!canEdit || Boolean(pipelineLoading)} onClick={onPreview} type="button">
            <RefreshCw className={pipelineLoading === "procurement-preview" ? "spin" : ""} size={16} />
            {pipelineLoading === "procurement-preview" ? "Обновляю" : "Обновить"}
          </button>
          <button
            aria-label="Создать черновики заявок из актуального плана"
            className="button primary compact-button"
            disabled={!canCreateDrafts}
            onClick={onCommit}
            title={model.summary.dueGroups ? "Состав будет повторно проверен перед созданием" : "Нет позиций, срок формирования которых наступил"}
            type="button"
          >
            <PackageCheck size={16} />
            {pipelineLoading === "procurement-commit" ? "Создаю" : `Создать заявки · ${model.summary.dueGroups}`}
          </button>
        </div>
      </header>

      <nav className="material-supply-lanes" aria-label="Этапы заявки">
        {lanes.map((lane) => (
          <button aria-pressed={view === lane.id} className={view === lane.id ? "active" : ""} key={lane.id} onClick={() => setView(lane.id)} type="button">
            <span className="material-supply-lane-icon">{lane.icon}</span>
            <span className="material-supply-lane-copy"><strong>{lane.label}</strong><small>{lane.hint}</small></span>
            <b>{lane.count}</b>
          </button>
        ))}
      </nav>

      <div className="material-supply-source-strip" aria-label="Сверка с итоговой заявкой">
        <span><PackageCheck size={16} /><strong>Исходная заявка</strong></span>
        <span><b>{model.summary.sourcePositions}</b> позиций</span>
        <span><b>{model.summary.actionablePositions}</b> к заказу</span>
        <span className={model.summary.clarificationPositions ? "needs-attention" : ""}><b>{model.summary.clarificationPositions}</b> уточнить</span>
        <span><b>{model.summary.sourcePackages}</b> {pluralWord(model.summary.sourcePackages, "пакет", "пакета", "пакетов")} МЗ</span>
      </div>

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
        <section className="material-supply-panel">
          <div className="material-supply-panel-heading">
            <div><strong>К оформлению</strong><span>{model.summary.due} поз. · {countLabel(model.summary.dueGroups, "заявка", "заявки", "заявок")} · срок по полю «Заказать до»</span></div>
            {previewCount !== null ? <span className={`badge ${planHasChanged ? "yellow" : "blue"}`}>{planHasChanged ? "План изменился · обновится при создании" : `Проверено: ${previewCount} поз.`}</span> : null}
          </div>
          {model.groups.length ? (
            <div className="material-supply-batch-table">
              <div className="material-supply-batch-head" aria-hidden="true"><span>Пакет заявки</span><span>Поз.</span><span>На объект</span><span>Состояние</span><span /></div>
              {model.groups.map((group, index) => (
                <details className={`material-supply-batch priority-${group.priority}`} key={group.key} open={index === 0}>
                  <summary>
                    <span className="material-supply-batch-title"><i /><span><strong>{group.category}</strong><small>Оформить до {formatDate(group.requestAt)}</small></span></span>
                    <strong className="material-supply-batch-count">{group.items.length}</strong>
                    <span className="material-supply-batch-date">{formatDate(group.neededAt)}</span>
                    <span className={`supply-priority priority-${group.priority}`}>{group.priority === "critical" ? "Срочно" : group.priority === "high" ? "На этой неделе" : "По плану"}</span>
                    <ChevronDown size={17} />
                  </summary>
                  <div className="material-supply-batch-lines">
                    {group.items.map((item) => (
                      <div key={item.id}>
                        <span><strong>{item.name}</strong><small>{item.source === "schedule" ? "По графику работ" : "По ведомости материалов"}</small></span>
                        <b>{item.deficitQty.toLocaleString("ru-RU")} {item.unit}</b>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>
          ) : <div className="material-supply-empty"><Check size={22} /><strong>Новых заявок не требуется</strong><span>План поставок на ближайшие {model.leadTimeDays} дней закрыт.</span></div>}
          {model.upcomingGroups.length ? <details className="material-supply-upcoming"><summary>Будущие пакеты: {model.upcomingGroups.length} · {model.upcomingDemands.length} поз. <ChevronDown size={16} /></summary><div>{model.upcomingGroups.map((group) => <span key={group.key}><strong>{group.category}</strong><small>формировать {formatDate(group.requestAt)} · поставка {formatDate(group.neededAt)}</small><b>{group.items.length} поз.</b></span>)}</div></details> : null}
          {model.clarificationDemands.length ? <details className="material-supply-upcoming material-supply-clarifications"><summary><CircleAlert size={16} />На уточнение: {model.clarificationDemands.length} поз. <ChevronDown size={16} /></summary><div>{model.clarificationDemands.map((item) => <span key={item.id}><strong>{item.requestCode ?? "Без пакета"}</strong>{item.name}<small>Укажите количество перед формированием заявки.</small></span>)}</div></details> : null}
        </section>
      )}

      {view === "approval" && (
        <div className="material-supply-request-list">
          {[...model.submitted, ...model.drafts].map((request) => {
            const isSubmitted = request.status === "submitted";
            const expectedAt = expectedDates[request.id] ?? request.expectedAt ?? request.neededAt;
            return <article className="material-supply-request" key={request.id}>
              <label className="material-supply-select"><input aria-label={`Выбрать заявку ${request.requestNumber ?? request.title}`} checked={selected.includes(request.id)} onChange={() => toggleSelected(request.id)} type="checkbox" /><span /></label>
              <div className="material-supply-request-main"><div className="material-supply-request-title"><span>{request.requestNumber ?? "Автозаявка"}</span><strong>{request.title}</strong><small>{request.items.length} поз. · нужно до {formatDate(request.neededAt)}</small></div><details className="material-supply-request-details"><summary>Состав заявки · {request.items.length} поз. <ChevronDown size={15} /></summary><div className="material-supply-request-lines">{request.items.map((item) => <span key={item.id ?? item.name}>{item.name}<b>{item.qty.toLocaleString("ru-RU")} {item.unit}</b></span>)}</div></details></div>
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
              <div className="material-supply-request-main"><div className="material-supply-request-title"><span>{request.requestNumber ?? "Заявка"}</span><strong>{request.title}</strong><small>Ожидается {formatDate(request.expectedAt ?? request.neededAt)} · принято {progress.percent}%</small></div><div className="material-supply-progress"><i style={{ width: `${progress.percent}%` }} /></div>{isReceiving ? <div className="material-supply-receive-lines">{request.items.map((item) => { const remaining = Math.max(item.qty - (item.receivedQty ?? 0), 0); return <label key={item.id ?? item.name}><span>{item.name}<small>осталось {remaining.toLocaleString("ru-RU")} {item.unit}</small></span><input max={remaining} min="0" step="0.001" type="number" value={item.id ? receiveQty[item.id] ?? 0 : 0} onChange={(event) => item.id && setReceiveQty((current) => ({ ...current, [item.id!]: Number(event.target.value) }))} /></label>; })}</div> : <details className="material-supply-request-details"><summary>Состав поставки · {request.items.length} поз. <ChevronDown size={15} /></summary><div className="material-supply-request-lines">{request.items.map((item) => <span key={item.id ?? item.name}>{item.name}<b>{(item.receivedQty ?? 0).toLocaleString("ru-RU")} / {item.qty.toLocaleString("ru-RU")} {item.unit}</b></span>)}</div></details>}</div>
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

    </section>
  );
}
