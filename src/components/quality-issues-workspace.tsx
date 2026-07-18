"use client";

import { AlertTriangle, ClipboardCheck, FileText, ListChecks, ReceiptText, ShieldAlert } from "lucide-react";
import React from "react";
import { buildQualityIssuesIntelligence, type QualityTone } from "@/lib/quality-issues-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type QualityIssuesWorkspaceProps = {
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

function badgeClass(tone: QualityTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: QualityTone }) {
  return (
    <div className={`quality-issues-card metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function QualityIssuesWorkspace(props: QualityIssuesWorkspaceProps) {
  const model = buildQualityIssuesIntelligence(props);

  return (
    <section className="quality-issues-workspace" aria-label="Quality Issues and Punch List">
      <div className={`quality-issues-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Quality / Issues &amp; Punch List</div>
          <h3>Качество / Замечания</h3>
          <p>Единый контроль замечаний площадки, рисков, evidence, графика и блокеров закрытия.</p>
          <div className="quality-issues-badges">
            <span className={`badge ${badgeClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge blue">{model.summary.totalIssues} signals</span>
            <span className="badge gray">{model.summary.acceptanceBlockers} КС blockers</span>
          </div>
        </div>
        <div className="quality-issues-actions">
          <button className="button primary compact-button" type="button" onClick={() => props.onNavigate("Исполнение")}>
            <ListChecks size={16} />
            Реестр NCR / Punch
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Рапорты")}>
            <ClipboardCheck size={16} />
            Рапорты
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("Документы")}>
            <FileText size={16} />
            Документы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => props.onNavigate("КС")}>
            <ReceiptText size={16} />
            КС
          </button>
        </div>
      </div>

      <div className="quality-issues-grid metrics">
        <Metric title="Quality status" value={model.summary.status} detail={model.summary.nextStep} tone={model.summary.tone} />
        <Metric title="Замечания" value={String(model.summary.totalIssues)} detail={`${model.summary.criticalIssues} critical`} tone={model.summary.criticalIssues ? "bad" : model.summary.totalIssues ? "warn" : "good"} />
        <Metric title="Рапорты / evidence" value={`${model.summary.reportIssues}/${model.summary.evidenceDocuments}`} detail="site signals / подтверждения" tone={model.summary.reportIssues || model.summary.evidenceDocuments ? "info" : "neutral"} />
        <Metric title="График / КС" value={`${model.summary.delayedWorkItems}/${model.summary.acceptanceBlockers}`} detail="отклонения / блокеры" tone={model.summary.delayedWorkItems || model.summary.acceptanceBlockers ? "warn" : "good"} />
      </div>

      <div className="quality-issues-grid">
        <article className="quality-issues-card wide">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h4>Issue register</h4>
          </div>
          <div className="quality-issues-list">
            {model.issues.length ? model.issues.map((item) => (
              <button className={`quality-issue-item tone-${item.tone}`} key={item.id} type="button" onClick={() => props.onNavigate(item.targetTab)}>
                <strong>{item.title}</strong>
                <span>{item.source} · {item.severity}</span>
                <small>{item.detail}</small>
                <em>{item.nextAction}</em>
              </button>
            )) : <span className="muted">Сигналы качества появятся из рапортов, рисков, графика и документации проекта.</span>}
          </div>
        </article>

        <article className="quality-issues-card">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h4>Punch actions</h4>
          </div>
          <div className="quality-issues-action-list">
            {model.actions.map((item) => (
              <button className={`quality-issues-action priority-${item.priority}`} key={`${item.title}-${item.targetTab}`} type="button" onClick={() => props.onNavigate(item.targetTab)}>
                <strong>{item.title}</strong>
                <span>{item.ownerRole} · {item.detail}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="quality-issues-card">
          <div className="section-title">
            <ClipboardCheck size={18} />
            <h4>{model.handoff.title}</h4>
          </div>
          <pre className="quality-issues-handoff-copy">{model.handoff.copyText}</pre>
        </article>

        <article className="quality-issues-card wide">
          <div className="section-title">
            <FileText size={18} />
            <h4>Ограничения v1</h4>
          </div>
          <ul className="quality-issues-limitations">
            {model.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
