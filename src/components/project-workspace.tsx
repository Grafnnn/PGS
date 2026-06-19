"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Bot, ClipboardList, FileText, Landmark, Package, Plus, Send, Table2, TimerReset, Truck } from "lucide-react";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import type { ImportPreview } from "@/lib/excel/import-types";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Risk, ScheduleItem } from "@/lib/types";

type Bundle = {
  project: {
    id: string;
    name: string;
    customer: string;
    object: string;
    address: string;
    contractAmount: number;
    startsAt: string;
    endsAt: string;
    manager: string;
  };
  budgetItems: BudgetItem[];
  scheduleItems: ScheduleItem[];
  materials: Material[];
  procurementRequests: ProcurementRequest[];
  payments: Payment[];
  dailyReports: DailyReport[];
  risks: Risk[];
};

const tabs = [
  "Обзор",
  "Бюджет / ВОР",
  "График",
  "Материалы",
  "Заявки",
  "Финансы",
  "Рапорты",
  "Риски",
  "Документы",
  "AI-помощник"
];

export function ProjectWorkspace({ initialBundle }: { initialBundle: Bundle }) {
  const [activeTab, setActiveTab] = useState(tabs[0]);
  const [budgetItems, setBudgetItems] = useState(initialBundle.budgetItems);
  const [scheduleItems, setScheduleItems] = useState(initialBundle.scheduleItems);
  const [materials, setMaterials] = useState(initialBundle.materials);
  const [payments, setPayments] = useState(initialBundle.payments);
  const [reports, setReports] = useState(initialBundle.dailyReports);
  const [risks, setRisks] = useState(initialBundle.risks);
  const [aiPrompt, setAiPrompt] = useState("Что сейчас самое важное по проекту?");
  const [aiAnswer, setAiAnswer] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importMode, setImportMode] = useState<"append" | "replace_budget" | "replace_materials" | "replace_schedule">("append");

  const budget = useMemo(() => budgetTotals(initialBundle.project.contractAmount, budgetItems), [budgetItems, initialBundle.project.contractAmount]);
  const works = useMemo(() => workTotals(scheduleItems), [scheduleItems]);
  const materialStats = useMemo(() => materialTotals(materials), [materials]);
  const finance = useMemo(() => financeTotals(payments), [payments]);
  const allRisks = useMemo(() => [...risks, ...deriveAutoRisks(scheduleItems, materials, payments)], [risks, scheduleItems, materials, payments]);

  async function askAi(prompt = aiPrompt) {
    setAiLoading(true);
    setAiPrompt(prompt);
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/ai/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });
      const data = (await response.json()) as { response?: string; error?: string };
      setAiAnswer(data.response ?? data.error ?? "Нет ответа.");
    } catch (error) {
      setAiAnswer(error instanceof Error ? error.message : "Ошибка AI-запроса.");
    } finally {
      setAiLoading(false);
    }
  }

  async function createResource<T>(resource: string, payload: unknown) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/${resource}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { item?: T; error?: string; issues?: unknown };
      if (!response.ok || !data.item) {
        throw new Error(data.error ?? "Не удалось сохранить запись.");
      }
      return data.item;
    } catch (saveError) {
      const message = saveError instanceof Error ? saveError.message : "Ошибка сохранения.";
      setError(message);
      throw saveError;
    } finally {
      setSaving("");
    }
  }

  async function previewImport() {
    if (!importFile) {
      setError("Выберите Excel-файл для импорта.");
      return;
    }
    setSaving("import-preview");
    setError("");
    setImportConfirmed(false);
    try {
      const formData = new FormData();
      formData.append("file", importFile);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/budget/preview`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as ImportPreview | { error?: string };
      if (!response.ok && "error" in data) throw new Error(data.error ?? "Не удалось проверить файл.");
      setImportPreview(data as ImportPreview);
    } catch (previewError) {
      setImportPreview(null);
      setError(previewError instanceof Error ? previewError.message : "Ошибка проверки Excel-файла.");
    } finally {
      setSaving("");
    }
  }

  async function commitImport() {
    if (!importPreview || !importConfirmed || importPreview.summary.errors > 0) return;
    setSaving("import-commit");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/imports/budget/commit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: importMode,
          sections: importPreview.sections,
          budgetItems: importPreview.budgetItems,
          materials: importPreview.materials,
          scheduleItems: importPreview.scheduleItems
        })
      });
      const data = (await response.json()) as { ok?: boolean; budgetItems?: BudgetItem[]; materials?: Material[]; scheduleItems?: ScheduleItem[]; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось сохранить импорт.");

      if (importMode === "replace_budget") setBudgetItems(data.budgetItems ?? []);
      else setBudgetItems((current) => [...current, ...(data.budgetItems ?? [])]);

      if (importMode === "replace_materials") setMaterials(data.materials ?? []);
      else setMaterials((current) => [...current, ...(data.materials ?? [])]);

      if (importMode === "replace_schedule") setScheduleItems(data.scheduleItems ?? []);
      else setScheduleItems((current) => [...current, ...(data.scheduleItems ?? [])]);

      setImportConfirmed(false);
      setError("");
      setAiAnswer(`Импорт сохранен: ВОР ${data.budgetItems?.length ?? 0}, материалы ${data.materials?.length ?? 0}, график ${data.scheduleItems?.length ?? 0}.`);
    } catch (commitError) {
      setError(commitError instanceof Error ? commitError.message : "Ошибка сохранения импорта.");
    } finally {
      setSaving("");
    }
  }

  return (
    <main className="page">
      <div className="header-row">
        <div>
          <div className="eyebrow">{initialBundle.project.customer}</div>
          <h1>{initialBundle.project.name}</h1>
          <p className="muted">
            {initialBundle.project.object}, {initialBundle.project.address}. РП: {initialBundle.project.manager}
          </p>
        </div>
        <span className="badge green">В работе</span>
      </div>

      <section className="grid grid-4">
        <Kpi title="Договор" value={money(initialBundle.project.contractAmount)} />
        <Kpi title="Прогнозная прибыль" value={money(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
        <Kpi title="Готовность" value={percent(works.completionPercent)} />
        <Kpi title="Кассовый разрыв" value={money(finance.cashGap)} tone={finance.cashGap < 0 ? "bad" : "good"} />
      </section>

      <div className="tabs">
        {tabs.map((tab) => (
          <button className={`tab ${activeTab === tab ? "active" : ""}`} key={tab} onClick={() => setActiveTab(tab)}>
            {tab}
          </button>
        ))}
      </div>
      {(saving || error) && (
        <div className={`panel ${error ? "delta-bad" : "muted"}`} style={{ marginBottom: 16 }}>
          {error || `Сохраняю: ${saving}`}
        </div>
      )}

      {activeTab === "Обзор" && (
        <section className="grid grid-2">
          <Panel title="План / факт проекта" icon={<TimerReset size={18} />}>
            <div className="grid grid-3">
              <Kpi title="Плановая себестоимость" value={money(budget.totalPlannedCost)} />
              <Kpi title="Фактическая себестоимость" value={money(budget.totalActualCost)} />
              <Kpi title="Прогнозная себестоимость" value={money(budget.totalForecastCost)} tone="warn" />
            </div>
          </Panel>
          <Panel title="Проблемные зоны" icon={<AlertTriangle size={18} />}>
            <div className="stack">
              {allRisks.slice(0, 4).map((risk) => (
                <div key={risk.id}>
                  <span className={`badge ${risk.priority === "critical" ? "red" : risk.priority === "high" ? "yellow" : "blue"}`}>{risk.priority}</span>{" "}
                  <strong>{risk.title}</strong>
                  <div className="muted">{risk.reason}</div>
                </div>
              ))}
            </div>
          </Panel>
          <Panel title="Материалы" icon={<Package size={18} />}>
            <div className="grid grid-3">
              <Kpi title="Дефицитные позиции" value={String(materialStats.deficitItems.length)} tone="bad" />
              <Kpi title="Закуплено" value={`${materialStats.orderedQty.toLocaleString("ru-RU")} ед.`} />
              <Kpi title="Перерасход" value={money(materialStats.materialOverrun)} tone={materialStats.materialOverrun > 0 ? "bad" : "good"} />
            </div>
          </Panel>
          <Panel title="Финансы" icon={<Landmark size={18} />}>
            <div className="grid grid-3">
              <Kpi title="Поступления" value={money(finance.incomingPayments)} tone="good" />
              <Kpi title="Платежи" value={money(finance.outgoingPayments)} />
              <Kpi title="Потребность" value={money(finance.financingNeed)} tone={finance.financingNeed ? "bad" : "good"} />
            </div>
          </Panel>
        </section>
      )}

      {activeTab === "Бюджет / ВОР" && (
        <Panel title="Бюджет, ВОР и классификация затрат" icon={<Table2 size={18} />}>
          <ImportPanel
            file={importFile}
            mode={importMode}
            preview={importPreview}
            confirmed={importConfirmed}
            loading={saving === "import-preview" || saving === "import-commit"}
            onFileChange={(file) => {
              setImportFile(file);
              setImportPreview(null);
              setImportConfirmed(false);
            }}
            onModeChange={setImportMode}
            onPreview={() => void previewImport()}
            onConfirmChange={setImportConfirmed}
            onCommit={() => void commitImport()}
          />
          <BudgetForm
            onAdd={async (item) => {
              const saved = await createResource<BudgetItem>("budget", {
                source: "Ручной ввод",
                actualUnitPrice: item.plannedUnitPrice,
                forecastUnitPrice: item.plannedUnitPrice,
                ...item
              });
              setBudgetItems((current) => [...current, saved]);
            }}
          />
          <BudgetTable items={budgetItems} />
        </Panel>
      )}

      {activeTab === "График" && (
        <Panel title="Календарный график работ" icon={<TimerReset size={18} />}>
          <ScheduleForm
            onAdd={async (item) => {
              const saved = await createResource<ScheduleItem>("schedule", { actualQty: 0, status: "not_started", ...item });
              setScheduleItems((current) => [...current, saved]);
            }}
          />
          <ScheduleTable items={scheduleItems} />
        </Panel>
      )}

      {activeTab === "Материалы" && (
        <Panel title="Материалы и снабжение" icon={<Package size={18} />}>
          <MaterialTable items={materials} />
          <button
            className="button primary"
            style={{ marginTop: 14 }}
            onClick={async () => {
              const saved = await createResource<Material>("materials", {
                name: "Кабель",
                unit: "м",
                requiredQty: 500,
                orderedQty: 0,
                deliveredQty: 0,
                consumedQty: 0,
                plannedUnitPrice: 240,
                actualUnitPrice: 0,
                supplier: "Не выбран",
                neededAt: new Date().toISOString().slice(0, 10),
                status: "required"
              });
              setMaterials((current) => [...current, saved]);
            }}
          >
            <Plus size={18} />
            Добавить материал
          </button>
        </Panel>
      )}

      {activeTab === "Заявки" && (
        <Panel title="Заявки снабжению" icon={<Truck size={18} />}>
          <RequestTable items={initialBundle.procurementRequests} />
        </Panel>
      )}

      {activeTab === "Финансы" && (
        <Panel title="Платежи и кассовый план" icon={<Landmark size={18} />}>
          <PaymentForm
            onAdd={async (payment) => {
              const saved = await createResource<Payment>("finance", { status: "planned", ...payment });
              setPayments((current) => [...current, saved]);
            }}
          />
          <PaymentTable items={payments} />
        </Panel>
      )}

      {activeTab === "Рапорты" && (
        <Panel title="Ежедневные рапорты стройплощадки" icon={<ClipboardList size={18} />}>
          <button
            className="button primary"
            onClick={async () => {
              const saved = await createResource<DailyReport>("daily-reports", {
                date: new Date().toISOString().slice(0, 10),
                author: "Прораб",
                weather: "Без осадков",
                workers: 18,
                engineers: 2,
                equipment: "Кран, самосвалы",
                completedWorks: "Заполните выполненные объемы",
                materialsReceived: "",
                materialsConsumed: "",
                downtime: "",
                issues: "",
                status: "draft"
              });
              setReports((current) => [saved, ...current]);
            }}
          >
            <Plus size={18} />
            Создать рапорт
          </button>
          <ReportTable items={reports} />
        </Panel>
      )}

      {activeTab === "Риски" && (
        <Panel title="Риски и отклонения" icon={<AlertTriangle size={18} />}>
          <button
            className="button primary"
            onClick={async () => {
              const saved = await createResource<Risk>("risks", {
                title: "Новый риск",
                reason: "Опишите причину и требуемое решение.",
                priority: "medium",
                owner: "РП",
                dueAt: new Date().toISOString().slice(0, 10),
                status: "open"
              });
              setRisks((current) => [...current, saved]);
            }}
          >
            <Plus size={18} />
            Добавить риск
          </button>
          <RiskTable items={allRisks} />
        </Panel>
      )}

      {activeTab === "Документы" && (
        <Panel title="Документы проекта" icon={<FileText size={18} />}>
          <div className="grid grid-3">
            {["Договор", "ВОР", "Проектная документация", "КС", "КП поставщика", "Фото"].map((category) => (
              <div className="panel" key={category}>
                <h3>{category}</h3>
                <p className="muted">Метаданные готовы в Prisma-схеме. Файлы хранятся в uploads/S3-compatible storage.</p>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {activeTab === "AI-помощник" && (
        <Panel title="AI-помощник руководителя проекта" icon={<Bot size={18} />}>
          <div className="toolbar">
            <button className="button secondary" onClick={() => askAi("Сформируй отчет руководству.")}>
              Сформировать отчет
            </button>
            <button className="button secondary" onClick={() => askAi("Найди риски проекта.")}>
              Найти риски
            </button>
            <button className="button secondary" onClick={() => askAi("Проверь бюджет и перерасходы.")}>
              Проверить бюджет
            </button>
            <button className="button secondary" onClick={() => askAi("Что нужно заказать срочно?")}>
              Что заказать?
            </button>
            <button className="button secondary" onClick={() => askAi("Объясни отклонения по срокам и деньгам.")}>
              Объяснить отклонения
            </button>
          </div>
          <label>
            Вопрос по проекту
            <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
          </label>
          <button className="button primary" disabled={aiLoading} onClick={() => askAi()}>
            <Send size={18} />
            {aiLoading ? "Анализ..." : "Спросить AI"}
          </button>
          <div className="ai-answer">{aiAnswer || "Ответ появится здесь. AI использует контекст бюджета, графика, материалов, финансов и рисков проекта."}</div>
        </Panel>
      )}
    </main>
  );
}

function ImportPanel({
  file,
  mode,
  preview,
  confirmed,
  loading,
  onFileChange,
  onModeChange,
  onPreview,
  onConfirmChange,
  onCommit
}: {
  file: File | null;
  mode: "append" | "replace_budget" | "replace_materials" | "replace_schedule";
  preview: ImportPreview | null;
  confirmed: boolean;
  loading: boolean;
  onFileChange: (file: File | null) => void;
  onModeChange: (mode: "append" | "replace_budget" | "replace_materials" | "replace_schedule") => void;
  onPreview: () => void;
  onConfirmChange: (confirmed: boolean) => void;
  onCommit: () => void;
}) {
  const canCommit = Boolean(preview && preview.summary.errors === 0 && confirmed && !loading);

  return (
    <div className="panel stack" style={{ background: "#f8fafc" }}>
      <div className="toolbar" style={{ marginBottom: 0 }}>
        <div>
          <h3>Импорт Excel ВОР / сметы</h3>
          <p className="muted">Файл сначала проверяется и показывается в preview. Запись в БД происходит только после подтверждения.</p>
        </div>
      </div>
      <div className="form-grid">
        <label>
          Excel-файл
          <input accept=".xlsx,.xls" type="file" onChange={(event) => onFileChange(event.target.files?.[0] ?? null)} />
        </label>
        <label>
          Режим сохранения
          <select value={mode} onChange={(event) => onModeChange(event.target.value as typeof mode)}>
            <option value="append">Добавить к текущим данным</option>
            <option value="replace_budget">Заменить только бюджет</option>
            <option value="replace_materials">Заменить только материалы</option>
            <option value="replace_schedule">Заменить только график</option>
          </select>
        </label>
        <label>
          &nbsp;
          <button className="button secondary" disabled={!file || loading} onClick={onPreview} type="button">
            Проверить файл
          </button>
        </label>
        <label>
          &nbsp;
          <button className="button primary" disabled={!canCommit} onClick={onCommit} type="button">
            Сохранить импорт
          </button>
        </label>
      </div>

      {file && <p className="muted">Выбран файл: {file.name}</p>}

      {preview && (
        <div className="stack">
          <div className="grid grid-4">
            <Kpi title="Разделы" value={String(preview.summary.sections)} />
            <Kpi title="ВОР" value={String(preview.summary.budgetItems)} />
            <Kpi title="Материалы" value={String(preview.summary.materials)} />
            <Kpi title="Неизвестные" value={String(preview.summary.unknownRows)} tone={preview.summary.unknownRows ? "warn" : undefined} />
          </div>
          <div className="grid grid-3">
            <Kpi title="График" value={String(preview.summary.scheduleItems)} />
            <Kpi title="Ошибки" value={String(preview.summary.errors)} tone={preview.summary.errors ? "bad" : "good"} />
            <Kpi title="Предупреждения" value={String(preview.summary.warnings)} tone={preview.summary.warnings ? "warn" : undefined} />
          </div>

          {(preview.errors.length > 0 || preview.warnings.length > 0) && (
            <div className="grid grid-2">
              <MessageList title="Ошибки" items={preview.errors} tone="bad" />
              <MessageList title="Предупреждения" items={preview.warnings} tone="warn" />
            </div>
          )}

          <PreviewTable
            title="Распознанные позиции"
            headers={["Лист", "Строка", "Раздел", "Наименование", "Тип", "Кол-во", "Цена"]}
            rows={preview.budgetItems.slice(0, 12).map((item) => [
              item.sheetName,
              item.rowNumber,
              item.section,
              item.name,
              item.kind,
              `${item.qty} ${item.unit}`,
              money(item.plannedUnitPrice)
            ])}
          />
          <PreviewTable
            title="Неизвестные строки"
            headers={["Лист", "Строка", "Причина", "Значения"]}
            rows={preview.unknownRows.slice(0, 8).map((item) => [item.sheetName, item.rowNumber, item.reason, item.values.join(" | ")])}
          />
          <label style={{ alignItems: "center", display: "flex", gridTemplateColumns: "auto 1fr", gap: 8 }}>
            <input checked={confirmed} onChange={(event) => onConfirmChange(event.target.checked)} style={{ width: "auto" }} type="checkbox" />
            Я проверил импортируемые данные
          </label>
        </div>
      )}
    </div>
  );
}

function MessageList({ title, items, tone }: { title: string; items: string[]; tone: "bad" | "warn" }) {
  if (!items.length) return <div className="panel muted">{title}: нет</div>;
  return (
    <div className="panel">
      <h3 className={tone === "bad" ? "delta-bad" : "delta-warn"}>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

function PreviewTable({ title, headers, rows }: { title: string; headers: string[]; rows: Array<Array<React.ReactNode>> }) {
  return (
    <div className="stack">
      <h3>{title}</h3>
      {rows.length ? <DataTable headers={headers} rows={rows} /> : <p className="muted">Нет строк для отображения.</p>}
    </div>
  );
}

function Panel({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className="panel stack">
      <div style={{ alignItems: "center", display: "flex", gap: 8 }}>
        {icon}
        <h2>{title}</h2>
      </div>
      {children}
    </section>
  );
}

function Kpi({ title, value, tone }: { title: string; value: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="kpi">
      <div className="kpi-label">{title}</div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : tone === "bad" ? "delta-bad" : ""}`}>{value}</div>
    </div>
  );
}

