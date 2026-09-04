"use client";

import {
  ArrowUpRight,
  Bot,
  CalendarDays,
  Camera,
  Check,
  ChevronDown,
  ClipboardCopy,
  FileDown,
  FilePlus2,
  Images,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Search,
  Send,
  ShieldCheck,
  Sparkles,
  Users,
  Trash2,
  X
} from "lucide-react";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import { DailyReportWorkOutputEditor } from "@/components/daily-report-work-output-editor";
import {
  applyDailyReportCrewAssignments,
  allocateDailyReportLabor,
  autoAssignDailyReportCrew,
  dailyReportAssignableCrew,
  dailyReportCompletedWorksFromOutputs,
  dailyReportWorkOutputAllocation,
  dailyReportWorkOutputNorm,
  dailyReportWorkOutputsComplete
} from "@/lib/daily-report-work-outputs";
import {
  dailyReportWorkScopeKey,
  dailyReportWorkScopeLabel,
  dailyReportWorkScopeSummary,
  parseDailyReportWorkScopes,
  seedDailyReportCompletedWorks,
  seedDailyReportWorkOutputs,
  syncDailyReportCompletedWorks
} from "@/lib/daily-report-work-scopes";
import { buildDailyReportScheduleUnits, syncDailyReportWorkOutputUnits } from "@/lib/daily-report-work-units";
import { dailyReportStatusLabel } from "@/lib/daily-reports";
import type { SerializedExecutiveReport } from "@/lib/executive-reports";
import type { PhotoQuestionResult } from "@/lib/photo-question";
import type { PhotoVolumeResult } from "@/lib/photo-volume-estimation";
import {
  formatReportPhotoBytes,
  mapWithConcurrency,
  prepareReportPhoto,
  REPORT_PHOTO_MAX_FILES,
  reportPhotoFileKey,
  uploadReportPhoto
} from "@/lib/report-photo-client";
import type { BudgetItem, DailyReport, DailyReportWorkOutput, DailyReportWorkScope, ProjectDocument, ScheduleItem, WorkStatus } from "@/lib/types";

type UserContext = {
  role?: "OWNER" | "ADMIN" | "MANAGER" | "VIEWER";
  authenticated?: boolean;
  name?: string;
};

type Props = {
  projectId: string;
  reports: DailyReport[];
  scheduleItems: ScheduleItem[];
  budgetItems?: BudgetItem[];
  documents?: ProjectDocument[];
  currentUser: UserContext | null;
  currentUserLoaded: boolean;
  onReportsChange: (items: DailyReport[]) => void;
  onScheduleItemsChange?: (items: ScheduleItem[]) => void;
  onDocumentsChange?: (items: ProjectDocument[]) => void;
};

type ReportMutationResponse = {
  item?: DailyReport;
  progress?: {
    mode: "applied" | "already_applied" | "rolled_back" | "none";
    entries: number;
    scheduleItems: ScheduleItem[];
  };
};

type ReportForm = Omit<DailyReport, "id" | "projectId" | "status" | "workOutputs" | "workScopes" | "crewMembers" | "evidenceDocuments" | "progressImpact"> & {
  phase: "open" | "closed";
  workCategory: string;
  workScopes: DailyReportWorkScope[];
  plannedWorks: string;
  crewResourceIds: string[];
  workOutputs: DailyReportWorkOutput[];
};

type WorkforceItem = {
  resourceId: string;
  name: string;
  profession: string;
  kind: "worker" | "engineer" | "crew";
  headcount: number;
};

type PendingReportPhoto = {
  id: string;
  file: File;
  originalSize: number;
  previewUrl?: string;
  optimized: boolean;
  status: "preparing" | "ready" | "uploading" | "failed" | "rejected";
  progress: number;
  error?: string;
};

type EvidenceUploadResult = {
  uploadedDocuments: ProjectDocument[];
  uploadedPhotoIds: string[];
  failureMessages: string[];
};

const emptyProjectDocuments: ProjectDocument[] = [];
const emptyBudgetItems: BudgetItem[] = [];

const workCategories = ["Кровельные работы", "Фасадные работы", "Монолит", "Кладка", "Отделка", "Инженерные сети", "Благоустройство", "Подготовительные работы", "Другое"];

const scheduleStatusMeta: Record<WorkStatus, { label: string; tone: string }> = {
  not_started: { label: "Не начато", tone: "gray" },
  in_progress: { label: "В работе", tone: "blue" },
  done: { label: "Готово", tone: "green" },
  delayed: { label: "Просрочено", tone: "red" },
  stopped: { label: "Остановлено", tone: "yellow" }
};

function scheduleDay(value: string) {
  return value.slice(0, 10);
}

function scheduleDateLabel(item: ScheduleItem) {
  const format = (value: string) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" });
  };
  return `${format(item.startsAt)}–${format(item.endsAt)}`;
}

function scheduleWorkRank(item: ScheduleItem, shiftDate: string) {
  const startsAt = scheduleDay(item.startsAt);
  const endsAt = scheduleDay(item.endsAt);
  const coversShift = Boolean(shiftDate && startsAt <= shiftDate && endsAt >= shiftDate);
  if (coversShift && item.status === "in_progress") return 0;
  if (coversShift && item.status !== "done") return 1;
  if (item.status === "in_progress") return 2;
  if (item.status === "delayed" || item.status === "stopped") return 3;
  if (item.status === "not_started" && startsAt >= shiftDate) return 4;
  if (item.status === "not_started") return 5;
  return 6;
}

export function dailyReportPhotoMutationId(reportId: string, file: Pick<File, "name" | "size" | "lastModified">) {
  const source = `${reportId}|${file.name}|${file.size}|${file.lastModified}`;
  let hash = 2166136261;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const reportToken = reportId.replace(/[^A-Za-z0-9_-]/g, "_").slice(-48) || "report";
  return `report_photo_${reportToken}_${(hash >>> 0).toString(36)}`;
}

export function buildScheduleWorkSuggestions(items: ScheduleItem[], shiftDate: string, query = "") {
  const normalizedQuery = query.trim().toLocaleLowerCase("ru-RU");
  return [...items]
    .filter((item) => {
      if (!normalizedQuery) return true;
      const status = scheduleStatusMeta[item.status].label;
      return `${item.name} ${item.owner} ${status}`.toLocaleLowerCase("ru-RU").includes(normalizedQuery);
    })
    .sort((left, right) => {
      const rankDelta = scheduleWorkRank(left, shiftDate) - scheduleWorkRank(right, shiftDate);
      if (rankDelta) return rankDelta;
      const dateDelta = scheduleDay(left.startsAt).localeCompare(scheduleDay(right.startsAt));
      return dateDelta || left.name.localeCompare(right.name, "ru-RU");
    });
}

export function ScheduleWorkPicker({
  items,
  shiftDate,
  selectedScopes,
  onToggle
}: {
  items: ScheduleItem[];
  shiftDate: string;
  selectedScopes: DailyReportWorkScope[];
  onToggle: (item: ScheduleItem) => void;
}) {
  const detailsRef = useRef<HTMLDetailsElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const suggestions = useMemo(() => buildScheduleWorkSuggestions(items, shiftDate, query), [items, query, shiftDate]);
  const visibleSuggestions = suggestions.slice(0, 30);
  const selectedScheduleIds = useMemo(() => new Set(selectedScopes.flatMap((scope) => scope.scheduleItemId ? [scope.scheduleItemId] : [])), [selectedScopes]);
  const selectedCount = selectedScheduleIds.size;

  return (
    <details
      className="daily-schedule-work-picker"
      ref={detailsRef}
      onKeyDown={(event) => {
        if (event.key !== "Escape" || !detailsRef.current?.open) return;
        detailsRef.current.open = false;
        detailsRef.current.querySelector<HTMLElement>("summary")?.focus();
      }}
      onToggle={(event) => {
        if (event.currentTarget.open) window.requestAnimationFrame(() => searchInputRef.current?.focus());
      }}
    >
      <summary aria-label="Выбрать работу из графика проекта" title="Выбрать работу из графика проекта">
        <CalendarDays size={16} />
        <span>Из графика</span>
        {selectedCount ? <b>{selectedCount}</b> : null}
        <ChevronDown className="daily-schedule-work-chevron" size={15} />
      </summary>
      <div className="daily-schedule-work-menu">
        <header>
          <div>
            <strong>Работы проектного графика</strong>
            <small>{items.length ? `${items.length} позиций · актуальные показаны первыми` : "График пока не заполнен"}</small>
          </div>
        </header>
        {items.length ? (
          <>
            <label className="daily-schedule-work-search">
              <Search size={15} />
              <input aria-label="Поиск работы в графике" placeholder="Название, ответственный или статус" ref={searchInputRef} value={query} onChange={(event) => setQuery(event.target.value)} />
            </label>
            <div aria-label="Работы проектного графика" aria-multiselectable="true" className="daily-schedule-work-results" role="listbox">
              {visibleSuggestions.length ? visibleSuggestions.map((item) => {
                const meta = scheduleStatusMeta[item.status];
                const selected = selectedScheduleIds.has(item.id);
                return (
                  <button aria-selected={selected} className={selected ? "selected" : ""} key={item.id} role="option" type="button" onClick={() => onToggle(item)}>
                    <span>
                      <strong>{item.name}</strong>
                      <small>{scheduleDateLabel(item)}{item.owner ? ` · ${item.owner}` : ""}</small>
                    </span>
                    <span className="daily-schedule-work-option-meta">
                      <span className={`badge ${meta.tone}`}>{meta.label}</span>
                      <span aria-hidden="true" className="daily-schedule-work-check">{selected ? <Check size={14} /> : null}</span>
                    </span>
                  </button>
                );
              }) : <p>По этому запросу работ нет.</p>}
            </div>
            {suggestions.length > visibleSuggestions.length ? <small className="daily-schedule-work-limit">Уточните поиск, чтобы увидеть остальные работы.</small> : null}
            <footer className="daily-schedule-work-footer">
              <span>{selectedCount ? `Выбрано из графика: ${selectedCount}` : "Выберите одну или несколько работ"}</span>
              <button className="button secondary compact-button" type="button" onClick={() => { if (detailsRef.current) detailsRef.current.open = false; }}>Готово</button>
            </footer>
          </>
        ) : (
          <div className="daily-schedule-work-empty">Добавьте работы во вкладке «График» или введите вид работ вручную.</div>
        )}
      </div>
    </details>
  );
}

