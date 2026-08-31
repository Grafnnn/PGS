"use client";

import { AlertTriangle, ChartPie, Check, ChevronDown, Download, FileCheck2, Pencil, Plus, ReceiptText, RefreshCw, Search, Sparkles, Trash2, Upload, X } from "lucide-react";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from "recharts";
import { builtInExpenseCategoryOptions, expensePaymentMethods, expensePaymentMethodLabels, type ExpenseCategoryOption, type ExpensePaymentMethod } from "@/lib/project-expense-config";
import type { ReceiptRecognitionResult } from "@/lib/receipt-recognition";

type ExpenseLine = {
  id?: string;
  name: string;
  category: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  amount: number;
  taxAmount: number;
};

type Expense = {
  id: string;
  sequence: number;
  expenseDate: string;
  merchant: string;
  documentNumber: string | null;
  category: string;
  paymentMethod: ExpensePaymentMethod;
  currency: string;
  grossAmount: number;
  taxAmount: number;
  source: "manual" | "receipt";
  recognitionStatus: "not_applicable" | "recognized" | "edited";
  recognitionConfidence: "low" | "medium" | "high" | null;
  notes: string | null;
  costCode?: { id: string; code: string; name: string } | null;
  receiptDocument?: { id: string; title: string; fileName: string | null; mimeType: string | null } | null;
  items: ExpenseLine[];
};

type Summary = {
  count: number;
  grossAmount: number;
  taxAmount: number;
  receipts: number;
  withoutReceipt: number;
  byCategory: Record<string, number>;
};

type CostCode = { id: string; code: string; name: string };
type FormMode = "manual" | "receipt";
type CategoryComposerTarget = "form" | "toolbar";

type ExpenseForm = {
  expenseDate: string;
  merchant: string;
  documentNumber: string;
  category: string;
  paymentMethod: ExpensePaymentMethod;
  currency: string;
  grossAmount: string;
  taxAmount: string;
  costCodeId: string;
  notes: string;
  recognitionStatus: "not_applicable" | "recognized" | "edited";
  recognitionConfidence: "low" | "medium" | "high" | null;
  items: ExpenseLine[];
};

function dateInput(value = new Date()) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 10);
}

function emptyForm(mode: FormMode): ExpenseForm {
  return {
    expenseDate: dateInput(), merchant: "", documentNumber: "", category: "materials", paymentMethod: "unknown", currency: "RUB",
    grossAmount: "", taxAmount: "0", costCodeId: "", notes: "",
    recognitionStatus: mode === "receipt" ? "recognized" : "not_applicable", recognitionConfidence: null, items: []
  };
}

function money(value: number) {
  return `${Math.round(value).toLocaleString("ru-RU")} ₽`;
}

function numberInput(value: string) {
  const parsed = Number(value.replace(",", "."));
  return Number.isFinite(parsed) ? parsed : 0;
}

function confidenceLabel(value: Expense["recognitionConfidence"]) {
  if (value === "high") return "Высокая точность";
  if (value === "medium") return "Проверьте отдельные поля";
  if (value === "low") return "Нужна внимательная проверка";
  return "Без распознавания";
}

const expenseChartColors = ["#0f766e", "#2563eb", "#d97706", "#dc2626", "#7c3aed", "#0891b2", "#65a30d", "#db2777", "#475569", "#b45309", "#0369a1", "#6d28d9"];

function expenseChartColor(value: string) {
  const hash = [...value].reduce((total, character) => (total * 31 + character.charCodeAt(0)) >>> 0, 0);
  return expenseChartColors[hash % expenseChartColors.length];
}

function ExpenseCategoryComposer({ className, inputLabel, value, saving, onChange, onSave, onCancel }: {
  className: string;
  inputLabel: string;
  value: string;
  saving: boolean;
  onChange(value: string): void;
  onSave(): void;
  onCancel(): void;
}) {
  return <div className={className}>
    <input
      aria-label={inputLabel}
      autoFocus
      maxLength={80}
      onChange={(event) => onChange(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          onSave();
        }
        if (event.key === "Escape") onCancel();
      }}
      placeholder="Например, аренда бытовки"
      value={value}
    />
    <button aria-label="Сохранить новую статью" className="icon-button primary" disabled={saving || value.trim().length < 2} onClick={onSave} title="Сохранить статью" type="button">{saving ? <RefreshCw className="spin" size={16} /> : <Check size={16} />}</button>
    <button aria-label="Отменить добавление статьи" className="icon-button" onClick={onCancel} title="Отмена" type="button"><X size={16} /></button>
  </div>;
}

