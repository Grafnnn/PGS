"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, DatabaseZap, Download, FileSearch, Link2, RefreshCw, ShieldCheck, Upload } from "lucide-react";
import type { AccountingImportPreview, AccountingSourceSystem } from "@/lib/accounting-bridge";

type BridgeRun = {
  id: string;
  sourceSystem: string;
  direction: string;
  fileName: string | null;
  status: string;
  rowCount: number;
  matchedCount: number;
  unresolvedCount: number;
  appliedAt: string | null;
  createdAt: string;
};

type BridgeState = {
  capabilities: { view: boolean; export: boolean; import: boolean; apply: boolean };
  summary: {
    contractAmount: number;
    commitmentsAmount: number;
    receivablesAmount: number;
    payablesAmount: number;
    paymentCount: number;
    commitmentCount: number;
    missingData: string[];
  };
  runs: BridgeRun[];
};

type PreviewState = { runId: string; preview: AccountingImportPreview };

const sourceOptions: Array<{ value: AccountingSourceSystem; label: string }> = [
  { value: "1c", label: "1С" },
  { value: "sbis", label: "СБИС" },
  { value: "kontur", label: "Контур" },
  { value: "excel", label: "Excel / CSV" },
  { value: "other", label: "Другая система" }
];

function money(value: number) {
  return `${value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ₽`;
}

function statusLabel(value: string) {
  return ({ preview: "Dry-run", applied: "Применено", exported: "Экспорт" } as Record<string, string>)[value] ?? value;
}

function matchLabel(value: string) {
  return ({ matched: "Совпадение", ambiguous: "Неоднозначно", unmatched: "Не найдено", conflict: "Конфликт" } as Record<string, string>)[value] ?? value;
}

async function responseError(response: Response) {
  const body = await response.json().catch(() => null) as { error?: string } | null;
  return body?.error || `HTTP ${response.status}`;
}