function BudgetForm({ onAdd }: { onAdd: (item: Omit<BudgetItem, "id" | "projectId" | "source" | "actualUnitPrice" | "forecastUnitPrice">) => Promise<void> }) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          section: String(data.get("section") || "Новый раздел"),
          code: String(data.get("code") || "new"),
          name: String(data.get("name") || "Новая позиция"),
          unit: String(data.get("unit") || "ед."),
          qty: Number(data.get("qty") || 1),
          plannedUnitPrice: Number(data.get("price") || 0),
          kind: String(data.get("kind") || "work") as BudgetItem["kind"]
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Раздел
        <input name="section" placeholder="Отделочные работы" />
      </label>
      <label>
        Наименование
        <input name="name" placeholder="Штукатурка стен" />
      </label>
      <label>
        Тип
        <select name="kind" defaultValue="work">
          <option value="work">Работа</option>
          <option value="material">Материал</option>
          <option value="equipment">Техника</option>
          <option value="payroll">ФОТ</option>
          <option value="subcontract">Субподряд</option>
          <option value="overhead">Накладные</option>
        </select>
      </label>
      <label>
        Код
        <input name="code" placeholder="5.1" />
      </label>
      <label>
        Ед.
        <input name="unit" placeholder="м2" />
      </label>
      <label>
        Кол-во
        <input name="qty" type="number" step="0.01" placeholder="100" />
      </label>
      <label>
        Цена
        <input name="price" type="number" step="0.01" placeholder="1200" />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function ScheduleForm({ onAdd }: { onAdd: (item: Omit<ScheduleItem, "id" | "projectId" | "actualQty" | "status">) => Promise<void> }) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          name: String(data.get("name") || "Новая работа"),
          owner: String(data.get("owner") || "РП"),
          startsAt: String(data.get("startsAt") || new Date().toISOString().slice(0, 10)),
          endsAt: String(data.get("endsAt") || new Date().toISOString().slice(0, 10)),
          plannedQty: Number(data.get("plannedQty") || 1)
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Работа
        <input name="name" placeholder="Монтаж перегородок" />
      </label>
      <label>
        Ответственный
        <input name="owner" placeholder="ПТО" />
      </label>
      <label>
        Начало
        <input name="startsAt" type="date" />
      </label>
      <label>
        Окончание
        <input name="endsAt" type="date" />
      </label>
      <label>
        Плановый объем
        <input name="plannedQty" type="number" step="0.01" />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function PaymentForm({ onAdd }: { onAdd: (payment: Omit<Payment, "id" | "projectId" | "status">) => Promise<void> }) {
  return (
    <form
      className="form-grid"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onAdd({
          title: String(data.get("title") || "Новый платеж"),
          counterparty: String(data.get("counterparty") || "Контрагент"),
          direction: String(data.get("direction") || "outgoing") as Payment["direction"],
          plannedAt: String(data.get("plannedAt") || new Date().toISOString().slice(0, 10)),
          amount: Number(data.get("amount") || 0),
          category: String(data.get("category") || "supplier") as Payment["category"]
        }).catch(() => undefined);
        event.currentTarget.reset();
      }}
    >
      <label>
        Платеж
        <input name="title" placeholder="Оплата поставщику" />
      </label>
      <label>
        Контрагент
        <input name="counterparty" placeholder="Поставщик" />
      </label>
      <label>
        Тип
        <select name="direction" defaultValue="outgoing">
          <option value="incoming">Поступление</option>
          <option value="outgoing">Платеж</option>
        </select>
      </label>
      <label>
        Дата
        <input name="plannedAt" type="date" />
      </label>
      <label>
        Сумма
        <input name="amount" type="number" />
      </label>
      <label>
        Категория
        <select name="category" defaultValue="supplier">
          <option value="customer">Заказчик</option>
          <option value="supplier">Поставщик</option>
          <option value="subcontractor">Субподряд</option>
          <option value="payroll">ФОТ</option>
          <option value="tax">Налоги</option>
          <option value="overhead">Накладные</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">
          <Plus size={18} />
          Добавить
        </button>
      </label>
    </form>
  );
}

