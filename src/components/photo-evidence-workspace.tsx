"use client";

import { Camera, ClipboardList, FileText, ReceiptText, ShieldCheck, TimerReset } from "lucide-react";
import React from "react";
import { buildPhotoEvidenceIntelligence, type EvidenceTone } from "@/lib/photo-evidence-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type PhotoEvidenceWorkspaceProps = {
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

function badgeClass(tone: EvidenceTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function Metric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: EvidenceTone }) {
  return (
    <div className={`photo-evidence-card metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function PhotoEvidenceWorkspace({
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
}: PhotoEvidenceWorkspaceProps) {
  const model = buildPhotoEvidenceIntelligence({
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
    <section className="photo-evidence-workspace" aria-label="Photo & Evidence Capture">
      <div className={`photo-evidence-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Photo & Evidence Capture</div>
          <h3>Фотофиксация / Evidence</h3>
          <p>Доказательная база проекта: фото, акты, журналы и исполнительные материалы, связанные с рапортами, графиком, КС и документами.</p>
          <div className="photo-evidence-badges">
            <span className={`badge ${badgeClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge blue">{model.summary.evidenceDocuments} evidence docs</span>
            <span className="badge gray">{model.summary.photoDocuments} фото</span>
          </div>
        </div>
        <div className="photo-evidence-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
            <FileText size={16} />
            Документы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Рапорты")}>
            <ClipboardList size={16} />
            Рапорты
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("КС")}>
            <ReceiptText size={16} />
            КС
          </button>
        </div>
      </div>

      <div className="photo-evidence-grid metrics">
        <Metric title="Evidence status" value={model.summary.status} detail={model.summary.nextStep} tone={model.summary.tone} />
        <Metric title="Фото / документы" value={`${model.summary.photoDocuments}/${model.summary.evidenceDocuments}`} detail="photo / evidence docs" tone={model.summary.evidenceDocuments ? "good" : "info"} />
        <Metric title="График / рапорты" value={`${model.summary.linkedScheduleItems}/${model.summary.reportEvidence}`} detail="linked schedule / report mentions" tone={model.summary.linkedScheduleItems || model.summary.reportEvidence ? "info" : "neutral"} />
        <Metric title="КС blockers" value={String(model.summary.ksBlockers)} detail={`${model.summary.missingEvidenceItems} missing evidence`} tone={model.summary.ksBlockers ? "bad" : model.summary.missingEvidenceItems ? "warn" : "good"} />
      </div>

      <div className="photo-evidence-grid">
        <article className="photo-evidence-card wide">
          <div className="section-title">
            <Camera size={18} />
            <h4>Evidence register</h4>
          </div>
          <div className="photo-evidence-list">
            {model.items.length ? model.items.map((item) => (
              <div className={`photo-evidence-item tone-${item.tone}`} key={item.id}>
                <strong>{item.title}</strong>
                <span>{item.category} · {item.source} · {item.linkedTo}</span>
                <small>{item.nextAction}</small>
              </div>
            )) : <span className="muted">Evidence появится после загрузки фото/актов/журналов или заполнения рапортов.</span>}
          </div>
        </article>

        <article className="photo-evidence-card">
          <div className="section-title">
            <ShieldCheck size={18} />
            <h4>Evidence actions</h4>
          </div>
          <div className="photo-evidence-action-list">
            {model.actions.map((action) => (
              <button className={`photo-evidence-action priority-${action.priority}`} key={`${action.title}-${action.targetTab}`} type="button" onClick={() => onNavigate(action.targetTab)}>
                <strong>{action.title}</strong>
                <span>{action.detail}</span>
              </button>
            ))}
          </div>
        </article>

        <article className="photo-evidence-card">
          <div className="section-title">
            <TimerReset size={18} />
            <h4>{model.handoff.title}</h4>
          </div>
          <pre className="photo-evidence-handoff-copy">{model.handoff.copyText}</pre>
        </article>

        <article className="photo-evidence-card wide">
          <div className="section-title">
            <FileText size={18} />
            <h4>Ограничения v1</h4>
          </div>
          <ul className="photo-evidence-limitations">
            {model.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
