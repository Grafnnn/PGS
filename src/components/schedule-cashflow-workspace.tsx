"use client";

import { AlertTriangle, CalendarDays, ClipboardList, Landmark, PackageCheck, TimerReset } from "lucide-react";
import React from "react";
import {
  buildScheduleCashflowIntelligenceModel,
  type ScheduleCashflowImportHistoryItem,
  type ScheduleCashflowIntelligenceModel,
  type ScheduleCashflowTone
} from "@/lib/schedule-cashflow-intelligence";
import type { BudgetItem, Material, Payment, ProcurementRequest, ScheduleItem } from "@/lib/types";

type ScheduleCashflowDraftState = {
  kind: string;
  mode: "preview" | "commit";
  draft: {
    summary: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
  };
  created?: unknown[];
} | null;

type ScheduleCashflowWorkspaceProps = {
  projectName: string;
  projectStartsAt?: string;
  projectEndsAt?: string;
  contractAmount: number;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  importHistory: ScheduleCashflowImportHistoryItem[];
  draft: ScheduleCashflowDraftState;
  loading: string;
  onSchedulePreview: () => void;
  onScheduleCommit: () => void;
  onCashflowPreview: () => void;
  onCashflowCommit: () => void;
  onNavigate: (tab: string) => void;
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function toneClass(tone: ScheduleCashflowTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function Metric({ title, value, detail, tone = "info" }: { title: string; value: string; detail: string; tone?: ScheduleCashflowTone }) {
  return (
    <div className={`schedule-cashflow-metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function DraftPreview({
  kind,
  model,
  draft
}: {
  kind: "schedule" | "cashflow";
  model: ScheduleCashflowIntelligenceModel;
  draft: ScheduleCashflowDraftState;
}) {
  if (draft?.kind !== kind) return null;
  const rows = draft.draft.items.slice(0, 8);
  return (
    <div className="schedule-cashflow-draft-preview">
      <div className="section-title">
        <ClipboardList size={17} />
        <h4>{kind === "schedule" ? "Preview графика" : "Preview cashflow"}</h4>
      </div>
      <div className="import-meta">
        {Object.entries(draft.draft.summary).map(([key, value]) => (
          <span className="muted" key={key}>{key}: {String(value)}</span>
        ))}
        {draft.mode === "commit" && <span className="badge green">Commit выполнен</span>}
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              {kind === "schedule" ? (
                <>
                  <th>Этап</th>
                  <th className="numeric">Работ</th>
                  <th className="numeric">Сумма</th>
                  <th>Длительность</th>
                  <th>Статус</th>
                </>
              ) : (
                <>
                  <th>Раздел</th>
                  <th className="numeric">Сумма</th>
                  <th>Период</th>
                  <th>Warning</th>
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={`${kind}-${index}`}>
                {kind === "schedule" ? (
                  <>
                    <td>{String(row.stage ?? row.name ?? "-")}</td>
                    <td className="numeric">{String(row.works ?? 0)}</td>
                    <td className="numeric">{money(Number(row.amount ?? 0))}</td>
                    <td>{String(row.suggestedDurationDays ?? "-")} дн.</td>
                    <td>{String(row.status ?? "-")}</td>
                  </>
                ) : (
                  <>
                    <td>{String(row.section ?? "-")}</td>
                    <td className="numeric">{money(Number(row.amount ?? 0))}</td>
                    <td>{String(row.period ?? "нужны даты")}</td>
                    <td>{String(row.warning ?? "-")}</td>
                  </>
                )}
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={kind === "schedule" ? 5 : 4}>Preview пустой. {model.readiness.nextStep}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function ScheduleCashflowWorkspace({
  projectName,
  projectStartsAt,
  projectEndsAt,
  contractAmount,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  importHistory,
  draft,
  loading,
  onSchedulePreview,
  onScheduleCommit,
  onCashflowPreview,
  onCashflowCommit,
  onNavigate
}: ScheduleCashflowWorkspaceProps) {
  const model = buildScheduleCashflowIntelligenceModel({
    project: { name: projectName, startsAt: projectStartsAt, endsAt: projectEndsAt, contractAmount },
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    importHistory
  });
  const scheduleDraft = draft?.kind === "schedule" ? draft : null;
  const cashflowDraft = draft?.kind === "cashflow" ? draft : null;
  const canScheduleCommit = scheduleDraft?.mode === "preview" && !loading;
  const canCashflowCommit = cashflowDraft?.mode === "preview" && !loading;

  return (
    <section className="schedule-cashflow-workspace" aria-label="Schedule & Cashflow Intelligence">
      <div className="schedule-cashflow-header">
        <div>
          <div className="eyebrow">Schedule & Cashflow Intelligence</div>
          <h3>График работ → недельный cashflow → план действий</h3>
          <p className="muted">Пакеты строятся из ВОР и материалов. Preview ничего не меняет, commit остается явным действием пользователя.</p>
        </div>
        <div className="schedule-cashflow-actions">
          <span className={`badge ${toneClass(model.tone)}`}>{model.readiness.label}</span>
          <button className="button secondary compact-button" disabled={Boolean(loading)} type="button" onClick={onSchedulePreview}>
            <TimerReset size={16} />
            {loading === "schedule-preview" ? "Готовлю..." : "Preview графика"}
          </button>
          <button className="button primary compact-button" disabled={!canScheduleCommit} type="button" onClick={onScheduleCommit}>
            Commit графика
          </button>
          <button className="button secondary compact-button" disabled={Boolean(loading)} type="button" onClick={onCashflowPreview}>
            <Landmark size={16} />
            {loading === "cashflow-preview" ? "Готовлю..." : "Preview cashflow"}
          </button>
          <button className="button primary compact-button" disabled={!canCashflowCommit} type="button" onClick={onCashflowCommit}>
            Commit cashflow
          </button>
        </div>
      </div>

      <div className="schedule-cashflow-summary-grid">
        <Metric title="Пакетов работ" value={String(model.summary.packageCount)} detail={`${model.summary.readyPackages} готовы · ${model.summary.blockedPackages} блокеры`} tone={model.summary.blockedPackages ? "warn" : "good"} />
        <Metric title="Недель плана" value={String(model.summary.scheduleWeeks)} detail="draft timeline из ВОР" />
        <Metric title="Работы" value={money(model.summary.totalWorkAmount)} detail="по рабочим строкам ВОР" />
        <Metric title="Материалы" value={money(model.summary.totalMaterialAmount)} detail={`${model.summary.procurementDependencies} зависимостей`} tone={model.summary.procurementDependencies ? "warn" : "info"} />
        <Metric title="Пик потребности" value={money(model.summary.peakCashNeed)} detail={model.summary.peakCashWeek} tone={model.summary.peakCashNeed ? "bad" : "good"} />
      </div>

      <div className={`schedule-cashflow-readiness tone-${model.tone}`}>
        <AlertTriangle size={18} />
        <div>
          <strong>{model.readiness.nextStep}</strong>
          {model.readiness.blockers.length ? (
            <ul>
              {model.readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <span>Критичных блокеров нет. Проверьте черновой план и выполните явный commit при готовности.</span>
          )}
        </div>
      </div>

      <div className="schedule-cashflow-grid">
        <article className="schedule-cashflow-card wide">
          <div className="section-title">
            <PackageCheck size={17} />
            <h4>Пакеты работ</h4>
          </div>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Пакет</th>
                  <th>Категория</th>
                  <th className="numeric">Сумма</th>
                  <th>Длительность</th>
                  <th>Ресурс</th>
                  <th>Готовность</th>
                </tr>
              </thead>
              <tbody>
                {model.packages.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.section}</strong>
                      <small>{item.rowCount} строк · confidence {Math.round(item.confidence * 100)}%</small>
                    </td>
                    <td>{item.category}</td>
                    <td className="numeric">{money(item.totalAmount)}</td>
                    <td>{item.suggestedDurationDays} дн.</td>
                    <td>{item.suggestedCrew}</td>
                    <td>
                      <span className={`badge ${item.readiness === "ready" ? "green" : "yellow"}`}>{item.readiness}</span>
                      {item.blockers.length ? <small>{item.blockers.join("; ")}</small> : null}
                    </td>
                  </tr>
                ))}
                {!model.packages.length && (
                  <tr>
                    <td colSpan={6}>Нет пакетов. Загрузите ВОР или добавьте бюджетные строки.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="schedule-cashflow-card">
          <div className="section-title">
            <CalendarDays size={17} />
            <h4>Недельный график</h4>
          </div>
          <div className="timeline-week-list">
            {model.timeline.slice(0, 8).map((week) => (
              <div className={`timeline-week-card tone-${week.tone}`} key={week.week}>
                <strong>{week.label}</strong>
                <span>{week.packages.join(", ")}</span>
                <small>{money(week.totalAmount)} · {week.blockers.length ? week.blockers.join("; ") : "без блокеров"}</small>
              </div>
            ))}
            {!model.timeline.length && <p className="muted">Недельный план появится после ВОР.</p>}
          </div>
        </article>

        <article className="schedule-cashflow-card">
          <div className="section-title">
            <Landmark size={17} />
            <h4>Cashflow по неделям</h4>
          </div>
          <div className="cashflow-week-list">
            {model.cashflow.slice(0, 8).map((week) => (
              <div className={`cashflow-week-card tone-${week.tone}`} key={week.week}>
                <strong>{week.label}</strong>
                <span>Net: {money(week.net)}</span>
                <small>Work {money(week.workCost)} · Mat {money(week.materialCost)} · Cum {money(week.cumulative)}</small>
              </div>
            ))}
            {!model.cashflow.length && <p className="muted">Cashflow появится после построения пакетов работ.</p>}
          </div>
        </article>

        <article className="schedule-cashflow-card">
          <div className="section-title">
            <AlertTriangle size={17} />
            <h4>Сигналы риска</h4>
          </div>
          {model.risks.length ? (
            <div className="schedule-risk-list">
              {model.risks.map((risk) => (
                <div key={`${risk.title}-${risk.detail}`}>
                  <span className={`badge ${risk.severity === "high" ? "red" : risk.severity === "medium" ? "yellow" : "blue"}`}>{risk.severity}</span>
                  <strong>{risk.title}</strong>
                  <small>{risk.detail}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Критичных сигналов по графику/cashflow не найдено.</p>
          )}
        </article>

        <article className="schedule-cashflow-card executive-plan-card wide">
          <div className="section-title">
            <ClipboardList size={17} />
            <h4>Executive weekly plan</h4>
          </div>
          <div className="executive-plan-grid">
            <div>
              <strong>Фокус недели</strong>
              <ul>
                {(model.executivePlan.thisWeekFocus.length ? model.executivePlan.thisWeekFocus : ["Сначала закрыть исходные данные ВОР"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Снабжение</strong>
              <ul>
                {(model.executivePlan.procurementActions.length ? model.executivePlan.procurementActions : ["Критичных материальных зависимостей не найдено"]).map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Финансы</strong>
              <ul>
                {model.executivePlan.financeCashNeeds.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div>
              <strong>Следующие действия</strong>
              <ul>
                {model.executivePlan.recommendedNextActions.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
          <div className="executive-draft-text">{model.executivePlan.draftText}</div>
          <div className="row-actions">
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Материалы")}>
              Материалы
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Бюджет / ВОР")}>
              ВОР
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Аналитика")}>
              Project Intelligence
            </button>
          </div>
        </article>
      </div>

      <DraftPreview kind="schedule" model={model} draft={draft} />
      <DraftPreview kind="cashflow" model={model} draft={draft} />
    </section>
  );
}