const emptyReport = (author = "Прораб", phase: "open" | "closed" = "open"): ReportForm => ({
  date: new Date().toISOString().slice(0, 10),
  author,
  weather: "",
  workers: 0,
  engineers: 0,
  equipment: "",
  completedWorks: "",
  materialsReceived: "",
  materialsConsumed: "",
  downtime: "",
  issues: "",
  shiftHours: 8,
  phase,
  workCategory: "",
  workScopes: [],
  plannedWorks: "",
  crewResourceIds: [],
  workOutputs: []
});

function tone(status: string) {
  if (status === "approved" || status === "published") return "green";
  if (status === "checked") return "blue";
  if (status === "submitted" || status === "partial") return "yellow";
  if (status === "blocked" || status === "no_data") return "red";
  return "gray";
}

export function isProjectEvidenceCandidate(document: ProjectDocument) {
  const searchable = `${document.category} ${document.title} ${document.fileName ?? ""}`;
  return (document.mimeType ?? "").startsWith("image/")
    && !document.dailyReportId
    && !/чек|расход|receipt|expense/i.test(searchable)
    && /фото|photo|фиксац|строй|рапорт|evidence/i.test(searchable);
}

function ReportEvidenceGallery({ documents, projectId }: { documents: ProjectDocument[]; projectId: string }) {
  const images = documents.filter((document) => (document.mimeType ?? "").startsWith("image/"));
  const otherDocuments = documents.filter((document) => !(document.mimeType ?? "").startsWith("image/"));
  return (
    <section className="daily-report-evidence" aria-label={`Фото и документы рапорта: ${documents.length}`}>
      <div className="daily-report-evidence-count"><Camera size={14} /> {images.length} фото{otherDocuments.length ? ` · ${otherDocuments.length} файлов` : ""}</div>
      {images.length ? (
        <div className="daily-report-evidence-gallery">
          {images.slice(0, 6).map((document) => (
            <a aria-label={`Открыть фото: ${document.title}`} href={`/api/projects/${projectId}/documents/${document.id}/download`} key={document.id} rel="noreferrer" target="_blank">
              <Image alt={document.title} height={180} loading="lazy" src={`/api/projects/${projectId}/documents/${document.id}/download?inline=1&v=${document.version}`} unoptimized width={240} />
              <span>{document.title}</span>
              <ArrowUpRight aria-hidden="true" size={13} />
            </a>
          ))}
        </div>
      ) : null}
      {otherDocuments.length ? (
        <div className="daily-report-evidence-files">
          {otherDocuments.map((document) => <a href={`/api/projects/${projectId}/documents/${document.id}/download`} key={document.id} rel="noreferrer" target="_blank"><FileDown size={13} />{document.title}</a>)}
        </div>
      ) : null}
    </section>
  );
}

async function responseError(response: Response, fallback: string) {
  const body = (await response.json().catch(() => ({}))) as { error?: string };
  if (response.status === 401 || response.status === 403) return "Недостаточно прав для этой операции.";
  return body.error ?? fallback;
}

