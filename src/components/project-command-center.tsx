"use client";

import { AlertTriangle, Bot, CheckCircle2, ClipboardList, FileText, Landmark, Package, Sparkles, TimerReset } from "lucide-react";
import React, { type CSSProperties } from "react";
import { buildProjectCommandCenterModel, type CommandCenterAiInsight, type CommandTone } from "@/lib/project-command-center";
import type { DocumentChecklistItem, PipelineAction, PipelineReadiness } from "@/lib/project-pipeline";
import type { RiskExecutiveImportHistoryItem } from "@/lib/risk-executive-intelligence";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type ProjectCommandCenterProps = {
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
  importHistory?: RiskExecutiveImportHistoryItem[];
  intelligence: {
    completenessScore: number;
    summary: string;
    topRisks: PipelineAction[];
    nextActions: PipelineAction[];
    missingData: string[];
  } | null;
  aiInsight?: CommandCenterAiInsight | null;
  aiLoading?: boolean;
  onNavigate: (tab: string) => void;
  onDrilldown?: (sectionId: string) => void;
  onRunAiSummary: () => void;
};

const icons = {
  readiness: <CheckCircle2 size={18} />,
  budget: <Landmark size={18} />,
  schedule: <TimerReset size={18} />,
  risks: <AlertTriangle size={18} />,
  materials: <Package size={18} />,
  cash: <Landmark size={18} />
};

function toneLabel(tone: CommandTone) {
  if (tone === "good") return "Норма";
  if (tone === "warn") return "Внимание";
  if (tone === "bad") return "Риск";
  if (tone === "info") return "Инфо";
  return "Статус";
}

function tabForRecommendedApp(app: string) {
  if (app === "ВОР") return "Бюджет / ВОР";
  if (app === "Снабжение") return "Материалы";
  return app;
}

function drilldownForTab(tab: string) {
  if (tab === "Документы") return "documents";
  if (tab === "Риски") return "risks";
  if (tab === "График") return "schedule";
  if (tab === "Бюджет / ВОР" || tab === "Финансы") return "finance-vor";
  if (tab === "Материалы" || tab === "Заявки") return "procurement";
  if (tab === "Рапорты") return "reports";
  if (tab === "AI-помощник" || tab === "Аналитика") return "ai-recommendations";
  return null;
}

function drilldownForKpi(key: string) {
  if (key === "budget" || key === "cash") return "finance-vor";
  if (key === "schedule") return "schedule";
  if (key === "risks") return "risks";
  if (key === "materials") return "procurement";
  if (key === "readiness") return "documents";
  return null;
}