function BudgetTable({ items }: { items: BudgetItem[] }) {
  return (
    <DataTable
      headers={["Раздел", "Код", "Наименование", "Тип", "Кол-во", "Цена план", "Цена факт", "Сумма план", "Маржа"]}
      rows={items.map((item) => [
        item.section,
        item.code,
        item.name,
        <span className="badge blue" key="kind">{item.kind}</span>,
        `${item.qty.toLocaleString("ru-RU")} ${item.unit}`,
        money(item.plannedUnitPrice),
        money(item.actualUnitPrice),
        money(item.qty * item.plannedUnitPrice),
        money(item.qty * (item.forecastUnitPrice - item.actualUnitPrice))
      ])}
    />
  );
}

function ScheduleTable({ items }: { items: ScheduleItem[] }) {
  return (
    <DataTable
      headers={["Работа", "Ответственный", "Начало", "Окончание", "План", "Факт", "Выполнение", "Статус"]}
      rows={items.map((item) => [
        item.name,
        item.owner,
        item.startsAt,
        item.endsAt,
        item.plannedQty,
        item.actualQty,
        percent(item.plannedQty ? (item.actualQty / item.plannedQty) * 100 : 0),
        <span className={`badge ${item.status === "delayed" ? "red" : item.status === "done" ? "green" : "blue"}`} key="status">{item.status}</span>
      ])}
    />
  );
}

