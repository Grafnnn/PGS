"use client";

import { AlertTriangle, ClipboardList, FileText, ListChecks, ShieldAlert } from "lucide-react";
import React from "react";
import {
  buildRiskExecutiveIntelligence,
  type ActionItem,
  type DecisionItem,
  type ExecutiveTone,
  type RiskExecutiveImportHistoryItem,
  type RiskItem,
  type RiskSeverity
} from "@/lib/risk-executive-intelligence";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type RiskExecutiveWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
  documents?: ProjectDocument[];
  readiness: PipelineReadiness | null;
  documentChecklist: DocumentChecklistItem[];
  intelligence: {
    completenessScore: number;
    summary: string;
    topRisks: PipelineAction[];
    nextActions: PipelineAction[];
    missingData: string[];
  } | null;
  importHistory: RiskExecutiveImportHistoryItem[];
  onNavigate: (tab: string) => void;
  onRunExecutiveAi?: () => void;
  aiLoading?: boolean;
};

function severityClass(severity: RiskSeverity) {
  if (severity === "critical" || severity === "high") return "red";
  if (severity === "medium") return "yellow";
  return "blue";
}

function severityLabel(severity: RiskSeverity) {
  if (severity === "critical") return "critical";
  if (severity === "high") return "high";
  if (severity === "medium") return "medium";
  return "low";
}

function executiveStatusClass(status: ExecutiveTone) {
  if (status === "red") return "red";
  if (status === "amber") return "yellow";
  if (status === "green") return "green";
  return "gray";
}

function ownerRoleLabel(role: string) {
  const map: Record<string, string> = {
    project_manager: "РП",
    procurement: "Снабжение",
    finance: "Финансы",
    executive: "Руководство",
    document_controller: "Документы",
    estimator: "ПТО / сметчик",
    unknown: "Не назначено"
  };
  return map[role] ?? role;
}

function dueHintLabel(value: ActionItem["dueHint"]) {
  const map: Record<ActionItem["dueHint"], string> = {
    today_next: "Сегодня / next",
    this_week: "На этой неделе",
    before_procurement: "До закупки",
    before_execution: "До производства",
    before_executive_report: "До отчета"
  };
  return map[value];
}

