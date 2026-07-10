"use client";

import { AlertTriangle, Bot, ClipboardList, FileText, Landmark, PackageCheck, ReceiptText, Scale, Send, Sparkles, TimerReset, Users } from "lucide-react";
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
        <article className="panel intelligence-panel baseline-intelligence-panel">
          <SectionHeader id="baseline" icon={<ClipboardList size={18} />} title="Baseline / Onboarding Intelligence" tone={model.baseline.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.baseline.ctaTab)}>
              Открыть обзор
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Шаблон" value={model.baseline.templateTitle} detail={model.baseline.templateDescription} tone={model.baseline.tone} />
            <StatusInsightCard title="Onboarding" value={`${model.baseline.score}%`} detail={model.baseline.readiness} tone={model.baseline.tone} />
            <StatusInsightCard title="Модули" value={String(model.baseline.modules.length)} detail={model.baseline.modules.join(" · ") || "ручная настройка"} tone={model.baseline.modules.length ? "info" : "neutral"} />
            <StatusInsightCard title="Недостающие данные" value={String(model.baseline.missingData.length)} detail="для управляемого запуска" tone={model.baseline.missingData.length ? "warn" : "good"} />
          </div>
          <SignalList
            emptyText="Baseline не требует дополнительных действий по текущим данным."
            items={[
              ...model.baseline.firstActions.map((item) => ({ title: item, detail: "Рекомендованное первое действие по шаблону.", tone: "info" as const })),
              ...model.baseline.missingData.map((item) => ({ title: item, detail: "Нужно заполнить, чтобы baseline стал управляемым.", tone: "warn" as const })),
              ...model.baseline.limitations.map((item) => ({ title: "Ограничение baseline", detail: item, tone: "neutral" as const }))
            ].slice(0, 9)}
          />
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="documents" icon={<FileText size={18} />} title="Documents Intelligence" tone={model.documents.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.documents.ctaTab)}>
              Открыть документы
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Готовность пакета" value={`${model.documents.score}%`} detail={`${model.documents.present}/${model.documents.total || 0} закрыто`} tone={model.documents.tone} />
            <StatusInsightCard title="Пробелы" value={String(model.documents.missing.length)} detail="Документы к дозагрузке или проверке" tone={model.documents.missing.length ? "warn" : "good"} />
            <StatusInsightCard title="Compliance" value={model.documents.complianceReadiness} detail={`${model.documents.missingCritical} urgent/high missing`} tone={model.documents.missingCritical ? "bad" : model.documents.tone} />
            <StatusInsightCard title="КС readiness" value={model.documents.ksReadiness} detail={`Executive package: ${model.documents.executivePackageReadiness}`} tone={model.documents.ksReadiness === "yes" ? "good" : model.documents.ksReadiness === "partial" ? "warn" : model.documents.ksReadiness === "unknown" ? "info" : "bad"} />
          </div>
          {model.documents.empty ? (
            <EmptyIntelligenceState text="Document checklist пока не загружен. Откройте раздел документов или загрузите ВОР/пакет файлов." />
          ) : (
            <div className="document-drilldown-stack">
              <SignalList
                emptyText="Критичных пробелов по документам не найдено."
                items={[
                  ...model.documents.blockingPackages,
                  ...model.documents.weeklyActions,
                  ...model.documents.missing.map((item) => ({ title: item.title, detail: item.suggestedNextStep, tone: item.status === "missing" ? "warn" as const : "info" as const, meta: item.categoryHints.join(", ") }))
                ].slice(0, 8)}
              />
            </div>
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
          <SectionHeader id="contract-tender" icon={<Scale size={18} />} title="Contract / Tender Intelligence" tone={model.contractTender.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.contractTender.ctaTab)}>
              Договор
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.contractTender.documentsTab)}>
              Документы
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Readiness" value={`${model.contractTender.score}%`} detail={model.contractTender.readiness} tone={model.contractTender.tone} />
            <StatusInsightCard title="Решение" value={model.contractTender.decision} detail={model.contractTender.contractValue} tone={model.contractTender.tone} />
            <StatusInsightCard title="Маржа" value={model.contractTender.forecastProfit} detail="по ВОР / договорной сумме" tone={model.contractTender.forecastProfit.startsWith("-") ? "bad" : "info"} />
            <StatusInsightCard title="Блокеры" value={`${model.contractTender.criticalRisks}/${model.contractTender.highRisks}`} detail={`${model.contractTender.missingCriticalDocs} critical docs`} tone={model.contractTender.criticalRisks || model.contractTender.missingCriticalDocs ? "bad" : model.contractTender.highRisks ? "warn" : "good"} />
          </div>
          {model.contractTender.empty ? (
            <EmptyIntelligenceState text="Нет договора, ТЗ, КП или документального пакета для проверки. Загрузите документы и повторите анализ." />
          ) : (
            <SignalList
              emptyText="Контрактных рисков по доступным данным не найдено."
              items={[
                ...model.contractTender.risks,
                ...model.contractTender.actions,
                ...model.contractTender.terms
              ].slice(0, 8)}
            />
          )}
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="proposal-submission" icon={<Send size={18} />} title="Commercial Proposal / КП Submission" tone={model.proposal.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.proposal.ctaTab)}>
              Открыть КП
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Proposal readiness" value={model.proposal.readiness} detail={`${model.proposal.blockers} blockers`} tone={model.proposal.tone} />
            <StatusInsightCard title="Цена КП" value={model.proposal.price} detail="по ВОР / карточке проекта" tone={model.proposal.price === "не рассчитано" ? "bad" : "info"} />
            <StatusInsightCard title="Данные" value={String(model.proposal.missingData)} detail="missing inputs" tone={model.proposal.missingData ? "warn" : "good"} />
            <StatusInsightCard title="Решения" value={String(model.proposal.decisionRequired)} detail="до отправки заказчику" tone={model.proposal.decisionRequired ? "warn" : "good"} />
          </div>
          {model.proposal.empty ? (
            <EmptyIntelligenceState text="Для КП нужны ВОР, цена, сроки и документы. Загрузите исходные данные или откройте договорный пакет." />
          ) : (
            <SignalList
              emptyText="КП не требует дополнительных действий по текущему срезу."
              items={model.proposal.topActions}
            />
          )}
          <div className="executive-action-note">
            <FileText size={16} />
            <span>{model.proposal.draftTitle}</span>
          </div>
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="acceptance-billing" icon={<ReceiptText size={18} />} title="Acceptance & Billing / КС Intelligence" tone={model.acceptanceBilling.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.acceptanceBilling.ctaTab)}>
              Открыть КС
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.acceptanceBilling.documentsTab)}>
              Документы
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Ready to bill" value={model.acceptanceBilling.readyAmount} detail={`${model.acceptanceBilling.readyItems} позиций`} tone={model.acceptanceBilling.readyItems ? "good" : "info"} />
            <StatusInsightCard title="Blocked billing" value={model.acceptanceBilling.blockedAmount} detail={`${model.acceptanceBilling.blockedItems} позиций`} tone={model.acceptanceBilling.blockedItems ? "warn" : "good"} />
            <StatusInsightCard title="Факт" value={String(model.acceptanceBilling.missingFactItems)} detail="позиций без подтверждения" tone={model.acceptanceBilling.missingFactItems ? "warn" : "good"} />
            <StatusInsightCard title="Документы КС" value={String(model.acceptanceBilling.documentBlockers)} detail={model.acceptanceBilling.status} tone={model.acceptanceBilling.documentBlockers ? "bad" : model.acceptanceBilling.tone} />
          </div>
          {model.acceptanceBilling.empty ? (
            <EmptyIntelligenceState text="Для КС нужны ВОР, график и подтвержденные фактические объемы." />
          ) : (
            <SignalList
              emptyText="Готовых или заблокированных строк КС пока нет."
              items={[
                ...model.acceptanceBilling.packageItems,
                ...model.acceptanceBilling.risks
              ].slice(0, 8)}
            />
          )}
          <div className="executive-action-note">
            <Sparkles size={16} />
            <span>{model.acceptanceBilling.nextStep}</span>
          </div>
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="execution-control" icon={<Users size={18} />} title="Subcontractor / Execution Control" tone={model.executionControl.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.executionControl.ctaTab)}>
              Исполнение
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.executionControl.scheduleTab)}>
              График
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Execution status" value={model.executionControl.status} detail={model.executionControl.headline} tone={model.executionControl.tone} />
            <StatusInsightCard title="Исполнители" value={String(model.executionControl.contractorCount)} detail={`${model.executionControl.activeFronts} активных фронтов`} tone={model.executionControl.contractorCount ? "info" : "warn"} />
            <StatusInsightCard title="Проблемные фронты" value={String(model.executionControl.delayedFronts)} detail={`${model.executionControl.unassignedItems} без владельца`} tone={model.executionControl.delayedFronts || model.executionControl.unassignedItems ? "bad" : "good"} />
            <StatusInsightCard title="Подряд / оплаты" value={model.executionControl.subcontractBudget} detail={`overdue ${model.executionControl.overduePayments}`} tone={model.executionControl.overduePayments !== "0 ₽" ? "warn" : "info"} />
          </div>
          {model.executionControl.empty ? (
            <EmptyIntelligenceState text="Для контроля исполнения нужны график, владельцы фронтов, подрядные платежи или рапорты." />
          ) : (
            <SignalList
              emptyText="Нет подрядных или execution-сигналов по текущему срезу."
              items={[
                ...model.executionControl.topContractors,
                ...model.executionControl.fronts
              ].slice(0, 8)}
            />
          )}
          <div className="executive-action-note">
            <Sparkles size={16} />
            <span>{model.executionControl.headline}</span>
          </div>
        </article>

        <article className="panel intelligence-panel">
          <SectionHeader id="field-operations" icon={<ClipboardList size={18} />} title="Field Operations / Daily Reports" tone={model.fieldOperations.tone}>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.fieldOperations.ctaTab)}>
              Рапорты
            </button>
            <button className="button secondary compact-button" type="button" onClick={() => onNavigate(model.fieldOperations.scheduleTab)}>
              График
            </button>
          </SectionHeader>
          <div className="intelligence-metrics">
            <StatusInsightCard title="Site facts" value={model.fieldOperations.status} detail={model.fieldOperations.headline} tone={model.fieldOperations.tone} />
            <StatusInsightCard title="Люди" value={`${model.fieldOperations.totalWorkers}/${model.fieldOperations.totalEngineers}`} detail={`${model.fieldOperations.reportCount} рапортов`} tone={model.fieldOperations.reportCount ? "info" : "neutral"} />
            <StatusInsightCard title="Простои / замечания" value={`${model.fieldOperations.downtimeReports}/${model.fieldOperations.issueReports}`} detail="signals from site" tone={model.fieldOperations.downtimeReports || model.fieldOperations.issueReports ? "bad" : "good"} />
            <StatusInsightCard title="Связи" value={`${model.fieldOperations.linkedScheduleItems}/${model.fieldOperations.materialSignals}`} detail="график / материалы" tone={model.fieldOperations.linkedScheduleItems || model.fieldOperations.materialSignals ? "warn" : "info"} />
          </div>
          {model.fieldOperations.empty ? (
            <EmptyIntelligenceState text="Ежедневных рапортов пока нет. Создайте первый рапорт, чтобы связать факт площадки с графиком, снабжением и КС." />
          ) : (
            <SignalList
              emptyText="Нет полевых сигналов по текущему срезу."
              items={[
                ...(model.fieldOperations.latestReport ? [{ title: model.fieldOperations.latestReport.title, detail: model.fieldOperations.latestReport.detail, tone: model.fieldOperations.tone }] : []),
                ...model.fieldOperations.signals,
                ...model.fieldOperations.actions
              ].slice(0, 8)}
            />
          )}
          <div className="executive-action-note">
            <Sparkles size={16} />
            <span>{model.fieldOperations.headline}</span>
          </div>
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