function MaterialTable({ items }: { items: Material[] }) {
  return (
    <DataTable
      headers={["Материал", "Потребность", "Заказано", "Доставлено", "Списано", "Цена план/факт", "Поставщик", "Статус"]}
      rows={items.map((item) => [
        item.name,
        `${item.requiredQty} ${item.unit}`,
        `${item.orderedQty} ${item.unit}`,
        `${item.deliveredQty} ${item.unit}`,
        `${item.consumedQty} ${item.unit}`,
        `${money(item.plannedUnitPrice)} / ${money(item.actualUnitPrice)}`,
        item.supplier,
        <span className={`badge ${item.status === "required" ? "red" : item.status === "delivered" ? "green" : "yellow"}`} key="status">{item.status}</span>
      ])}
    />
  );
}

function RequestTable({ items }: { items: ProcurementRequest[] }) {
  return (
    <DataTable
      headers={["Заявка", "Инициатор", "Требуется", "Приоритет", "Статус", "Позиции"]}
      rows={items.map((item) => [
        item.title,
        item.initiator,
        item.neededAt,
        <span className={`badge ${item.priority === "critical" ? "red" : "yellow"}`} key="priority">{item.priority}</span>,
        <span className="badge blue" key="status">{item.status}</span>,
        item.items.map((requestItem) => `${requestItem.name}: ${requestItem.qty} ${requestItem.unit}`).join("; ")
      ])}
    />
  );
}

