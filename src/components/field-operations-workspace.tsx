"use client";

import { AlertTriangle, Camera, ClipboardList, FileText, Package, ReceiptText, TimerReset, Users } from "lucide-react";
import React from "react";
import {
  buildFieldOperationsIntelligence,
  type FieldOpsSnapshot,
  type FieldOpsTone
} from "@/lib/field-operations-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type FieldOperationsWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
  documents: ProjectDocument[];
  documentChecklist: DocumentChecklistItem[];
  onNavigate: (tab: string) => void;
};

function badgeClass(tone: FieldOpsTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: FieldOpsTone }) {
  return (
    <div className={`field-ops-card metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SnapshotCard({ snapshot }: { snapshot: FieldOpsSnapshot }) {
  return (
    <article className={`field-ops-snapshot tone-${snapshot.tone}`}>
      <div>
        <strong>{snapshot.title}</strong>
        <span>{snapshot.status} · {snapshot.workforce}</span>
      </div>
      <dl>
        <div><dt>Погода</dt><dd>{snapshot.weather}</dd></div>
        <div><dt>Техника</dt><dd>{snapshot.equipment}</dd></div>
      </dl>
      <p>{snapshot.completedWorks}</p>
      <small>{snapshot.downtime !== "Простоев не указано" ? snapshot.downtime : snapshot.issues}</small>
    </article>
  );
}

export function FieldOperationsWorkspace({
  project,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  dailyReports,
  risks,
  documents,
  documentChecklist,
  onNavigate
}: FieldOperationsWorkspaceProps) {
  const model = buildFieldOperationsIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    dailyReports,
    risks,
    documents,
    documentChecklist
  });

  return (
    <section className="field-ops-workspace" aria-label="Field Operations & Daily Reports">
      <div className={`field-ops-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Field Operations & Daily Reports</div>
          <h3>Площадка / Рапорты</h3>
          <p>Ежедневный факт стройплощадки: люди, техника, объемы, материалы, простои, замечания и связь с графиком, КС, рисками и снабжением.</p>
          <div className="field-ops-badges">
            <span className={`badge ${badgeClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge blue">{model.summary.reportCount} рапортов</span>
            <span className="badge gray">{model.summary.totalWorkers} рабочих</span>
          </div>
        </div>
        <div className="field-ops-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("График")}>
            <TimerReset size={16} />
            График
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Материалы")}>
            <Package size={16} />
            Материалы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("КС")}>
            <ReceiptText size={16} />
            КС
          </button>
        </div>
      </div>

      <div className="field-ops-grid metrics">
        <Metric title="Daily site facts" value={model.summary.status} detail={model.summary.nextStep} tone={model.summary.tone} />
        <Metric title="Workforce & equipment" value={`${model.summary.totalWorkers}/${model.summary.totalEngineers}`} detail={`${model.summary.equipmentMentions} единиц/упоминаний техники`} tone={model.summary.reportCount ? "info" : "neutral"} />
        <Metric title="Downtime / issues" value={`${model.summary.downtimeReports}/${model.summary.issueReports}`} detail="простои / замечания" tone={model.summary.downtimeReports || model.summary.issueReports ? "bad" : model.summary.reportCount ? "good" : "info"} />
        <Metric title="Fact-to-system links" value={`${model.summary.linkedScheduleItems}/${model.summary.materialSignals}`} detail="график / материалы" tone={model.summary.linkedScheduleItems || model.summary.materialSignals ? "warn" : "info"} />
      </div>

      <div className="field-ops-grid">
        <article className="field-ops-card wide">
          <div className="section-title">
            <ClipboardList size={18} />
            <h4>Daily report snapshots</h4>
          </div>
          <div className="field-ops-snapshot-grid">
            {model.snapshots.length ? model.snapshots.map((snapshot) => <SnapshotCard key={snapshot.id} snapshot={snapshot} />) : <span className="muted">Рапорты появятся после первого ежедневного факта площадки.</span>}
          </div>
        </article>

        <article className="field-ops-card">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h4>Field signals</h4>
          </div>
          <div className="field-ops-signal-list">
            {model.signals.length ? model.signals.map((signal) => (
              <button className={`field-ops-signal tone-${signal.tone}`} key={`${signal.title}-${signal.targetTab}`} type="button" onClick={() => onNavigate(signal.targetTab)}>
                <strong>{signal.title}</strong>
                <span>{signal.detail}</span>
              </button>
            )) : <span className="muted">Сигналы появятся после заполнения рапортов, графика, материалов и документов.</span>}
          </div>
        </article>

        <article className="field-ops-card">
          <div className="section-title">
            <Users size={18} />
            <h4>Action register</h4>
          </div>
          <div className="field-ops-action-list">
            {model.actions.map((action) => (
              <button className={`field-ops-action priority-${action.priority}`} key={`${action.title}-${action.targetTab}`} type="button" onClick={() => onNavigate(action.targetTab)}>
                <strong>{action.title}</strong>
                <span>{action.ownerRole} · {action.detail}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="field-ops-card wide">
          <div className="section-title">
            <FileText size={18} />
            <h4>{model.handoff.title}</h4>
          </div>
          <pre className="field-ops-handoff-copy">{model.handoff.copyText}</pre>
        </article>

        <article className="field-ops-card wide">
          <div className="section-title">
            <Camera size={18} />
            <h4>Фото / исполнительская связь</h4>
          </div>
          <ul className="field-ops-limitations">
            {model.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
