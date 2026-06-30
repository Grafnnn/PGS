"use client";

import { AlertTriangle, ClipboardList, Layers3, PackageCheck, Truck } from "lucide-react";
import React from "react";
import {
  buildProcurementIntelligenceModel,
  type ProcurementImportHistoryItem,
  type ProcurementIntelligenceModel
} from "@/lib/procurement-intelligence";
import type { Material, ProcurementRequest } from "@/lib/types";

type ProcurementDraftState = {
  kind: string;
  mode: "preview" | "commit";
  draft: {
    summary: Record<string, unknown>;
    items: Array<Record<string, unknown>>;
  };
  created?: unknown[];
} | null;

type ProcurementIntelligenceWorkspaceProps = {
  projectName: string;
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  importHistory: ProcurementImportHistoryItem[];
  draft: ProcurementDraftState;
  loading: string;
  onPreview: () => void;
  onCommit: () => void;
  onNavigate: (tab: string) => void;
};

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function toneClass(tone: ProcurementIntelligenceModel["tone"]) {
  if (tone === "good") return "green";
  if (tone === "warn") return "yellow";
  if (tone === "bad") return "red";
  if (tone === "info") return "blue";
  return "gray";
}

function StatusPill({ children, tone }: { children: React.ReactNode; tone: ProcurementIntelligenceModel["tone"] }) {
  return <span className={`badge ${toneClass(tone)}`}>{children}</span>;
}

function SummaryTile({ title, value, detail }: { title: string; value: string; detail: string }) {
  return (
    <div className="procurement-summary-tile">
      <small>{title}</small>
      <strong>{value}</strong>
      <span>{detail}</span>
    </div>
  );
}

