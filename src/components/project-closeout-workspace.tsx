"use client";

import {
  AlertTriangle,
  BadgeCheck,
  CalendarClock,
  CheckCircle2,
  ClipboardCheck,
  FileCheck2,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";

type ChecklistStatus = "pending" | "in_progress" | "completed" | "blocked" | "not_applicable";
type PackageStatus = "draft" | "in_progress" | "submitted" | "accepted" | "rejected" | "closed";
type WarrantyStatus = "draft" | "active" | "expiring" | "expired" | "closed";

type CloseoutPayload = {
  project: { id: string; name: string; status: string; endsAt: string };
  packages: Array<{
    id: string;
    number: string;
    title: string;
    scope: string | null;
    status: PackageStatus;
    responsibleParty: string | null;
    dueAt: string | null;
    handoverAt: string | null;
    decisionComment: string | null;
    notes: string | null;
    transmittal: { id: string; sequence: number; subject: string; status: string; revision: number } | null;
    checklistItems: Array<{
      id: string;
      title: string;
      category: string;
      required: boolean;
      status: ChecklistStatus;
      storedStatus: ChecklistStatus;
      sourceType: string;
      documentId: string | null;
      document: { id: string; title: string; category: string; fileName: string | null; version: number } | null;
      notes: string | null;
      confirmedBy: string | null;
      confirmedAt: string | null;
    }>;
  }>;
  warranties: Array<{
    id: string;
    number: string;
    title: string;
    category: string;
    status: WarrantyStatus;
    storedStatus: WarrantyStatus;
    counterparty: string | null;
    responsibleParty: string | null;
    startsAt: string | null;
    endsAt: string | null;
    noticeDays: number;
    retentionAmount: number;
    retentionReleaseAt: string | null;
    terms: string | null;
    notes: string | null;
    package: { id: string; number: string; title: string } | null;
    sourceDocumentId: string | null;
  }>;
  documents: Array<{ id: string; title: string; category: string; fileName: string | null; version: number }>;
  transmittals: Array<{ id: string; sequence: number; subject: string; status: string; revision: number }>;
  openAcceptanceIssues: Array<{ id: string; number: string; title: string; severity: string; status: string; dueAt: string | null }>;
  summary: {
    readiness: "not_started" | "in_progress" | "blocked" | "awaiting_acceptance" | "ready" | "warranty" | "completed";
    packageCount: number;
    acceptedPackageCount: number;
    requiredItemCount: number;
    completedItemCount: number;
    blockedItemCount: number;
    remainingItemCount: number;
    completionPercent: number;
    openAcceptanceBlockers: number;
    activeWarrantyCount: number;
    expiringWarrantyCount: number;
    retentionHeld: number;
    canCompleteProject: boolean;
  };
};

const packageStatusLabels: Record<PackageStatus, string> = {
  draft: "Черновик",
  in_progress: "В работе",
  submitted: "На приёмке",
  accepted: "Принят",
  rejected: "Возвращён",
  closed: "Закрыт"
};

const checklistStatusLabels: Record<ChecklistStatus, string> = {
  pending: "Не начато",
  in_progress: "На проверке",
  completed: "Подтверждено",
  blocked: "Блокер",
  not_applicable: "Не применимо"
};

const warrantyStatusLabels: Record<WarrantyStatus, string> = {
  draft: "Нужно уточнить",
  active: "Действует",
  expiring: "Истекает",
  expired: "Истекла",
  closed: "Закрыта"
};

const warrantyTransitions: Record<WarrantyStatus, readonly WarrantyStatus[]> = {
  draft: ["active", "closed"],
  active: ["expiring", "expired", "closed"],
  expiring: ["active", "expired", "closed"],
  expired: ["closed"],
  closed: []
};

const readinessLabels: Record<CloseoutPayload["summary"]["readiness"], string> = {
  not_started: "Не начато",
  in_progress: "Комплектование",
  blocked: "Есть блокеры",
  awaiting_acceptance: "На приёмке",
  ready: "Готово к завершению",
  warranty: "Гарантийный период",
  completed: "Завершено"
};

function dateLabel(value: string | null) {
  if (!value) return "не задано";
  return new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "short", year: "numeric" }).format(new Date(value));
}

