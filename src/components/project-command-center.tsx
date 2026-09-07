"use client";

import { AlertTriangle, Bot, CheckCircle2, ClipboardList, FileText, Landmark, Package, ReceiptText, Scale, Send, Sparkles, TimerReset, Users } from "lucide-react";
import React, { type CSSProperties } from "react";
import { ProjectModelLauncher } from "@/components/project-model-viewer";
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
  onRunAiSummary: () => void;
};

const icons = {
  baseline: <ClipboardList size={18} />,
  readiness: <CheckCircle2 size={18} />,
  budget: <Landmark size={18} />,
  costToComplete: <Landmark size={18} />,
  changeOrders: <ClipboardList size={18} />,
  notices: <FileText size={18} />,
  schedule: <TimerReset size={18} />,
  risks: <AlertTriangle size={18} />,
  contract: <Scale size={18} />,
  proposal: <Send size={18} />,
  acceptance: <ReceiptText size={18} />,
  execution: <Users size={18} />,
  fieldOps: <ClipboardList size={18} />,
  evidence: <FileText size={18} />,
  quality: <AlertTriangle size={18} />,
  materials: <Package size={18} />,
  cash: <Landmark size={18} />
};

const featuredKpiKeys = new Set(["baseline", "budget", "costToComplete", "schedule", "risks", "cash"]);
const featuredProgressKeys = new Set(["baseline", "acceptance", "schedule", "materials", "finance"]);

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
  if (app === "Договор") return "Договор / Тендер";
  if (app === "Качество") return "Риски";
  return app;
}

function tabForKpi(key: string) {
  if (key === "cash" || key === "costToComplete") return "Финансы";
  if (key === "schedule") return "График";
  if (key === "acceptance") return "КС";
  if (key === "contract" || key === "notices" || key === "changeOrders") return "Договор / Тендер";
  if (key === "proposal") return "КП / Подача";
  if (key === "execution") return "Исполнение";
  if (key === "fieldOps" || key === "evidence") return "Рапорты";
  if (key === "quality" || key === "risks") return "Риски";
  if (key === "materials") return "Материалы";
  if (key === "baseline" || key === "readiness") return "Аналитика";
  return "Бюджет / ВОР";
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
  const featuredKpis = model.kpis.filter((kpi) => featuredKpiKeys.has(kpi.key));
  const secondaryKpis = model.kpis.filter((kpi) => !featuredKpiKeys.has(kpi.key));
  const featuredProgress = model.progress.filter((item) => featuredProgressKeys.has(item.key));
  const secondaryProgress = model.progress.filter((item) => !featuredProgressKeys.has(item.key));
  const openKpi = (key: string) => onNavigate(tabForKpi(key));

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
          <small>Состояние проекта</small>
        </div>
      </div>

      <ProjectModelLauncher project={project} />

      <div className="command-kpi-grid command-kpi-grid-primary">
        {featuredKpis.map((kpi) => (
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

      <details className="panel compact-details command-secondary-kpis">
        <summary>Остальные показатели <span>{secondaryKpis.length}</span></summary>
        <div className="command-kpi-grid">
          {secondaryKpis.map((kpi) => (
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
      </details>

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
            {model.aiSummary.bullets.slice(0, 4).map((item, index) => (
              <div className="command-ai-bullet" key={`${item}-${index}`}>
                <span>{index + 1}</span>
                <p>{item}</p>
              </div>
            ))}
          </div>
          <div className="command-apps">
            {model.aiSummary.recommendedApps.slice(0, 6).map((app) => (
              <button className="app-chip" key={app} type="button" onClick={() => onNavigate(tabForRecommendedApp(app))}>
                {app}
              </button>
            ))}
          </div>
          <div className="command-ai-actions">
            <button className="button primary" disabled={aiLoading} type="button" onClick={onRunAiSummary}>
              <Bot size={18} />
              {aiLoading ? "Готовлю сводку..." : model.aiSummary.empty ? "Сформировать AI-сводку" : "Обновить AI-сводку"}
            </button>
            <button className="button secondary" type="button" onClick={() => onNavigate("AI-помощник")}>
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
            {featuredProgress.map((item) => (
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
          {secondaryProgress.length > 0 && (
            <details className="compact-details inline-details command-secondary-progress">
              <summary>Готовность данных <span>{secondaryProgress.length}</span></summary>
              <div className="progress-stack">
                {secondaryProgress.map((item) => (
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
            </details>
          )}
        </article>
      </div>

      <div className="command-lower-grid command-secondary-grid">
        <details className="panel compact-details command-status-board">
          <summary>Статус по модулям <span>{model.statusBoard.length}</span></summary>
          <div className="status-board-grid">
            {model.statusBoard.map((item) => (
              <button className="status-board-item" key={item.key} type="button" onClick={() => onNavigate(item.tab)}>
                <span className={`status-dot tone-${item.tone}`} />
                <span>
                  <small>{item.label}</small>
                  <strong>{item.value}</strong>
                  <em>{item.detail}</em>
                </span>
              </button>
            ))}
          </div>
        </details>

        <details className="panel compact-details command-action-center">
          <summary>Центр действий <span>{model.nextActions.length}</span></summary>
          <div className="action-center-list">
            {model.nextActions.map((action, index) => (
              <button className={`action-center-item tone-${action.tone}`} key={action.key} type="button" onClick={() => onNavigate(action.tab)}>
                <span>{index + 1}</span>
                <strong>{action.title}</strong>
                <small>{action.detail}</small>
              </button>
            ))}
          </div>
        </details>
      </div>
    </section>
  );
}