function SummaryMetric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "good" | "warn" | "bad" | "info" | "neutral" }) {
  return (
    <div className={`risk-exec-metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function EmptyRiskState({ missingSources }: { missingSources: string[] }) {
  return (
    <div className="risk-exec-empty-state">
      <strong>Нет выявленных рисков по доступным данным</strong>
      <span>{missingSources.length ? `Недостаточно данных для полного риск-анализа: ${missingSources.join(", ")}.` : "Данные есть, но регулярный риск-ревью всё равно нужен."}</span>
    </div>
  );
}

function RiskRegisterTable({ risks }: { risks: RiskItem[] }) {
  if (!risks.length) return null;
  return (
    <div className="table-wrap risk-register-wrap">
      <table>
        <thead>
          <tr>
            <th>Риск</th>
            <th>Severity</th>
            <th>Источник</th>
            <th>Действие</th>
            <th>Решение</th>
            <th>Владелец</th>
          </tr>
        </thead>
        <tbody>
          {risks.map((risk) => (
            <tr key={risk.id}>
              <td>
                <strong>{risk.title}</strong>
                <small>{risk.description}</small>
                {risk.evidence.length ? <small>Evidence: {risk.evidence.slice(0, 2).join("; ")}</small> : null}
              </td>
              <td>
                <span className={`badge ${severityClass(risk.severity)}`}>{severityLabel(risk.severity)}</span>
                <small>{risk.status} · {risk.confidence}</small>
              </td>
              <td>
                <span>{risk.sourceArea}</span>
                <small>{risk.category} · {risk.sourceRef}</small>
              </td>
              <td>{risk.suggestedAction}</td>
              <td>{risk.decisionRequired ? risk.decisionText ?? "Требуется решение" : "Не требуется"}</td>
              <td>{ownerRoleLabel(risk.ownerRole)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DecisionRegisterPanel({ decisions }: { decisions: DecisionItem[] }) {
  return (
    <article className="risk-exec-card">
      <div className="section-title">
        <ShieldAlert size={18} />
        <h3>Decision Register</h3>
      </div>
      {!decisions.length ? (
        <div className="risk-exec-empty-state">
          <strong>Срочные решения не сформированы</strong>
          <span>Если данных мало, это не означает отсутствие решений — сначала закройте missing sources.</span>
        </div>
      ) : (
        <div className="risk-exec-list">
          {decisions.map((decision) => (
            <div className={`risk-exec-list-item priority-${decision.priority}`} key={decision.id}>
              <span className="risk-exec-index">{decision.priority}</span>
              <div>
                <strong>{decision.title}</strong>
                <p>{decision.reason}</p>
                <small>{ownerRoleLabel(decision.decisionOwnerRole)} · {decision.requiredBy} · impact: {decision.impact.join(", ")}</small>
                <em>{decision.recommendedNextStep}</em>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function ActionRegisterPanel({ actions }: { actions: ActionItem[] }) {
  const groups = ["today_next", "this_week", "before_procurement", "before_execution", "before_executive_report"] as const;
  return (
    <article className="risk-exec-card">
      <div className="section-title">
        <ListChecks size={18} />
        <h3>Recommended Actions</h3>
      </div>
      {!actions.length ? (
        <div className="risk-exec-empty-state">
          <strong>Действия появятся после загрузки данных</strong>
          <span>ВОР, снабжение, график, cashflow и документы питают этот список.</span>
        </div>
      ) : (
        <div className="risk-action-groups">
          {groups.map((group) => {
            const items = actions.filter((action) => action.dueHint === group);
            if (!items.length) return null;
            return (
              <div className="risk-action-group" key={group}>
                <h4>{dueHintLabel(group)}</h4>
                {items.slice(0, 4).map((action) => (
                  <div className={`risk-action-item priority-${action.priority}`} key={action.id}>
                    <strong>{action.title}</strong>
                    <small>{ownerRoleLabel(action.ownerRole)} · {action.sourceArea} · {action.status}</small>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </article>
  );
}

export function RiskExecutiveWorkspace({
  project,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  dailyReports,
  risks,
  documents = [],
  readiness,
  documentChecklist,
  intelligence,
  importHistory,
  onNavigate,
  onRunExecutiveAi,
  aiLoading = false
}: RiskExecutiveWorkspaceProps) {
  const model = buildRiskExecutiveIntelligence({
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
    intelligence,
    importHistory
  });

  const report = model.executiveReport;

  return (
    <section className="risk-executive-workspace" aria-label="Risks & Executive Reports">
      <div className="risk-exec-header">
        <div>
          <div className="eyebrow">Risks & Executive Reports</div>
          <h3>Риски, решения и отчет руководству</h3>
          <p className="muted">Детерминированный управленческий слой по ВОР, снабжению, графику, cashflow, документам и текущим рискам. AI не вызывается при рендере.</p>
        </div>
        <div className="risk-exec-actions">
          <span className={`badge ${executiveStatusClass(report.status)}`}>status: {report.status}</span>
          <span className={`badge ${report.reportReadiness === "ready" ? "green" : report.reportReadiness === "blocked" ? "red" : "yellow"}`}>report: {report.reportReadiness}</span>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Аналитика")}>
            Project Intelligence
          </button>
          {onRunExecutiveAi && (
            <button className="button primary compact-button" disabled={aiLoading} type="button" onClick={onRunExecutiveAi}>
              {aiLoading ? "Готовлю..." : "AI executive polish"}
            </button>
          )}
        </div>
      </div>

      <div className="risk-exec-summary-grid">
        <SummaryMetric title="Открытые риски" value={String(model.summary.totalOpen)} detail={`${model.summary.critical} critical · ${model.summary.high} high`} tone={model.summary.critical ? "bad" : model.summary.high ? "warn" : "good"} />
        <SummaryMetric title="Решения" value={String(model.summary.decisionRequired)} detail="решения руководства" tone={model.summary.decisionRequired ? "warn" : "good"} />
        <SummaryMetric title="Блокеры исполнения" value={String(model.summary.blockedExecution)} detail="schedule / procurement / cashflow" tone={model.summary.blockedExecution ? "bad" : "good"} />
        <SummaryMetric title="Качество данных" value={String(model.summary.dataQuality)} detail="ВОР/import warnings" tone={model.summary.dataQuality ? "warn" : "good"} />
        <SummaryMetric title="Report readiness" value={model.summary.reportReadiness} detail={model.summary.missingSources.length ? `Нет: ${model.summary.missingSources.join(", ")}` : "источники присутствуют"} tone={model.summary.reportReadiness === "ready" ? "good" : model.summary.reportReadiness === "blocked" ? "bad" : "warn"} />
      </div>

      <div className="risk-exec-layout">
        <article className="risk-exec-card risk-register-card">
          <div className="section-title">
            <AlertTriangle size={18} />
            <h3>Risk Register</h3>
          </div>
          {!model.risks.length ? <EmptyRiskState missingSources={model.summary.missingSources} /> : <RiskRegisterTable risks={model.risks} />}
        </article>

        <DecisionRegisterPanel decisions={model.decisions} />
        <ActionRegisterPanel actions={model.actions} />

        <article className="risk-exec-card executive-report-card">
          <div className="section-title">
            <FileText size={18} />
            <h3>Executive Weekly Report</h3>
          </div>
          <div className="executive-status-snapshot">
            <span className={`badge ${executiveStatusClass(report.status)}`}>{model.managementSummary.headline}</span>
            <p>{model.managementSummary.summary}</p>
            <strong>Следующее управленческое действие: {model.managementSummary.nextManagementAction}</strong>
          </div>
          <div className="executive-report-sections">
            {report.sections.map((section) => (
              <div className="executive-report-section" key={section.title}>
                <strong>{section.title}</strong>
                <p>{section.text}</p>
              </div>
            ))}
          </div>
          <div className="copyable-report-block" aria-label="Copyable executive report text">
            <div className="section-title">
              <ClipboardList size={16} />
              <h4>Copyable report text</h4>
            </div>
            <pre>{report.copyText}</pre>
          </div>
        </article>
      </div>
    </section>
  );
}
