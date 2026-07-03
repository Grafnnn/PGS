"use client";

import { AlertTriangle, Bot, ClipboardList, FileText, Landmark, PackageCheck, Sparkles, TimerReset } from "lucide-react";
import React from "react";
import {
  buildProjectIntelligenceDrilldownModel,
  type AiInsightResponse,
  type AiScenario,
  type DrilldownTone,
  type ProjectIntelligenceInput
} from "@/lib/project-intelligence-drilldown";

type ProjectIntelligenceDrilldownProps = ProjectIntelligenceInput & {
  aiResults?: Partial<Record<AiScenario, AiInsightResponse>>;
  aiErrors?: Partial<Record<AiScenario, string | undefined>>;
  aiLoading?: AiScenario | null;
  onNavigate: (tab: string) => void;
  onRunAiScenario: (scenario: AiScenario) => void;
};

function badgeClass(tone: DrilldownTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function statusLabel(tone: DrilldownTone) {
  if (tone === "good") return "Норма";
  if (tone === "warn") return "Внимание";
  if (tone === "bad") return "Риск";
  if (tone === "info") return "Инфо";
  return "Нет данных";
}

function EmptyIntelligenceState({ text }: { text: string }) {
  return (
    <div className="empty-intelligence-state">
      <strong>Нет достаточных данных</strong>
      <span>{text}</span>
    </div>
  );
}

function SectionHeader({
  id,
  icon,
  title,
  tone,
  children
}: {
  id: string;
  icon: React.ReactNode;
  title: string;
  tone: DrilldownTone;
  children?: React.ReactNode;
}) {
  return (
    <div className="intelligence-section-header" id={id}>
      <div className="section-title">
        {icon}
        <h3>{title}</h3>
      </div>
      <div className="intelligence-header-actions">
        <span className={`badge ${badgeClass(tone)}`}>{statusLabel(tone)}</span>
        {children}
      </div>
    </div>
  );
}

function StatusInsightCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: DrilldownTone }) {
  return (
    <div className={`status-insight-card tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SignalList({
  items,
  emptyText
}: {
  items: Array<{ title: string; detail: string; tone: DrilldownTone; meta?: string }>;
  emptyText: string;
}) {
  if (!items.length) return <EmptyIntelligenceState text={emptyText} />;
  return (
    <div className="intelligence-signal-list">
      {items.map((item) => (
        <div className={`intelligence-signal tone-${item.tone}`} key={`${item.title}-${item.detail}`}>
          <span className="status-dot" />
          <div>
            <strong>{item.title}</strong>
            <small>{item.detail}</small>
            {item.meta && <em>{item.meta}</em>}
          </div>
        </div>
      ))}
    </div>
  );
}

export function ProjectIntelligenceDrilldown({
  aiResults = {},
  aiErrors = {},
  aiLoading = null,
  onNavigate,
  onRunAiScenario,
  ...input
}: ProjectIntelligenceDrilldownProps) {
  const model = buildProjectIntelligenceDrilldownModel(input);
  const aiHasResult = Object.keys(aiResults).length > 0;

  return (
    <section className="project-intelligence-drilldown" aria-label="Project Intelligence Drill-down">
      <div className="intelligence-topline">
        <div>
          <div className="eyebrow">Drill-down workspace</div>
          <h2>Project Intelligence</h2>
          <p className="muted">Проваливайтесь из сводки в рабочие зоны: документы, риски, график, ВОР, финансы, снабжение, отчеты и AI-сценарии.</p>
        </div>
        <div className="intelligence-nav" aria-label="Разделы Project Intelligence">
          {model.nav.map((item) => (
            <a className={`intelligence-nav-chip tone-${item.tone}`} href={`#${item.id}`} key={item.id}>
              {item.label}
              {typeof item.count === "number" && <span>{item.count}</span>}
            </a>
          ))}
        </div>
      </div>

      <div className="intelligence-grid">
        <article className="panel intelligence-panel">
          <SectionHeader id="documents" icon={<FileText size={18} />} title="Documents Intelligence" tone={model.documents.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.documents.ctaTab)}>
              Открыть документы
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Готовность пакета" value={`${model.documents.score}%`} detail={`${model.documents.present}/${model.documents.total || 0} закрыто`} tone={model.documents.tone} />
            <StatusInsightCard title="Пробелы" value={String(model.documents.missing.length)} detail="Документы к дозагрузке или проверке" tone={model.documents.missing.length ? "warn" : "good"} />
          </div>
          {model.documents.empty ? (
            <EmptyIntelligenceState text="Document checklist пока не загружен. Откройте раздел документов или загрузите ВОР/пакет файлов." />
          ) : (
            <SignalList
              emptyText="Критичных пробелов по документам не найдено."
              items={model.documents.missing.map((item) => ({ title: item.title, detail: item.suggestedNextStep, tone: item.status === "missing" ? "warn" : "info", meta: item.categoryHints.join(", ") }))}
            />
          )}
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="risks" icon={<AlertTriangle size={18} />} title="Risk Intelligence" tone={model.risks.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.risks.ctaTab)}>
              Открыть риски
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Открытые риски" value={String(model.risks.total)} detail={`Critical ${model.risks.critical} · High ${model.risks.high}`} tone={model.risks.tone} />
            <StatusInsightCard title="Автосигналы" value={model.risks.empty ? "нет" : "есть"} detail="График, материалы и cash gap" tone={model.risks.empty ? "good" : "warn"} />
            <StatusInsightCard title="Решения" value={String(model.risks.decisionRequired)} detail={`Report ${model.risks.reportReadiness}`} tone={model.risks.decisionRequired ? "warn" : "good"} />
          </div>
          <SignalList
            emptyText="Открытых рисков нет. Продолжайте обновлять график, материалы и платежи."
            items={model.risks.top.map((risk) => ({ title: risk.title, detail: risk.detail, tone: risk.tone, meta: `${risk.priority}${risk.owner ? ` · ${risk.owner}` : ""}${risk.dueAt ? ` · ${risk.dueAt}` : ""}` }))}
          />
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="schedule" icon={<TimerReset size={18} />} title="Schedule / График Intelligence" tone={model.schedule.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.schedule.ctaTab)}>
              Открыть график
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="План / факт" value={`${model.schedule.completionPercent}%`} detail="Накопительное выполнение" tone={model.schedule.tone} />
            <StatusInsightCard title="Просрочки" value={String(model.schedule.overdueCount)} detail={`${model.schedule.delayDays} дней max`} tone={model.schedule.overdueCount ? "bad" : "good"} />
            <StatusInsightCard title="Пакеты из ВОР" value={String(model.schedule.packageCount)} detail={`${model.schedule.readinessLabel} · ${model.schedule.nextPlanLabel}`} tone={model.schedule.blockedPackageCount ? "warn" : "info"} />
            <StatusInsightCard title="Блокеры пакетов" value={String(model.schedule.blockedPackageCount)} detail="цены, объемы, материалы" tone={model.schedule.blockedPackageCount ? "bad" : "good"} />
          </div>
          <SignalList
            emptyText="График пока пустой. Создайте работы вручную или через draft из ВОР."
            items={model.schedule.timeline.map((item) => ({ title: item.title, detail: item.detail, tone: item.tone, meta: item.status }))}
          />
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="finance-vor" icon={<Landmark size={18} />} title="ВОР / Finance Intelligence" tone={model.financeVor.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.financeVor.ctaTab)}>
              Открыть ВОР
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.financeVor.financeTab)}>
              Финансы
            </button>
          </SectionHeader>
          {model.financeVor.empty ? (
            <EmptyIntelligenceState text="Нет бюджета или платежей для финансового drill-down. Загрузите ВОР или добавьте платежи." />
          ) : (
            <div className="intelligence-metrics finance-metrics">
              <StatusInsightCard title="Плановая себестоимость" value={model.financeVor.plannedCost} detail="по ВОР / бюджету" tone="info" />
              <StatusInsightCard title="Прогнозная себестоимость" value={model.financeVor.forecastCost} detail={`Отклонение ${model.financeVor.budgetDeviation}`} tone={model.financeVor.tone} />
              <StatusInsightCard title="Прогноз прибыли" value={model.financeVor.forecastProfit} detail="контракт минус прогноз" tone={model.financeVor.tone} />
              <StatusInsightCard title="Cash gap" value={model.financeVor.cashGap} detail={`Потребность ${model.financeVor.financingNeed}`} tone={model.financeVor.tone} />
              <StatusInsightCard title="Draft cashflow" value={model.financeVor.peakCashNeed} detail={`${model.financeVor.cashflowStatus} · ${model.financeVor.peakCashWeek}`} tone={model.financeVor.peakCashNeed === "0 ₽" ? "good" : "warn"} />
            </div>
          )}
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="procurement" icon={<PackageCheck size={18} />} title="Procurement / Снабжение Intelligence" tone={model.procurement.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.procurement.ctaTab)}>
              Материалы
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.procurement.requestTab)}>
              Заявки
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Дефицит" value={String(model.procurement.deficitCount)} detail="материалы ниже потребности" tone={model.procurement.deficitCount ? "bad" : "good"} />
            <StatusInsightCard title="Кандидаты" value={String(model.procurement.candidateCount)} detail={model.procurement.readinessLabel} tone={model.procurement.candidateCount ? "warn" : model.procurement.tone} />
            <StatusInsightCard title="Оценка draft" value={model.procurement.estimatedDraftTotal} detail={`Warning ${model.procurement.warningCount}`} tone={model.procurement.warningCount ? "warn" : "info"} />
            <StatusInsightCard title="Активные заявки" value={String(model.procurement.activeRequestCount)} detail="draft/submitted/ordered" tone={model.procurement.activeRequestCount ? "warn" : "info"} />
          </div>
          {model.procurement.empty ? (
            <EmptyIntelligenceState text="Материалы и заявки пока не заведены. Загрузите ВОР или добавьте потребности вручную." />
          ) : (
            <SignalList
              emptyText="Дефицитных материалов нет. Проверьте ближайшие поставки в заявках."
              items={[
                ...model.procurement.deficitItems.map((item) => ({ title: item.name, detail: item.detail, tone: item.tone })),
                ...model.procurement.requests.map((item) => ({ title: item.title, detail: item.detail, tone: item.tone }))
              ].slice(0, 6)}
            />
          )}
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="reports" icon={<ClipboardList size={18} />} title="Reports / Executive Output" tone={model.reports.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.reports.reportTab)}>
              Рапорты
            </button>
            <button className="button primary compact-button" disabled={aiLoading === model.reports.executiveScenario} type="button" onClick={() => onRunAiScenario(model.reports.executiveScenario)}>
              {aiLoading === model.reports.executiveScenario ? "Готовлю..." : "Executive report"}
            </button>
          </SectionHeader>
          {model.reports.empty ? (
            <EmptyIntelligenceState text="Ежедневных рапортов пока нет. Executive report можно сформировать из текущих бюджета, графика, снабжения и рисков." />
          ) : (
            <div className="executive-report-preview">
              <strong>{model.reports.latestReport?.title}</strong>
              <p>{model.reports.latestReport?.detail}</p>
              <span className="badge blue">{model.reports.latestReport?.status}</span>
            </div>
          )}
          <div className="executive-action-note">
            <Sparkles size={16} />
            <span>{model.reports.nextExecutiveAction}</span>
          </div>
          <div className="ai-recommendation-meta executive-readiness-meta">
            <div>
              <strong>Executive status</strong>
              <span>{model.reports.executiveStatus}</span>
            </div>
            <div>
              <strong>Readiness</strong>
              <span>{model.reports.reportReadiness}</span>
            </div>
            <div>
              <strong>Решения</strong>
              <span>{model.reports.decisionsRequired}</span>
            </div>
            <div>
              <strong>Missing data</strong>
              <span>{model.reports.missingData.join(" · ") || "нет критичных пропусков"}</span>
            </div>
          </div>
        </article>
      </div>

      <article className="panel intelligence-panel ai-recommendations-panel" id="ai-recommendations">
        <SectionHeader id="ai-recommendations-title" icon={<Bot size={18} />} title="AI Recommendations Drill-down" tone={model.ai.tone}>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("AI-помощник")}>
            Открыть AI-помощник
          </button>
        </SectionHeader>
        <div className="ai-recommendation-meta">
          <div>
            <strong>Источник данных</strong>
            <span>{model.ai.dataUsed.join(" · ") || "Контекст проекта будет собран перед ручным запуском сценария."}</span>
          </div>
          <div>
            <strong>Ограничения</strong>
            <span>{model.ai.limitations.join(" · ") || "Live provider не вызывается при рендере страницы."}</span>
          </div>
          <div>
            <strong>Результаты</strong>
            <span>{aiHasResult ? "Есть результаты сценариев для просмотра." : "Запустите сценарий вручную."}</span>
          </div>
        </div>
        <div className="ai-drilldown-grid">
          {model.ai.scenarios.map((scenario) => {
            const result = aiResults[scenario.scenario];
            const error = aiErrors[scenario.scenario];
            const loading = aiLoading === scenario.scenario;
            return (
              <div className={`ai-drilldown-card ${error ? "has-error" : result ? "has-result" : ""}`} key={scenario.scenario}>
                <div>
                  <strong>{scenario.title}</strong>
                  <p>{scenario.description}</p>
                </div>
                <div className="ai-card-tags">
                  {scenario.data.slice(0, 3).map((item) => (
                    <span className="badge gray" key={`${scenario.scenario}-${item}`}>
                      {item}
                    </span>
                  ))}
                </div>
                {result && (
                  <div className="ai-result-preview">
                    <span className={`badge ${result.provider === "openai" ? "blue" : result.provider === "degraded" ? "yellow" : "gray"}`}>{result.provider}</span>
                    <strong>{result.subject ?? result.title}</strong>
                    <p>{result.summary}</p>
                    {result.recommendedAttachments?.length ? <small>Рекомендуемые приложения: {result.recommendedAttachments.join(", ")}</small> : null}
                  </div>
                )}
                {error && <div className="ai-error-preview">AI-сценарий сейчас недоступен. Проверьте подключение и повторите запуск позже.</div>}
                <div className="row-actions">
                  <button className="button primary compact-button" disabled={loading} type="button" onClick={() => onRunAiScenario(scenario.scenario)}>
                    {loading ? "Запуск..." : result ? "Обновить" : "Запустить"}
                  </button>
                  <button className="button secondary compact-button" type="button" onClick={() => onNavigate(scenario.target)}>
                    {scenario.target}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </article>
    </section>
  );
}
