"use client";

import { AlertTriangle, ClipboardCheck, FileSearch, Landmark, ListChecks, Scale, ShieldAlert, Sparkles } from "lucide-react";
import React from "react";
import {
  buildContractTenderIntelligence,
  type ContractTenderAction,
  type ContractTenderRisk,
  type ContractTenderTone
} from "@/lib/contract-tender-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type ContractTenderWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  risks: Risk[];
  documents: ProjectDocument[];
  documentChecklist: DocumentChecklistItem[];
  onNavigate: (tab: string) => void;
};

function toneClass(tone: ContractTenderTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function ownerLabel(role: ContractTenderAction["ownerRole"]) {
  const labels: Record<ContractTenderAction["ownerRole"], string> = {
    executive: "Руководство",
    project_manager: "РП",
    finance: "Финансы",
    pto: "ПТО",
    estimator: "Сметчик",
    legal: "Юрист",
    procurement: "Снабжение"
  };
  return labels[role];
}

function ContractTenderMetric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: ContractTenderTone }) {
  return (
    <div className={`contract-tender-metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function RiskCard({ risk }: { risk: ContractTenderRisk }) {
  const tone = risk.severity === "critical" || risk.severity === "high" ? "bad" : risk.severity === "medium" ? "warn" : "info";
  return (
    <div className={`contract-tender-risk tone-${tone}`}>
      <div>
        <strong>{risk.title}</strong>
        <span>{risk.description}</span>
      </div>
      <span className={`badge ${risk.severity === "critical" || risk.severity === "high" ? "red" : risk.severity === "medium" ? "yellow" : "blue"}`}>{risk.severity}</span>
      <small>{risk.suggestedAction}</small>
    </div>
  );
}

export function ContractTenderWorkspace({
  project,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  risks,
  documents,
  documentChecklist,
  onNavigate
}: ContractTenderWorkspaceProps) {
  const model = buildContractTenderIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist
  });

  return (
    <section className="contract-tender-workspace" aria-label="Contract and tender intelligence">
      <div className={`contract-tender-header tone-${model.summary.tone}`}>
        <div>
          <div className="eyebrow">Contract & Tender Intelligence</div>
          <h3>Договор / тендер / КП</h3>
          <p>{model.summary.recommendation}</p>
          <div className="contract-tender-badges">
            <span className={`badge ${toneClass(model.summary.tone)}`}>{model.summary.headline}</span>
            <span className="badge gray">score {model.summary.score}%</span>
            <span className="badge blue">{model.tenderReadiness.label}</span>
          </div>
        </div>
        <div className="contract-tender-actions">
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
            <FileSearch size={16} />
            Документы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Бюджет / ВОР")}>
            <Landmark size={16} />
            ВОР
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Финансы")}>
            <Scale size={16} />
            Финансы
          </button>
        </div>
      </div>

      <div className="contract-tender-summary-grid">
        <ContractTenderMetric title="Сумма договора" value={model.summary.contractValueLabel} detail="из карточки проекта" tone="info" />
        <ContractTenderMetric title="Прогноз прибыли" value={`${model.summary.forecastMarginPercent.toFixed(1)}%`} detail={model.summary.forecastProfit.toLocaleString("ru-RU") + " ₽"} tone={model.summary.forecastProfit < 0 ? "bad" : "good"} />
        <ContractTenderMetric title="Критичные документы" value={String(model.summary.missingCriticalDocs)} detail="нет или требуют проверки" tone={model.summary.missingCriticalDocs ? "bad" : "good"} />
        <ContractTenderMetric title="High/Critical risks" value={`${model.summary.highRisks}/${model.summary.criticalRisks}`} detail="до подписания" tone={model.summary.criticalRisks ? "bad" : model.summary.highRisks ? "warn" : "good"} />
      </div>

      <div className="contract-tender-grid">
        <article className="contract-tender-card">
          <div className="section-title">
            <ClipboardCheck size={18} />
            <h4>Ключевые условия</h4>
          </div>
          <div className="contract-term-list">
            {model.terms.map((term) => (
              <div className={`contract-term tone-${term.tone}`} key={term.key}>
                <strong>{term.label}</strong>
                <span>{term.value}</span>
                <small>{term.evidence[0]}</small>
              </div>
            ))}
          </div>
        </article>

        <article className="contract-tender-card">
          <div className="section-title">
            <ListChecks size={18} />
            <h4>Пакет документов</h4>
          </div>
          <div className="contract-doc-list">
            {model.requiredDocuments.map((document) => (
              <div className={`contract-doc-item status-${document.status}`} key={document.key}>
                <div>
                  <strong>{document.title}</strong>
                  <small>{document.suggestedAction}</small>
                </div>
                <span className={`badge ${document.status === "present" ? "green" : document.priority === "critical" ? "red" : "yellow"}`}>{document.status}</span>
              </div>
            ))}
          </div>
        </article>

        <article className="contract-tender-card">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h4>Риски договора</h4>
          </div>
          {model.risks.length ? (
            <div className="contract-risk-list">
              {model.risks.slice(0, 8).map((risk) => <RiskCard risk={risk} key={risk.id} />)}
            </div>
          ) : (
            <div className="contract-empty-state">
              <strong>Критичных рисков не найдено</strong>
              <span>Это не заменяет юридическую проверку, но позволяет вынести пакет на управленческий review.</span>
            </div>
          )}
        </article>

        <article className="contract-tender-card">
          <div className="section-title">
            <Sparkles size={18} />
            <h4>Управленческая записка</h4>
          </div>
          <div className="contract-memo">
            {model.managementMemo.sections.map((section) => (
              <div key={section.title}>
                <strong>{section.title}</strong>
                <p>{section.text}</p>
              </div>
            ))}
          </div>
          <div className="contract-action-list">
            {model.actions.slice(0, 6).map((action) => (
              <div className={`contract-action priority-${action.priority}`} key={action.id}>
                <AlertTriangle size={16} />
                <div>
                  <strong>{action.title}</strong>
                  <span>{ownerLabel(action.ownerRole)} · {action.detail}</span>
                </div>
              </div>
            ))}
          </div>
        </article>
      </div>

      {model.summary.dataLimitations.length ? (
        <div className="contract-limitations">
          <strong>Ограничения анализа</strong>
          <span>{model.summary.dataLimitations.join(" · ")}</span>
        </div>
      ) : null}
    </section>
  );
}