function dateInput(value: string | null) {
  return value?.slice(0, 10) ?? "";
}

function money(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

function toneFor(value: string) {
  if (["completed", "accepted", "closed", "active", "ready"].includes(value)) return "good";
  if (["blocked", "rejected", "expired"].includes(value)) return "bad";
  if (["submitted", "expiring", "awaiting_acceptance"].includes(value)) return "warn";
  return "info";
}

async function responseError(response: Response, fallback: string) {
  const body = await response.json().catch(() => ({})) as { error?: string };
  return body.error || fallback;
}

function useCloseout(projectId: string) {
  const [payload, setPayload] = useState<CloseoutPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/closeout`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить контур сдачи."));
      setPayload(await response.json() as CloseoutPayload);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить контур сдачи.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => void load(), [load]);

  const mutate = useCallback(async (key: string, body: Record<string, unknown>) => {
    setSaving(key);
    try {
      const response = await fetch(`/api/projects/${projectId}/closeout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось обновить контур сдачи."));
      setPayload(await response.json() as CloseoutPayload);
      setError("");
      window.dispatchEvent(new Event("pgs:inbox-updated"));
      return true;
    } catch (mutationError) {
      setError(mutationError instanceof Error ? mutationError.message : "Не удалось обновить контур сдачи.");
      return false;
    } finally {
      setSaving("");
    }
  }, [projectId]);

  return { payload, loading, saving, error, load, mutate };
}

export function ProjectCloseoutOverview({
  projectId,
  onOpen
}: {
  projectId: string;
  onOpen: () => void;
}) {
  const { payload, loading } = useCloseout(projectId);
  if (loading) {
    return <section className="closeout-overview" aria-label="Сдача и гарантия"><Loader2 className="spin" size={18} /><span>Проверяю готовность к сдаче...</span></section>;
  }
  if (!payload) return null;
  return (
    <section className={`closeout-overview tone-${toneFor(payload.summary.readiness)}`} aria-label="Сдача и гарантия">
      <div className="closeout-overview-icon"><BadgeCheck size={20} /></div>
      <div>
        <small>Project Closeout &amp; Warranty</small>
        <strong>{readinessLabels[payload.summary.readiness]}</strong>
        <span>{payload.summary.completedItemCount}/{payload.summary.requiredItemCount} требований · {payload.summary.openAcceptanceBlockers} блокирующих замечаний</span>
      </div>
      <div className="closeout-overview-progress" aria-label={`Готовность ${payload.summary.completionPercent}%`}>
        <span style={{ width: `${payload.summary.completionPercent}%` }} />
      </div>
      <button className="button secondary" onClick={onOpen} type="button">Открыть контур</button>
    </section>
  );
}

