"use client";

import { Banknote, ClipboardCheck, FileWarning, Landmark, ListChecks, ShieldAlert } from "lucide-react";
import React from "react";
import {
  buildAcceptanceBillingIntelligence,
  type AcceptanceBillingAction,
  type AcceptanceBillingImportHistoryItem,
  type AcceptanceBillingItem,
  type AcceptanceBillingStatus,
  type AcceptanceBillingTone
} from "@/lib/acceptance-billing-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type AcceptanceBillingWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  risks: Risk[];
  documents: ProjectDocument[];
  documentChecklist: DocumentChecklistItem[];
  importHistory: AcceptanceBillingImportHistoryItem[];
  onNavigate: (tab: string) => void;
};

function compactMoney(value: number) {
  const safe = Number.isFinite(value) ? value : 0;
  const abs = Math.abs(safe);
  if (abs >= 1_000_000_000) return `${(safe / 1_000_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млрд ₽`;
  if (abs >= 1_000_000) return `${(safe / 1_000_000).toLocaleString("ru-RU", { maximumFractionDigits: 1 })} млн ₽`;
  return `${Math.round(safe).toLocaleString("ru-RU")} ₽`;
}

function toneClass(tone: AcceptanceBillingTone) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function statusClass(status: AcceptanceBillingStatus) {
  if (status === "ready_for_review") return "green";
  if (status === "partial_ready" || status === "needs_documents") return "yellow";
  if (status === "blocked") return "red";
  if (status === "needs_fact") return "blue";
  return "gray";
}

function ownerLabel(role: AcceptanceBillingAction["ownerRole"]) {
  const labels: Record<AcceptanceBillingAction["ownerRole"], string> = {
    project_manager: "РП",
    pto: "ПТО",
    finance: "Финансы",
    site_engineer: "Площадка",
    procurement: "Снабжение",
    executive: "Руководство"
  };
  return labels[role];
}

