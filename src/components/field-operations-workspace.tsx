"use client";

import { AlertTriangle, Camera, ClipboardList, FileText, Package, ReceiptText, TimerReset, Users } from "lucide-react";
import React from "react";
import {
  buildFieldOperationsIntelligence,
  type FieldOpsSnapshot,
  type FieldOpsTone
} from "@/lib/field-operations-intelligence";
import { dailyReportWorkOutputTotals } from "@/lib/daily-report-work-outputs";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
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

function SnapshotCard({ report, snapshot }: { report?: DailyReport; snapshot: FieldOpsSnapshot }) {
  const outputTotals = dailyReportWorkOutputTotals(report?.workOutputs ?? []);
  return (
    <article className={`field-ops-snapshot tone-${snapshot.tone}`}>
      <div>
        <strong>{snapshot.title}</strong>
        <span>{dailyReportStatusLabel(snapshot.status)} · {snapshot.workforce}</span>
      </div>
      <dl>
        <div><dt>Погода</dt><dd>{snapshot.weather}</dd></div>
        <div><dt>Техника</dt><dd>{snapshot.equipment}</dd></div>
      </dl>
      <p>{snapshot.completedWorks}</p>
      {outputTotals.rows ? <small>Измеримая выработка: {outputTotals.rows} стр. · {outputTotals.laborHours.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} чел.-ч</small> : null}
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
  const reportsById = new Map(dailyReports.map((report) => [report.id, report]));
  const approvedReports = dailyReports.filter((report) => report.status === "approved").length;
  const pendingReports = dailyReports.length - approvedReports;
  const evidenceDocuments = documents.filter((document) =>
    /фото|photo|рапорт|исполн|акт|журнал|evidence/i.test(`${document.category} ${document.title} ${document.fileName ?? ""}`)
  );
  const reportEvidenceDocuments = evidenceDocuments.filter((document) => document.dailyReportId);

  return (
    <section className="field-ops-workspace" aria-label="Стройплощадка и ежедневные рапорты">
      <div className={`field-ops-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Сводка по утверждённым рапортам</div>
          <h3>Контроль площадки</h3>
          <p>Это обзорный экран: он собирает людей, технику, объёмы, простои и замечания из рапортов. Сам сменный факт вводится и исправляется в журнале «Рапорты».</p>
          <div className="field-ops-badges">
            <span className={`badge ${badgeClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge blue">{model.summary.reportCount} рапортов</span>
            <span className={`badge ${approvedReports ? "green" : "gray"}`}>{approvedReports} утверждено</span>
            {pendingReports ? <span className="badge yellow">{pendingReports} ожидают проверки</span> : null}
            <span className="badge gray">{model.summary.totalWorkers} рабочих</span>
          </div>
        </div>
        <div className="field-ops-actions">
          <button className="button primary compact-button" type="button" onClick={() => onNavigate("Рапорты")}>
            <ClipboardList size={16} />
            Открыть рапорты
          </button>
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
        <Metric title="Люди и техника" value={`${model.summary.totalWorkers}/${model.summary.totalEngineers}`} detail={`${model.summary.equipmentMentions} единиц/упоминаний техники`} tone={model.summary.reportCount ? "info" : "neutral"} />
        <Metric title="Простои / замечания" value={`${model.summary.downtimeReports}/${model.summary.issueReports}`} detail="простои / замечания" tone={model.summary.downtimeReports || model.summary.issueReports ? "bad" : model.summary.reportCount ? "good" : "info"} />
        <Metric title="Проверка рапортов" value={`${approvedReports}/${pendingReports}`} detail="утверждено / в работе" tone={pendingReports ? "warn" : approvedReports ? "good" : "info"} />
        <Metric title="Связи факта с системой" value={`${model.summary.linkedScheduleItems}/${model.summary.materialSignals}`} detail="график / материалы" tone={model.summary.linkedScheduleItems || model.summary.materialSignals ? "warn" : "info"} />
      </div>

      <div className="field-ops-grid">
        <article className="field-ops-card wide">
          <div className="section-title">
            <ClipboardList size={18} />
            <h4>Сводки ежедневных рапортов</h4>
          </div>
          <div className="field-ops-snapshot-grid">
            {model.snapshots.length ? model.snapshots.map((snapshot) => <SnapshotCard key={snapshot.id} report={reportsById.get(snapshot.id)} snapshot={snapshot} />) : <span className="muted">Рапорты появятся после первого ежедневного факта площадки.</span>}
          </div>
        </article>

        <article className="field-ops-card">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h4>Сигналы стройплощадки</h4>
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
            <h4>Реестр действий</h4>
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
            <h4>Фото из рапортов · {reportEvidenceDocuments.length}</h4>
          </div>
          <p className="muted">Фото сохраняются с привязкой к конкретному рапорту и одновременно доступны в разделе «Документы». Откройте рапорт, чтобы увидеть его галерею и производственный факт вместе.</p>
          <div className="field-ops-actions">
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
              <FileText size={16} /> Открыть документы площадки
            </button>
          </div>
          <ul className="field-ops-limitations">
            {model.limitations.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </article>
      </div>
    </section>
  );
}