export function ReportsWorkflow({ projectId, reports, scheduleItems, budgetItems = emptyBudgetItems, documents = emptyProjectDocuments, currentUser, currentUserLoaded, onReportsChange, onScheduleItemsChange, onDocumentsChange }: Props) {
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ReportForm>(() => emptyReport(currentUser?.name));
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [dailyReportsLoaded, setDailyReportsLoaded] = useState(false);
  const [dailyReportsError, setDailyReportsError] = useState("");
  const [executiveReports, setExecutiveReports] = useState<SerializedExecutiveReport[]>([]);
  const [selectedExecutiveId, setSelectedExecutiveId] = useState<string | null>(null);
  const [executiveLoaded, setExecutiveLoaded] = useState(false);
  const [publishConfirmed, setPublishConfirmed] = useState(false);
  const [copied, setCopied] = useState(false);
  const [workforce, setWorkforce] = useState<WorkforceItem[]>([]);
  const [workforceLoaded, setWorkforceLoaded] = useState(false);
  const [crewSearch, setCrewSearch] = useState("");
  const [workDraft, setWorkDraft] = useState("");
  const [pendingPhotos, setPendingPhotos] = useState<PendingReportPhoto[]>([]);
  const [selectedPhotoIds, setSelectedPhotoIds] = useState<string[]>([]);
  const [photoQuestion, setPhotoQuestion] = useState("");
  const [photoAnswer, setPhotoAnswer] = useState<PhotoQuestionResult | null>(null);
  const [photoVolumeResult, setPhotoVolumeResult] = useState<PhotoVolumeResult | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");
  const [selectedExistingPhotoIds, setSelectedExistingPhotoIds] = useState<string[]>([]);
  const [correctionReportId, setCorrectionReportId] = useState<string | null>(null);
  const [correctionReason, setCorrectionReason] = useState("");
  const photoObjectUrls = useRef(new Set<string>());
  const photoPreparationVersion = useRef(0);

  const role = currentUser?.role;
  const canEdit = role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  const canApprove = role === "OWNER" || role === "ADMIN";
  const selectedExecutive = executiveReports.find((item) => item.id === selectedExecutiveId) ?? executiveReports[0] ?? null;
  const sortedReports = useMemo(() => [...reports].sort((a, b) => b.date.localeCompare(a.date)), [reports]);
  const activeReport = editingId ? reports.find((item) => item.id === editingId) ?? null : null;
  const evidence = activeReport?.evidenceDocuments?.filter((item) => (item.mimeType ?? "").startsWith("image/")) ?? [];
  const availableProjectPhotos = useMemo(
    () => documents
      .filter(isProjectEvidenceCandidate)
      .sort((left, right) => (right.uploadedAt ?? right.createdAt).localeCompare(left.uploadedAt ?? left.createdAt)),
    [documents]
  );
  const visibleProjectPhotos = availableProjectPhotos.slice(0, 24);
  const uploadablePhotos = pendingPhotos.filter((item) => item.status === "ready" || item.status === "failed");
  const photosPreparing = pendingPhotos.some((item) => item.status === "preparing");
  const photosRejected = pendingPhotos.some((item) => item.status === "rejected");
  const photoOperationBusy = busy === "photo-upload" || busy === "photo-ai" || busy === "photo-volume";
  const photoControlsBusy = photoOperationBusy || busy === "daily-save";
  const selectedCrew = workforce.filter((item) => form.crewResourceIds.includes(item.resourceId));
  const selectedHeadcount = selectedCrew.length
    ? selectedCrew.reduce((sum, item) => sum + item.headcount, 0)
    : form.workers + form.engineers;
  const selectedWorkerHeadcount = selectedCrew.length
    ? dailyReportAssignableCrew(selectedCrew).reduce((sum, item) => sum + item.headcount, 0)
    : form.workers;
  const visibleWorkforce = useMemo(() => {
    const query = crewSearch.trim().toLocaleLowerCase("ru-RU");
    if (!query) return workforce;
    return workforce.filter((item) => `${item.name} ${item.profession}`.toLocaleLowerCase("ru-RU").includes(query));
  }, [crewSearch, workforce]);
  const missingRequiredFields = form.phase === "open"
    ? [
        !form.author.trim() ? "автор" : "",
        !form.workScopes.length ? "хотя бы один вид работ" : "",
        !form.plannedWorks.trim() ? "план смены" : "",
        !form.crewResourceIds.length && form.workers + form.engineers === 0 ? "состав смены" : ""
      ].filter(Boolean)
    : [
        !form.author.trim() ? "автор" : "",
        !form.workOutputs.length && !form.downtime.trim() && !form.issues.trim() ? "работу или причину простоя" : "",
        !dailyReportWorkOutputsComplete(form.workOutputs) ? "объём и состав по каждой работе" : ""
      ].filter(Boolean);

  const loadDailyReports = useCallback(async () => {
    if (!currentUserLoaded || !currentUser?.authenticated) {
      setDailyReportsLoaded(true);
      return;
    }
    setBusy((current) => current || "daily-load");
    setDailyReportsError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/daily-reports`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить рапорты."));
      const body = (await response.json()) as { items?: DailyReport[] };
      onReportsChange(body.items ?? []);
    } catch (loadError) {
      setDailyReportsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить рапорты.");
    } finally {
      setDailyReportsLoaded(true);
      setBusy((current) => current === "daily-load" ? "" : current);
    }
  }, [currentUser?.authenticated, currentUserLoaded, onReportsChange, projectId]);

  const loadExecutiveReports = useCallback(async () => {
    if (!currentUserLoaded || !currentUser?.authenticated) {
      setExecutiveLoaded(true);
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить историю отчетов."));
      const body = (await response.json()) as { items: SerializedExecutiveReport[] };
      setExecutiveReports(body.items);
      setSelectedExecutiveId((current) => current ?? body.items[0]?.id ?? null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Не удалось загрузить историю отчетов.");
    } finally {
      setExecutiveLoaded(true);
    }
  }, [currentUser?.authenticated, currentUserLoaded, projectId]);

  const loadWorkforce = useCallback(async () => {
    if (!currentUserLoaded || !currentUser?.authenticated) {
      setWorkforceLoaded(true);
      return;
    }
    try {
      const response = await fetch(`/api/projects/${projectId}/daily-workforce?date=${encodeURIComponent(form.date)}`, { cache: "no-store" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось загрузить состав проекта."));
      const body = (await response.json()) as { items?: WorkforceItem[] };
      setWorkforce(body.items ?? []);
    } catch (loadError) {
      setDailyReportsError(loadError instanceof Error ? loadError.message : "Не удалось загрузить состав проекта.");
    } finally {
      setWorkforceLoaded(true);
    }
  }, [currentUser?.authenticated, currentUserLoaded, form.date, projectId]);

  useEffect(() => {
    void loadExecutiveReports();
  }, [loadExecutiveReports]);

  useEffect(() => {
    void loadDailyReports();
  }, [loadDailyReports]);

  useEffect(() => {
    void loadWorkforce();
  }, [loadWorkforce]);

  useEffect(() => () => {
    photoPreparationVersion.current += 1;
    photoObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls.current.clear();
  }, []);

  function clearPendingPhotos() {
    photoPreparationVersion.current += 1;
    photoObjectUrls.current.forEach((url) => URL.revokeObjectURL(url));
    photoObjectUrls.current.clear();
    setPendingPhotos([]);
  }

  function closeReportForm() {
    clearPendingPhotos();
    setFormOpen(false);
  }

  function openNewReport() {
    setEditingId(null);
    setForm(emptyReport(currentUser?.name || "Прораб", "open"));
    setFormOpen(true);
    clearPendingPhotos();
    setSelectedPhotoIds([]);
    setPhotoQuestion("");
    setPhotoAnswer(null);
    setPhotoVolumeResult(null);
    setPhotoNotice("");
    setSelectedExistingPhotoIds([]);
    setCrewSearch("");
    setWorkDraft("");
    setError("");
  }

  const scheduleUnits = useMemo(
    () => buildDailyReportScheduleUnits(scheduleItems, budgetItems),
    [budgetItems, scheduleItems]
  );

  function openEditReport(item: DailyReport, closeShift = false) {
    const workScopes = parseDailyReportWorkScopes(item.workScopes, item.workCategory);
    const phase = closeShift ? "closed" : item.phase ?? "closed";
    const seedFactFromPlan = closeShift;
    const shiftHours = item.shiftHours ?? 8;
    const reportCrew = item.crewMembers ?? [];
    const reportWorkerHeadcount = reportCrew.length
      ? dailyReportAssignableCrew(reportCrew).reduce((sum, member) => sum + member.headcount, 0)
      : item.workers;
    const currentOutputs = syncDailyReportWorkOutputUnits(item.workOutputs ?? [], scheduleUnits);
    const seededOutputs = seedFactFromPlan
      ? seedDailyReportWorkOutputs(workScopes, currentOutputs, scheduleUnits)
      : currentOutputs;
    const hasNamedAssignments = seededOutputs.some((output) => output.crewResourceIds?.length);
    const preparedOutputs = reportCrew.length
      ? autoAssignDailyReportCrew(seededOutputs, reportCrew, shiftHours, !hasNamedAssignments)
      : seedFactFromPlan
        ? allocateDailyReportLabor(seededOutputs, reportWorkerHeadcount, shiftHours, true)
        : seededOutputs;
    setEditingId(item.id);
    setForm({
      date: item.date,
      author: item.author,
      weather: item.weather,
      workers: item.workers,
      engineers: item.engineers,
      equipment: item.equipment,
      completedWorks: seedFactFromPlan ? seedDailyReportCompletedWorks(workScopes, item.completedWorks) : item.completedWorks,
      materialsReceived: item.materialsReceived,
      materialsConsumed: item.materialsConsumed,
      downtime: item.downtime,
      issues: item.issues,
      shiftHours,
      phase,
      workCategory: dailyReportWorkScopeSummary(workScopes, item.workCategory),
      workScopes,
      plannedWorks: item.plannedWorks ?? "",
      crewResourceIds: (item.crewMembers ?? []).map((member) => member.resourceId),
      workOutputs: preparedOutputs
    });
    clearPendingPhotos();
    setSelectedPhotoIds(item.evidenceDocuments?.filter((document) => (document.mimeType ?? "").startsWith("image/")).map((document) => document.id).slice(0, 4) ?? []);
    setPhotoQuestion("");
    setPhotoAnswer(null);
    setPhotoVolumeResult(null);
    setPhotoNotice("");
    setSelectedExistingPhotoIds([]);
    setCrewSearch("");
    setWorkDraft("");
    setFormOpen(true);
    setError("");
  }

  function replaceWorkScopes(nextScopes: DailyReportWorkScope[]) {
    setPhotoVolumeResult(null);
    setForm((current) => {
      const workScopes = parseDailyReportWorkScopes(nextScopes);
      const nextKeys = new Set(workScopes.map(dailyReportWorkScopeKey));
      const removedScopes = current.workScopes.filter((scope) => !nextKeys.has(dailyReportWorkScopeKey(scope)));
      const retainedOutputs = current.workOutputs.filter((output) => {
        const removed = removedScopes.some((scope) => scope.scheduleItemId
          ? scope.scheduleItemId === output.scheduleItemId
          : scope.workName.trim().toLocaleLowerCase("ru-RU") === output.workName.trim().toLocaleLowerCase("ru-RU"));
        const untouched = !output.profession.trim()
          && output.quantity === 0
          && !output.unit.trim()
          && (output.laborAllocationMode === "auto" || output.laborHours === 0);
        return !(removed && untouched);
      });
      const seededOutputs = current.phase === "closed"
        ? seedDailyReportWorkOutputs(workScopes, retainedOutputs, scheduleUnits)
        : retainedOutputs;
      return {
        ...current,
        workScopes,
        workCategory: dailyReportWorkScopeSummary(workScopes),
        completedWorks: current.phase === "closed"
          ? syncDailyReportCompletedWorks(current.workScopes, workScopes, current.completedWorks)
          : current.completedWorks,
        workOutputs: current.phase === "closed"
          ? selectedCrew.length
            ? autoAssignDailyReportCrew(seededOutputs, selectedCrew, current.shiftHours ?? 8)
            : allocateDailyReportLabor(seededOutputs, selectedWorkerHeadcount, current.shiftHours ?? 8)
          : seededOutputs
      };
    });
  }

  function addManualWork() {
    const workName = workDraft.trim().replace(/\s+/g, " ");
    if (workName.length < 2) return;
    if (form.workScopes.length >= 20) {
      setError("В одной смене можно выбрать до 20 видов работ.");
      return;
    }
    const duplicate = form.workScopes.some((scope) => scope.workName.toLocaleLowerCase("ru-RU") === workName.toLocaleLowerCase("ru-RU"));
    if (!duplicate) replaceWorkScopes([...form.workScopes, { workName, source: "manual" }]);
    setWorkDraft("");
  }

  function toggleScheduleWork(item: ScheduleItem) {
    const selected = form.workScopes.some((scope) => scope.scheduleItemId === item.id);
    if (selected) {
      replaceWorkScopes(form.workScopes.filter((scope) => scope.scheduleItemId !== item.id));
      return;
    }
    if (form.workScopes.length >= 20) {
      setError("В одной смене можно выбрать до 20 видов работ.");
      return;
    }
    replaceWorkScopes([...form.workScopes, { scheduleItemId: item.id, workName: item.name, source: "schedule" }]);
  }

  function removeWorkScope(scope: DailyReportWorkScope) {
    const key = dailyReportWorkScopeKey(scope);
    replaceWorkScopes(form.workScopes.filter((item) => dailyReportWorkScopeKey(item) !== key));
  }

  function toggleCrew(resourceId: string) {
    setForm((current) => {
      const crewResourceIds = current.crewResourceIds.includes(resourceId)
        ? current.crewResourceIds.filter((id) => id !== resourceId)
        : [...current.crewResourceIds, resourceId];
      return withSelectedCrew(current, crewResourceIds);
    });
  }

  function selectVisibleCrew() {
    setForm((current) => withSelectedCrew(
      current,
      Array.from(new Set([...current.crewResourceIds, ...visibleWorkforce.map((item) => item.resourceId)]))
    ));
  }

  function clearCrew() {
    setForm((current) => withSelectedCrew(current, []));
  }

  function withSelectedCrew(current: ReportForm, crewResourceIds: string[]) {
    const selected = workforce.filter((item) => crewResourceIds.includes(item.resourceId));
    const counts = selected.reduce((totals, item) => {
      if (item.kind === "engineer") totals.engineers += item.headcount;
      else totals.workers += item.headcount;
      return totals;
    }, { workers: 0, engineers: 0 });
    return {
      ...current,
      ...counts,
      crewResourceIds,
      workOutputs: current.phase === "closed"
        ? selected.length
          ? autoAssignDailyReportCrew(current.workOutputs, selected, current.shiftHours ?? 8)
          : allocateDailyReportLabor(current.workOutputs, counts.workers, current.shiftHours ?? 8)
        : current.workOutputs
    };
  }

  function updateManualCrew(field: "workers" | "engineers", value: number) {
    setForm((current) => {
      const next = { ...current, [field]: value };
      return {
        ...next,
        workOutputs: next.phase === "closed"
          ? allocateDailyReportLabor(next.workOutputs, next.workers, next.shiftHours ?? 8)
          : next.workOutputs
      };
    });
  }

  function togglePhoto(documentId: string) {
    setPhotoAnswer(null);
    setPhotoVolumeResult(null);
    setSelectedPhotoIds((current) => {
      if (current.includes(documentId)) return current.filter((id) => id !== documentId);
      return current.length < 4 ? [...current, documentId] : current;
    });
  }

  function updatePendingPhoto(id: string, patch: Partial<PendingReportPhoto>) {
    setPendingPhotos((current) => current.map((item) => item.id === id ? { ...item, ...patch } : item));
  }

  function removePendingPhoto(id: string) {
    const target = pendingPhotos.find((item) => item.id === id);
    if (target?.previewUrl) {
      URL.revokeObjectURL(target.previewUrl);
      photoObjectUrls.current.delete(target.previewUrl);
    }
    setPendingPhotos((current) => current.filter((item) => item.id !== id));
  }

  async function selectPhotoFiles(files: File[]) {
    const availableSlots = Math.max(0, REPORT_PHOTO_MAX_FILES - pendingPhotos.length);
    const selected = files.slice(0, availableSlots);
    if (!selected.length) {
      if (files.length) setError(`К одной загрузке можно добавить до ${REPORT_PHOTO_MAX_FILES} фото.`);
      return;
    }
    if (files.length > selected.length) setError(`Добавлены первые ${selected.length} фото из ${files.length}. Лимит очереди: ${REPORT_PHOTO_MAX_FILES}.`);
    else setError("");
    setPhotoAnswer(null);
    setPhotoVolumeResult(null);
    setPhotoNotice("");
    const version = photoPreparationVersion.current;
    const batchToken = Date.now().toString(36);
    const initial: PendingReportPhoto[] = selected.map((file, index) => ({
      id: `${reportPhotoFileKey(file, index)}:${batchToken}`,
      file,
      originalSize: file.size,
      optimized: false,
      status: "preparing",
      progress: 0
    }));
    setPendingPhotos((current) => [...current, ...initial]);

    for (const item of initial) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      try {
        const prepared = await prepareReportPhoto(item.file);
        if (version !== photoPreparationVersion.current) return;
        const previewUrl = URL.createObjectURL(prepared.file);
        photoObjectUrls.current.add(previewUrl);
        updatePendingPhoto(item.id, {
          file: prepared.file,
          originalSize: prepared.originalSize,
          previewUrl,
          optimized: prepared.optimized,
          status: "ready"
        });
      } catch (prepareError) {
        if (version !== photoPreparationVersion.current) return;
        updatePendingPhoto(item.id, {
          status: "rejected",
          error: prepareError instanceof Error ? prepareError.message : "Не удалось подготовить фото."
        });
      }
    }
  }

  async function persistEvidence(photos: PendingReportPhoto[]): Promise<EvidenceUploadResult> {
    if (!editingId) return { uploadedDocuments: [], uploadedPhotoIds: [], failureMessages: ["Сначала сохраните рапорт."] };
    const outcomes = await mapWithConcurrency(photos, 2, async (photo) => {
      updatePendingPhoto(photo.id, { status: "uploading", progress: 0, error: undefined });
      try {
        let lastRenderedProgress = -10;
        const document = await uploadReportPhoto({
          projectId,
          reportId: editingId,
          file: photo.file,
          clientMutationId: dailyReportPhotoMutationId(editingId, photo.file),
          onProgress: (progress) => {
            if (progress !== 100 && progress - lastRenderedProgress < 10) return;
            lastRenderedProgress = progress;
            React.startTransition(() => updatePendingPhoto(photo.id, { progress }));
          }
        });
        return { photoId: photo.id, document };
      } catch (fileError) {
        const message = fileError instanceof Error ? fileError.message : `Не удалось загрузить ${photo.file.name}.`;
        updatePendingPhoto(photo.id, { status: "failed", error: message, progress: 0 });
        return { photoId: photo.id, error: message };
      }
    });
    return {
      uploadedDocuments: outcomes.flatMap((item) => item.document ? [item.document] : []),
      uploadedPhotoIds: outcomes.flatMap((item) => item.document ? [item.photoId] : []),
      failureMessages: outcomes.flatMap((item) => item.error ? [item.error] : [])
    };
  }

  function reflectEvidenceUpload(result: EvidenceUploadResult) {
    const uploadedIds = new Set(result.uploadedPhotoIds);
    pendingPhotos.forEach((item) => {
      if (!uploadedIds.has(item.id)) return;
      if (item.previewUrl) {
        URL.revokeObjectURL(item.previewUrl);
        photoObjectUrls.current.delete(item.previewUrl);
      }
    });
    setPendingPhotos((current) => current.filter((item) => !uploadedIds.has(item.id)));
    if (result.uploadedDocuments.length) {
      const uploadedDocumentIds = result.uploadedDocuments.map((item) => item.id);
      setSelectedPhotoIds((current) => [...new Set([...current, ...uploadedDocumentIds])].slice(0, 4));
      onReportsChange(reports.map((report) => report.id === editingId
        ? {
            ...report,
            evidenceDocuments: [...new Map([...(report.evidenceDocuments ?? []), ...result.uploadedDocuments].map((document) => [document.id, document])).values()]
          }
        : report));
      onDocumentsChange?.([...new Map([...documents, ...result.uploadedDocuments].map((document) => [document.id, document])).values()]);
      setPhotoNotice(`Прикреплено: ${result.uploadedDocuments.length}. Фото сохранены в рапорте и в разделе «Документы».`);
    }
    if (result.failureMessages.length) {
      setError(`${result.failureMessages.length} фото не загружено. Успешные файлы сохранены, повторите только оставшиеся. ${result.failureMessages[0]}`);
    }
  }

  async function uploadEvidence() {
    if (!editingId || !uploadablePhotos.length) return;
    setBusy("photo-upload");
    setError("");
    setPhotoNotice("");
    try {
      const result = await persistEvidence(uploadablePhotos);
      reflectEvidenceUpload(result);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Не удалось загрузить фото смены.");
    } finally {
      setBusy("");
    }
  }

  async function attachExistingEvidence() {
    if (!editingId || !selectedExistingPhotoIds.length) return;
    setBusy("photo-link");
    setError("");
    setPhotoNotice("");
    try {
      const response = await fetch(`/api/projects/${projectId}/daily-reports/${editingId}/evidence`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentIds: selectedExistingPhotoIds })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось прикрепить фото из документов."));
      const body = (await response.json()) as { items: ProjectDocument[]; linked: number };
      const linkedIds = new Set(body.items.map((item) => item.id));
      onDocumentsChange?.(documents.map((document) => linkedIds.has(document.id)
        ? { ...document, dailyReportId: editingId }
        : document));
      onReportsChange(reports.map((report) => report.id === editingId
        ? {
            ...report,
            evidenceDocuments: [
              ...(report.evidenceDocuments ?? []).filter((document) => !linkedIds.has(document.id)),
              ...body.items
            ]
          }
        : report));
      setSelectedPhotoIds((current) => [...new Set([...current, ...body.items.map((item) => item.id)])].slice(0, 4));
      setPhotoAnswer(null);
      setPhotoVolumeResult(null);
      setSelectedExistingPhotoIds([]);
      setPhotoNotice(`Из документов прикреплено: ${body.linked}. Фото теперь видны в карточке рапорта.`);
    } catch (linkError) {
      setError(linkError instanceof Error ? linkError.message : "Не удалось прикрепить фото из документов.");
    } finally {
      setBusy("");
    }
  }

  async function uploadedPhotoIdsForAnalysis() {
    let documentIds = selectedPhotoIds;
    if (uploadablePhotos.length) {
      const result = await persistEvidence(uploadablePhotos);
      reflectEvidenceUpload(result);
      documentIds = [...new Set([...documentIds, ...result.uploadedDocuments.map((item) => item.id)])].slice(0, 4);
    }
    return documentIds;
  }

  async function askAboutPhotos() {
    if (!editingId || (!selectedPhotoIds.length && !uploadablePhotos.length) || photoQuestion.trim().length < 3) return;
    setBusy("photo-ai");
    setError("");
    setPhotoAnswer(null);
    try {
      const documentIds = await uploadedPhotoIdsForAnalysis();
      if (!documentIds.length) throw new Error("Добавьте хотя бы одно фото для анализа.");
      const response = await fetch(`/api/projects/${projectId}/daily-reports/${editingId}/photo-question`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ question: photoQuestion, documentIds })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось проанализировать фотографии."));
      const body = (await response.json()) as { result: PhotoQuestionResult };
      setPhotoAnswer(body.result);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Не удалось проанализировать фотографии.");
    } finally {
      setBusy("");
    }
  }

  async function estimateVolumesFromPhotos() {
    if (!editingId || (!selectedPhotoIds.length && !uploadablePhotos.length)) return;
    const scheduleItemIds = [...new Set(form.workOutputs.flatMap((output) => output.scheduleItemId ? [output.scheduleItemId] : []))];
    if (!scheduleItemIds.length) {
      setError("Для AI-оценки выберите измеримые работы из графика проекта.");
      return;
    }
    setBusy("photo-volume");
    setError("");
    setPhotoVolumeResult(null);
    try {
      const documentIds = await uploadedPhotoIdsForAnalysis();
      if (!documentIds.length) throw new Error("Добавьте хотя бы одно фото для оценки объёмов.");
      const response = await fetch(`/api/projects/${projectId}/daily-reports/${editingId}/photo-volume`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ documentIds, scheduleItemIds })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось оценить объёмы по фотографиям."));
      const body = (await response.json()) as { result: PhotoVolumeResult };
      setPhotoVolumeResult(body.result);
    } catch (analysisError) {
      setError(analysisError instanceof Error ? analysisError.message : "Не удалось оценить объёмы по фотографиям.");
    } finally {
      setBusy("");
    }
  }

  function applyPhotoVolumeSuggestions() {
    if (!photoVolumeResult) return;
    const quantityByScheduleId = new Map(photoVolumeResult.suggestions.flatMap((item) => (
      item.suggestedQuantity !== null && item.confidence !== "low" && !item.needsManualMeasurement
        ? [[item.scheduleItemId, item.suggestedQuantity] as const]
        : []
    )));
    if (!quantityByScheduleId.size) {
      setPhotoNotice("На фото недостаточно масштаба для автоматической подстановки. Укажите объёмы вручную.");
      return;
    }
    setForm((current) => ({
      ...current,
      workOutputs: current.workOutputs.map((output) => output.scheduleItemId && quantityByScheduleId.has(output.scheduleItemId)
        ? { ...output, quantity: quantityByScheduleId.get(output.scheduleItemId)! }
        : output)
    }));
    setPhotoNotice(`AI-черновик подставлен в ${quantityByScheduleId.size} ${quantityByScheduleId.size === 1 ? "работу" : "работы"}. Проверьте объёмы перед сохранением факта.`);
  }

  async function saveReport() {
    setBusy("daily-save");
    setError("");
    try {
      if (photosPreparing) throw new Error("Дождитесь завершения подготовки фотографий.");
      if (photosRejected) throw new Error("Удалите неподдерживаемые фото из очереди перед сохранением факта.");
      if (editingId && uploadablePhotos.length) {
        const uploadResult = await persistEvidence(uploadablePhotos);
        reflectEvidenceUpload(uploadResult);
        if (uploadResult.failureMessages.length) throw new Error("Не все фото прикреплены. Повторите загрузку или удалите проблемные файлы из очереди.");
      }
      const workOutputs = selectedCrew.length
        ? applyDailyReportCrewAssignments(form.workOutputs, selectedCrew, form.shiftHours ?? 8)
        : form.workOutputs;
      const completedWorks = form.phase === "closed"
        ? dailyReportCompletedWorksFromOutputs(workOutputs) || "Работы не выполнялись"
        : form.completedWorks;
      const response = await fetch(editingId ? `/api/daily-reports/${editingId}` : `/api/projects/${projectId}/daily-reports`, {
        method: editingId ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...form, completedWorks, workOutputs })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сохранить рапорт."));
      await response.json();
      await loadDailyReports();
      clearPendingPhotos();
      setFormOpen(false);
      setEditingId(null);
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Не удалось сохранить рапорт.");
    } finally {
      setBusy("");
    }
  }

  async function transitionReport(item: DailyReport, status: DailyReport["status"]) {
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось изменить статус рапорта."));
      const body = (await response.json()) as ReportMutationResponse;
      if (body.progress?.scheduleItems.length) onScheduleItemsChange?.(body.progress.scheduleItems);
      await loadDailyReports();
    } catch (transitionError) {
      setError(transitionError instanceof Error ? transitionError.message : "Не удалось изменить статус рапорта.");
    } finally {
      setBusy("");
    }
  }

  async function synchronizeReportProgress(item: DailyReport) {
    if (!window.confirm("Учесть объёмы этого ранее утверждённого рапорта в графике? Действие не продублируется при повторном запуске.")) return;
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ applyProgress: true })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось учесть факт рапорта в графике."));
      const body = (await response.json()) as ReportMutationResponse;
      if (body.progress?.scheduleItems.length) onScheduleItemsChange?.(body.progress.scheduleItems);
      await loadDailyReports();
    } catch (progressError) {
      setError(progressError instanceof Error ? progressError.message : "Не удалось учесть факт рапорта в графике.");
    } finally {
      setBusy("");
    }
  }

  async function reopenReport(item: DailyReport) {
    if (correctionReason.trim().length < 5) return;
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ status: "draft", correctionReason })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось вернуть рапорт на доработку."));
      const body = (await response.json()) as ReportMutationResponse;
      if (body.progress?.scheduleItems.length) onScheduleItemsChange?.(body.progress.scheduleItems);
      setCorrectionReportId(null);
      setCorrectionReason("");
      await loadDailyReports();
    } catch (correctionError) {
      setError(correctionError instanceof Error ? correctionError.message : "Не удалось вернуть рапорт на доработку.");
    } finally {
      setBusy("");
    }
  }

  async function removeReport(item: DailyReport) {
    if (!window.confirm(`Удалить черновик рапорта за ${item.date}?`)) return;
    setBusy(`daily-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/daily-reports/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить рапорт."));
      onReportsChange(reports.filter((current) => current.id !== item.id));
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить рапорт.");
    } finally {
      setBusy("");
    }
  }

  async function createExecutiveReport() {
    setBusy("executive-create");
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reportDate: new Date().toISOString().slice(0, 10) })
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось сформировать отчет."));
      const body = (await response.json()) as { item: SerializedExecutiveReport };
      setExecutiveReports((items) => [body.item, ...items]);
      setSelectedExecutiveId(body.item.id);
      setPublishConfirmed(false);
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "Не удалось сформировать отчет.");
    } finally {
      setBusy("");
    }
  }

  async function updateExecutiveReport(item: SerializedExecutiveReport, payload: { status: "published" | "archived"; publishConfirmed?: boolean }) {
    setBusy(`executive-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports/${item.id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload)
      });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось обновить отчет."));
      const body = (await response.json()) as { item: SerializedExecutiveReport };
      setExecutiveReports((items) => items.map((current) => (current.id === item.id ? body.item : current)));
      setPublishConfirmed(false);
    } catch (updateError) {
      setError(updateError instanceof Error ? updateError.message : "Не удалось обновить отчет.");
    } finally {
      setBusy("");
    }
  }

  async function removeExecutiveDraft(item: SerializedExecutiveReport) {
    if (!window.confirm(`Удалить черновик отчета v${item.version}?`)) return;
    setBusy(`executive-${item.id}`);
    setError("");
    try {
      const response = await fetch(`/api/projects/${projectId}/executive-reports/${item.id}`, { method: "DELETE" });
      if (!response.ok) throw new Error(await responseError(response, "Не удалось удалить отчет."));
      setExecutiveReports((items) => items.filter((current) => current.id !== item.id));
      setSelectedExecutiveId(null);
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "Не удалось удалить отчет.");
    } finally {
      setBusy("");
    }
  }

  async function copyExecutiveReport() {
    if (!selectedExecutive) return;
    try {
      await navigator.clipboard.writeText(selectedExecutive.content.copyText);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1600);
    } catch {
      setError("Не удалось скопировать отчет. Используйте скачивание TXT.");
    }
  }

  return (
    <section className="reports-workflow" aria-label="Reports Workflow v2">
      {error ? <div className="form-error" role="alert">{error}</div> : null}
      {dailyReportsError ? <div className="form-error" role="alert">{dailyReportsError}</div> : null}

      <div className="reports-workflow-heading">
        <div>
          <div className="eyebrow">Смена и рапорт прораба</div>
          <h3>План дня → состав → факт → фото</h3>
          <p className="muted">Утром откройте смену и выберите людей. В конце дня внесите объёмы и фото. После утверждения связанные объёмы автоматически обновят график и сводку площадки.</p>
        </div>
        <div className="form-actions">
          <button className="button secondary" disabled={busy === "daily-load"} type="button" onClick={() => void loadDailyReports()}>
            <RefreshCw className={busy === "daily-load" ? "spin" : ""} size={17} /> {busy === "daily-load" ? "Обновляю..." : "Обновить"}
          </button>
          {canEdit ? (
            <button className="button primary" type="button" onClick={openNewReport}>
              <Plus size={17} /> Открыть смену
            </button>
          ) : null}
        </div>
      </div>

      {formOpen ? (
        <div className="daily-report-editor">
          <div className="reports-workflow-heading compact">
            <div>
              <strong>{editingId ? form.phase === "closed" ? "Фактическое закрытие смены" : "Заявка на смену" : "Новая заявка на смену"}</strong>
              <span>{form.phase === "open" ? "План, несколько видов работ и персональный состав." : "Отдельный объём по каждой работе, события и фотофиксация."}</span>
            </div>
            <button aria-label="Закрыть форму рапорта" className="icon-button" type="button" title="Закрыть" onClick={closeReportForm}><X size={18} /></button>
          </div>
          <div className="daily-shift-steps" aria-label="Этап смены">
            <span className="active"><strong>1</strong> План и люди</span>
            <span className={form.phase === "closed" ? "active" : ""}><strong>2</strong> Факт и фото</span>
            <span><strong>3</strong> Проверка</span>
          </div>
          <div className="daily-report-form-grid">
            <label>Дата<input type="date" value={form.date} onChange={(event) => setForm({ ...form, date: event.target.value })} /></label>
            <label>Автор <span aria-hidden="true">*</span><input aria-invalid={!form.author.trim()} required value={form.author} onChange={(event) => setForm({ ...form, author: event.target.value })} /></label>
            <div className="daily-report-field daily-work-scopes-field">
              <label htmlFor="daily-work-category">Укрупнённые виды работ <span aria-hidden="true">*</span></label>
              <div className="daily-work-category-control">
                <input
                  aria-invalid={!form.workScopes.length}
                  id="daily-work-category"
                  list={`daily-work-category-options-${projectId}`}
                  maxLength={240}
                  placeholder="Введите свой вид работ"
                  value={workDraft}
                  onChange={(event) => setWorkDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    event.preventDefault();
                    addManualWork();
                  }}
                />
                <button aria-label="Добавить введённый вид работ" className="button secondary daily-add-work-button" disabled={workDraft.trim().length < 2 || form.workScopes.length >= 20} title="Добавить вид работ" type="button" onClick={addManualWork}><Plus size={16} /> Добавить</button>
                <ScheduleWorkPicker
                  items={scheduleItems}
                  selectedScopes={form.workScopes}
                  shiftDate={form.date}
                  onToggle={toggleScheduleWork}
                />
                <datalist id={`daily-work-category-options-${projectId}`}>
                  {Array.from(new Set([...scheduleItems.map((item) => item.name), ...workCategories])).map((category) => <option key={category} value={category} />)}
                </datalist>
              </div>
              {form.workScopes.length ? (
                <div className="daily-work-scope-list" role="list" aria-label="Выбранные виды работ">
                  {form.workScopes.map((scope) => {
                    const scheduleItem = scope.scheduleItemId ? scheduleItems.find((item) => item.id === scope.scheduleItemId) : null;
                    return (
                      <div key={dailyReportWorkScopeKey(scope)} role="listitem">
                        <span>
                          <strong>{scope.workName}</strong>
                          <small>{scheduleItem ? `График · ${scheduleDateLabel(scheduleItem)}` : "Добавлено вручную"}</small>
                        </span>
                        <button aria-label={`Убрать вид работ: ${scope.workName}`} className="icon-button" title="Убрать вид работ" type="button" onClick={() => removeWorkScope(scope)}><X size={15} /></button>
                      </div>
                    );
                  })}
                </div>
              ) : <div className="daily-work-scope-empty">Добавьте одну или несколько работ. При закрытии смены они станут отдельными строками факта.</div>}
              <small>Можно сочетать позиции графика и свои работы, до 20 позиций в одном рапорте.</small>
            </div>
            <label>Погода<input value={form.weather} onChange={(event) => setForm({ ...form, weather: event.target.value })} placeholder="Температура, осадки, ветер" /></label>
            <label className="wide">План работ на смену <span aria-hidden="true">*</span><textarea aria-invalid={!form.plannedWorks.trim()} rows={2} value={form.plannedWorks} onChange={(event) => setForm({ ...form, plannedWorks: event.target.value })} placeholder="Что должно быть выполнено к концу дня" /></label>
            <label className="wide">Техника<input value={form.equipment} onChange={(event) => setForm({ ...form, equipment: event.target.value })} placeholder="Наименование и количество" /></label>
          </div>

          <section className="daily-crew-picker" aria-label="Состав смены">
            <div className="daily-crew-heading"><span><Users size={18} /><strong>Кто работает</strong></span><small>{selectedHeadcount ? `${selectedHeadcount} чел.` : "Состав не выбран"}</small></div>
            {workforceLoaded && workforce.length ? (
              <>
                <div className="daily-crew-tools">
                  <label><Search size={15} /><input aria-label="Поиск сотрудника" value={crewSearch} onChange={(event) => setCrewSearch(event.target.value)} placeholder="Найти по ФИО или профессии" /></label>
                  <button className="button secondary compact-button" disabled={!visibleWorkforce.length} type="button" onClick={selectVisibleCrew}>Выбрать видимых</button>
                  <button className="button secondary compact-button" disabled={!form.crewResourceIds.length} type="button" onClick={clearCrew}>Очистить</button>
                </div>
                {visibleWorkforce.length ? (
                  <div className="daily-crew-grid">
                    {visibleWorkforce.map((item) => (
                      <label className={form.crewResourceIds.includes(item.resourceId) ? "selected" : ""} key={item.resourceId}>
                        <input checked={form.crewResourceIds.includes(item.resourceId)} type="checkbox" onChange={() => toggleCrew(item.resourceId)} />
                        <span><strong>{item.name}</strong><small>{item.profession || (item.kind === "engineer" ? "ИТР" : "Рабочий")}{item.headcount > 1 ? ` · ${item.headcount} чел.` : ""}</small></span>
                      </label>
                    ))}
                  </div>
                ) : <div className="daily-crew-empty"><p>По этому запросу сотрудников нет.</p></div>}
              </>
            ) : workforceLoaded ? (
              <div className="daily-crew-empty">
                <p>Сотрудники ещё не назначены на проект. Создайте и согласуйте заявку в «ФОТ» → «Заявки на допуск», импортируйте Excel-реестр или укажите численность вручную.</p>
                <div><label>Рабочие<input min="0" type="number" value={form.workers} onChange={(event) => updateManualCrew("workers", Number(event.target.value))} /></label><label>ИТР<input min="0" type="number" value={form.engineers} onChange={(event) => updateManualCrew("engineers", Number(event.target.value))} /></label></div>
              </div>
            ) : <div className="reports-empty">Загружаю состав проекта...</div>}
          </section>

          {form.phase === "closed" ? (
            <>
              {form.workScopes.length ? <p className="daily-work-output-plan-note"><strong>{form.workScopes.length} {form.workScopes.length === 1 ? "работа перенесена" : "работы перенесены"} из плана.</strong> Укажите объём и распределите выбранных утром работников. Профессии, единицы и 8-часовая смена уже подставлены.</p> : null}
              <DailyReportWorkOutputEditor
                crewHeadcount={selectedWorkerHeadcount}
                crewMembers={selectedCrew}
                outputs={form.workOutputs}
                scheduleItems={scheduleItems}
                scheduleUnits={scheduleUnits}
                shiftHours={form.shiftHours ?? 8}
                onChange={(workOutputs) => setForm((current) => ({ ...current, workOutputs }))}
                onShiftHoursChange={(shiftHours) => setForm((current) => ({
                  ...current,
                  shiftHours,
                  workOutputs: selectedCrew.length
                    ? applyDailyReportCrewAssignments(current.workOutputs, selectedCrew, shiftHours)
                    : allocateDailyReportLabor(current.workOutputs, current.workers, shiftHours, true)
                }))}
              />
              <details className="daily-closeout-extra">
                <summary><span><ChevronDown size={16} /><strong>Материалы, простои и замечания</strong></span><small>Заполняйте только при наличии событий</small></summary>
                <div className="daily-report-form-grid daily-fact-grid">
                  <label>Материалы получены<textarea rows={2} value={form.materialsReceived} onChange={(event) => setForm({ ...form, materialsReceived: event.target.value })} /></label>
                  <label>Материалы израсходованы<textarea rows={2} value={form.materialsConsumed} onChange={(event) => setForm({ ...form, materialsConsumed: event.target.value })} /></label>
                  <label>Простои<textarea rows={2} value={form.downtime} onChange={(event) => setForm({ ...form, downtime: event.target.value })} /></label>
                  <label>Проблемы / замечания<textarea rows={2} value={form.issues} onChange={(event) => setForm({ ...form, issues: event.target.value })} /></label>
                </div>
              </details>
              {editingId ? (
                <section className="daily-photo-workspace" aria-label="Фото смены и AI-анализ">
                  <div className="daily-crew-heading"><span><Camera size={18} /><strong>Фото факта</strong></span><small>Оптимизация перед загрузкой · до {REPORT_PHOTO_MAX_FILES} фото</small></div>
                  <div className="daily-photo-upload">
                    <label className={`button secondary${photoControlsBusy || photosPreparing ? " disabled" : ""}`}><Images size={16} /> Добавить фото<input accept="image/jpeg,image/png,image/webp" disabled={photoControlsBusy || photosPreparing} multiple type="file" onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      event.currentTarget.value = "";
                      void selectPhotoFiles(files);
                    }} /></label>
                    <span>{pendingPhotos.length ? `В очереди: ${pendingPhotos.length}` : "Крупные снимки будут автоматически облегчены"}</span>
                    <button className="button secondary" disabled={!uploadablePhotos.length || photosPreparing || photoControlsBusy} type="button" onClick={() => void uploadEvidence()}>{busy === "photo-upload" ? "Загружаю..." : `Прикрепить${uploadablePhotos.length ? ` · ${uploadablePhotos.length}` : ""}`}</button>
                  </div>
                  {pendingPhotos.length ? (
                    <div className="daily-photo-upload-queue" aria-label="Очередь загрузки фото" aria-live="polite">
                      {pendingPhotos.map((photo) => (
                        <article className={`state-${photo.status}`} key={photo.id}>
                          {photo.previewUrl ? <Image alt="" height={72} loading="lazy" src={photo.previewUrl} unoptimized width={96} /> : <span className="daily-photo-placeholder"><Camera size={18} /></span>}
                          <div>
                            <strong>{photo.file.name}</strong>
                            <small>{photo.status === "preparing"
                              ? "Подготавливаю без блокировки формы..."
                              : photo.status === "uploading"
                                ? `Загрузка: ${photo.progress}%`
                                : photo.status === "failed" || photo.status === "rejected"
                                  ? photo.error
                                  : photo.optimized
                                    ? `${formatReportPhotoBytes(photo.originalSize)} → ${formatReportPhotoBytes(photo.file.size)}`
                                    : formatReportPhotoBytes(photo.file.size)}</small>
                            {photo.status === "uploading" ? <progress max={100} value={photo.progress}>{photo.progress}%</progress> : null}
                          </div>
                          <button aria-label={`Убрать ${photo.file.name} из очереди`} className="icon-button" disabled={photo.status === "uploading"} title="Убрать из очереди" type="button" onClick={() => removePendingPhoto(photo.id)}><X size={15} /></button>
                        </article>
                      ))}
                    </div>
                  ) : null}
                  {availableProjectPhotos.length ? (
                    <details className="daily-existing-photo-picker">
                      <summary><Images size={16} /><span>Прикрепить из документов</span><b>{availableProjectPhotos.length}</b><ChevronDown size={15} /></summary>
                      <div className="daily-existing-photo-panel">
                        <p>Здесь показаны ещё не связанные с рапортами фото проекта. Выберите нужные, повторно загружать файлы не придётся.</p>
                        <div className="daily-photo-grid daily-existing-photo-grid">
                          {visibleProjectPhotos.map((document) => {
                            const selected = selectedExistingPhotoIds.includes(document.id);
                            return (
                              <label className={selected ? "selected" : ""} key={document.id}>
                                <input checked={selected} type="checkbox" onChange={() => setSelectedExistingPhotoIds((current) => current.includes(document.id) ? current.filter((id) => id !== document.id) : [...current, document.id])} />
                                <Image alt={document.title} height={150} loading="lazy" src={`/api/projects/${projectId}/documents/${document.id}/download?inline=1&v=${document.version}`} unoptimized width={200} />
                                <span>{document.title}</span>
                              </label>
                            );
                          })}
                        </div>
                        {availableProjectPhotos.length > visibleProjectPhotos.length ? <p className="form-hint">Показаны последние {visibleProjectPhotos.length} фото. Остальные доступны в разделе «Документы».</p> : null}
                        <div className="form-actions">
                          <span className="muted">Выбрано: {selectedExistingPhotoIds.length}</span>
                          <button className="button secondary compact-button" disabled={!selectedExistingPhotoIds.length || busy === "photo-link"} type="button" onClick={() => void attachExistingEvidence()}>{busy === "photo-link" ? "Прикрепляю..." : "Добавить в рапорт"}</button>
                        </div>
                      </div>
                    </details>
                  ) : null}
                  {photoNotice ? <div className="daily-photo-notice" role="status">{photoNotice}</div> : null}
                  {evidence.length ? (
                    <div className="daily-photo-grid">
                      {evidence.map((document) => (
                        <label className={selectedPhotoIds.includes(document.id) ? "selected" : ""} key={document.id}>
                          <input checked={selectedPhotoIds.includes(document.id)} disabled={!selectedPhotoIds.includes(document.id) && selectedPhotoIds.length >= 4} type="checkbox" onChange={() => togglePhoto(document.id)} />
                          <Image alt={document.title} height={240} loading="lazy" src={`/api/projects/${projectId}/documents/${document.id}/download?inline=1&v=${document.version}`} unoptimized width={320} />
                          <span>{document.title}</span>
                        </label>
                      ))}
                    </div>
                  ) : <p className="muted">Прикрепите фото: они останутся доказательством факта и станут доступны для AI-анализа.</p>}
                  <section className="daily-photo-volume-tool" aria-label="AI-оценка объёмов по фото">
                    <div>
                      <span><Sparkles size={17} /><strong>Определить объёмы по фото</strong><b>AI-черновик</b></span>
                      <p>AI сопоставит выбранные фото с работами из графика. Результат не изменит рапорт, пока вы явно не подставите и не сохраните его.</p>
                    </div>
                    <button className="button primary" disabled={(!selectedPhotoIds.length && !uploadablePhotos.length) || photosPreparing || photoControlsBusy || !form.workOutputs.some((output) => output.scheduleItemId)} type="button" onClick={() => void estimateVolumesFromPhotos()}><Sparkles size={16} /> {busy === "photo-volume" ? "Оцениваю объёмы..." : uploadablePhotos.length ? "Загрузить и оценить" : "Оценить объёмы"}</button>
                    {photoVolumeResult ? (
                      <div className="daily-photo-volume-result" role="status">
                        <p>{photoVolumeResult.summary}</p>
                        <div>
                          {photoVolumeResult.suggestions.map((suggestion) => (
                            <article className={suggestion.suggestedQuantity === null ? "needs-measurement" : "has-suggestion"} key={suggestion.scheduleItemId}>
                              <span><strong>{suggestion.workName}</strong><small>{suggestion.basis}</small></span>
                              <span><b>{suggestion.suggestedQuantity === null ? "Нужен замер" : `${suggestion.suggestedQuantity.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ${suggestion.unit}`}</b><small>Уверенность: {suggestion.confidence === "high" ? "высокая" : suggestion.confidence === "medium" ? "средняя" : "низкая"}</small></span>
                            </article>
                          ))}
                        </div>
                        {photoVolumeResult.limitations.length ? <small>Ограничения: {photoVolumeResult.limitations.join(" ")}</small> : null}
                        <button className="button secondary" disabled={!photoVolumeResult.suggestions.some((item) => item.suggestedQuantity !== null && item.confidence !== "low" && !item.needsManualMeasurement)} type="button" onClick={applyPhotoVolumeSuggestions}><Check size={16} /> Подставить проверяемые объёмы</button>
                      </div>
                    ) : null}
                  </section>
                  <div className="daily-photo-ai-prompt">
                    <strong className="daily-photo-ai-title"><Bot size={17} /> Отдельный вопрос по фото</strong>
                    <div className="daily-photo-ai-presets" aria-label="Быстрые вопросы по фото">
                      {["Есть ли видимые дефекты?", "Что проверить перед приёмкой?", "Есть ли риски по качеству?"].map((question) => <button className="button secondary compact-button" key={question} type="button" onClick={() => setPhotoQuestion(question)}>{question}</button>)}
                    </div>
                    <div className="daily-photo-question">
                      <label>Вопрос по фото<textarea rows={2} value={photoQuestion} onChange={(event) => setPhotoQuestion(event.target.value)} placeholder="Что нужно проверить на этих фотографиях?" /></label>
                      <button className="button primary" disabled={(!selectedPhotoIds.length && !uploadablePhotos.length) || photosPreparing || photoQuestion.trim().length < 3 || photoControlsBusy} type="button" onClick={() => void askAboutPhotos()}><Bot size={17} /> {busy === "photo-ai" ? "Анализирую..." : uploadablePhotos.length ? "Загрузить и спросить AI" : "Спросить AI"}</button>
                    </div>
                    <p className="form-hint" role="status">{!selectedPhotoIds.length && !uploadablePhotos.length
                      ? "Добавьте хотя бы одно фото."
                      : photoQuestion.trim().length < 3
                        ? "Выберите быстрый вопрос или напишите свой."
                        : `К анализу готово фото: ${Math.min(4, selectedPhotoIds.length + uploadablePhotos.length)}.`}</p>
                  </div>
                  {photoAnswer ? (
                    <div className="daily-photo-answer" role="status">
                      <div><strong>Ответ</strong><span className={`badge ${photoAnswer.confidence === "high" ? "green" : photoAnswer.confidence === "medium" ? "yellow" : "gray"}`}>Уверенность: {photoAnswer.confidence}</span></div>
                      <p>{photoAnswer.answer}</p>
                      {photoAnswer.observations.length ? <section><strong>Наблюдения</strong><ul>{photoAnswer.observations.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                      {photoAnswer.risks.length ? <section><strong>Риски</strong><ul>{photoAnswer.risks.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                      {photoAnswer.recommendedActions.length ? <section><strong>Что сделать</strong><ul>{photoAnswer.recommendedActions.map((item) => <li key={item}>{item}</li>)}</ul></section> : null}
                      {photoAnswer.limitations.length ? <small>Ограничения: {photoAnswer.limitations.join(" ")}</small> : null}
                    </div>
                  ) : null}
                </section>
              ) : <p className="form-hint">Сначала сохраните заявку на смену. После этого в форме факта появится загрузка фото.</p>}
            </>
          ) : null}
          {missingRequiredFields.length ? <p className="form-hint" role="status">Для сохранения заполните: {missingRequiredFields.join(", ")}.</p> : null}
          <div className="form-actions">
            <button className="button primary" disabled={busy === "daily-save" || photoOperationBusy || photosPreparing || photosRejected || missingRequiredFields.length > 0} type="button" onClick={() => void saveReport()}>
              <Save size={17} /> {busy === "daily-save" ? "Сохраняю..." : form.phase === "open" ? "Открыть смену" : "Сохранить факт"}
            </button>
            <button className="button secondary" type="button" onClick={closeReportForm}>Отмена</button>
          </div>
        </div>
      ) : null}

      <div className="daily-report-list">
        {!dailyReportsLoaded && busy === "daily-load" ? <div className="reports-empty">Загружаю рапорты со стройплощадки...</div> : sortedReports.length ? sortedReports.map((item) => (
          <article className="daily-report-row" key={item.id}>
            <div className="daily-report-row-main">
              <div><strong>{new Date(item.date).toLocaleDateString("ru-RU")} · {dailyReportWorkScopeLabel(item.workScopes, item.workCategory || "Смена")}</strong><span>{item.author} · {item.workers} рабочих / {item.engineers} ИТР</span></div>
              <div className="daily-report-badges"><span className={`badge ${(item.phase ?? "closed") === "open" ? "blue" : "gray"}`}>{(item.phase ?? "closed") === "open" ? "Смена открыта" : "Факт внесён"}</span><span className={`badge ${tone(item.status)}`}>{dailyReportStatusLabel(item.status)}</span></div>
            </div>
            <p>{(item.phase ?? "closed") === "open" ? item.plannedWorks || "План смены не заполнен" : item.completedWorks || "Выполненные работы не заполнены"}</p>
            <small>{item.weather || "Погода не указана"} · {item.equipment || "Техника не указана"}</small>
            {parseDailyReportWorkScopes(item.workScopes, item.workCategory).length > 1 ? <div className="daily-report-work-scope-summary">{parseDailyReportWorkScopes(item.workScopes, item.workCategory).map((scope) => <span key={dailyReportWorkScopeKey(scope)}>{scope.workName}</span>)}</div> : null}
            {item.crewMembers?.length ? <div className="daily-report-crew-summary">{item.crewMembers.map((member) => <span key={member.resourceId}>{member.name}</span>)}</div> : null}
            {item.evidenceDocuments?.length ? <ReportEvidenceGallery documents={item.evidenceDocuments} projectId={projectId} /> : null}
            {item.workOutputs?.length ? (
              <div className="daily-report-output-summary">
                {item.workOutputs.map((output, index) => {
                  const actual = dailyReportWorkOutputNorm(output);
                  const allocation = dailyReportWorkOutputAllocation(output, item.shiftHours ?? 8);
                  const assignedNames = (item.crewMembers ?? [])
                    .filter((member) => output.crewResourceIds?.includes(member.resourceId))
                    .map((member) => member.name);
                  return (
                    <span key={`${output.profession}-${output.workName}-${index}`}>
                      <strong>{output.workName}</strong>
                      {output.quantity.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} {output.unit}
                      {` · ${allocation.workerCount} чел. × ${allocation.hoursPerWorker.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ч = ${output.laborHours.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} чел.-ч`}
                      {assignedNames.length ? ` · ${assignedNames.join(", ")}` : ` · ${output.profession}`}
                      {actual ? ` · ${actual.norm.toLocaleString("ru-RU", { maximumFractionDigits: 3 })} ${actual.unit}` : ""}
                    </span>
                  );
                })}
              </div>
            ) : null}
            {item.status === "approved" && item.workOutputs?.some((output) => output.scheduleItemId) ? (
              <div className={`daily-report-progress-impact ${item.progressImpact?.applied ? "is-applied" : "is-pending"}`}>
                <span>{item.progressImpact?.historicalEntries
                  ? "Факт учтён в предыдущей редакции графика. Верните рапорт на доработку и привяжите работы к текущему графику."
                  : item.progressImpact?.applied
                  ? `Учтено в графике · ${item.progressImpact.scheduleItems} работ`
                  : item.progressImpact
                    ? "Факт ещё не учтён в графике"
                    : "Проверяем связь с графиком..."}</span>
                {item.progressImpact && !item.progressImpact.applied && !item.progressImpact.historicalEntries && canApprove ? <button className="button secondary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void synchronizeReportProgress(item)}>Учесть в графике</button> : null}
              </div>
            ) : null}
            {item.issues || item.downtime ? <div className="daily-report-alert">{item.issues || item.downtime}</div> : null}
            <div className="daily-report-actions">
              {item.status === "draft" && (item.phase ?? "closed") === "open" && canEdit ? <button className="button primary compact-button" type="button" onClick={() => openEditReport(item, true)}><Pencil size={15} /> Внести факт</button> : null}
              {item.status === "draft" && (item.phase ?? "closed") === "closed" && canEdit ? <button className="button secondary compact-button" type="button" onClick={() => openEditReport(item)}><Pencil size={15} /> Редактировать</button> : null}
              {item.status === "draft" && (item.phase ?? "closed") === "closed" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "submitted")}><Send size={15} /> Отправить</button> : null}
              {item.status === "submitted" && canEdit ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "checked")}><Check size={15} /> Проверить</button> : null}
              {item.status === "checked" && canApprove ? <button className="button primary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => void transitionReport(item, "approved")}><ShieldCheck size={15} /> Утвердить</button> : null}
              {item.status === "approved" && canApprove ? <button className="button secondary compact-button" disabled={busy === `daily-${item.id}`} type="button" onClick={() => { setCorrectionReportId(item.id); setCorrectionReason(""); }}><RotateCcw size={15} /> Исправить</button> : null}
              {item.status === "draft" && canApprove ? <button className="icon-button danger" type="button" title="Удалить черновик" onClick={() => void removeReport(item)}><Trash2 size={16} /></button> : null}
            </div>
            {correctionReportId === item.id ? (
              <div className="daily-report-correction">
                <label>Причина исправления<input autoFocus maxLength={300} placeholder="Например: уточнить объём и заменить фото" value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} /></label>
                <p>Рапорт вернётся в черновик. Учтённые им объёмы будут вычтены из графика; после правки рапорт нужно согласовать заново.</p>
                <div className="form-actions">
                  <button className="button primary compact-button" disabled={correctionReason.trim().length < 5 || busy === `daily-${item.id}`} type="button" onClick={() => void reopenReport(item)}>Вернуть на доработку</button>
                  <button className="button secondary compact-button" type="button" onClick={() => { setCorrectionReportId(null); setCorrectionReason(""); }}>Отмена</button>
                </div>
              </div>
            ) : null}
          </article>
        )) : <div className="reports-empty">Рапортов пока нет. Первый рапорт создаётся только после заполнения и сохранения формы.</div>}
      </div>

      <div className="reports-workflow-heading executive-heading">
        <div>
          <div className="eyebrow">Версионная управленческая отчетность</div>
          <h3>Управленческие отчеты</h3>
          <p className="muted">Каждый выпуск сохраняет собственную версию и снимок источников. Формирование выполняется только по явной команде, опубликованная версия неизменяема.</p>
        </div>
        {canEdit ? <button className="button primary" disabled={busy === "executive-create"} type="button" onClick={() => void createExecutiveReport()}><FilePlus2 size={17} /> {busy === "executive-create" ? "Формирую..." : "Сформировать версию"}</button> : null}
      </div>

      {!currentUser?.authenticated && executiveLoaded ? <div className="reports-empty">Войдите в систему, чтобы открыть историю управленческих отчетов.</div> : null}
      {currentUser?.authenticated && executiveLoaded && !executiveReports.length ? <div className="reports-empty">Сохранённых версий пока нет. Формирование выполняется только по явной команде.</div> : null}

      {executiveReports.length ? (
        <div className="executive-report-workflow-layout">
          <div className="executive-report-history" role="tablist" aria-label="Версии управленческого отчета">
            {executiveReports.map((item) => (
              <button className={item.id === selectedExecutive?.id ? "active" : ""} key={item.id} type="button" onClick={() => { setSelectedExecutiveId(item.id); setPublishConfirmed(false); }}>
                <strong>v{item.version} · {item.reportDate}</strong>
                <span>{item.title}</span>
                <small className={`badge ${tone(item.status)}`}>{item.status}</small>
              </button>
            ))}
          </div>

          {selectedExecutive ? (
            <article className="executive-report-version">
              <div className="reports-workflow-heading compact">
                <div>
                  <strong>{selectedExecutive.title}</strong>
                  <span>v{selectedExecutive.version} · readiness: {selectedExecutive.content.reportReadiness}</span>
                </div>
                <span className={`badge ${tone(selectedExecutive.status)}`}>{selectedExecutive.status}</span>
              </div>
              <div className="executive-report-sections compact-sections">
                {selectedExecutive.content.sections.map((section) => <div key={section.title}><strong>{section.title}</strong><p>{section.text}</p></div>)}
              </div>
              {selectedExecutive.status === "draft" && canApprove && ["blocked", "no_data"].includes(selectedExecutive.content.reportReadiness) ? (
                <label className="report-publish-confirm"><input checked={publishConfirmed} type="checkbox" onChange={(event) => setPublishConfirmed(event.target.checked)} /> Подтверждаю выпуск отчёта с неполными или блокирующими данными</label>
              ) : null}
              <div className="form-actions">
                <button className="button secondary compact-button" type="button" onClick={() => void copyExecutiveReport()}><ClipboardCopy size={15} /> {copied ? "Скопировано" : "Копировать"}</button>
                <a className="button secondary compact-button" href={`/api/projects/${projectId}/executive-reports/${selectedExecutive.id}/export`}><FileDown size={15} /> Скачать TXT</a>
                {selectedExecutive.status === "draft" && canApprove ? <button className="button primary compact-button" disabled={busy === `executive-${selectedExecutive.id}` || (["blocked", "no_data"].includes(selectedExecutive.content.reportReadiness) && !publishConfirmed)} type="button" onClick={() => void updateExecutiveReport(selectedExecutive, { status: "published", publishConfirmed })}><ShieldCheck size={15} /> Опубликовать</button> : null}
                {selectedExecutive.status === "published" && canApprove ? <button className="button secondary compact-button" type="button" onClick={() => void updateExecutiveReport(selectedExecutive, { status: "archived" })}>В архив</button> : null}
                {selectedExecutive.status === "draft" && canApprove ? <button className="icon-button danger" type="button" title="Удалить черновик" onClick={() => void removeExecutiveDraft(selectedExecutive)}><Trash2 size={16} /></button> : null}
              </div>
            </article>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
