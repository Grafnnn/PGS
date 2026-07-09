"use client";

import { ClipboardCheck, Copy, FileText, Landmark, ListChecks, PackageCheck, Send, ShieldAlert, TimerReset } from "lucide-react";
import React from "react";
import {
  buildCommercialProposalIntelligence,
  type CommercialProposalIntelligence,
  type ProposalTone
} from "@/lib/commercial-proposal-intelligence";
import type { ProcurementImportHistoryItem } from "@/lib/procurement-intelligence";
import type { DocumentChecklistItem, PipelineReadiness } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type CommercialProposalWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
  documents: ProjectDocument[];
  readiness: PipelineReadiness | null;
  documentChecklist: DocumentChecklistItem[];
  importHistory: ProcurementImportHistoryItem[];
  onNavigate: (tab: string) => void;
};

function toneClass(tone: ProposalTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function money(value: number | undefined) {
  if (value === undefined || !Number.isFinite(value)) return "не рассчитано";
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function MetricCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ProposalTone }) {
  return (
    <div className={`commercial-proposal-card metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function CopyBlock({ title, text }: { title: string; text: string }) {
  return (
    <div className="commercial-copy-block">
      <div className="section-title">
        <Copy size={16} />
        <h4>{title}</h4>
      </div>
      <pre>{text}</pre>
    </div>
  );
}

function Checklist({ model }: { model: CommercialProposalIntelligence }) {
  return (
    <div className="commercial-checklist">
      {model.submissionChecklist.items.slice(0, 12).map((item) => (
        <div className={`commercial-checklist-item status-${item.status}`} key={`${item.title}-${item.source}`}>
          <div>
            <strong>{item.title}</strong>
            <span>{item.reason}</span>
          </div>
          <small>{item.source}</small>
        </div>
      ))}
    </div>
  );
}

export function CommercialProposalWorkspace({
  project,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  dailyReports,
  risks,
  documents,
  readiness,
  documentChecklist,
  importHistory,
  onNavigate
}: CommercialProposalWorkspaceProps) {
  const model = buildCommercialProposalIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    dailyReports,
    risks,
    documents,
    readiness,
    documentChecklist,
    importHistory
  });

  return (
    <section className="commercial-proposal-workspace" aria-label="Commercial Proposal & Tender Submission">
      <div className={`commercial-proposal-header tone-${model.readiness.tone}`}>
        <div>
          <div className="eyebrow">Commercial Proposal & Tender Submission</div>
          <h3>КП / Подача</h3>
          <p>Черновик коммерческого предложения, внутреннее согласование и пакет тендерной подачи на основе ВОР, договора, документов, графика и снабжения.</p>
          <div className="commercial-proposal-badges">
            <span className={`badge ${toneClass(model.readiness.tone)}`}>{model.readiness.label}</span>
            <span className="badge blue">Proposal readiness</span>
            <span className="badge gray">{model.readiness.canSendToCustomer ? "customer review" : "internal review"}</span>
          </div>
        </div>
        <div className="commercial-proposal-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Договор / Тендер")}>
            <ShieldAlert size={16} />
            Договор
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Бюджет / ВОР")}>
            <Landmark size={16} />
            ВОР
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
            <FileText size={16} />
            Документы
          </button>
        </div>
      </div>

      <div className="commercial-proposal-grid metrics">
        <MetricCard title="Proposal readiness" value={model.readiness.label} detail={`${model.readiness.blockers.length} blockers · ${model.readiness.warnings.length} warnings`} tone={model.readiness.tone} />
        <MetricCard title="Price structure" value={money(model.priceSummary.totalAmount)} detail={`работы ${money(model.priceSummary.workAmount)} · материалы ${money(model.priceSummary.materialAmount)}`} tone={model.priceSummary.totalAmount ? "info" : "bad"} />
        <MetricCard title="Work/material split" value={`${model.workMaterialSplit.workCategories.length}/${model.workMaterialSplit.materialCategories.length}`} detail={`${model.workMaterialSplit.unpricedRows.length} unpriced · ${model.workMaterialSplit.unknownRows.length} review`} tone={model.workMaterialSplit.unpricedRows.length ? "warn" : "good"} />
        <MetricCard title="Tender submission checklist" value={`${model.submissionChecklist.readyCount} ready`} detail={`${model.submissionChecklist.missingCount} missing documents`} tone={model.submissionChecklist.missingCount ? "warn" : "good"} />
      </div>

      <div className="commercial-proposal-grid">
        <article className="commercial-proposal-card">
          <div className="section-title">
            <Landmark size={18} />
            <h4>Price structure</h4>
          </div>
          <dl className="commercial-detail-list">
            <div><dt>Сумма КП</dt><dd>{money(model.priceSummary.totalAmount)}</dd></div>
            <div><dt>Работы</dt><dd>{money(model.priceSummary.workAmount)}</dd></div>
            <div><dt>Материалы</dt><dd>{money(model.priceSummary.materialAmount)}</dd></div>
            <div><dt>НДС</dt><dd>{model.priceSummary.vatMode}{model.priceSummary.vatPercent ? ` · ${model.priceSummary.vatPercent}%` : ""}</dd></div>
          </dl>
          <ul className="commercial-note-list">
            {model.priceSummary.assumptions.slice(0, 4).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="commercial-proposal-card">
          <div className="section-title">
            <PackageCheck size={18} />
            <h4>Work/material split</h4>
          </div>
          <div className="commercial-split-list">
            {[...model.workMaterialSplit.workCategories.slice(0, 4), ...model.workMaterialSplit.materialCategories.slice(0, 4)].map((item) => (
              <div key={`${item.label}-${item.count}`}>
                <strong>{item.label}</strong>
                <span>{money(item.amount)} · {item.count} поз.</span>
              </div>
            ))}
          </div>
          {model.workMaterialSplit.unpricedRows.length ? <small className="commercial-warning">{model.workMaterialSplit.unpricedRows.length} строк требуют цены/количества.</small> : null}
        </article>

        <article className="commercial-proposal-card">
          <div className="section-title">
            <TimerReset size={18} />
            <h4>Сроки и снабжение</h4>
          </div>
          <dl className="commercial-detail-list">
            <div><dt>Период</dt><dd>{model.scheduleSummary.period}</dd></div>
            <div><dt>Работ в графике</dt><dd>{model.scheduleSummary.plannedItems}</dd></div>
            <div><dt>Снабжение</dt><dd>{model.procurementNotes.readiness}</dd></div>
          </dl>
          <ul className="commercial-note-list">
            {[...model.scheduleSummary.limitations, ...model.procurementNotes.missingMaterialData].slice(0, 5).map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>

        <article className="commercial-proposal-card">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h4>Договорные риски</h4>
          </div>
          <div className="commercial-action-list">
            {model.contractTenderRisks.slice(0, 6).map((risk) => (
              <div className={`commercial-action tone-${risk.tone}`} key={`${risk.title}-${risk.detail}`}>
                <strong>{risk.title}</strong>
                <span>{risk.detail}</span>
              </div>
            ))}
            {!model.contractTenderRisks.length && <span className="muted">Риски не выявлены по доступным данным, требуется ручная проверка.</span>}
          </div>
        </article>

        <article className="commercial-proposal-card wide">
          <div className="section-title">
            <ListChecks size={18} />
            <h4>Tender submission checklist</h4>
          </div>
          <Checklist model={model} />
        </article>

        <article className="commercial-proposal-card wide">
          <div className="section-title">
            <ClipboardCheck size={18} />
            <h4>Следующие действия</h4>
          </div>
          <div className="commercial-action-list">
            {model.actions.map((action) => (
              <div className={`commercial-action priority-${action.priority}`} key={`${action.title}-${action.ownerRole}`}>
                <strong>{action.title}</strong>
                <span>{action.ownerRole} · {action.detail}</span>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="commercial-copy-grid">
        <CopyBlock title="Customer-facing proposal draft" text={model.customerProposalDraft.copyText} />
        <CopyBlock title="Internal approval memo" text={model.internalApprovalMemo.copyText} />
      </div>

      <div className="commercial-limitations">
        <div className="section-title">
          <Send size={18} />
          <h4>Ограничения перед отправкой</h4>
        </div>
        <span>{model.limitations.join(" · ")}</span>
      </div>
    </section>
  );
}