export function ProjectCommandCenter({
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
  importHistory = [],
  intelligence,
  aiInsight,
  aiLoading = false,
  onNavigate,
  onDrilldown,
  onRunAiSummary
}: ProjectCommandCenterProps) {
  const model = buildProjectCommandCenterModel({
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
    intelligence,
    aiInsight
  });
  const openTabOrDrilldown = (tab: string) => {
    const section = drilldownForTab(tab);
    if (section && onDrilldown) onDrilldown(section);
    else onNavigate(tab);
  };
  const openKpi = (key: string) => {
    const section = drilldownForKpi(key);
    if (section && onDrilldown) onDrilldown(section);
    else onNavigate(key === "cash" ? "Финансы" : key === "schedule" ? "График" : key === "materials" ? "Материалы" : key === "risks" ? "Риски" : key === "readiness" ? "Аналитика" : "Бюджет / ВОР");
  };

  return (
    <section className="command-center" aria-label="Project command center">
      <div className={`command-hero tone-${model.health.tone}`}>
        <div className="command-hero-main">
          <div className="eyebrow">Command center · {model.project.customer}</div>
          <div className="command-title-row">
            <h2>{model.project.name}</h2>
            <span className={`badge ${model.health.tone === "bad" ? "red" : model.health.tone === "warn" ? "yellow" : "green"}`}>{model.health.label}</span>
          </div>
          <p>{model.health.summary}</p>
          <div className="command-meta-grid">
            <span>{model.project.object}</span>
            <span>{model.project.address}</span>
            <span>РП: {model.project.manager}</span>
            <span>{model.project.startsAt} - {model.project.endsAt}</span>
          </div>
        </div>
        <div className="health-meter" aria-label={`Health score ${model.health.score}%`}>
          <div className="health-ring" style={{ "--score": model.health.score } as CSSProperties}>
            <span>{model.health.score}%</span>
          </div>
          <small>Project health</small>
        </div>
      </div>

      <div className="command-kpi-grid">
        {model.kpis.map((kpi) => (
          <button className={`command-kpi tone-${kpi.tone}`} key={kpi.key} type="button" onClick={() => openKpi(kpi.key)}>
            <span className="command-kpi-icon">{icons[kpi.key as keyof typeof icons] ?? <CheckCircle2 size={18} />}</span>
            <span className="command-kpi-copy">
              <small>{kpi.label}</small>
              <strong>{kpi.value}</strong>
              <em>{kpi.hint}</em>
            </span>
          </button>
        ))}
      </div>

      <div className="command-layout">
        <article className="panel command-ai-card">
          <div className="section-title">
            <Sparkles size={18} />
            <h3>{model.aiSummary.subject}</h3>
          </div>
          <div className="ai-source-row">
            <span className={`badge ${model.aiSummary.degraded ? "yellow" : "blue"}`}>{model.aiSummary.provider}</span>
            {model.aiSummary.empty && <span className="badge gray">без автозапроса</span>}
          </div>
          <div className="command-ai-bullets">
            {model.aiSummary.bullets.map((item, index) => (
              <div className="command-ai-bullet" key={`${item}-${index}`}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="command-apps">
            {model.aiSummary.recommendedApps.map((app) => (
              <button className="app-chip" key={app} type="button" onClick={() => openTabOrDrilldown(tabForRecommendedApp(app))}>
                {app}
              </button>
            ))}
          </div>
          <div className="command-ai-actions">
            <button className="button primary" disabled={aiLoading} type="button" onClick={onRunAiSummary}>
              <Bot size={18} />
              {aiLoading ? "Готовлю сводку..." : model.aiSummary.empty ? "Сформировать AI-сводку" : "Обновить AI-сводку"}
            </button>
            <button className="button secondary" type="button" onClick={() => openTabOrDrilldown("AI-помощник")}>
              Открыть сценарии
            </button>
          </div>
        </article>

        <article className="panel command-progress-card">
          <div className="section-title">
            <TimerReset size={18} />
            <h3>Операционный прогресс</h3>
          </div>
          <div className="progress-stack">
            {model.progress.map((item) => (
              <div className="progress-row" key={item.key}>
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.detail}</span>
                </div>
                <div className="progress-meter" aria-label={`${item.label}: ${item.value}%`}>
                  <span className={`tone-${item.tone}`} style={{ width: `${item.value}%` }} />
                </div>
                <b>{item.value}%</b>
              </div>
            ))}
          </div>
        </article>
      </div>

      <div className="command-lower-grid">
        <article className="panel command-status-board">
          <div className="section-title">
            <ClipboardList size={18} />
            <h3>Статус борд</h3>
          </div>
          <div className="status-board-grid">
            {model.statusBoard.map((item) => (
              <button className="status-board-item" key={item.key} type="button" onClick={() => openTabOrDrilldown(item.tab)}>
                <span className={`status-dot tone-${item.tone}`} />
                <span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                  <em>{item.detail}</em>
                </span>
              </button>
            ))}
          </div>
        </article>

        <article className="panel command-action-center">
          <div className="section-title">
            <FileText size={18} />
            <h3>Action center</h3>
          </div>
          <div className="action-center-list">
            {model.nextActions.map((action, index) => (
              <button className={`action-center-item tone-${action.tone}`} key={action.key} type="button" onClick={() => openTabOrDrilldown(action.tab)}>
                <span>{index + 1}</span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </button>
            ))}
          </div>
        </article>
      </div>
    </section>
  );
}