export function ProjectCloseoutWorkspace({
  projectId,
  canEdit,
  canApprove
}: {
  projectId: string;
  canEdit: boolean;
  canApprove: boolean;
}) {
  const { payload, loading, saving, error, load, mutate } = useCloseout(projectId);
  const [showPackageForm, setShowPackageForm] = useState(false);
  const [showWarrantyForm, setShowWarrantyForm] = useState(false);
  const [completeConfirmed, setCompleteConfirmed] = useState(false);
  const [packageForm, setPackageForm] = useState({ title: "", scope: "", responsibleParty: "", dueAt: "" });
  const [warrantyForm, setWarrantyForm] = useState({
    title: "",
    category: "workmanship",
    packageId: "",
    counterparty: "",
    responsibleParty: "",
    startsAt: "",
    endsAt: "",
    retentionAmount: "0",
    retentionReleaseAt: "",
    terms: ""
  });

  const stages = useMemo(() => [
    { key: "package", label: "Комплектование", active: Boolean(payload?.packages.length), complete: Boolean(payload?.summary.acceptedPackageCount) },
    { key: "acceptance", label: "Приёмка", active: Boolean(payload?.packages.some((item) => ["submitted", "accepted", "closed"].includes(item.status))), complete: Boolean(payload?.packages.length && payload.summary.acceptedPackageCount === payload.summary.packageCount) },
    { key: "warranty", label: "Гарантия", active: Boolean(payload?.summary.activeWarrantyCount || payload?.project.status === "completed"), complete: Boolean(payload?.warranties.length && payload.warranties.every((item) => item.status === "closed")) },
    { key: "closed", label: "Закрыто", active: payload?.project.status === "completed" || payload?.project.status === "archived", complete: payload?.project.status === "archived" }
  ], [payload]);

  if (loading && !payload) {
    return <div className="closeout-loading"><Loader2 className="spin" size={20} /> Загружаю контур сдачи и гарантии...</div>;
  }

  if (!payload) {
    return <div className="callout danger"><AlertTriangle size={18} />{error || "Контур сдачи недоступен."}</div>;
  }

  const createPackage = async (event: React.FormEvent) => {
    event.preventDefault();
    const ok = await mutate("create-package", {
      action: "create_package",
      title: packageForm.title,
      scope: packageForm.scope || null,
      responsibleParty: packageForm.responsibleParty || null,
      dueAt: packageForm.dueAt ? new Date(`${packageForm.dueAt}T12:00:00.000Z`).toISOString() : null
    });
    if (ok) {
      setPackageForm({ title: "", scope: "", responsibleParty: "", dueAt: "" });
      setShowPackageForm(false);
    }
  };

  const createWarranty = async (event: React.FormEvent) => {
    event.preventDefault();
    const toIso = (value: string) => value ? new Date(`${value}T12:00:00.000Z`).toISOString() : null;
    const ok = await mutate("create-warranty", {
      action: "create_warranty",
      title: warrantyForm.title,
      category: warrantyForm.category,
      packageId: warrantyForm.packageId || null,
      counterparty: warrantyForm.counterparty || null,
      responsibleParty: warrantyForm.responsibleParty || null,
      startsAt: toIso(warrantyForm.startsAt),
      endsAt: toIso(warrantyForm.endsAt),
      retentionAmount: Number(warrantyForm.retentionAmount || 0),
      retentionReleaseAt: toIso(warrantyForm.retentionReleaseAt),
      terms: warrantyForm.terms || null,
      noticeDays: 30
    });
    if (ok) {
      setWarrantyForm({
        title: "",
        category: "workmanship",
        packageId: "",
        counterparty: "",
        responsibleParty: "",
        startsAt: "",
        endsAt: "",
        retentionAmount: "0",
        retentionReleaseAt: "",
        terms: ""
      });
      setShowWarrantyForm(false);
    }
  };

  return (
    <div className="closeout-workspace">
      <header className="closeout-header">
        <div>
          <span className="eyebrow">Project Closeout &amp; Warranty v1</span>
          <h2>Сдача, передача и гарантийные обязательства</h2>
          <p>Единый gate между выполнением работ, документами, качеством, КС, передачей заказчику и гарантийным периодом.</p>
        </div>
        <button className="icon-button" onClick={() => void load()} title="Обновить" type="button"><RefreshCw className={loading ? "spin" : ""} size={18} /></button>
      </header>

      {error && <div className="callout danger" role="alert"><AlertTriangle size={18} />{error}</div>}

      <section className="closeout-stage-rail" aria-label="Этапы закрытия проекта">
        {stages.map((stage, index) => (
          <div className={`closeout-stage ${stage.active ? "active" : ""} ${stage.complete ? "complete" : ""}`} key={stage.key}>
            <span>{stage.complete ? <CheckCircle2 size={17} /> : index + 1}</span>
            <strong>{stage.label}</strong>
          </div>
        ))}
      </section>

      <section className="closeout-metrics" aria-label="Сводка сдачи">
        <article><ClipboardCheck size={18} /><div><small>Готовность</small><strong>{payload.summary.completionPercent}%</strong><span>{payload.summary.completedItemCount}/{payload.summary.requiredItemCount} требований</span></div></article>
        <article><FileCheck2 size={18} /><div><small>Пакеты</small><strong>{payload.summary.acceptedPackageCount}/{payload.summary.packageCount}</strong><span>принято заказчиком</span></div></article>
        <article className={payload.summary.openAcceptanceBlockers ? "metric-danger" : ""}><AlertTriangle size={18} /><div><small>Блокеры качества</small><strong>{payload.summary.openAcceptanceBlockers}</strong><span>NCR / Punch / дефекты</span></div></article>
        <article className={payload.summary.expiringWarrantyCount ? "metric-warning" : ""}><CalendarClock size={18} /><div><small>Гарантия</small><strong>{payload.summary.activeWarrantyCount}</strong><span>{payload.summary.expiringWarrantyCount} требуют внимания</span></div></article>
        <article><ShieldCheck size={18} /><div><small>Удержания</small><strong>{money(payload.summary.retentionHeld)}</strong><span>до подтверждённого высвобождения</span></div></article>
      </section>

      {!payload.packages.length ? (
        <section className="closeout-empty">
          <BadgeCheck size={28} />
          <div>
            <h3>Контур сдачи ещё не сформирован</h3>
            <p>PGS создаст стартовый пакет, найдёт кандидаты среди документов и вынесет открытые блокирующие замечания. Найденные файлы останутся «на проверке», пока ответственный не подтвердит их.</p>
          </div>
          {canEdit && <button className="button primary" disabled={Boolean(saving)} onClick={() => void mutate("bootstrap", { action: "bootstrap" })} type="button"><Plus size={17} /> Сформировать контур сдачи</button>}
        </section>
      ) : (
        <>
          <section className="closeout-section-head">
            <div><h3>Пакеты сдачи</h3><p>Каждый пакет проходит checklist, отправку, приёмку и закрытие.</p></div>
            {canEdit && <button className="button secondary" onClick={() => setShowPackageForm((value) => !value)} type="button"><Plus size={16} /> Новый пакет</button>}
          </section>

          {showPackageForm && (
            <form className="closeout-create-form" onSubmit={createPackage}>
              <label className="field"><span>Название пакета</span><input required minLength={3} value={packageForm.title} onChange={(event) => setPackageForm({ ...packageForm, title: event.target.value })} placeholder="Сдача инженерных систем" /></label>
              <label className="field field-wide"><span>Состав / границы</span><textarea value={packageForm.scope} onChange={(event) => setPackageForm({ ...packageForm, scope: event.target.value })} placeholder="Разделы, этапы и результат передачи" /></label>
              <label className="field"><span>Ответственный</span><input value={packageForm.responsibleParty} onChange={(event) => setPackageForm({ ...packageForm, responsibleParty: event.target.value })} /></label>
              <label className="field"><span>Срок сдачи</span><input type="date" value={packageForm.dueAt} onChange={(event) => setPackageForm({ ...packageForm, dueAt: event.target.value })} /></label>
              <div className="closeout-form-actions"><button className="button primary" disabled={saving === "create-package"} type="submit">Создать пакет</button><button className="button ghost" onClick={() => setShowPackageForm(false)} type="button">Отмена</button></div>
            </form>
          )}

          <div className="closeout-package-list">
            {payload.packages.map((closeoutPackage) => {
              const required = closeoutPackage.checklistItems.filter((item) => item.required);
              const complete = required.filter((item) => item.status === "completed" || item.status === "not_applicable").length;
              const packageReady = required.length > 0 && complete === required.length && !payload.summary.openAcceptanceBlockers;
              return (
                <section className={`closeout-package status-${closeoutPackage.status}`} key={closeoutPackage.id}>
                  <header>
                    <div className="closeout-package-number">{closeoutPackage.number}</div>
                    <div className="closeout-package-title">
                      <h3>{closeoutPackage.title}</h3>
                      <span>{closeoutPackage.scope || "Границы пакета не описаны"}</span>
                    </div>
                    <span className={`badge ${toneFor(closeoutPackage.status)}`}>{packageStatusLabels[closeoutPackage.status]}</span>
                  </header>
                  <div className="closeout-package-meta">
                    <span>Ответственный: <strong>{closeoutPackage.responsibleParty || "не назначен"}</strong></span>
                    <span>Срок: <strong>{dateLabel(closeoutPackage.dueAt)}</strong></span>
                    <span>Checklist: <strong>{complete}/{required.length}</strong></span>
                  </div>
                  <div className="closeout-progress"><span style={{ width: `${required.length ? Math.round((complete / required.length) * 100) : 0}%` }} /></div>

                  <div className="closeout-package-controls">
                    <label>
                      <span>Финальная выдача</span>
                      <select
                        disabled={!canEdit || Boolean(saving)}
                        value={closeoutPackage.transmittal?.id ?? ""}
                        onChange={(event) => void mutate(`transmittal-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, transmittalId: event.target.value || null })}
                      >
                        <option value="">Не привязана</option>
                        {payload.transmittals.map((item) => <option key={item.id} value={item.id}>TR-{String(item.sequence).padStart(3, "0")} · {item.subject} · {item.status}</option>)}
                      </select>
                    </label>
                    <label>
                      <span>Дата передачи</span>
                      <input
                        disabled={!canEdit || Boolean(saving)}
                        type="date"
                        value={dateInput(closeoutPackage.handoverAt)}
                        onChange={(event) => void mutate(`handover-${closeoutPackage.id}`, {
                          action: "update_package",
                          id: closeoutPackage.id,
                          handoverAt: event.target.value ? new Date(`${event.target.value}T12:00:00.000Z`).toISOString() : null
                        })}
                      />
                    </label>
                  </div>

                  <div className="closeout-checklist">
                    {closeoutPackage.checklistItems.map((item) => (
                      <div className={`closeout-checklist-row status-${item.status}`} key={item.id}>
                        <span className="closeout-checklist-state">{item.status === "completed" || item.status === "not_applicable" ? <CheckCircle2 size={17} /> : item.status === "blocked" ? <AlertTriangle size={17} /> : <span />}</span>
                        <div className="closeout-checklist-copy">
                          <strong>{item.title}</strong>
                          <small>{item.notes}</small>
                          {item.confirmedBy && <em>Подтвердил: {item.confirmedBy}</em>}
                        </div>
                        {item.sourceType === "document_requirement" ? (
                          <select
                            aria-label={`Документ для ${item.title}`}
                            disabled={!canEdit || Boolean(saving)}
                            value={item.documentId ?? ""}
                            onChange={(event) => void mutate(`check-doc-${item.id}`, {
                              action: "update_checklist_item",
                              id: item.id,
                              status: item.storedStatus,
                              documentId: event.target.value || null
                            })}
                          >
                            <option value="">Выберите документ</option>
                            {payload.documents.map((document) => <option key={document.id} value={document.id}>{document.title} · v{document.version}</option>)}
                          </select>
                        ) : <span className="closeout-source-label">{item.category}</span>}
                        <select
                          aria-label={`Статус ${item.title}`}
                          disabled={!canEdit || Boolean(saving)}
                          value={item.status}
                          onChange={(event) => void mutate(`check-${item.id}`, {
                            action: "update_checklist_item",
                            id: item.id,
                            status: event.target.value,
                            documentId: item.documentId
                          })}
                        >
                          {Object.entries(checklistStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                        </select>
                      </div>
                    ))}
                  </div>

                  {closeoutPackage.decisionComment && <div className="closeout-decision-comment"><strong>Решение:</strong> {closeoutPackage.decisionComment}</div>}

                  {canEdit && (
                    <footer className="closeout-package-actions">
                      {["draft", "rejected"].includes(closeoutPackage.status) && <button className="button secondary" disabled={Boolean(saving)} onClick={() => void mutate(`start-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, status: "in_progress" })} type="button">В работу</button>}
                      {closeoutPackage.status === "in_progress" && <button className="button primary" disabled={!packageReady || Boolean(saving)} onClick={() => void mutate(`submit-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, status: "submitted" })} title={!packageReady ? "Сначала закройте обязательные пункты и блокеры качества" : undefined} type="button"><Send size={16} /> Отправить на приёмку</button>}
                      {closeoutPackage.status === "submitted" && canApprove && <>
                        <button className="button primary" disabled={Boolean(saving)} onClick={() => void mutate(`accept-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, status: "accepted", decisionComment: "Пакет принят." })} type="button"><CheckCircle2 size={16} /> Принять</button>
                        <button className="button secondary" disabled={Boolean(saving)} onClick={() => void mutate(`revise-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, status: "in_progress", decisionComment: "Возвращено на доработку." })} type="button">На доработку</button>
                      </>}
                      {closeoutPackage.status === "accepted" && canApprove && <button className="button secondary" disabled={Boolean(saving)} onClick={() => void mutate(`close-${closeoutPackage.id}`, { action: "update_package", id: closeoutPackage.id, status: "closed" })} type="button">Закрыть пакет</button>}
                    </footer>
                  )}
                </section>
              );
            })}
          </div>
        </>
      )}

      {payload.openAcceptanceIssues.length > 0 && (
        <section className="closeout-blockers">
          <div className="closeout-section-head"><div><h3>Блокеры приёмки</h3><p>Эти замечания должны быть закрыты в существующем контуре качества.</p></div><span className="badge bad">{payload.openAcceptanceIssues.length}</span></div>
          {payload.openAcceptanceIssues.map((issue) => (
            <div key={issue.id}><strong>{issue.number}</strong><span>{issue.title}</span><span className={`badge ${issue.severity === "critical" || issue.severity === "high" ? "bad" : "warn"}`}>{issue.status}</span></div>
          ))}
        </section>
      )}

      <section className="closeout-section-head warranty-head">
        <div><h3>Гарантийные обязательства и удержания</h3><p>Только подтверждённые договорные сроки и суммы. Пустые поля остаются видимым ограничением.</p></div>
        {canEdit && <button className="button secondary" onClick={() => setShowWarrantyForm((value) => !value)} type="button"><Plus size={16} /> Добавить обязательство</button>}
      </section>

      {showWarrantyForm && (
        <form className="closeout-create-form warranty-form" onSubmit={createWarranty}>
          <label className="field"><span>Обязательство</span><input required minLength={3} value={warrantyForm.title} onChange={(event) => setWarrantyForm({ ...warrantyForm, title: event.target.value })} placeholder="Гарантия на монтажные работы" /></label>
          <label className="field"><span>Категория</span><select value={warrantyForm.category} onChange={(event) => setWarrantyForm({ ...warrantyForm, category: event.target.value })}><option value="workmanship">Работы</option><option value="materials">Материалы</option><option value="equipment">Оборудование</option><option value="retention">Удержание</option><option value="other">Другое</option></select></label>
          <label className="field"><span>Пакет сдачи</span><select value={warrantyForm.packageId} onChange={(event) => setWarrantyForm({ ...warrantyForm, packageId: event.target.value })}><option value="">Весь проект</option>{payload.packages.map((item) => <option key={item.id} value={item.id}>{item.number} · {item.title}</option>)}</select></label>
          <label className="field"><span>Контрагент</span><input value={warrantyForm.counterparty} onChange={(event) => setWarrantyForm({ ...warrantyForm, counterparty: event.target.value })} /></label>
          <label className="field"><span>Ответственный</span><input value={warrantyForm.responsibleParty} onChange={(event) => setWarrantyForm({ ...warrantyForm, responsibleParty: event.target.value })} /></label>
          <label className="field"><span>Начало</span><input type="date" value={warrantyForm.startsAt} onChange={(event) => setWarrantyForm({ ...warrantyForm, startsAt: event.target.value })} /></label>
          <label className="field"><span>Окончание</span><input type="date" value={warrantyForm.endsAt} onChange={(event) => setWarrantyForm({ ...warrantyForm, endsAt: event.target.value })} /></label>
          <label className="field"><span>Удержание, ₽</span><input min="0" step="0.01" type="number" value={warrantyForm.retentionAmount} onChange={(event) => setWarrantyForm({ ...warrantyForm, retentionAmount: event.target.value })} /></label>
          <label className="field"><span>Высвобождение</span><input type="date" value={warrantyForm.retentionReleaseAt} onChange={(event) => setWarrantyForm({ ...warrantyForm, retentionReleaseAt: event.target.value })} /></label>
          <label className="field field-wide"><span>Условия</span><textarea value={warrantyForm.terms} onChange={(event) => setWarrantyForm({ ...warrantyForm, terms: event.target.value })} /></label>
          <div className="closeout-form-actions"><button className="button primary" disabled={saving === "create-warranty"} type="submit">Сохранить обязательство</button><button className="button ghost" onClick={() => setShowWarrantyForm(false)} type="button">Отмена</button></div>
        </form>
      )}

      <div className="warranty-register">
        {payload.warranties.length ? payload.warranties.map((warranty) => (
          <article className={`warranty-row status-${warranty.status}`} key={warranty.id}>
            <div className="warranty-identity"><strong>{warranty.number}</strong><span>{warranty.title}</span><small>{warranty.package ? `${warranty.package.number} · ${warranty.package.title}` : "Весь проект"}</small></div>
            <div><small>Период</small><strong>{dateLabel(warranty.startsAt)} — {dateLabel(warranty.endsAt)}</strong></div>
            <div><small>Удержание</small><strong>{money(warranty.retentionAmount)}</strong><span>до {dateLabel(warranty.retentionReleaseAt)}</span></div>
            <div><small>Ответственный</small><strong>{warranty.responsibleParty || "не назначен"}</strong><span>{warranty.counterparty || "контрагент не указан"}</span></div>
            <select
              aria-label={`Статус ${warranty.title}`}
              disabled={!canEdit || Boolean(saving)}
              value={warranty.storedStatus}
              onChange={(event) => void mutate(`warranty-${warranty.id}`, { action: "update_warranty", id: warranty.id, status: event.target.value })}
            >
              {[warranty.storedStatus, ...warrantyTransitions[warranty.storedStatus]].map((value) => <option key={value} value={value}>{warrantyStatusLabels[value]}</option>)}
            </select>
          </article>
        )) : <div className="empty-state compact">Гарантийные обязательства ещё не заведены.</div>}
      </div>

      {canApprove && payload.packages.length > 0 && payload.project.status !== "completed" && payload.project.status !== "archived" && (
        <section className={`closeout-finalize ${payload.summary.canCompleteProject ? "is-ready" : ""}`}>
          <div><BadgeCheck size={22} /><div><h3>Завершение проекта</h3><p>{payload.summary.canCompleteProject ? "Все обязательные gates закрыты. После подтверждения проект перейдёт в completed, а гарантии продолжат контролироваться." : `Осталось требований: ${payload.summary.remainingItemCount}; блокеров качества: ${payload.summary.openAcceptanceBlockers}; непринятых пакетов: ${payload.summary.packageCount - payload.summary.acceptedPackageCount}.`}</p></div></div>
          <label><input checked={completeConfirmed} disabled={!payload.summary.canCompleteProject} onChange={(event) => setCompleteConfirmed(event.target.checked)} type="checkbox" /> Подтверждаю завершение договорного контура проекта</label>
          <button className="button primary" disabled={!payload.summary.canCompleteProject || !completeConfirmed || Boolean(saving)} onClick={() => void mutate("complete-project", { action: "complete_project" })} type="button"><BadgeCheck size={17} /> Завершить проект</button>
        </section>
      )}
    </div>
  );
}
