"use client";

import { ClipboardCheck, FileCheck2, FileWarning, ListChecks, PackageCheck, ShieldAlert } from "lucide-react";
import React from "react";
import {
  buildDocumentComplianceIntelligence,
  type DocumentComplianceReadiness,
  type DocumentOwnerRole,
  type DocumentPriority,
  type DocumentRequirementStatus,
  type RequiredDocument,
  type RiskExecutiveImportHistoryItem,
  type WeeklyDocumentAction
} from "@/lib/document-compliance-intelligence";
import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

type DocumentComplianceWorkspaceProps = {
  project: Partial<Project>;
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  risks: Risk[];
  documents: ProjectDocument[];
  documentChecklist: DocumentChecklistItem[];
  importHistory: RiskExecutiveImportHistoryItem[];
  onNavigate: (tab: string) => void;
};

function statusTone(status: DocumentRequirementStatus | DocumentComplianceReadiness) {
  if (status === "verified" || status === "uploaded" || status === "ready") return "green";
  if (status === "ready_for_review" || status === "partial") return "blue";
  if (status === "missing_critical" || status === "missing" || status === "no_data") return "red";
  if (status === "unknown" || status === "needs_setup" || status === "needed") return "yellow";
  return "gray";
}

function priorityTone(priority: DocumentPriority) {
  if (priority === "urgent" || priority === "high") return "red";
  if (priority === "medium") return "yellow";
  return "blue";
}

function ownerLabel(role: DocumentOwnerRole) {
  const labels: Record<DocumentOwnerRole, string> = {
    project_manager: "РП",
    document_controller: "ПТО / документы",
    site_engineer: "ИТР / площадка",
    procurement: "Снабжение",
    finance: "Финансы",
    subcontractor: "Субподрядчик",
    executive: "Руководство",
    unknown: "Не назначено"
  };
  return labels[role];
}