function PaymentTable({ items }: { items: Payment[] }) {
  return (
    <DataTable
      headers={["Платеж", "Контрагент", "Тип", "Дата", "Сумма", "Категория", "Статус"]}
      rows={items.map((item) => [
        item.title,
        item.counterparty,
        item.direction === "incoming" ? "Поступление" : "Платеж",
        item.plannedAt,
        money(item.amount),
        item.category,
        <span className={`badge ${item.status === "paid" ? "green" : item.status === "overdue" ? "red" : "blue"}`} key="status">{item.status}</span>
      ])}
    />
  );
}

function ReportTable({ items }: { items: DailyReport[] }) {
  return (
    <DataTable
      headers={["Дата", "Автор", "Погода", "Люди", "Техника", "Выполнено", "Проблемы", "Статус"]}
      rows={items.map((item) => [
        item.date,
        item.author,
        item.weather,
        `${item.workers} раб. / ${item.engineers} ИТР`,
        item.equipment,
        item.completedWorks,
        item.issues,
        <span className="badge blue" key="status">{item.status}</span>
      ])}
    />
  );
}

function RiskTable({ items }: { items: Risk[] }) {
  return (
    <DataTable
      headers={["Риск", "Причина", "Приоритет", "Ответственный", "Срок", "Статус"]}
      rows={items.map((item) => [
        item.title,
        item.reason,
        <span className={`badge ${item.priority === "critical" ? "red" : item.priority === "high" ? "yellow" : "blue"}`} key="priority">{item.priority}</span>,
        item.owner,
        item.dueAt,
        <span className={`badge ${item.status === "closed" ? "green" : "gray"}`} key="status">{item.status}</span>
      ])}
    />
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {headers.map((header) => (
              <th key={header}>{header}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => (
            <tr key={index}>
              {row.map((cell, cellIndex) => (
                <td key={cellIndex}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