export function AccountingBridgeWorkspace({ projectId, onPaymentsChanged }: { projectId: string; onPaymentsChanged: () => Promise<void> }) {
  const [state, setState] = useState<BridgeState | null>(null);
  const [sourceSystem, setSourceSystem] = useState<AccountingSourceSystem>("1c");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewState | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [loading, setLoading] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading("load");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/accounting-bridge`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response));
      setState(await response.json() as BridgeState);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить журнал обмена.");
    } finally {
      setLoading("");
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const readiness = useMemo(() => {
    if (!state) return { label: "Проверка", tone: "info" };
    if (!state.summary.paymentCount) return { label: "Нужны платежи", tone: "warn" };
    if (state.summary.missingData.length) return { label: "Есть ограничения", tone: "warn" };
    return { label: "Готово к обмену", tone: "good" };
  }, [state]);

  async function downloadPackage() {
    setLoading("export");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/accounting-bridge/export`, { method: "POST" });
      if (!response.ok) throw new Error(await responseError(response));
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `pgs-accounting-${projectId}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setNotice("Пакет подготовлен и записан в журнал обмена.");
      await load();
    } catch (exportError) {
      setError(exportError instanceof Error ? exportError.message : "Экспорт не выполнен.");
    } finally {
      setLoading("");
    }
  }

  async function previewImport() {
    if (!file) return;
    setLoading("preview");
    setError("");
    setNotice("");
    setConfirmed(false);
    try {
      const form = new FormData();
      form.set("file", file);
      form.set("sourceSystem", sourceSystem);
      const response = await fetch(`/api/projects/${projectId}/accounting-bridge/preview`, { method: "POST", body: form });
      if (!response.ok) throw new Error(await responseError(response));
      const result = await response.json() as PreviewState;
      setPreview(result);
      setNotice("Dry-run готов. Рабочие платежи не изменены.");
      await load();
    } catch (previewError) {
      setError(previewError instanceof Error ? previewError.message : "Файл не удалось сверить.");
    } finally {
      setLoading("");
    }
  }

  async function applyPreview() {
    if (!preview || !confirmed) return;
    setLoading("apply");
    setError("");
    setNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/accounting-bridge/runs/${preview.runId}/apply`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ confirmed: true })
      });
      if (!response.ok) throw new Error(await responseError(response));
      const body = await response.json() as { result: { updatedPayments: number; linkedPayments: number; unresolved: number } };
      setNotice(`Применено: ${body.result.updatedPayments} оплат, ${body.result.linkedPayments} внешних связей. Исключения оставлены без изменений: ${body.result.unresolved}.`);
      setPreview(null);
      setFile(null);
      setConfirmed(false);
      await Promise.all([load(), onPaymentsChanged()]);
    } catch (applyError) {
      setError(applyError instanceof Error ? applyError.message : "Сверка не применена.");
    } finally {
      setLoading("");
    }
  }

  return (
    <section className="accounting-bridge-workspace" aria-label="ERP & Accounting Bridge">
      <header className="accounting-bridge-header">
        <div>
          <div className="eyebrow">ERP &amp; Accounting Bridge v1</div>
          <h3>ERP / Бухгалтерия</h3>
          <p>Экспорт финансового контура, dry-run сверка и подтвержденное обновление факта оплаты.</p>
        </div>
        <div className="accounting-bridge-actions">
          <span className={`badge ${readiness.tone === "good" ? "green" : readiness.tone === "warn" ? "yellow" : "blue"}`}><ShieldCheck size={14} />{readiness.label}</span>
          <button className="icon-button" disabled={Boolean(loading)} onClick={() => void load()} title="Обновить журнал" type="button"><RefreshCw size={17} /></button>
          <button className="button secondary compact-button" disabled={!state?.capabilities.export || Boolean(loading)} onClick={() => void downloadPackage()} type="button"><Download size={16} />Экспорт JSON</button>
        </div>
      </header>

      {error && <div className="alert error"><AlertTriangle size={17} />{error}</div>}
      {notice && <div className="alert success"><CheckCircle2 size={17} />{notice}</div>}

      <div className="accounting-bridge-summary">
        <Metric label="Договор" value={money(state?.summary.contractAmount ?? 0)} detail="карточка проекта" />
        <Metric label="Обязательства" value={money(state?.summary.commitmentsAmount ?? 0)} detail={`${state?.summary.commitmentCount ?? 0} заявок`} />
        <Metric label="К получению" value={money(state?.summary.receivablesAmount ?? 0)} detail="входящие платежи" />
        <Metric label="К оплате" value={money(state?.summary.payablesAmount ?? 0)} detail={`${state?.summary.paymentCount ?? 0} платежей`} />
      </div>

      <div className="accounting-bridge-grid">
        <section className="accounting-bridge-section">
          <div className="accounting-bridge-section-title"><Upload size={18} /><div><h4>Сверка файла</h4><span>XLSX, XLS, CSV или JSON · до 5 МБ</span></div></div>
          <div className="accounting-import-controls">
            <label>Источник<select value={sourceSystem} onChange={(event) => setSourceSystem(event.target.value as AccountingSourceSystem)}>{sourceOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
            <label className="accounting-file-input">Файл<input accept=".xlsx,.xls,.csv,.json" onChange={(event) => { setFile(event.target.files?.[0] ?? null); setPreview(null); setConfirmed(false); }} type="file" /><span>{file?.name ?? "Файл не выбран"}</span></label>
            <button className="button primary" disabled={!file || !state?.capabilities.import || Boolean(loading)} onClick={() => void previewImport()} type="button"><FileSearch size={16} />Проверить</button>
          </div>
          <div className="accounting-safety-note"><DatabaseZap size={17} /><span>Неизвестные и неоднозначные строки остаются исключениями. Новые платежи автоматически не создаются.</span></div>
          {state?.summary.missingData.length ? <div className="accounting-limitations"><strong>Перед первым обменом</strong><span>{state.summary.missingData.join(" · ")}</span></div> : null}
        </section>

        <section className="accounting-bridge-section">
          <div className="accounting-bridge-section-title"><Link2 size={18} /><div><h4>Журнал обмена</h4><span>Последние 20 операций</span></div></div>
          <div className="accounting-run-list">
            {state?.runs.length ? state.runs.map((run) => (
              <div className="accounting-run" key={run.id}>
                <div><strong>{run.direction === "export" ? "Экспорт" : run.fileName || "Импорт"}</strong><span>{new Date(run.createdAt).toLocaleString("ru-RU")}</span></div>
                <span className={`badge ${run.status === "applied" || run.status === "exported" ? "green" : "yellow"}`}>{statusLabel(run.status)}</span>
                <small>{run.matchedCount}/{run.rowCount} совпадений · {run.unresolvedCount} исключений</small>
              </div>
            )) : <p className="muted">Операций обмена пока нет.</p>}
          </div>
        </section>
      </div>

      {preview && <PreviewPanel confirmed={confirmed} loading={loading} preview={preview.preview} setConfirmed={setConfirmed} onApply={() => void applyPreview()} canApply={Boolean(state?.capabilities.apply)} />}
    </section>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <div className="accounting-bridge-metric"><small>{label}</small><strong>{value}</strong><span>{detail}</span></div>;
}

function PreviewPanel({ preview, confirmed, setConfirmed, onApply, loading, canApply }: { preview: AccountingImportPreview; confirmed: boolean; setConfirmed: (value: boolean) => void; onApply: () => void; loading: string; canApply: boolean }) {
  return <section className="accounting-preview">
    <div className="accounting-preview-header"><div><div className="eyebrow">Dry-run</div><h4>{preview.fileName}</h4></div><div className="accounting-preview-counters"><span className="badge green">{preview.summary.matched} совпадений</span><span className="badge yellow">{preview.summary.ambiguous + preview.summary.unmatched} на проверку</span>{preview.summary.conflicts ? <span className="badge red">{preview.summary.conflicts} конфликтов</span> : null}</div></div>
    {preview.warnings.length ? <div className="accounting-warning-list">{preview.warnings.map((warning) => <span key={warning}><AlertTriangle size={14} />{warning}</span>)}</div> : null}
    <div className="table-wrap accounting-preview-table"><table><thead><tr><th>Строка</th><th>Дата</th><th>Контрагент</th><th>Сумма</th><th>Результат</th><th>Платёж PGS</th></tr></thead><tbody>{preview.matches.map((match) => <tr key={`${match.row.rowNumber}-${match.row.externalId ?? "row"}`}><td>{match.row.rowNumber}</td><td>{match.row.date}</td><td>{match.row.counterparty || "—"}<small>{match.row.purpose}</small></td><td>{money(match.row.amount)}</td><td><span className={`badge ${match.status === "matched" ? "green" : match.status === "conflict" ? "red" : "yellow"}`}>{matchLabel(match.status)}</span><small>{match.reasons.join(" · ")}</small></td><td>{match.paymentTitle ?? "Не изменяется"}</td></tr>)}</tbody></table></div>
    <div className="accounting-apply-bar"><label className="check-row"><input checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} type="checkbox" /><span>Подтверждаю применение только {preview.summary.safeToApply} безопасных совпадений</span></label><button className="button primary" disabled={!confirmed || !canApply || Boolean(loading) || preview.summary.safeToApply === 0} onClick={onApply} type="button"><CheckCircle2 size={16} />Применить сверку</button></div>
  </section>;
}