function ComplianceMetric({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: "green" | "yellow" | "red" | "blue" | "gray" }) {
  return (
    <div className={`doc-compliance-metric tone-${tone}`}>
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

function RequirementTable({ items }: { items: RequiredDocument[] }) {
  if (!items.length) {
    return (
      <div className="doc-compliance-empty-state">
        <strong>Checklist требований не сформирован</strong>
        <span>Добавьте ВОР, график, материалы или document checklist, чтобы получить документальные требования.</span>
      </div>
    );
  }
  return (
    <div className="table-wrap doc-compliance-table-wrap">
      <table>
        <thead>
          <tr>
            <th>Документ</th>
            <th>Статус</th>
            <th>Для чего нужен</th>
            <th>Владелец</th>
            <th>Следующий шаг</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <strong>{item.title}</strong>
                <small>{item.category} · {item.sourceArea}</small>
              </td>
              <td>
                <span className={`badge ${statusTone(item.status)}`}>{item.status}</span>
                <small className={`badge ${priorityTone(item.priority)}`}>{item.priority}</small>
              </td>
              <td>
                <span>{item.requiredFor.join(", ")}</span>
                {item.blockers.length ? <small>Блокеры: {item.blockers.join(", ")}</small> : null}
              </td>
              <td>{ownerLabel(item.ownerRole)}</td>
              <td>{item.suggestedAction}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function MissingDocumentsPanel({ items }: { items: RequiredDocument[] }) {
  return (
    <article className="doc-compliance-card">
      <div className="section-title">
        <FileWarning size={18} />
        <h3>Missing Documents</h3>
      </div>
      {!items.length ? (
        <div className="doc-compliance-empty-state">
          <strong>Критичных пропусков не найдено</strong>
          <span>Это не юридическая гарантия полноты комплекта, а операционный checklist по доступным данным.</span>
        </div>
      ) : (
        <div className="doc-compliance-list">
          {items.slice(0, 10).map((item) => (
            <div className={`doc-compliance-list-item priority-${item.priority}`} key={item.id}>
              <span>{item.priority}</span>
              <div>
                <strong>{item.title}</strong>
                <p>{item.suggestedAction}</p>
                <small>{ownerLabel(item.ownerRole)} · {item.requiredFor.join(", ")}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

function WeeklyPlan({ items }: { items: WeeklyDocumentAction[] }) {
  return (
    <article className="doc-compliance-card">
      <div className="section-title">
        <ListChecks size={18} />
        <h3>Weekly Document Collection Plan</h3>
      </div>
      {!items.length ? (
        <div className="doc-compliance-empty-state">
          <strong>План сбора документов пока пуст</strong>
          <span>Он появится после ВОР, графика, материалов или checklist.</span>
        </div>
      ) : (
        <div className="doc-compliance-action-grid">
          {items.slice(0, 8).map((item) => (
            <div className={`doc-compliance-action priority-${item.priority}`} key={item.id}>
              <strong>{item.title}</strong>
              <span>{ownerLabel(item.ownerRole)} · {item.supports}</span>
              <small>{item.reason}</small>
            </div>
          ))}
        </div>
      )}
    </article>
  );
}

export function DocumentComplianceWorkspace({
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
}: DocumentComplianceWorkspaceProps) {
  const model = buildDocumentComplianceIntelligence({
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

  const grouped = model.requiredDocuments.reduce<Record<string, RequiredDocument[]>>((acc, item) => {
    const key =
      item.category === "executive"
        ? "Исполнительная"
        : item.category === "material_certificate" || item.category === "quality" || item.category === "procurement"
          ? "Материалы / certificates"
          : item.category === "ks"
            ? "КС / финальное закрытие"
            : item.category === "report"
              ? "Отчетность / executive"
              : item.category === "photo_evidence"
                ? "Фотофиксация"
                : item.category === "design"
                  ? "Проектные/исходные данные"
                  : item.category === "permit" || item.category === "safety"
                    ? "Safety / permits"
                    : "Требует классификации";
    acc[key] = [...(acc[key] ?? []), item];
    return acc;
  }, {});

  return (
    <section className="document-compliance-workspace" aria-label="Documents & Executive Compliance">
      <div className="doc-compliance-header">
        <div>
          <div className="eyebrow">Documents & Executive Compliance</div>
          <h3>Документы, КС-ready и executive package</h3>
          <p className="muted">Операционный checklist по ВОР, графику, материалам, рискам и загруженным документам. Это не юридическая гарантия полноты комплекта.</p>
        </div>
        <div className="doc-compliance-actions">
          <span className={`badge ${statusTone(model.summary.readiness)}`}>readiness: {model.summary.readiness}</span>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Аналитика")}>
            Project Intelligence
          </button>
          <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Рапорты")}>
            Executive report
          </button>
        </div>
      </div>

      <div className="doc-compliance-summary-grid">
        <ComplianceMetric title="Required docs" value={String(model.summary.totalRequired)} detail="операционный checklist" tone="blue" />
        <ComplianceMetric title="Missing" value={String(model.summary.missing)} detail={`${model.summary.urgentHigh} urgent/high`} tone={model.summary.urgentHigh ? "red" : model.summary.missing ? "yellow" : "green"} />
        <ComplianceMetric title="КС / closeout" value={model.closeoutReadiness.readyForKs} detail={`${model.closeoutReadiness.blockingDocuments.length} document blockers`} tone={model.closeoutReadiness.readyForKs === "yes" ? "green" : model.closeoutReadiness.readyForKs === "partial" ? "yellow" : "red"} />
        <ComplianceMetric title="Executive package" value={model.executivePackage.readiness} detail={`${model.executivePackage.items.length} items`} tone={model.executivePackage.readiness === "ready" ? "green" : model.executivePackage.readiness === "partial" ? "yellow" : "red"} />
        <ComplianceMetric title="Uploaded / verified" value={String(model.summary.verifiedUploaded)} detail={`${model.summary.unknownStatus} unknown`} tone={model.summary.verifiedUploaded ? "green" : "gray"} />
      </div>

      <div className="doc-compliance-layout">
        <article className="doc-compliance-card doc-compliance-wide">
          <div className="section-title">
            <ClipboardCheck size={18} />
            <h3>Required Documents Checklist</h3>
          </div>
          <div className="doc-compliance-groups">
            {Object.entries(grouped).map(([group, items]) => (
              <details open key={group}>
                <summary>{group} · {items.length}</summary>
                <RequirementTable items={items} />
              </details>
            ))}
          </div>
        </article>

        <MissingDocumentsPanel items={model.missingDocuments.filter((item) => item.priority === "urgent" || item.priority === "high")} />

        <article className="doc-compliance-card doc-compliance-wide">
          <div className="section-title">
            <PackageCheck size={18} />
            <h3>Work Package Document Map</h3>
          </div>
          <div className="table-wrap doc-compliance-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Пакет</th>
                  <th>Тип</th>
                  <th>Readiness</th>
                  <th>Docs</th>
                  <th>Блокеры</th>
                </tr>
              </thead>
              <tbody>
                {model.workPackageMap.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.title}</strong>
                      <small>{item.sourceSection}</small>
                    </td>
                    <td>{item.category}</td>
                    <td>
                      <span className={`badge ${item.readiness === "ready" ? "green" : item.readiness === "blocked" ? "red" : "yellow"}`}>{item.readiness}</span>
                    </td>
                    <td>{item.requiredDocsCount} required · {item.missingDocsCount} missing</td>
                    <td>{item.blockingDocs.slice(0, 3).join("; ") || "-"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <article className="doc-compliance-card">
          <div className="section-title">
            <FileCheck2 size={18} />
            <h3>КС / Closeout Readiness</h3>
          </div>
          <div className="doc-compliance-readiness">
            <span className={`badge ${model.closeoutReadiness.readyForKs === "yes" ? "green" : model.closeoutReadiness.readyForKs === "partial" ? "yellow" : "red"}`}>КС: {model.closeoutReadiness.readyForKs}</span>
            <span className={`badge ${model.closeoutReadiness.closeoutReady === "yes" ? "green" : model.closeoutReadiness.closeoutReady === "partial" ? "yellow" : "red"}`}>closeout: {model.closeoutReadiness.closeoutReady}</span>
          </div>
          <ul className="action-list">
            {model.closeoutReadiness.suggestedNextSteps.map((item) => <li key={item}>{item}</li>)}
            {!model.closeoutReadiness.suggestedNextSteps.length && <li>Проверить комплект перед выпуском КС-ready пакета.</li>}
          </ul>
        </article>

        <article className="doc-compliance-card">
          <div className="section-title">
            <FileCheck2 size={18} />
            <h3>Executive Document Package</h3>
          </div>
          <span className={`badge ${model.executivePackage.readiness === "ready" ? "green" : model.executivePackage.readiness === "partial" ? "yellow" : "red"}`}>{model.executivePackage.readiness}</span>
          <ul className="action-list">
            {model.executivePackage.customerSubmissionChecklist.map((item) => <li key={item}>{item}</li>)}
          </ul>
          {!!model.executivePackage.limitations.length && <p className="muted">{model.executivePackage.limitations.join(" ")}</p>}
        </article>

        <WeeklyPlan items={model.weeklyPlan} />

        <article className="doc-compliance-card">
          <div className="section-title">
            <ShieldAlert size={18} />
            <h3>Compliance Risks</h3>
          </div>
          <div className="doc-compliance-list">
            {model.complianceRisks.slice(0, 8).map((risk) => (
              <div className={`doc-compliance-list-item priority-${risk.priority}`} key={risk.id}>
                <span>{risk.priority}</span>
                <div>
                  <strong>{risk.title}</strong>
                  <p>{risk.description}</p>
                  <small>{ownerLabel(risk.ownerRole)} · {risk.sourceArea}</small>
                </div>
              </div>
            ))}
            {!model.complianceRisks.length && <div className="doc-compliance-empty-state"><strong>Compliance risks не выявлены</strong><span>Продолжайте обновлять checklist и загруженные документы.</span></div>}
          </div>
        </article>

        {!!model.unmatchedUploads.length && (
          <article className="doc-compliance-card">
            <div className="section-title">
              <FileWarning size={18} />
              <h3>Unmatched uploads</h3>
            </div>
            <ul className="action-list">
              {model.unmatchedUploads.slice(0, 8).map((item) => (
                <li key={item.id}>{item.fileName ?? item.title} · {item.category}</li>
              ))}
            </ul>
          </article>
        )}
      </div>
    </section>
  );
}
