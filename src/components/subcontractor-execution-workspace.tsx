"use client";

import { AlertTriangle, ClipboardList, FileText, Landmark, ReceiptText, TimerReset, Users } from "lucide-react";
import React from "react";
import {
  buildSubcontractorExecutionIntelligence,
  type ContractorExecutionCard,
  type ExecutionTone
} from "@/lib/subcontractor-execution-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type SubcontractorExecutionWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  payments: Payment[];
  procurementRequests: ProcurementRequest[];
  dailyReports: DailyReport[];
  risks: Risk[];
  documents: ProjectDocument[];
  documentChecklist: DocumentChecklistItem[];
  onNavigate: (tab: string) => void;
};

function toneClass(tone: ExecutionTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function money(value: number) {
  if (!Number.isFinite(value)) return "0 ₽";
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ExecutionTone }) {
  return (
    <div className={`execution-control-card metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function ContractorCard({ contractor }: { contractor: ContractorExecutionCard }) {
  return (
    <article className={`execution-contractor-card tone-${contractor.tone}`}>
      <div>
        <strong>{contractor.name}</strong>
        <span>{contractor.role} · {contractor.readiness}</span>
      </div>
      <dl>
        <div><dt>Фронты</dt><dd>{contractor.activeItems}/{contractor.plannedItems}</dd></div>
        <div><dt>Задержки</dt><dd>{contractor.delayedItems + contractor.stoppedItems}</dd></div>
        <div><dt>Бюджет</dt><dd>{money(contractor.budgetAmount)}</dd></div>
        <div><dt>Оплачено</dt><dd>{money(contractor.paidAmount)}</dd></div>
      </dl>
      <p>{contractor.nextAction}</p>
      {contractor.latestReport && <small>{contractor.latestReport}</small>}
    </article>
  );
}

export function SubcontractorExecutionWorkspace({
  project,
  budgetItems,
  scheduleItems,
  payments,
  procurementRequests,
  dailyReports,
  risks,
  documents,
  documentChecklist,
  onNavigate
}: SubcontractorExecutionWorkspaceProps) {
  const model = buildSubcontractorExecutionIntelligence({
    project,
    budgetItems,
    scheduleItems,
    payments,
    procurementRequests,
    dailyReports,
    risks,
    documents,
    documentChecklist
  });

  return (
    <section className="execution-control-workspace" aria-label="Subcontractor & Execution Control">
      <div className={`execution-control-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Subcontractor & Execution Control</div>
          <h3>Подрядчики / Исполнение</h3>
          <p>Контроль владельцев фронтов, подрядчиков, задержек, документов, оплат и готовности к КС по данным графика, ВОР, рапортов и рисков.</p>
          <div className="execution-control-badges">
            <span className={`badge ${toneClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge blue">{model.summary.contractorCount} исполнителей</span>
            <span className="badge gray">{model.summary.activeFronts} активных фронтов</span>
          </div>
        </div>
        <div className="execution-control-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("График")}>
            <TimerReset size={16} />
            График
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
            <FileText size={16} />
            Документы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("КС")}>
            <ReceiptText size={16} />
            КС
          </button>
        </div>
      </div>

      <div className="execution-control-grid metrics">
        <Metric title="Execution status" value={model.summary.status} detail={model.summary.nextStep} tone={model.summary.tone} />
        <Metric title="Проблемные фронты" value={String(model.summary.delayedFronts)} detail={`${model.summary.unassignedItems} без владельца`} tone={model.summary.delayedFronts || model.summary.unassignedItems ? "bad" : "good"} />
        <Metric title="Подрядный бюджет" value={money(model.summary.subcontractBudget)} detail={`оплачено ${money(model.summary.paidToSubcontractors)}`} tone={model.summary.subcontractBudget ? "info" : "neutral"} />
        <Metric title="Документы / оплаты" value={`${model.summary.documentBlockers}/${money(model.summary.overduePayments)}`} detail="блокеры / просрочка" tone={model.summary.documentBlockers || model.summary.overduePayments ? "warn" : "good"} />
      </div>

      <div className="execution-control-grid">
        <article className="execution-control-card wide">
          <div className="section-title">
            <Users size={18} />
            <h4>Contractors & owners</h4>
          </div>
          <div className="execution-contractor-grid">
            {model.contractors.length ? model.contractors.map((contractor) => <ContractorCard contractor={contractor} key={contractor.name} />) : <span className="muted">Исполнители появятся после заполнения графика, подрядных платежей или рапортов.</span>}
          </div>
        </article>

        <article className="execution-control-card">
          <div className="section-title">
            <TimerReset size={18} />
            <h4>Execution fronts</h4>
          </div>
          <div className="execution-front-list">
            {model.fronts.length ? model.fronts.map((front) => (
              <div className={`execution-front tone-${front.tone}`} key={front.id}>
                <strong>{front.title}</strong>
                <span>{front.owner} · {front.progress}% · {front.status}</span>
                <small>{front.nextAction}</small>
              </div>
            )) : <span className="muted">Фронты не загружены.</span>}
          </div>
        </article>

        <article className="execution-control-card">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h4>Action register</h4>
          </div>
          <div className="execution-action-list">
            {model.actions.map((action) => (
              <button className={`execution-action priority-${action.priority}`} key={`${action.title}-${action.targetTab}`} type="button" onClick={() => onNavigate(action.targetTab)}>
                <strong>{action.title}</strong>
                <span>{action.ownerRole} · {action.detail}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="execution-control-card wide">
          <div className="section-title">
            <ClipboardList size={18} />
            <h4>{model.handoff.title}</h4>
          </div>
          <pre className="execution-handoff-copy">{model.handoff.copyText}</pre>
        </article>

        <article className="execution-control-card wide">
          <div className="section-title">
            <Landmark size={18} />
            <h4>Ограничения модели</h4>
          </div>
          <ul className="execution-limitations">
            {model.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