function AcceptanceMetric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: AcceptanceBillingTone }) {
  return (
    <div className={`acceptance-billing-metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function BillingItemsTable({ items }: { items: AcceptanceBillingItem[] }) {
  if (!items.length) {
    return (
      <div className="acceptance-empty-state">
        <strong>Нет строк для КС</strong>
        <span>Загрузите ВОР, создайте график и подтвердите фактические объемы.</span>
      </div>
    );
  }
  return (
    <div className="table-wrap acceptance-billing-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Работа / пакет</th>
            <th>Факт</th>
            <th>К предъявлению</th>
            <th>Статус</th>
            <th>Блокеры</th>
            <th>Следующий шаг</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title}</strong>
                <small>{item.section} · {item.source}</small>
                {item.evidence.length ? <small>{item.evidence.slice(0, 2).join("; ")}</small> : null}
              </td>
              <td>
                <span>{item.completedQty} / {item.plannedQty} {item.unit}</span>
                {item.warnings.length ? <small>{item.warnings.join("; ")}</small> : null}
              </td>
              <td>
                <strong>{compactMoney(item.billableAmount)}</strong>
                <small>{item.billableQty} {item.unit} x {compactMoney(item.unitPrice)}</small>
              </td>
              <td><span className={`badge ${item.status === "ready" ? "green" : item.status === "needs_fact" ? "blue" : item.status === "needs_documents" ? "yellow" : "red"}`}>{item.status}</span></td>
              <td>
                {item.blockers.length ? (
                  <ul className="acceptance-blocker-list">
                    {item.blockers.slice(0, 4).map((blocker) => (
                      <li key={`${item.id}-${blocker.kind}-${blocker.message}`}>{blocker.message}</li>
                    ))}
                  </ul>
                ) : (
                  <span className="muted">Нет блокеров</span>
                )}
              </td>
              <td>{item.suggestedAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function AcceptanceBillingWorkspace({
  project,
  budgetItems,
  scheduleItems,
  materials,
  procurementRequests,
  payments,
  risks,
  documents,
  documentChecklist,
  importHistory,
  onNavigate
}: AcceptanceBillingWorkspaceProps) {
  const model = buildAcceptanceBillingIntelligence({
    project,
    budgetItems,
    scheduleItems,
    materials,
    procurementRequests,
    payments,
    risks,
    documents,
    documentChecklist,
    importHistory
  });

  return (
    <section className="acceptance-billing-workspace" aria-label="Acceptance & Billing Workflow">
      <div className="acceptance-billing-header">
        <div>
          <div className="eyebrow">КС / Acceptance & Billing Workflow</div>
          <h3>Закрытие выполненных объемов и предъявление заказчику</h3>
          <p className="muted">Детерминированный слой: что можно включать в КС, какие объемы подтверждены, что блокируют документы, риски, снабжение и cashflow. Официальные формы КС-2/КС-3 пока не формируются.</p>
        </div>
        <div className="acceptance-billing-actions">
          <span className={`badge ${statusClass(model.summary.status)}`}>status: {model.summary.status}</span>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Документы")}>
            Документы
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Финансы")}>
            Cashflow
          </button>
        </div>
      </div>

      <div className="acceptance-billing-summary-grid">
        <AcceptanceMetric title="Ready to bill" value={compactMoney(model.summary.readyAmount)} detail={`${model.summary.readyItems} строк`} tone={model.summary.readyItems ? "good" : "info"} />
        <AcceptanceMetric title="Blocked billing" value={compactMoney(model.summary.blockedAmount)} detail={`${model.summary.blockedItems} строк`} tone={model.summary.blockedItems ? "warn" : "good"} />
        <AcceptanceMetric title="Факт / объемы" value={String(model.summary.missingFactItems)} detail="позиций без подтвержденного факта" tone={model.summary.missingFactItems ? "warn" : "good"} />
        <AcceptanceMetric title="Документы" value={String(model.summary.documentBlockers)} detail="блокеры КС / closeout" tone={model.summary.documentBlockers ? "bad" : "good"} />
        <AcceptanceMetric title="Cashflow" value={compactMoney(model.cashflowImpact.outstandingAfterReadyBilling)} detail={model.cashflowImpact.note} tone={model.cashflowImpact.outstandingAfterReadyBilling ? "warn" : "info"} />
      </div>

      <div className={`acceptance-readiness tone-${model.summary.tone}`}>
        <ClipboardCheck size={18} />
        <div>
          <strong>{model.summary.readinessLabel}</strong>
          <span>{model.summary.nextStep}</span>
        </div>
      </div>

      <div className="acceptance-billing-grid">
        <article className="acceptance-billing-card wide">
          <div className="section-title">
            <Banknote size={18} />
            <h3>КС package draft</h3>
          </div>
          <div className="acceptance-package-summary">
            <div>
              <small>Период</small>
              <strong>{model.packageDraft.periodLabel}</strong>
            </div>
            <div>
              <small>Готово</small>
              <strong>{compactMoney(model.packageDraft.totalReadyAmount)}</strong>
            </div>
            <div>
              <small>Заблокировано</small>
              <strong>{compactMoney(model.packageDraft.totalBlockedAmount)}</strong>
            </div>
            <div>
              <small>Статус</small>
              <strong>{model.packageDraft.status}</strong>
            </div>
          </div>
          <BillingItemsTable items={[...model.packageDraft.readyItems, ...model.packageDraft.blockedItems].slice(0, 16)} />
        </article>

        <article className="acceptance-billing-card">
          <div className="section-title">
            <FileWarning size={18} />
            <h3>Required package</h3>
          </div>
          <ul className="action-list">
            {model.packageDraft.customerSubmissionChecklist.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
          {model.packageDraft.requiredDocuments.length ? (
            <div className="acceptance-note">
              <strong>Документы к закрытию</strong>
              <span>{model.packageDraft.requiredDocuments.slice(0, 6).join("; ")}</span>
            </div>
          ) : null}
        </article>

        <article className="acceptance-billing-card">
          <div className="section-title">
            <Landmark size={18} />
            <h3>Billing cashflow impact</h3>
          </div>
          <div className="acceptance-cashflow-grid">
            <AcceptanceMetric title="Ready invoice" value={compactMoney(model.cashflowImpact.readyToInvoice)} detail="не считать поступлением до оплаты" tone={model.cashflowImpact.readyToInvoice ? "good" : "info"} />
            <AcceptanceMetric title="Customer paid" value={compactMoney(model.cashflowImpact.paidByCustomer)} detail="факт оплат заказчика" tone="info" />
            <AcceptanceMetric title="Planned receipts" value={compactMoney(model.cashflowImpact.plannedCustomerReceipts)} detail="план поступлений" tone="info" />
          </div>
        </article>

        <article className="acceptance-billing-card">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h3>Acceptance risks</h3>
          </div>
          {!model.risks.length ? (
            <div className="acceptance-empty-state">
              <strong>Критичных блокеров КС не выявлено</strong>
              <span>Это не заменяет проверку ПТО и договорных условий.</span>
            </div>
          ) : (
            <div className="acceptance-risk-list">
              {model.risks.map((risk) => (
                <div className={`acceptance-risk severity-${risk.severity}`} key={risk.id}>
                  <span className={`badge ${risk.severity === "critical" || risk.severity === "high" ? "red" : risk.severity === "medium" ? "yellow" : "blue"}`}>{risk.severity}</span>
                  <div>
                    <strong>{risk.title}</strong>
                    <small>{risk.description}</small>
                    <em>{risk.suggestedAction}</em>
                  </div>
                </div>
              ))}
            </div>
          )}
        </article>

        <article className="acceptance-billing-card">
          <div className="section-title">
            <ListChecks size={18} />
            <h3>Next actions</h3>
          </div>
          <div className="acceptance-action-list">
            {model.actions.map((action) => (
              <button className={`acceptance-action priority-${action.priority}`} key={action.id} type="button" onClick={() => onNavigate(action.targetTab)}>
                <strong>{action.title}</strong>
                <span>{ownerLabel(action.ownerRole)} · {action.detail}</span>
              </button>
            ))}
            {!model.actions.length && <div className="acceptance-empty-state">Действия появятся после ВОР, графика и факта выполнения.</div>}
          </div>
        </article>
      </div>

      <div className="acceptance-executive-note">
        <strong>{model.executiveSummary.title}</strong>
        <span>{model.executiveSummary.text}</span>
        <small>{model.executiveSummary.limitations.join(" ")}</small>
      </div>
    </section>
  );
}
