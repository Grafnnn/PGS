"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Bot, ClipboardList, FileText, Landmark, Package, Pencil, Plus, Send, Table2, TimerReset, Trash2, Truck, Users } from "lucide-react";
import { budgetTotals, deriveAutoRisks, financeTotals, materialTotals, money, percent, workTotals } from "@/lib/calculations";
import type { ImportPreview } from "@/lib/excel/import-types";
import type { AiIntelligenceSummary, ProjectIntelligenceSnapshot } from "@/lib/project-intelligence";
import type { AuditEvent, BudgetItem, DailyReport, Material, Payment, ProcurementRequest, ProjectDocument, ProjectDocumentVersion, ProjectMember, Risk, ScheduleItem } from "@/lib/types";

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
  "Аналитика",
  "Бюджет / ВОР",
  "График",
  "Материалы",
  "Заявки",
  "Финансы",
  "Рапорты",
  "Риски",
  "Документы",
  "Участники",
  "История",
  "AI-помощник"
];

const aiQuickActions = [
  "Проверить риски проекта",
  "Сравнить бюджет и факт",
  "Найти просрочки",
  "Сформировать заявку снабжения",
  "Подготовить пояснительную записку"
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
  const [intelligence, setIntelligence] = useState<ProjectIntelligenceSnapshot | null>(null);
  const [intelligenceLoading, setIntelligenceLoading] = useState(false);
  const [intelligenceAi, setIntelligenceAi] = useState<AiIntelligenceSummary | null>(null);
  const [intelligenceAiLoading, setIntelligenceAiLoading] = useState(false);
  const [saving, setSaving] = useState("");
  const [error, setError] = useState("");
  const [importFile, setImportFile] = useState<File | null>(null);
  const [importPreview, setImportPreview] = useState<ImportPreview | null>(null);
  const [importConfirmed, setImportConfirmed] = useState(false);
  const [importMode, setImportMode] = useState<"append" | "replace_budget" | "replace_materials" | "replace_schedule">("append");
  const [editingBudget, setEditingBudget] = useState<BudgetItem | null>(null);
  const [editingMaterial, setEditingMaterial] = useState<Material | null>(null);
  const [editingSchedule, setEditingSchedule] = useState<ScheduleItem | null>(null);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [documents, setDocuments] = useState<ProjectDocument[]>([]);
  const [documentVersions, setDocumentVersions] = useState<Record<string, ProjectDocumentVersion[]>>({});
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentCategory, setDocumentCategory] = useState("прочее");
  const [members, setMembers] = useState<ProjectMember[]>([]);
  const [memberEmail, setMemberEmail] = useState("");
  const [memberRole, setMemberRole] = useState<ProjectMember["role"]>("VIEWER");

  const budget = useMemo(() => budgetTotals(initialBundle.project.contractAmount, budgetItems), [budgetItems, initialBundle.project.contractAmount]);
  const works = useMemo(() => workTotals(scheduleItems), [scheduleItems]);
  const materialStats = useMemo(() => materialTotals(materials), [materials]);
  const finance = useMemo(() => financeTotals(payments), [payments]);
  const allRisks = useMemo(() => [...risks, ...deriveAutoRisks(scheduleItems, materials, payments)], [risks, scheduleItems, materials, payments]);
  const activeRisks = allRisks.filter((risk) => risk.status !== "closed");
  const delayedWorks = scheduleItems.filter((item) => item.status === "delayed");
  const activeRequests = initialBundle.procurementRequests.filter((request) => request.status !== "closed");
  const budgetDeviation = budget.totalForecastCost - budget.totalPlannedCost;
  const aiAnswerTone = aiLoading ? "loading" : aiAnswer ? (/OPENAI_API_KEY|not configured|failed|ошибка|error|Project not found/i.test(aiAnswer) ? "error" : "ready") : "empty";

  const loadAudit = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/audit`);
      const data = (await response.json()) as { items?: AuditEvent[] };
      if (response.ok) setAuditEvents(data.items ?? []);
    } catch {
      setAuditEvents([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (activeTab !== "История") return;
    void loadAudit();
  }, [activeTab, loadAudit]);

  const loadDocuments = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents`);
      const data = (await response.json()) as { items?: ProjectDocument[] };
      if (response.ok) setDocuments(data.items ?? []);
    } catch {
      setDocuments([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (activeTab !== "Документы") return;
    void loadDocuments();
  }, [activeTab, loadDocuments]);

  const loadMembers = useCallback(async () => {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members`);
      const data = (await response.json()) as { items?: ProjectMember[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить участников.");
      setMembers(data.items ?? []);
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка загрузки участников.");
      setMembers([]);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (activeTab !== "Участники") return;
    void loadMembers();
  }, [activeTab, loadMembers]);

  const loadIntelligence = useCallback(async () => {
    setIntelligenceLoading(true);
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/intelligence`);
      const data = (await response.json()) as { snapshot?: ProjectIntelligenceSnapshot; error?: string };
      if (!response.ok || !data.snapshot) throw new Error(data.error ?? "Не удалось загрузить аналитику.");
      setIntelligence(data.snapshot);
    } catch (intelligenceError) {
      setError(intelligenceError instanceof Error ? intelligenceError.message : "Ошибка загрузки аналитики.");
    } finally {
      setIntelligenceLoading(false);
    }
  }, [initialBundle.project.id]);

  useEffect(() => {
    if (activeTab !== "Аналитика" || intelligence) return;
    void loadIntelligence();
  }, [activeTab, intelligence, loadIntelligence]);

  async function generateIntelligenceAiSummary() {
    setIntelligenceAiLoading(true);
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/intelligence/ai-summary`, { method: "POST" });
      const data = (await response.json()) as { summary?: AiIntelligenceSummary; error?: string };
      if (!response.ok || !data.summary) throw new Error(data.error ?? "Не удалось сформировать AI-сводку.");
      setIntelligenceAi(data.summary);
    } catch (summaryError) {
      setError(summaryError instanceof Error ? summaryError.message : "Ошибка AI-сводки.");
    } finally {
      setIntelligenceAiLoading(false);
    }
  }

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

  async function updateResource<T>(resource: string, id: string, payload: unknown) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/${resource}/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = (await response.json()) as { item?: T; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось обновить запись.");
      return data.item;
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Ошибка обновления.");
      throw updateError;
    } finally {
      setSaving("");
    }
  }

  async function deleteResource(resource: string, id: string) {
    setSaving(resource);
    setError("");
    try {
      const response = await fetch(`/api/${resource}/${id}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить запись.");
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления.");
      throw deleteError;
    } finally {
      setSaving("");
    }
  }

  async function uploadDocument() {
    if (!documentFile) {
      setError("Выберите файл документа.");
      return;
    }
    setSaving("document-upload");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", documentFile);
      formData.append("category", documentCategory);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/upload`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as { item?: ProjectDocument; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось загрузить документ.");
      setDocuments((current) => [data.item as ProjectDocument, ...current]);
      setDocumentFile(null);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Ошибка загрузки документа.");
    } finally {
      setSaving("");
    }
  }

  async function deleteDocument(document: ProjectDocument) {
    setSaving("document-delete");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить документ.");
      setDocuments((current) => current.filter((item) => item.id !== document.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Ошибка удаления документа.");
    } finally {
      setSaving("");
    }
  }

  async function loadDocumentVersions(document: ProjectDocument) {
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}/versions`);
      const data = (await response.json()) as { items?: ProjectDocumentVersion[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось загрузить версии.");
      setDocumentVersions((current) => ({ ...current, [document.id]: data.items ?? [] }));
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Ошибка загрузки версий.");
    }
  }

  async function uploadDocumentVersion(document: ProjectDocument, file: File) {
    setSaving("document-version");
    setError("");
    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`/api/projects/${initialBundle.project.id}/documents/${document.id}/versions`, {
        method: "POST",
        body: formData
      });
      const data = (await response.json()) as { item?: ProjectDocumentVersion; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось загрузить версию.");
      setDocuments((current) =>
        current.map((item) =>
          item.id === document.id
            ? { ...item, version: data.item!.versionNumber, fileName: data.item!.fileName, mimeType: data.item!.mimeType, sizeBytes: data.item!.sizeBytes, uploadedAt: data.item!.createdAt }
            : item
        )
      );
      await loadDocumentVersions(document);
    } catch (versionError) {
      setError(versionError instanceof Error ? versionError.message : "Ошибка загрузки версии.");
    } finally {
      setSaving("");
    }
  }

  async function addProjectMember() {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: memberEmail, role: memberRole })
      });
      const data = (await response.json()) as { item?: ProjectMember; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось добавить участника.");
      setMembers((current) => {
        const withoutDuplicate = current.filter((member) => member.id !== data.item!.id);
        return [...withoutDuplicate, data.item as ProjectMember];
      });
      setMemberEmail("");
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка добавления участника.");
    } finally {
      setSaving("");
    }
  }

  async function updateProjectMember(memberId: string, role: ProjectMember["role"]) {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members/${memberId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role })
      });
      const data = (await response.json()) as { item?: ProjectMember; error?: string };
      if (!response.ok || !data.item) throw new Error(data.error ?? "Не удалось изменить роль.");
      setMembers((current) => current.map((member) => (member.id === memberId ? (data.item as ProjectMember) : member)));
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка изменения роли.");
    } finally {
      setSaving("");
    }
  }

  async function removeProjectMember(memberId: string) {
    setSaving("members");
    setError("");
    try {
      const response = await fetch(`/api/projects/${initialBundle.project.id}/members/${memberId}`, { method: "DELETE" });
      const data = (await response.json()) as { ok?: boolean; error?: string };
      if (!response.ok || !data.ok) throw new Error(data.error ?? "Не удалось удалить участника.");
      setMembers((current) => current.filter((member) => member.id !== memberId));
    } catch (memberError) {
      setError(memberError instanceof Error ? memberError.message : "Ошибка удаления участника.");
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
      <div className="page-header">
        <div className="page-header-main">
          <div className="eyebrow">{initialBundle.project.customer}</div>
          <h1>{initialBundle.project.name}</h1>
          <p className="muted">
            {initialBundle.project.object}, {initialBundle.project.address}. РП: {initialBundle.project.manager}
          </p>
          <div className="page-header-meta">
            <StatusBadge tone="good">В работе</StatusBadge>
            <StatusBadge tone={budgetDeviation > 0 ? "bad" : "good"}>Отклонение: {money(budgetDeviation)}</StatusBadge>
            <StatusBadge tone={delayedWorks.length ? "bad" : "neutral"}>Просрочки: {delayedWorks.length}</StatusBadge>
            <StatusBadge tone={activeRisks.length ? "warn" : "good"}>Риски: {activeRisks.length}</StatusBadge>
          </div>
        </div>
        <div className="page-header-actions">
          <button className="button secondary" type="button" onClick={() => setActiveTab("Бюджет / ВОР")}>
            <Table2 size={18} />
            Импорт ВОР
          </button>
          <button className="button secondary" type="button" onClick={() => setActiveTab("Рапорты")}>
            <ClipboardList size={18} />
            Добавить рапорт
          </button>
          <button className="button primary" type="button" onClick={() => setActiveTab("AI-помощник")}>
            <Bot size={18} />
            AI-анализ
          </button>
        </div>
      </div>

      <section className="grid grid-4">
        <Kpi title="Договор" value={money(initialBundle.project.contractAmount)} />
        <Kpi title="Прогнозная прибыль" value={money(budget.forecastProfit)} tone={budget.forecastProfit > 0 ? "good" : "bad"} />
        <Kpi title="Готовность" value={percent(works.completionPercent)} />
        <Kpi title="Кассовый разрыв" value={money(finance.cashGap)} tone={finance.cashGap < 0 ? "bad" : "good"} />
        <Kpi title="Факт / прогноз" value={money(budget.totalForecastCost)} tone={budgetDeviation > 0 ? "bad" : "good"} />
        <Kpi title="Остаток бюджета" value={money(Math.max(initialBundle.project.contractAmount - budget.totalForecastCost, 0))} />
        <Kpi title="Срок проекта" value={`${initialBundle.project.startsAt} - ${initialBundle.project.endsAt}`} />
        <Kpi title="Заявки" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} />
      </section>

      <div className="workspace-layout" style={{ marginTop: 18 }}>
        <div>
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
                    <div key={risk.id} className="attention-item">
                      <StatusBadge tone={risk.priority === "critical" ? "bad" : risk.priority === "high" ? "warn" : "info"}>{risk.priority}</StatusBadge>
                      <strong>{risk.title}</strong>
                      <div className="muted">{risk.reason}</div>
                    </div>
                  ))}
                  {!allRisks.length && <EmptyState text="Открытых рисков и авто-отклонений пока нет." />}
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

          {activeTab === "Аналитика" && (
            <IntelligenceTab
              snapshot={intelligence}
              aiSummary={intelligenceAi}
              loading={intelligenceLoading}
              aiLoading={intelligenceAiLoading}
              onRefresh={() => void loadIntelligence()}
              onGenerateAi={() => void generateIntelligenceAiSummary()}
            />
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
          {editingBudget && (
            <BudgetEditForm
              item={editingBudget}
              onCancel={() => setEditingBudget(null)}
              onSave={async (payload) => {
                const saved = await updateResource<BudgetItem>("budget", editingBudget.id, payload);
                setBudgetItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingBudget(null);
              }}
            />
          )}
          <BudgetTable
            items={budgetItems}
            onEdit={setEditingBudget}
            onDelete={async (item) => {
              await deleteResource("budget", item.id);
              setBudgetItems((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
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
          {editingSchedule && (
            <ScheduleEditForm
              item={editingSchedule}
              onCancel={() => setEditingSchedule(null)}
              onSave={async (payload) => {
                const saved = await updateResource<ScheduleItem>("schedule", editingSchedule.id, payload);
                setScheduleItems((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingSchedule(null);
              }}
            />
          )}
          <ScheduleTable
            items={scheduleItems}
            onEdit={setEditingSchedule}
            onDelete={async (item) => {
              await deleteResource("schedule", item.id);
              setScheduleItems((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
        </Panel>
      )}

      {activeTab === "Материалы" && (
        <Panel title="Материалы и снабжение" icon={<Package size={18} />}>
          {editingMaterial && (
            <MaterialEditForm
              item={editingMaterial}
              onCancel={() => setEditingMaterial(null)}
              onSave={async (payload) => {
                const saved = await updateResource<Material>("materials", editingMaterial.id, payload);
                setMaterials((current) => current.map((item) => (item.id === saved.id ? saved : item)));
                setEditingMaterial(null);
              }}
            />
          )}
          <MaterialTable
            items={materials}
            onEdit={setEditingMaterial}
            onDelete={async (item) => {
              await deleteResource("materials", item.id);
              setMaterials((current) => current.filter((candidate) => candidate.id !== item.id));
            }}
          />
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
          <div className="form-grid">
            <label>
              Категория
              <select value={documentCategory} onChange={(event) => setDocumentCategory(event.target.value)}>
                <option value="договор">Договор</option>
                <option value="смета">Смета</option>
                <option value="вор">ВОР</option>
                <option value="исполнительная">Исполнительная</option>
                <option value="кс">КС</option>
                <option value="фото">Фото</option>
                <option value="прочее">Прочее</option>
              </select>
            </label>
            <label>
              Файл
              <input accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip" type="file" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} />
            </label>
            <label>
              &nbsp;
              <button className="button primary" type="button" disabled={!documentFile || saving === "document-upload"} onClick={() => void uploadDocument()}>
                Загрузить
              </button>
            </label>
          </div>
          <DocumentTable
            items={documents}
            projectId={initialBundle.project.id}
            versions={documentVersions}
            onLoadVersions={(document) => {
              void loadDocumentVersions(document);
            }}
            onUploadVersion={(document, file) => {
              void uploadDocumentVersion(document, file);
            }}
            onDelete={(document) => {
              void deleteDocument(document);
            }}
          />
        </Panel>
      )}

      {activeTab === "Участники" && (
        <Panel title="Участники проекта" icon={<Users size={18} />}>
          <div className="form-grid">
            <label>
              Email пользователя
              <input value={memberEmail} placeholder="manager@company.ru" onChange={(event) => setMemberEmail(event.target.value)} />
            </label>
            <label>
              Проектная роль
              <select value={memberRole} onChange={(event) => setMemberRole(event.target.value as ProjectMember["role"])}>
                <option value="OWNER">OWNER</option>
                <option value="ADMIN">ADMIN</option>
                <option value="MANAGER">MANAGER</option>
                <option value="VIEWER">VIEWER</option>
              </select>
            </label>
            <label>
              &nbsp;
              <button className="button primary" type="button" disabled={!memberEmail || saving === "members"} onClick={() => void addProjectMember()}>
                <Plus size={18} />
                Добавить
              </button>
            </label>
          </div>
          <ProjectMembersTable
            items={members}
            onRoleChange={(member, role) => {
              void updateProjectMember(member.id, role);
            }}
            onRemove={(member) => {
              void removeProjectMember(member.id);
            }}
          />
        </Panel>
      )}

      {activeTab === "История" && (
        <Panel title="Журнал изменений" icon={<ClipboardList size={18} />}>
          <div className="toolbar">
            <a className="button secondary" href={`/api/projects/${initialBundle.project.id}/export/json`}>
              Экспорт проекта JSON
            </a>
            <a className="button secondary" href={`/api/projects/${initialBundle.project.id}/audit/export/json`}>
              Экспорт истории JSON
            </a>
          </div>
          <AuditTable items={auditEvents} />
        </Panel>
      )}

      {activeTab === "AI-помощник" && (
        <Panel title="AI-помощник руководителя проекта" icon={<Bot size={18} />} className="ai-panel">
          <div className="toolbar ai-actions">
            {aiQuickActions.map((action) => (
              <button className="button secondary" key={action} type="button" onClick={() => void askAi(action)}>
                {action}
              </button>
            ))}
          </div>
          <div className="ai-source-row">
            <StatusBadge tone="info">Источник: ВОР</StatusBadge>
            <StatusBadge tone="info">График</StatusBadge>
            <StatusBadge tone="info">Материалы</StatusBadge>
            <StatusBadge tone="info">Финансы</StatusBadge>
            <StatusBadge tone="info">Рапорты и риски</StatusBadge>
          </div>
          <div className="ai-composer">
            <label>
              Вопрос по проекту
              <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} />
            </label>
            <button className="button primary" disabled={aiLoading} type="button" onClick={() => void askAi()}>
              <Send size={18} />
              {aiLoading ? "Анализ..." : "Спросить AI"}
            </button>
          </div>
          <div className={`ai-answer ${aiAnswerTone}`}>
            {aiLoading
              ? "AI анализирует контекст проекта..."
              : aiAnswer || "Ответ появится здесь. AI использует контекст бюджета, графика, материалов, финансов и рисков проекта."}
          </div>
        </Panel>
      )}
        </div>

        <aside className="panel stack context-panel">
          <div>
            <div className="eyebrow">Контекст проекта</div>
            <h2>Что проверить</h2>
            <p className="muted">Короткая панель для РП и ПТО: риски, сроки, снабжение и финансовые отклонения.</p>
          </div>
          <div className="attention-list">
            <ContextItem title="Бюджет / факт" value={money(budgetDeviation)} tone={budgetDeviation > 0 ? "bad" : "good"} />
            <ContextItem title="Просроченные работы" value={String(delayedWorks.length)} tone={delayedWorks.length ? "bad" : "good"} />
            <ContextItem title="Открытые риски" value={String(activeRisks.length)} tone={activeRisks.length ? "warn" : "good"} />
            <ContextItem title="Заявки снабжению" value={String(activeRequests.length)} tone={activeRequests.length ? "warn" : "good"} />
          </div>
          <div className="stack">
            <h3>AI-рекомендации</h3>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void askAi("Проверь риски проекта и назови три первоочередных действия.");
            }}>
              Проверить риски проекта
            </button>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void askAi("Сравни бюджет и факт, выдели перерасход и причины.");
            }}>
              Сравнить бюджет и факт
            </button>
            <button className="button secondary" type="button" onClick={() => {
              setActiveTab("AI-помощник");
              void askAi("Подготовь пояснительную записку руководству по текущему статусу проекта.");
            }}>
              Подготовить записку
            </button>
          </div>
        </aside>
      </div>
    </main>
  );
}

function IntelligenceTab({
  snapshot,
  aiSummary,
  loading,
  aiLoading,
  onRefresh,
  onGenerateAi
}: {
  snapshot: ProjectIntelligenceSnapshot | null;
  aiSummary: AiIntelligenceSummary | null;
  loading: boolean;
  aiLoading: boolean;
  onRefresh: () => void;
  onGenerateAi: () => void;
}) {
  if (loading && !snapshot) return <Panel title="Аналитика проекта" icon={<AlertTriangle size={18} />}><EmptyState text="Загружаю расчетную аналитику..." /></Panel>;
  if (!snapshot) {
    return (
      <Panel title="Аналитика проекта" icon={<AlertTriangle size={18} />}>
        <EmptyState text="Недостаточно данных для аналитики или endpoint недоступен." />
        <button className="button secondary" type="button" onClick={onRefresh}>Обновить</button>
      </Panel>
    );
  }

  return (
    <section className="stack intelligence-view">
      <Panel title="Executive Summary" icon={<ClipboardList size={18} />}>
        <div className="toolbar">
          <div>
            <h3>{snapshot.executiveSummary.headline}</h3>
            <p className="muted">{snapshot.deterministicSummary}</p>
          </div>
          <button className="button secondary" type="button" onClick={onRefresh} disabled={loading}>
            Обновить
          </button>
        </div>
        <div className="grid grid-4">
          <Kpi title="Бюджет" value={money(snapshot.executiveSummary.budgetTotal)} />
          <Kpi title="Маржа план" value={percent(snapshot.executiveSummary.plannedMarginPercent)} />
          <Kpi title="Маржа прогноз" value={percent(snapshot.executiveSummary.forecastMarginPercent)} tone={snapshot.executiveSummary.forecastMarginPercent > 0 ? "good" : "bad"} />
          <Kpi title="Оплачено" value={money(snapshot.executiveSummary.paymentFact)} />
        </div>
        <PreviewTable
          title="Главные выводы"
          headers={["Вывод"]}
          rows={snapshot.executiveSummary.conclusions.map((item) => [item])}
        />
        {snapshot.executiveSummary.missingData.length > 0 && <MessageList title="Недостаточно данных" items={snapshot.executiveSummary.missingData} tone="warn" />}
      </Panel>

      <Panel title="Risk Radar" icon={<AlertTriangle size={18} />}>
        <div className="risk-radar-grid">
          {snapshot.radar.map((item) => (
            <div className="risk-radar-card" key={item.category}>
              <div className="toolbar">
                <strong>{item.title}</strong>
                <StatusBadge tone={riskTone(item.level)}>{readableStatus(item.level)}</StatusBadge>
              </div>
              <p>{item.shortReason}</p>
              <p className="muted">{item.suggestedAction}</p>
              <EvidenceList evidence={item.evidence} />
            </div>
          ))}
        </div>
      </Panel>

      <section className="grid grid-2">
        <Panel title="Budget Intelligence" icon={<Table2 size={18} />}>
          <div className="grid grid-3">
            <Kpi title="Без цены" value={String(snapshot.budget.missingPriceItems.length)} tone={snapshot.budget.missingPriceItems.length ? "bad" : "good"} />
            <Kpi title="Без количества" value={String(snapshot.budget.zeroQuantityItems.length)} tone={snapshot.budget.zeroQuantityItems.length ? "bad" : "good"} />
            <Kpi title="Дубли" value={String(snapshot.budget.duplicateItems.length)} tone={snapshot.budget.duplicateItems.length ? "warn" : "good"} />
          </div>
          <PreviewTable
            title="Топ дорогих позиций"
            headers={["Раздел", "Позиция", "Сумма", "Доля"]}
            rows={snapshot.budget.topCostItems.slice(0, 10).map((item) => [item.section, item.name, money(item.amount), percent(item.sharePercent)])}
          />
          <IssueTable issues={snapshot.budget.issues.slice(0, 8)} />
        </Panel>

        <Panel title="Schedule Intelligence" icon={<TimerReset size={18} />}>
          <div className="grid grid-3">
            <Kpi title="Просрочено" value={String(snapshot.schedule.overdueTasks.length)} tone={snapshot.schedule.overdueTasks.length ? "bad" : "good"} />
            <Kpi title="Без дат" value={String(snapshot.schedule.noDateTasks.length)} tone={snapshot.schedule.noDateTasks.length ? "warn" : "good"} />
            <Kpi title="Без ответственного" value={String(snapshot.schedule.noOwnerTasks.length)} tone={snapshot.schedule.noOwnerTasks.length ? "warn" : "good"} />
          </div>
          <PreviewTable
            title="Forecast сроков"
            headers={["Окно", "Риск", "Сигналов", "Комментарий"]}
            rows={snapshot.schedule.forecast.map((item) => [`${item.windowDays} дней`, <StatusBadge key="risk" tone={riskTone(item.riskLevel)}>{readableStatus(item.riskLevel)}</StatusBadge>, item.riskCount, item.summary])}
          />
          <IssueTable issues={snapshot.schedule.issues.slice(0, 8)} />
        </Panel>
      </section>

      <section className="grid grid-2">
        <Panel title="Рекомендации по закупкам" icon={<Truck size={18} />}>
          <div className="grid grid-3">
            <Kpi title="Дефицит" value={String(snapshot.procurement.deficitMaterials.length)} tone={snapshot.procurement.deficitMaterials.length ? "bad" : "good"} />
            <Kpi title="Без поставщика" value={String(snapshot.procurement.missingSupplierMaterials.length)} tone={snapshot.procurement.missingSupplierMaterials.length ? "warn" : "good"} />
            <Kpi title="Излишек" value={String(snapshot.procurement.overstockMaterials.length)} tone={snapshot.procurement.overstockMaterials.length ? "warn" : "good"} />
          </div>
          <ActionTable actions={snapshot.procurement.recommendations.slice(0, 8)} />
        </Panel>

        <Panel title="Finance Intelligence" icon={<Landmark size={18} />}>
          <div className="grid grid-3">
            <Kpi title="Не оплачено" value={money(snapshot.finance.unpaidAmount)} />
            <Kpi title="Просрочено" value={money(snapshot.finance.overdueAmount)} tone={snapshot.finance.overdueAmount ? "bad" : "good"} />
            <Kpi title="Cash gap" value={money(snapshot.finance.possibleCashGap)} tone={snapshot.finance.possibleCashGap < 0 ? "bad" : "good"} />
          </div>
          <PreviewTable
            title="Cashflow forecast"
            headers={["Окно", "Поступления", "Платежи", "Потребность"]}
            rows={snapshot.finance.forecast.map((item) => [`${item.windowDays} дней`, money(item.incoming), money(item.outgoing), money(item.financingNeed)])}
          />
          <IssueTable issues={snapshot.finance.issues.slice(0, 8)} />
        </Panel>
      </section>

      <section className="grid grid-2">
        <Panel title="Документы и проверка" icon={<FileText size={18} />}>
          <div className="grid grid-3">
            <Kpi title="Нет ключевых" value={String(snapshot.documents.missingKeyDocuments.length)} tone={snapshot.documents.missingKeyDocuments.length ? "bad" : "good"} />
            <Kpi title="Без категории" value={String(snapshot.documents.uncategorizedDocuments.length)} tone={snapshot.documents.uncategorizedDocuments.length ? "warn" : "good"} />
            <Kpi title="Устаревшие" value={String(snapshot.documents.staleDocuments.length)} tone={snapshot.documents.staleDocuments.length ? "warn" : "good"} />
          </div>
          <p className="muted">{snapshot.documents.ragReadiness.message}</p>
          <ActionTable actions={snapshot.documents.reviewRecommendations.slice(0, 8)} />
        </Panel>

        <Panel title="Action Plan" icon={<ClipboardList size={18} />}>
          <ActionTable actions={snapshot.actions.slice(0, 12)} />
        </Panel>
      </section>

      <Panel title="AI Summary" icon={<Bot size={18} />} className="ai-panel">
        <div className="toolbar">
          <div>
            <StatusBadge tone={snapshot.ai.status === "available" ? "info" : "warn"}>{snapshot.ai.message}</StatusBadge>
          </div>
          <button className="button primary" type="button" disabled={aiLoading} onClick={onGenerateAi}>
            {aiLoading ? "Формирую..." : "Сформировать AI-сводку"}
          </button>
        </div>
        {aiSummary ? (
          <div className={`ai-answer ${aiSummary.status === "success" ? "ready" : "error"}`}>
            <strong>{aiSummary.managementNote}</strong>
            <p>{aiSummary.executiveSummary}</p>
            <PreviewTable title="AI рекомендации" headers={["Действие"]} rows={aiSummary.recommendedActions.map((item) => [item])} />
          </div>
        ) : (
          <p className="muted">AI-сводка создается только по кнопке. Расчетная аналитика выше работает без OpenAI.</p>
        )}
      </Panel>
    </section>
  );
}

function IssueTable({ issues }: { issues: ProjectIntelligenceSnapshot["budget"]["issues"] }) {
  return (
    <PreviewTable
      title="Сигналы"
      headers={["Риск", "Уровень", "Причина", "Действие"]}
      rows={issues.map((item) => [
        item.title,
        <StatusBadge key="level" tone={riskTone(item.level)}>{readableStatus(item.level)}</StatusBadge>,
        item.reason,
        item.suggestedAction
      ])}
    />
  );
}

function ActionTable({ actions }: { actions: ProjectIntelligenceSnapshot["actions"] }) {
  return (
    <PreviewTable
      title="Рекомендации"
      headers={["Приоритет", "Категория", "Действие", "Следующий шаг"]}
      rows={actions.map((item) => [
        <StatusBadge key="priority" tone={riskTone(item.priority)}>{readableStatus(item.priority)}</StatusBadge>,
        categoryLabel(item.category),
        item.title,
        item.suggestedNextStep
      ])}
    />
  );
}

function EvidenceList({ evidence }: { evidence: ProjectIntelligenceSnapshot["radar"][number]["evidence"] }) {
  return (
    <ul className="evidence-list">
      {evidence.slice(0, 3).map((item, index) => (
        <li key={`${item.entityType}-${item.entityId ?? index}`}>
          <strong>{item.label}</strong>
          <span className="muted"> {item.explanation}</span>
        </li>
      ))}
    </ul>
  );
}

function riskTone(level: string): "good" | "warn" | "bad" | "info" | "neutral" {
  if (level === "critical" || level === "high") return "bad";
  if (level === "medium") return "warn";
  if (level === "low") return "good";
  return "neutral";
}

function categoryLabel(value: string) {
  const labels: Record<string, string> = {
    budget: "Бюджет",
    schedule: "График",
    procurement: "Закупки",
    finance: "Финансы",
    documents: "Документы",
    risks: "Риски",
    import: "Импорт",
    ai: "AI"
  };
  return labels[value] ?? value;
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
    <div className="panel stack import-panel">
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
          <label className="checkbox-row">
            <input checked={confirmed} onChange={(event) => onConfirmChange(event.target.checked)} type="checkbox" />
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

function Panel({ title, icon, children, className = "" }: { title: string; icon: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={`panel stack ${className}`}>
      <div className="panel-title">
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

function StatusBadge({ tone, children }: { tone: "good" | "warn" | "bad" | "info" | "neutral"; children: React.ReactNode }) {
  const color = tone === "good" ? "green" : tone === "warn" ? "yellow" : tone === "bad" ? "red" : tone === "info" ? "blue" : "gray";
  return <span className={`badge ${color}`}>{children}</span>;
}

function EmptyState({ text }: { text: string }) {
  return <div className="empty-state">{text}</div>;
}

function ContextItem({ title, value, tone }: { title: string; value: string; tone: "good" | "warn" | "bad" }) {
  return (
    <div className="attention-item">
      <div className="kpi-label">{title}</div>
      <div className={`kpi-value ${tone === "good" ? "delta-good" : tone === "warn" ? "delta-warn" : "delta-bad"}`}>{value}</div>
    </div>
  );
}

function readableStatus(value: string) {
  const labels: Record<string, string> = {
    not_started: "Не начато",
    in_progress: "В работе",
    done: "Готово",
    delayed: "Просрочено",
    stopped: "Остановлено",
    required: "Требуется",
    requested: "Запрошено",
    ordered: "Заказано",
    in_transit: "В пути",
    delivered: "Доставлено",
    closed: "Закрыто",
    planned: "План",
    paid: "Оплачено",
    overdue: "Просрочено",
    open: "Открыт",
    draft: "Черновик",
    critical: "Критично",
    high: "Высокий",
    medium: "Средний",
    low: "Низкий"
  };
  return labels[value] ?? value;
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

function BudgetEditForm({ item, onSave, onCancel }: { item: BudgetItem; onSave: (payload: Partial<BudgetItem>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid panel"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          unit: String(data.get("unit") || item.unit),
          qty: Number(data.get("qty") || item.qty),
          plannedUnitPrice: Number(data.get("plannedUnitPrice") || item.plannedUnitPrice),
          actualUnitPrice: Number(data.get("actualUnitPrice") || item.actualUnitPrice),
          forecastUnitPrice: Number(data.get("forecastUnitPrice") || item.forecastUnitPrice)
        }).catch(() => undefined);
      }}
    >
      <label>
        Наименование
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ед.
        <input name="unit" defaultValue={item.unit} />
      </label>
      <label>
        Кол-во
        <input name="qty" type="number" step="0.001" defaultValue={item.qty} />
      </label>
      <label>
        Цена план
        <input name="plannedUnitPrice" type="number" step="0.01" defaultValue={item.plannedUnitPrice} />
      </label>
      <label>
        Цена факт
        <input name="actualUnitPrice" type="number" step="0.01" defaultValue={item.actualUnitPrice} />
      </label>
      <label>
        Цена прогноз
        <input name="forecastUnitPrice" type="number" step="0.01" defaultValue={item.forecastUnitPrice} />
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function ScheduleEditForm({ item, onSave, onCancel }: { item: ScheduleItem; onSave: (payload: Partial<ScheduleItem>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid panel"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          owner: String(data.get("owner") || item.owner),
          startsAt: String(data.get("startsAt") || item.startsAt),
          endsAt: String(data.get("endsAt") || item.endsAt),
          plannedQty: Number(data.get("plannedQty") || item.plannedQty),
          actualQty: Number(data.get("actualQty") || item.actualQty),
          status: String(data.get("status") || item.status) as ScheduleItem["status"]
        }).catch(() => undefined);
      }}
    >
      <label>
        Работа
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ответственный
        <input name="owner" defaultValue={item.owner} />
      </label>
      <label>
        Начало
        <input name="startsAt" type="date" defaultValue={item.startsAt} />
      </label>
      <label>
        Окончание
        <input name="endsAt" type="date" defaultValue={item.endsAt} />
      </label>
      <label>
        План
        <input name="plannedQty" type="number" step="0.001" defaultValue={item.plannedQty} />
      </label>
      <label>
        Факт
        <input name="actualQty" type="number" step="0.001" defaultValue={item.actualQty} />
      </label>
      <label>
        Статус
        <select name="status" defaultValue={item.status}>
          <option value="not_started">not_started</option>
          <option value="in_progress">in_progress</option>
          <option value="done">done</option>
          <option value="delayed">delayed</option>
          <option value="stopped">stopped</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function MaterialEditForm({ item, onSave, onCancel }: { item: Material; onSave: (payload: Partial<Material>) => Promise<void>; onCancel: () => void }) {
  return (
    <form
      className="form-grid panel"
      onSubmit={(event) => {
        event.preventDefault();
        const data = new FormData(event.currentTarget);
        void onSave({
          name: String(data.get("name") || item.name),
          unit: String(data.get("unit") || item.unit),
          requiredQty: Number(data.get("requiredQty") || item.requiredQty),
          orderedQty: Number(data.get("orderedQty") || item.orderedQty),
          deliveredQty: Number(data.get("deliveredQty") || item.deliveredQty),
          consumedQty: Number(data.get("consumedQty") || item.consumedQty),
          plannedUnitPrice: Number(data.get("plannedUnitPrice") || item.plannedUnitPrice),
          actualUnitPrice: Number(data.get("actualUnitPrice") || item.actualUnitPrice),
          status: String(data.get("status") || item.status) as Material["status"]
        }).catch(() => undefined);
      }}
    >
      <label>
        Материал
        <input name="name" defaultValue={item.name} />
      </label>
      <label>
        Ед.
        <input name="unit" defaultValue={item.unit} />
      </label>
      <label>
        Потребность
        <input name="requiredQty" type="number" step="0.001" defaultValue={item.requiredQty} />
      </label>
      <label>
        Заказано
        <input name="orderedQty" type="number" step="0.001" defaultValue={item.orderedQty} />
      </label>
      <label>
        Доставлено
        <input name="deliveredQty" type="number" step="0.001" defaultValue={item.deliveredQty} />
      </label>
      <label>
        Списано
        <input name="consumedQty" type="number" step="0.001" defaultValue={item.consumedQty} />
      </label>
      <label>
        Цена план
        <input name="plannedUnitPrice" type="number" step="0.01" defaultValue={item.plannedUnitPrice} />
      </label>
      <label>
        Цена факт
        <input name="actualUnitPrice" type="number" step="0.01" defaultValue={item.actualUnitPrice} />
      </label>
      <label>
        Статус
        <select name="status" defaultValue={item.status}>
          <option value="required">required</option>
          <option value="requested">requested</option>
          <option value="ordered">ordered</option>
          <option value="in_transit">in_transit</option>
          <option value="delivered">delivered</option>
          <option value="closed">closed</option>
        </select>
      </label>
      <label>
        &nbsp;
        <button className="button primary" type="submit">Сохранить</button>
      </label>
      <label>
        &nbsp;
        <button className="button secondary" type="button" onClick={onCancel}>Отмена</button>
      </label>
    </form>
  );
}

function RowActions({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  return (
    <div className="row-actions">
      <button className="icon-button" title="Редактировать" type="button" onClick={onEdit}>
        <Pencil size={16} />
      </button>
      <button className="icon-button" title="Удалить" type="button" onClick={onDelete}>
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function BudgetTable({ items, onEdit, onDelete }: { items: BudgetItem[]; onEdit: (item: BudgetItem) => void; onDelete: (item: BudgetItem) => void }) {
  return (
    <DataTable
      headers={["Раздел", "Код", "Наименование", "Тип", "Кол-во", "Цена план", "Цена факт", "Сумма план", "Маржа", ""]}
      numericColumns={[4, 5, 6, 7, 8]}
      emptyMessage="ВОР пока пустая. Добавьте позицию вручную или импортируйте Excel."
      rows={items.map((item) => [
        item.section,
        item.code,
        item.name,
        <StatusBadge key="kind" tone="info">{item.kind}</StatusBadge>,
        `${item.qty.toLocaleString("ru-RU")} ${item.unit}`,
        money(item.plannedUnitPrice),
        money(item.actualUnitPrice),
        money(item.qty * item.plannedUnitPrice),
        money(item.qty * (item.forecastUnitPrice - item.actualUnitPrice)),
        <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
      ])}
    />
  );
}

function ScheduleTable({ items, onEdit, onDelete }: { items: ScheduleItem[]; onEdit: (item: ScheduleItem) => void; onDelete: (item: ScheduleItem) => void }) {
  return (
    <DataTable
      headers={["Работа", "Ответственный", "Начало", "Окончание", "План", "Факт", "Выполнение", "Статус", ""]}
      numericColumns={[4, 5, 6]}
      emptyMessage="График пока не заполнен. Добавьте первую работу или импортируйте план."
      rows={items.map((item) => [
        item.name,
        item.owner,
        item.startsAt,
        item.endsAt,
        item.plannedQty,
        item.actualQty,
        percent(item.plannedQty ? (item.actualQty / item.plannedQty) * 100 : 0),
        <StatusBadge key="status" tone={item.status === "delayed" ? "bad" : item.status === "done" ? "good" : "info"}>{readableStatus(item.status)}</StatusBadge>,
        <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
      ])}
    />
  );
}

function MaterialTable({ items, onEdit, onDelete }: { items: Material[]; onEdit: (item: Material) => void; onDelete: (item: Material) => void }) {
  return (
    <DataTable
      headers={["Материал", "Потребность", "Заказано", "Доставлено", "Списано", "Цена план/факт", "Поставщик", "Статус", ""]}
      numericColumns={[1, 2, 3, 4, 5]}
      emptyMessage="Материалы пока не заведены. Добавьте позицию или загрузите ВОР."
      rows={items.map((item) => [
        item.name,
        `${item.requiredQty} ${item.unit}`,
        `${item.orderedQty} ${item.unit}`,
        `${item.deliveredQty} ${item.unit}`,
        `${item.consumedQty} ${item.unit}`,
        `${money(item.plannedUnitPrice)} / ${money(item.actualUnitPrice)}`,
        item.supplier,
        <StatusBadge key="status" tone={item.status === "required" ? "bad" : item.status === "delivered" ? "good" : "warn"}>{readableStatus(item.status)}</StatusBadge>,
        <RowActions key="actions" onEdit={() => onEdit(item)} onDelete={() => onDelete(item)} />
      ])}
    />
  );
}

function RequestTable({ items }: { items: ProcurementRequest[] }) {
  return (
    <DataTable
      headers={["Заявка", "Инициатор", "Требуется", "Приоритет", "Статус", "Позиции"]}
      emptyMessage="Заявок снабжению пока нет."
      rows={items.map((item) => [
        item.title,
        item.initiator,
        item.neededAt,
        <StatusBadge key="priority" tone={item.priority === "critical" ? "bad" : "warn"}>{readableStatus(item.priority)}</StatusBadge>,
        <StatusBadge key="status" tone="info">{readableStatus(item.status)}</StatusBadge>,
        item.items.map((requestItem) => `${requestItem.name}: ${requestItem.qty} ${requestItem.unit}`).join("; ")
      ])}
    />
  );
}

function PaymentTable({ items }: { items: Payment[] }) {
  return (
    <DataTable
      headers={["Платеж", "Контрагент", "Тип", "Дата", "Сумма", "Категория", "Статус"]}
      numericColumns={[4]}
      emptyMessage="Платежи пока не заведены."
      rows={items.map((item) => [
        item.title,
        item.counterparty,
        item.direction === "incoming" ? "Поступление" : "Платеж",
        item.plannedAt,
        money(item.amount),
        item.category,
        <StatusBadge key="status" tone={item.status === "paid" ? "good" : item.status === "overdue" ? "bad" : "info"}>{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function ReportTable({ items }: { items: DailyReport[] }) {
  return (
    <DataTable
      headers={["Дата", "Автор", "Погода", "Люди", "Техника", "Выполнено", "Проблемы", "Статус"]}
      emptyMessage="Рапортов пока нет."
      rows={items.map((item) => [
        item.date,
        item.author,
        item.weather,
        `${item.workers} раб. / ${item.engineers} ИТР`,
        item.equipment,
        item.completedWorks,
        item.issues,
        <StatusBadge key="status" tone="info">{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function RiskTable({ items }: { items: Risk[] }) {
  return (
    <DataTable
      headers={["Риск", "Причина", "Приоритет", "Ответственный", "Срок", "Статус"]}
      emptyMessage="Риски пока не заведены."
      rows={items.map((item) => [
        item.title,
        item.reason,
        <StatusBadge key="priority" tone={item.priority === "critical" ? "bad" : item.priority === "high" ? "warn" : "info"}>{readableStatus(item.priority)}</StatusBadge>,
        item.owner,
        item.dueAt,
        <StatusBadge key="status" tone={item.status === "closed" ? "good" : "neutral"}>{readableStatus(item.status)}</StatusBadge>
      ])}
    />
  );
}

function AuditTable({ items }: { items: AuditEvent[] }) {
  return (
    <DataTable
      headers={["Дата", "Действие", "Сущность", "Описание", "Пользователь"]}
      emptyMessage="История изменений пока пустая."
      rows={items.map((item) => [
        new Date(item.createdAt).toLocaleString("ru-RU"),
        item.action,
        item.entity,
        item.summary ?? item.entityId,
        item.actorName ?? "local-user"
      ])}
    />
  );
}

function DocumentTable({
  items,
  projectId,
  versions,
  onLoadVersions,
  onUploadVersion,
  onDelete
}: {
  items: ProjectDocument[];
  projectId: string;
  versions: Record<string, ProjectDocumentVersion[]>;
  onLoadVersions: (document: ProjectDocument) => void;
  onUploadVersion: (document: ProjectDocument, file: File) => void;
  onDelete: (document: ProjectDocument) => void;
}) {
  return (
    <DataTable
      headers={["Файл", "Категория", "Тип", "Версии", "Размер", "Загрузил", "Дата", "Действия"]}
      numericColumns={[4]}
      emptyMessage="Документы пока не загружены."
      rows={items.map((item) => [
        <a key="download" className="delta-good" href={`/api/projects/${projectId}/documents/${item.id}/download`}>
          {item.fileName ?? item.title}
        </a>,
        item.category,
        item.previewAvailable ? `${item.mimeType ?? "-"} · preview-ready` : item.mimeType ?? "-",
        <div key="versions" className="stack">
          <button className="button secondary" type="button" onClick={() => onLoadVersions(item)}>
            v{item.version} · История
          </button>
          {versions[item.id]?.map((version) => (
            <a key={version.id} className="muted" href={`/api/projects/${projectId}/documents/${item.id}/versions/${version.id}/download`}>
              v{version.versionNumber}: {version.fileName}
            </a>
          ))}
        </div>,
        item.sizeBytes ? `${(item.sizeBytes / 1024 / 1024).toFixed(2)} MB` : "-",
        item.author,
        item.uploadedAt ? new Date(item.uploadedAt).toLocaleString("ru-RU") : new Date(item.createdAt).toLocaleString("ru-RU"),
        <div key="actions" className="stack">
          <input accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png,.webp,.zip" type="file" onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) onUploadVersion(item, file);
            event.currentTarget.value = "";
          }} />
          <button className="icon-button" title="Удалить" type="button" onClick={() => onDelete(item)}>
            <Trash2 size={16} />
          </button>
        </div>
      ])}
    />
  );
}

function ProjectMembersTable({
  items,
  onRoleChange,
  onRemove
}: {
  items: ProjectMember[];
  onRoleChange: (member: ProjectMember, role: ProjectMember["role"]) => void;
  onRemove: (member: ProjectMember) => void;
}) {
  return (
    <DataTable
      headers={["Пользователь", "Email", "Проектная роль", "Глобальная роль", "Статус", "Добавлен", "Действия"]}
      emptyMessage="Участники проекта пока не добавлены."
      rows={items.map((member) => [
        member.user.name,
        member.user.email,
        <select key="role" value={member.role} onChange={(event) => onRoleChange(member, event.target.value as ProjectMember["role"])}>
          <option value="OWNER">OWNER</option>
          <option value="ADMIN">ADMIN</option>
          <option value="MANAGER">MANAGER</option>
          <option value="VIEWER">VIEWER</option>
        </select>,
        <StatusBadge key="global-role" tone="info">{member.user.role}</StatusBadge>,
        <StatusBadge key="status" tone={member.user.isActive ? "good" : "neutral"}>{member.user.isActive ? "active" : "inactive"}</StatusBadge>,
        new Date(member.createdAt).toLocaleString("ru-RU"),
        <button className="icon-button" key="remove" title="Удалить участника" type="button" onClick={() => onRemove(member)}>
          <Trash2 size={16} />
        </button>
      ])}
    />
  );
}

function DataTable({
  headers,
  rows,
  numericColumns = [],
  emptyMessage = "Нет данных для отображения."
}: {
  headers: string[];
  rows: React.ReactNode[][];
  numericColumns?: number[];
  emptyMessage?: string;
}) {
  return (
    <div className="table-wrap">
      {rows.length ? (
        <table>
          <thead>
            <tr>
              {headers.map((header, index) => (
                <th className={numericColumns.includes(index) ? "numeric" : undefined} key={header}>{header}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => (
              <tr key={index}>
                {row.map((cell, cellIndex) => (
                  <td className={numericColumns.includes(cellIndex) ? "numeric" : undefined} key={cellIndex}>{cell}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <EmptyState text={emptyMessage} />
      )}
    </div>
  );
}