type ExpenseChartDatum = { value: string; label: string; amount: number; percent: number; color: string };

function ExpenseCategoryInsights({ data, total, selected, onSelect }: { data: ExpenseChartDatum[]; total: number; selected: string; onSelect(value: string): void }) {
  return <section aria-label="Структура расходов по статьям" className="expense-category-insights">
    <header>
      <div><span className="eyebrow">Структура фактических затрат</span><h4><ChartPie size={18} /> Расходы по статьям</h4></div>
      <div><small>Общая сумма</small><strong>{money(total)}</strong></div>
    </header>
    {data.length === 0 ? <div className="expense-category-empty"><ChartPie size={22} /><span>Диаграмма появится после добавления первого расхода.</span></div> : <div className="expense-category-insights-body">
      <div className="expense-category-chart">
        <ResponsiveContainer height="100%" width="100%">
          <PieChart accessibilityLayer>
            <Pie data={data} dataKey="amount" innerRadius="58%" nameKey="label" outerRadius="88%" paddingAngle={data.length > 1 ? 2 : 0} stroke="var(--panel)" strokeWidth={2}>
              {data.map((item) => <Cell fill={item.color} key={item.value} />)}
            </Pie>
            <Tooltip content={({ active, payload }) => {
              const item = payload?.[0]?.payload as ExpenseChartDatum | undefined;
              return active && item ? <div className="expense-category-tooltip"><strong>{item.label}</strong><span>{money(item.amount)}</span><small>{item.percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}% от общей суммы</small></div> : null;
            }} />
          </PieChart>
        </ResponsiveContainer>
        <div aria-hidden="true" className="expense-category-chart-center"><strong>{data.length}</strong><span>{data.length === 1 ? "статья" : data.length < 5 ? "статьи" : "статей"}</span></div>
      </div>
      <div aria-label="Статьи расходов" className="expense-category-legend">
        {data.map((item) => <button aria-pressed={selected === item.value} key={item.value} onClick={() => onSelect(selected === item.value ? "all" : item.value)} type="button">
          <i style={{ background: item.color }} />
          <span><strong>{item.label}</strong><small>{item.percent.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%</small></span>
          <b>{money(item.amount)}</b>
          <em aria-hidden="true"><span style={{ width: `${Math.max(item.percent, 2)}%`, background: item.color }} /></em>
        </button>)}
      </div>
    </div>}
  </section>;
}

export function ExpenseRegisterWorkspace({ projectId, canEdit, canDelete }: { projectId: string; canEdit: boolean; canDelete: boolean }) {
  const [items, setItems] = useState<Expense[]>([]);
  const [costCodes, setCostCodes] = useState<CostCode[]>([]);
  const [categories, setCategories] = useState<ExpenseCategoryOption[]>(builtInExpenseCategoryOptions);
  const [summary, setSummary] = useState<Summary>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [formMode, setFormMode] = useState<FormMode | null>(null);
  const [editingId, setEditingId] = useState("");
  const [form, setForm] = useState<ExpenseForm>(() => emptyForm("manual"));
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [recognitionWarnings, setRecognitionWarnings] = useState<string[]>([]);
  const [categoryComposerTarget, setCategoryComposerTarget] = useState<CategoryComposerTarget | null>(null);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [creatingCategory, setCreatingCategory] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/projects/${projectId}/expenses`, { cache: "no-store" });
      const data = await response.json() as { items?: Expense[]; costCodes?: CostCode[]; categories?: ExpenseCategoryOption[]; summary?: Summary; error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось загрузить реестр расходов.");
      setItems(data.items ?? []);
      setCostCodes(data.costCodes ?? []);
      setCategories(data.categories?.length ? data.categories : builtInExpenseCategoryOptions);
      setSummary(data.summary);
      setError("");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить реестр расходов.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLocaleLowerCase("ru");
    return items.filter((item) => {
      if (categoryFilter !== "all" && item.category !== categoryFilter && !item.items.some((line) => line.category === categoryFilter)) return false;
      return !needle || `${item.merchant} ${item.documentNumber ?? ""} ${item.costCode?.code ?? ""} ${item.items.map((line) => line.name).join(" ")}`.toLocaleLowerCase("ru").includes(needle);
    });
  }, [categoryFilter, items, query]);

  const categoryLabels = useMemo(() => Object.fromEntries(categories.map((category) => [category.value, category.label])), [categories]);
  const chartData = useMemo<ExpenseChartDatum[]>(() => {
    const total = summary?.grossAmount ?? 0;
    const knownValues = new Set([...categories.map((category) => category.value), ...Object.keys(summary?.byCategory ?? {})]);
    return [...knownValues]
      .map((value) => ({ value, label: categoryLabels[value] ?? "Статья не найдена", amount: summary?.byCategory[value] ?? 0 }))
      .filter((item) => item.amount > 0)
      .sort((left, right) => right.amount - left.amount)
      .map((item) => ({ ...item, percent: total > 0 ? item.amount / total * 100 : 0, color: expenseChartColor(item.value) }));
  }, [categories, categoryLabels, summary]);

  const lineTotal = useMemo(() => form.items.reduce((sum, line) => sum + line.amount, 0), [form.items]);

  function openNew(mode: FormMode) {
    const nextForm = emptyForm(mode);
    if (categoryFilter !== "all") nextForm.category = categoryFilter;
    setEditingId("");
    setFormMode(mode);
    setForm(nextForm);
    setReceiptFile(null);
    setRecognitionWarnings([]);
    setCategoryComposerTarget(null);
    setNewCategoryName("");
    setError("");
    setNotice("");
  }

  function closeForm() {
    setFormMode(null);
    setEditingId("");
    setReceiptFile(null);
    setRecognitionWarnings([]);
    setCategoryComposerTarget(null);
    setNewCategoryName("");
  }

  function toggleCategoryComposer(target: CategoryComposerTarget) {
    const shouldOpen = categoryComposerTarget !== target;
    setCategoryComposerTarget(shouldOpen ? target : null);
    if (shouldOpen) setNewCategoryName("");
    setError("");
  }

  function markEdited(next: ExpenseForm) {
    return formMode === "receipt" && next.recognitionConfidence ? { ...next, recognitionStatus: "edited" as const } : next;
  }

  function updateForm<K extends keyof ExpenseForm>(key: K, value: ExpenseForm[K]) {
    setForm((current) => markEdited({ ...current, [key]: value }));
  }

  function addLine() {
    setForm((current) => markEdited({ ...current, items: [...current.items, { name: "", category: current.category, quantity: 1, unit: "шт", unitPrice: 0, amount: 0, taxAmount: 0 }] }));
  }

  function updateLine(index: number, patch: Partial<ExpenseLine>, recalculate = false) {
    setForm((current) => {
      const lines = current.items.map((line, lineIndex) => {
        if (lineIndex !== index) return line;
        const next = { ...line, ...patch };
        if (recalculate) next.amount = Math.round(next.quantity * next.unitPrice * 100) / 100;
        return next;
      });
      return markEdited({ ...current, items: lines });
    });
  }

  async function createCategory(target: CategoryComposerTarget) {
    const name = newCategoryName.trim();
    if (name.length < 2) return setError("Введите название статьи — минимум 2 символа.");
    setCreatingCategory(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/expense-categories`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name })
      });
      const data = await response.json() as { item?: ExpenseCategoryOption; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error || "Не удалось добавить статью расходов.");
      setCategories((current) => [...current, data.item as ExpenseCategoryOption]);
      if (target === "toolbar") setCategoryFilter(data.item.value);
      else updateForm("category", data.item.value);
      setNewCategoryName("");
      setCategoryComposerTarget(null);
      setNotice(`Статья «${data.item.label}» добавлена и выбрана.`);
    } catch (categoryError) {
      setError(categoryError instanceof Error ? categoryError.message : "Не удалось добавить статью расходов.");
    } finally {
      setCreatingCategory(false);
    }
  }

  async function analyzeReceipt() {
    if (!receiptFile) return setError("Выберите фото или PDF чека.");
    setAnalyzing(true);
    setError("");
    setNotice("");
    try {
      const body = new FormData();
      body.set("file", receiptFile);
      const response = await fetch(`/api/projects/${projectId}/expenses/receipt-preview`, { method: "POST", body });
      const data = await response.json() as { preview?: ReceiptRecognitionResult; error?: string };
      if (!response.ok || !data.preview) throw new Error(data.error || "Не удалось распознать чек.");
      const preview = data.preview;
      setForm({
        expenseDate: preview.expenseDate ?? dateInput(), merchant: preview.merchant ?? "Не определено", documentNumber: preview.documentNumber ?? "",
        category: preview.category, paymentMethod: preview.paymentMethod, currency: preview.currency, grossAmount: preview.grossAmount?.toString() ?? "",
        taxAmount: (preview.taxAmount ?? 0).toString(), costCodeId: "", notes: "", recognitionStatus: "recognized",
        recognitionConfidence: preview.confidence, items: preview.items
      });
      setRecognitionWarnings(preview.warnings);
      setNotice("Чек распознан. Проверьте суммы и статьи перед сохранением.");
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Не удалось распознать чек.");
    } finally {
      setAnalyzing(false);
    }
  }

  function editExpense(item: Expense) {
    setEditingId(item.id);
    setFormMode(item.source);
    setReceiptFile(null);
    setRecognitionWarnings([]);
    setForm({
      expenseDate: item.expenseDate.slice(0, 10), merchant: item.merchant, documentNumber: item.documentNumber ?? "", category: item.category,
      paymentMethod: item.paymentMethod, currency: item.currency, grossAmount: item.grossAmount.toString(), taxAmount: item.taxAmount.toString(),
      costCodeId: item.costCode?.id ?? "", notes: item.notes ?? "", recognitionStatus: item.recognitionStatus,
      recognitionConfidence: item.recognitionConfidence, items: item.items.map((line) => ({ ...line }))
    });
    setError("");
    setNotice("");
  }

  function payload() {
    return {
      expenseDate: form.expenseDate, merchant: form.merchant, documentNumber: form.documentNumber || null, category: form.category,
      paymentMethod: form.paymentMethod, currency: form.currency.toUpperCase(), grossAmount: numberInput(form.grossAmount), taxAmount: numberInput(form.taxAmount),
      costCodeId: form.costCodeId || null, notes: form.notes || null, source: formMode ?? "manual", recognitionStatus: form.recognitionStatus,
      recognitionConfidence: form.recognitionConfidence, items: form.items.map(({ id: _id, ...line }) => line)
    };
  }

  async function save() {
    if (!form.merchant.trim()) return setError("Укажите поставщика или назначение расхода.");
    if (!form.grossAmount || numberInput(form.grossAmount) < 0) return setError("Укажите сумму расхода.");
    if (formMode === "receipt" && !editingId && !receiptFile) return setError("Выберите чек и выполните распознавание.");
    setSaving(true);
    setError("");
    try {
      const target = editingId ? `/api/projects/${projectId}/expenses/${editingId}` : `/api/projects/${projectId}/expenses`;
      let response: Response;
      if (formMode === "receipt" && !editingId) {
        const body = new FormData();
        body.set("payload", JSON.stringify(payload()));
        body.set("file", receiptFile as File);
        response = await fetch(target, { method: "POST", body });
      } else {
        response = await fetch(target, { method: editingId ? "PATCH" : "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload()) });
      }
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error || "Не удалось сохранить расход.");
      closeForm();
      setNotice(editingId ? "Расход обновлён." : "Расход добавлен в реестр.");
      await load();
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить расход.");
    } finally {
      setSaving(false);
    }
  }

  async function remove(item: Expense) {
    if (!window.confirm(`Удалить расход №${item.sequence} «${item.merchant}»? Файл чека останется в документах проекта.`)) return;
    setError("");
    const response = await fetch(`/api/projects/${projectId}/expenses/${item.id}`, { method: "DELETE" });
    const data = await response.json() as { error?: string };
    if (!response.ok) return setError(data.error || "Не удалось удалить расход.");
    setNotice("Расход удалён; связанный документ сохранён.");
    await load();
  }

  return <section className="expense-register">
    <header className="expense-register-header">
      <div>
        <span className="eyebrow">Фактические затраты</span>
        <h3><ReceiptText size={22} /> Реестр расходов</h3>
        <p>Чеки, ручные расходы и постатейная выгрузка. Плановые платежи остаются в отдельной вкладке.</p>
      </div>
      <div className="expense-register-actions">
        {canEdit && <a className="button secondary" href={`/api/projects/${projectId}/expenses/export`}><Download size={16} /> Excel</a>}
        {canEdit && <button className="button secondary" onClick={() => openNew("manual")} type="button"><Plus size={16} /> Без чека</button>}
        {canEdit && <button className="button" onClick={() => openNew("receipt")} type="button"><Upload size={16} /> Загрузить чек</button>}
      </div>
    </header>

    <div className="expense-metrics">
      <article><span>Учтено</span><strong>{money(summary?.grossAmount ?? 0)}</strong><small>{summary?.count ?? 0} записей</small></article>
      <article><span>В том числе НДС</span><strong>{money(summary?.taxAmount ?? 0)}</strong><small>для сверки</small></article>
      <article><span>С подтверждением</span><strong>{summary?.receipts ?? 0}</strong><small>чеков и документов</small></article>
      <article className={(summary?.withoutReceipt ?? 0) > 0 ? "tone-warn" : "tone-good"}><span>Без чека</span><strong>{summary?.withoutReceipt ?? 0}</strong><small>ручных записей</small></article>
    </div>

    <ExpenseCategoryInsights data={chartData} onSelect={setCategoryFilter} selected={categoryFilter} total={summary?.grossAmount ?? 0} />

    {(error || notice) && <div className={`expense-notice ${error ? "error" : "success"}`}>{error ? <AlertTriangle size={17} /> : <FileCheck2 size={17} />}<span>{error || notice}</span></div>}

    {formMode && <div className="expense-form">
      <header>
        <div><span className="eyebrow">{editingId ? "Редактирование" : formMode === "receipt" ? "Новый расход по чеку" : "Новый расход без чека"}</span><h4>{editingId ? `Расход №${items.find((item) => item.id === editingId)?.sequence ?? ""}` : "Проверьте данные перед сохранением"}</h4></div>
        <button aria-label="Закрыть форму" className="icon-button" onClick={closeForm} title="Закрыть" type="button"><X size={18} /></button>
      </header>

      {formMode === "receipt" && !editingId && <div className="expense-receipt-upload">
        <label><span>Фото или PDF чека</span><input accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp" type="file" onChange={(event) => { setReceiptFile(event.target.files?.[0] ?? null); setRecognitionWarnings([]); }} /><small>{receiptFile?.name ?? "До 10 МБ"}</small></label>
        <button className="button secondary" disabled={!receiptFile || analyzing} onClick={() => void analyzeReceipt()} type="button">{analyzing ? <RefreshCw className="spin" size={16} /> : <Sparkles size={16} />}{analyzing ? "Распознаём" : "Распознать чек"}</button>
        <span className={`expense-confidence ${form.recognitionConfidence ?? "none"}`}>{confidenceLabel(form.recognitionConfidence)}</span>
      </div>}

      {recognitionWarnings.length > 0 && <div className="expense-recognition-warnings"><AlertTriangle size={17} /><div><strong>Проверьте вручную</strong>{recognitionWarnings.map((warning) => <span key={warning}>{warning}</span>)}</div></div>}

      <div className="expense-form-grid">
        <label className="field"><span>Дата *</span><input type="date" value={form.expenseDate} onChange={(event) => updateForm("expenseDate", event.target.value)} /></label>
        <label className="field field-wide"><span>Поставщик / назначение *</span><input placeholder="ООО Стройснаб или хозяйственные расходы" value={form.merchant} onChange={(event) => updateForm("merchant", event.target.value)} /></label>
        <label className="field"><span>№ чека / документа</span><input value={form.documentNumber} onChange={(event) => updateForm("documentNumber", event.target.value)} /></label>
        <div className="field expense-category-field">
          <span>Статья *</span>
          <div className="expense-category-control">
            <select aria-label="Статья расхода" value={form.category} onChange={(event) => updateForm("category", event.target.value)}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}{category.custom ? " · своя" : ""}</option>)}</select>
            <button aria-expanded={categoryComposerTarget === "form"} aria-label="Добавить свою статью в расход" className="icon-button" onClick={() => toggleCategoryComposer("form")} title="Добавить свою статью" type="button"><Plus size={17} /></button>
          </div>
          {categoryComposerTarget === "form" && <ExpenseCategoryComposer className="expense-category-composer" inputLabel="Название новой статьи расхода" onCancel={() => { setCategoryComposerTarget(null); setNewCategoryName(""); }} onChange={setNewCategoryName} onSave={() => void createCategory("form")} saving={creatingCategory} value={newCategoryName} />}
        </div>
        <label className="field"><span>Способ оплаты</span><select value={form.paymentMethod} onChange={(event) => updateForm("paymentMethod", event.target.value as ExpensePaymentMethod)}>{expensePaymentMethods.map((method) => <option key={method} value={method}>{expensePaymentMethodLabels[method]}</option>)}</select></label>
        <label className="field"><span>Код затрат</span><select value={form.costCodeId} onChange={(event) => updateForm("costCodeId", event.target.value)}><option value="">Не привязан</option>{costCodes.map((code) => <option key={code.id} value={code.id}>{code.code} · {code.name}</option>)}</select></label>
        <label className="field"><span>Сумма *</span><input inputMode="decimal" placeholder="0,00" value={form.grossAmount} onChange={(event) => updateForm("grossAmount", event.target.value)} /></label>
        <label className="field"><span>В том числе НДС</span><input inputMode="decimal" value={form.taxAmount} onChange={(event) => updateForm("taxAmount", event.target.value)} /></label>
        <label className="field"><span>Валюта</span><input maxLength={3} value={form.currency} onChange={(event) => updateForm("currency", event.target.value.toUpperCase())} /></label>
        <label className="field field-wide"><span>Примечание</span><textarea placeholder="Объект, получатель, причина расхода" value={form.notes} onChange={(event) => updateForm("notes", event.target.value)} /></label>
      </div>

      <div className="expense-lines">
        <header><div><strong>Позиции расхода</strong><span>Для постатейного Excel и аналитики по категориям</span></div><button className="button secondary compact-button" onClick={addLine} type="button"><Plus size={15} /> Позиция</button></header>
        {form.items.length === 0 ? <button className="expense-lines-empty" onClick={addLine} type="button">Добавить детализацию или сохранить расход одной строкой</button> : form.items.map((line, index) => <div className="expense-line" key={`${index}-${line.id ?? "new"}`}>
          <input aria-label="Наименование позиции" className="expense-line-name" placeholder="Наименование" value={line.name} onChange={(event) => updateLine(index, { name: event.target.value })} />
          <select aria-label="Статья позиции" value={line.category} onChange={(event) => updateLine(index, { category: event.target.value })}>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select>
          <input aria-label="Количество" inputMode="decimal" min="0" type="number" value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) }, true)} />
          <input aria-label="Единица" value={line.unit} onChange={(event) => updateLine(index, { unit: event.target.value })} />
          <input aria-label="Цена" inputMode="decimal" min="0" type="number" value={line.unitPrice} onChange={(event) => updateLine(index, { unitPrice: Number(event.target.value) }, true)} />
          <input aria-label="Сумма позиции" inputMode="decimal" min="0" type="number" value={line.amount} onChange={(event) => updateLine(index, { amount: Number(event.target.value) })} />
          <button aria-label="Удалить позицию" className="icon-button" onClick={() => setForm((current) => markEdited({ ...current, items: current.items.filter((_, lineIndex) => lineIndex !== index) }))} title="Удалить позицию" type="button"><Trash2 size={16} /></button>
        </div>)}
        {form.items.length > 0 && <div className={`expense-line-total ${Math.abs(lineTotal - numberInput(form.grossAmount)) > 0.01 ? "variance" : ""}`}><span>Сумма позиций</span><strong>{money(lineTotal)}</strong><small>{Math.abs(lineTotal - numberInput(form.grossAmount)) > 0.01 ? `Отклонение ${money(lineTotal - numberInput(form.grossAmount))}` : "Совпадает с итогом"}</small></div>}
      </div>

      <footer><span>Сохранение чека создаст связанный документ проекта.</span><div><button className="button secondary" onClick={closeForm} type="button">Отмена</button><button className="button" disabled={saving || analyzing} onClick={() => void save()} type="button">{saving ? <RefreshCw className="spin" size={16} /> : <FileCheck2 size={16} />}{saving ? "Сохраняем" : "Сохранить расход"}</button></div></footer>
    </div>}

    <div className="expense-toolbar">
      <label><Search size={16} /><input aria-label="Поиск расходов" placeholder="Поставщик, документ, позиция или код" value={query} onChange={(event) => setQuery(event.target.value)} /></label>
      <div className="expense-toolbar-category">
        <label><span>Статья</span><select aria-label="Фильтр по статье расходов" value={categoryFilter} onChange={(event) => setCategoryFilter(event.target.value)}><option value="all">Все статьи</option>{categories.map((category) => <option key={category.value} value={category.value}>{category.label}</option>)}</select><ChevronDown size={15} /></label>
        {canEdit && <button aria-expanded={categoryComposerTarget === "toolbar"} aria-label="Добавить свою статью рядом с фильтром" className="icon-button expense-toolbar-add-category" onClick={() => toggleCategoryComposer("toolbar")} title="Добавить свою статью" type="button"><Plus size={17} /></button>}
        {categoryComposerTarget === "toolbar" && <ExpenseCategoryComposer className="expense-toolbar-category-composer" inputLabel="Название новой статьи в фильтре" onCancel={() => { setCategoryComposerTarget(null); setNewCategoryName(""); }} onChange={setNewCategoryName} onSave={() => void createCategory("toolbar")} saving={creatingCategory} value={newCategoryName} />}
      </div>
      <button aria-label="Обновить реестр" className="icon-button" disabled={loading} onClick={() => void load()} title="Обновить" type="button"><RefreshCw className={loading ? "spin" : ""} size={17} /></button>
    </div>

    <div className="expense-list">
      {loading ? <div className="expense-empty"><RefreshCw className="spin" size={20} /><strong>Загружаем реестр</strong></div> : filtered.length === 0 ? <div className="expense-empty"><ReceiptText size={24} /><strong>{items.length ? "По фильтру ничего не найдено" : "Расходов пока нет"}</strong><span>{items.length ? "Измените условия поиска." : "Добавьте расход вручную или загрузите чек."}</span></div> : filtered.map((item) => <details className="expense-row" key={item.id}>
        <summary>
          <span className="expense-row-number">#{item.sequence}</span>
          <span className="expense-row-main"><strong>{item.merchant}</strong><small>{new Date(item.expenseDate).toLocaleDateString("ru-RU")} · {categoryLabels[item.category] ?? "Статья не найдена"}</small></span>
          <span className="expense-row-code">{item.costCode ? `${item.costCode.code} · ${item.costCode.name}` : "Без кода затрат"}</span>
          <span className="expense-row-source">{item.receiptDocument ? <><ReceiptText size={14} /> Чек</> : "Без чека"}</span>
          <strong className="expense-row-amount">{money(item.grossAmount)}</strong>
          <ChevronDown className="expense-row-chevron" size={17} />
        </summary>
        <div className="expense-row-details">
          <div className="expense-row-meta"><span><small>Документ</small><strong>{item.documentNumber || "Не указан"}</strong></span><span><small>Оплата</small><strong>{expensePaymentMethodLabels[item.paymentMethod]}</strong></span><span><small>НДС</small><strong>{money(item.taxAmount)}</strong></span><span><small>Источник</small><strong>{item.source === "receipt" ? confidenceLabel(item.recognitionConfidence) : "Ручная запись"}</strong></span></div>
          {item.items.length > 0 && <div className="expense-row-lines">{item.items.map((line, index) => <div key={line.id ?? index}><span>{line.name}</span><small>{line.quantity.toLocaleString("ru-RU")} {line.unit} × {money(line.unitPrice)}</small><strong>{money(line.amount)}</strong></div>)}</div>}
          <footer>
            <span>{item.notes || "Без примечания"}</span>
            <div>{item.receiptDocument && <a className="button secondary compact-button" href={`/api/projects/${projectId}/documents/${item.receiptDocument.id}/download`}><Download size={15} /> {item.receiptDocument.fileName ?? "Чек"}</a>}{canEdit && <button className="icon-button" onClick={() => editExpense(item)} title="Редактировать" type="button"><Pencil size={16} /></button>}{canDelete && <button className="icon-button danger" onClick={() => void remove(item)} title="Удалить расход" type="button"><Trash2 size={16} /></button>}</div>
          </footer>
        </div>
      </details>)}
    </div>
  </section>;
}