export function ProcurementIntelligenceWorkspace({
  projectName,
  materials,
  procurementRequests,
  importHistory,
  draft,
  loading,
  onPreview,
  onCommit,
  onNavigate
}: ProcurementIntelligenceWorkspaceProps) {
  const model = buildProcurementIntelligenceModel({ projectName, materials, procurementRequests, importHistory });
  const currentDraft = draft?.kind === "procurement" ? draft : null;
  const canCommit = model.candidates.length > 0 && !loading;

  return (
    <section className="procurement-intelligence-workspace" aria-label="Procurement & Materials Intelligence">
      <div className="procurement-intelligence-header">
        <div>
          <div className="eyebrow">Procurement & Materials Intelligence</div>
          <h3>Материалы из ВОР → заявка снабжению</h3>
          <p className="muted">Позиции группируются по разделам и категориям. Preview не пишет рабочие данные проекта, commit остается явным действием.</p>
        </div>
        <div className="procurement-header-actions">
          <StatusPill tone={model.tone}>{model.readiness.label}</StatusPill>
          <button className="button secondary compact-button" disabled={Boolean(loading)} type="button" onClick={onPreview}>
            <ClipboardList size={16} />
            {loading === "procurement-preview" ? "Готовлю..." : "Preview заявок"}
          </button>
          <button className="button primary compact-button" disabled={!canCommit || currentDraft?.mode !== "preview"} type="button" onClick={onCommit}>
            <Truck size={16} />
            {loading === "procurement-commit" ? "Создаю..." : "Создать черновики"}
          </button>
        </div>
      </div>

      <div className="procurement-summary-grid">
        <SummaryTile title="Материалов" value={String(model.summary.materials)} detail="persisted materials" />
        <SummaryTile title="Кандидатов" value={String(model.summary.candidates)} detail="можно включить в draft" />
        <SummaryTile title="Активных заявок" value={String(model.summary.activeRequests)} detail="не дублируются" />
        <SummaryTile title="Warning / unknown" value={String(model.summary.warnings + model.summary.missingRows)} detail="только на проверку" />
        <SummaryTile title="Оценка заявки" value={money(model.summary.estimatedTotal)} detail={`${model.summary.deficitTotal.toLocaleString("ru-RU")} ед. дефицита`} />
      </div>

      <div className={`procurement-readiness tone-${model.tone}`}>
        <PackageCheck size={18} />
        <div>
          <strong>{model.readiness.nextStep}</strong>
          {model.readiness.blockers.length ? (
            <ul>
              {model.readiness.blockers.map((blocker) => (
                <li key={blocker}>{blocker}</li>
              ))}
            </ul>
          ) : (
            <span>Блокеров для draft-заявки нет. Проверьте кандидатов и выполните явный commit.</span>
          )}
        </div>
      </div>

      <div className="procurement-intelligence-grid">
        <article className="procurement-card wide">
          <div className="section-title">
            <Layers3 size={17} />
            <h4>Реестр потребности</h4>
          </div>
          <div className="table-wrap procurement-table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Материал</th>
                  <th>Источник</th>
                  <th className="numeric">Нужно</th>
                  <th className="numeric">Заказано</th>
                  <th className="numeric">Дефицит</th>
                  <th className="numeric">Оценка</th>
                  <th>Статус</th>
                </tr>
              </thead>
              <tbody>
                {model.materialNeeds.slice(0, 12).map((item) => (
                  <tr key={item.id}>
                    <td data-label="Материал">
                      <strong>{item.name || "Без названия"}</strong>
                      <small>{item.category}</small>
                    </td>
                    <td data-label="Источник">
                      <span>{item.sourceSection}</span>
                      <small>{item.sourceFile} · {item.sourceRow}</small>
                    </td>
                    <td className="numeric" data-label="Нужно">{item.quantity.toLocaleString("ru-RU")} {item.unit}</td>
                    <td className="numeric" data-label="Заказано">{item.orderedQty.toLocaleString("ru-RU")}</td>
                    <td className="numeric" data-label="Дефицит">{item.deficitQty.toLocaleString("ru-RU")}</td>
                    <td className="numeric" data-label="Оценка">{money(item.estimatedTotal)}</td>
                    <td data-label="Статус">
                      <span className="badge gray">{item.status}</span>
                      {item.warnings.length ? <small>{item.warnings.slice(0, 2).join("; ")}</small> : null}
                    </td>
                  </tr>
                ))}
                {!model.materialNeeds.length && (
                  <tr>
                    <td colSpan={7}>Материалы пока не загружены. Загрузите ВОР или добавьте потребность вручную.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </article>

        <article className="procurement-card">
          <div className="section-title">
            <Truck size={17} />
            <h4>Кандидаты в заявку</h4>
          </div>
          {model.groupsByCategory.length ? (
            <div className="procurement-group-list">
              {model.groupsByCategory.map((group) => (
                <div className="procurement-group-card" key={group.key}>
                  <strong>{group.label}</strong>
                  <span>{group.count} поз. · {money(group.estimatedTotal)}</span>
                  <small>Дефицит: {group.deficitQty.toLocaleString("ru-RU")}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Нет валидных кандидатов. Unknown/warning строки не включаются в заявку автоматически.</p>
          )}
        </article>

        <article className="procurement-card">
          <div className="section-title">
            <AlertTriangle size={17} />
            <h4>Строки на проверку</h4>
          </div>
          {model.missingRows.length ? (
            <div className="procurement-warning-list">
              {model.missingRows.slice(0, 8).map((row) => (
                <div key={`${row.source}-${row.name}`}>
                  <strong>{row.name}</strong>
                  <span>{row.reason}</span>
                  <small>{row.source}</small>
                </div>
              ))}
            </div>
          ) : (
            <p className="muted">Критичных unknown/warning строк для снабжения нет.</p>
          )}
        </article>

        <article className="procurement-card wide supply-draft-block">
          <div className="section-title">
            <ClipboardList size={17} />
            <h4>Черновик заявки снабжению</h4>
          </div>
          <div className="supply-draft-layout">
            <div>
              <p className="muted">Только валидные material candidates. Unknown rows остаются в проверке и не попадают в draft без ручного решения.</p>
              <div className="procurement-draft-items">
                {model.supplyRequestDraft.items.slice(0, 8).map((item) => (
                  <div key={`${item.name}-${item.unit}-${item.quantity}`}>
                    <strong>{item.name}</strong>
                    <span>{item.quantity.toLocaleString("ru-RU")} {item.unit} · {item.category} · {money(item.estimatedTotal)}</span>
                    <small>{item.comment}</small>
                  </div>
                ))}
                {!model.supplyRequestDraft.items.length && <span className="muted">Нет валидных строк для заявки.</span>}
              </div>
            </div>
            <pre className="copyable-draft">{model.supplyRequestDraft.copyText}</pre>
          </div>
        </article>
      </div>

      {currentDraft && (
        <div className="procurement-draft-result">
          <strong>{currentDraft.mode === "commit" ? "Commit выполнен" : "Preview готов"}</strong>
          <span>{currentDraft.draft.items.length} строк в ответе draft-from-import.</span>
          <div className="import-meta">
            {Object.entries(currentDraft.draft.summary).map(([key, value]) => (
              <span className="muted" key={key}>{key}: {String(value)}</span>
            ))}
          </div>
        </div>
      )}

      <div className="procurement-shortcuts">
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Бюджет / ВОР")}>Открыть ВОР</button>
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Заявки")}>Открыть заявки</button>
        <button className="button secondary compact-button" type="button" onClick={() => onNavigate("Аналитика")}>Project Intelligence</button>
      </div>
    </section>
  );
}
