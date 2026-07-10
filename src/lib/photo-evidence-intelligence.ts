import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type EvidenceTone = "good" | "warn" | "bad" | "info" | "neutral";
export type EvidenceStatus = "no_evidence" | "needs_capture" | "blocked" | "partial" | "ready_for_review";
export type EvidenceTarget = "Рапорты" | "Документы" | "КС" | "График" | "Материалы" | "Риски";

export type EvidenceSummary = {
  status: EvidenceStatus;
  tone: EvidenceTone;
  headline: string;
  nextStep: string;
  evidenceDocuments: number;
  photoDocuments: number;
  reportEvidence: number;
  linkedScheduleItems: number;
  ksBlockers: number;
  missingEvidenceItems: number;
};

export type EvidenceItem = {
  id: string;
  title: string;
  category: "photo" | "report" | "document" | "checklist" | "schedule";
  tone: EvidenceTone;
  source: string;
  linkedTo: string;
  status: "present" | "missing" | "needs_review";
  nextAction: string;
};

export type EvidenceAction = {
  title: string;
  detail: string;
  priority: "low" | "medium" | "high";
  targetTab: EvidenceTarget;
};

export type EvidenceHandoff = {
  title: string;
  copyText: string;
};

export type PhotoEvidenceInput = {
  project?: Partial<Project> | null;
  budgetItems?: BudgetItem[] | null;
  scheduleItems?: ScheduleItem[] | null;
  materials?: Material[] | null;
  procurementRequests?: ProcurementRequest[] | null;
  payments?: Payment[] | null;
  dailyReports?: DailyReport[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
};

export type PhotoEvidenceModel = {
  summary: EvidenceSummary;
  items: EvidenceItem[];
  actions: EvidenceAction[];
  handoff: EvidenceHandoff;
  limitations: string[];
};

function normalize(value: string | undefined | null) {
  return (value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function readableDate(value: string | undefined) {
  if (!value) return "нет даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function isPhotoDocument(document: ProjectDocument) {
  const text = normalize(`${document.category} ${document.title} ${document.fileName ?? ""} ${document.mimeType ?? ""}`);
  return /фото|photo|jpg|jpeg|png|webp|image|фиксац|скрыт/.test(text);
}

function isEvidenceDocument(document: ProjectDocument) {
  const text = normalize(`${document.category} ${document.title} ${document.fileName ?? ""} ${document.mimeType ?? ""}`);
  return isPhotoDocument(document) || /исполн|акт|кс|журнал|рапорт|схем|сертифик|паспорт|evidence/.test(text);
}

function needsEvidence(schedule: ScheduleItem) {
  const text = normalize(schedule.name);
  return schedule.actualQty > 0 || schedule.status === "done" || /скрыт|монолит|бетон|армат|сети|кабель|испытан|засып|кров|гидро/.test(text);
}

function documentMatchesText(document: ProjectDocument, text: string) {
  const source = normalize(`${document.category} ${document.title} ${document.fileName ?? ""}`);
  const normalized = normalize(text);
  if (!normalized) return false;
  return normalized.split(/\s+/).filter((word) => word.length > 4).some((word) => source.includes(word));
}

function checklistNeedsEvidence(item: DocumentChecklistItem) {
  return item.status !== "present" && /фото|фиксац|исполн|акт|кс|журнал|схем|скрыт/i.test(`${item.title} ${item.suggestedNextStep ?? ""}`);
}

function action(title: string, detail: string, priority: EvidenceAction["priority"], targetTab: EvidenceTarget): EvidenceAction {
  return { title, detail, priority, targetTab };
}

export function buildPhotoEvidenceIntelligence(input: PhotoEvidenceInput): PhotoEvidenceModel {
  const project = input.project ?? {};
  const scheduleItems = input.scheduleItems ?? [];
  const reports = input.dailyReports ?? [];
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];
  const risks = input.risks ?? [];

  const evidenceDocuments = documents.filter(isEvidenceDocument);
  const photoDocuments = documents.filter(isPhotoDocument);
  const reportEvidence = reports.filter((report) => /фото|фиксац|скрыт|акт|журнал|схем/i.test(`${report.completedWorks} ${report.issues}`)).length;
  const scheduleNeedsEvidence = scheduleItems.filter(needsEvidence);
  const checklistMissing = checklist.filter(checklistNeedsEvidence);
  const fieldRisks = risks.filter((risk) => risk.status !== "closed" && /фото|исполн|акт|кс|скрыт|подтвержд/i.test(`${risk.title} ${risk.reason}`));

  const scheduleEvidenceItems: EvidenceItem[] = scheduleNeedsEvidence.slice(0, 8).map((item) => {
    const matched = evidenceDocuments.some((document) => documentMatchesText(document, item.name));
    const missing = !matched && item.actualQty > 0;
    return {
      id: `schedule:${item.id}`,
      title: item.name,
      category: "schedule",
      tone: matched ? "good" : missing ? "warn" : "info",
      source: `График · ${readableDate(item.startsAt)}-${readableDate(item.endsAt)}`,
      linkedTo: "График / КС",
      status: matched ? "present" : missing ? "missing" : "needs_review",
      nextAction: matched ? "Evidence найдено в документах." : "Привязать фото/акт/журнал к выполненному объему."
    };
  });

  const documentEvidenceItems: EvidenceItem[] = evidenceDocuments.slice(0, 8).map((document) => ({
    id: `document:${document.id}`,
    title: document.title || document.fileName || "Evidence document",
    category: isPhotoDocument(document) ? "photo" : "document",
    tone: isPhotoDocument(document) ? "good" : "info",
    source: `${document.category} · v${document.version}`,
    linkedTo: document.previewAvailable ? "Документы / preview" : "Документы",
    status: "present",
    nextAction: "Проверить привязку к работе, КС или замечанию."
  }));

  const checklistItems: EvidenceItem[] = checklistMissing.slice(0, 8).map((item) => ({
    id: `checklist:${item.key}`,
    title: item.title,
    category: "checklist",
    tone: item.status === "missing" ? "bad" : "warn",
    source: "Document checklist",
    linkedTo: "Документы / КС",
    status: "missing",
    nextAction: item.suggestedNextStep
  }));

  const reportItems: EvidenceItem[] = reports.slice(0, 5).map((report) => ({
    id: `report:${report.id}`,
    title: `${readableDate(report.date)} · ${report.author}`,
    category: "report",
    tone: /фото|фиксац|акт|журнал/i.test(`${report.completedWorks} ${report.issues}`) ? "good" : "info",
    source: "Ежедневный рапорт",
    linkedTo: "Площадка",
    status: /фото|фиксац|акт|журнал/i.test(`${report.completedWorks} ${report.issues}`) ? "present" : "needs_review",
    nextAction: report.issues || report.completedWorks || "Заполнить факт и доказательства смены."
  }));

  const items = [...checklistItems, ...scheduleEvidenceItems, ...documentEvidenceItems, ...reportItems].slice(0, 24);
  const missingEvidenceItems = items.filter((item) => item.status === "missing").length;
  const linkedScheduleItems = scheduleEvidenceItems.filter((item) => item.status === "present").length;
  const ksBlockers = checklistMissing.filter((item) => /кс|акт|исполн|скрыт/i.test(`${item.title} ${item.suggestedNextStep}`)).length + scheduleEvidenceItems.filter((item) => item.status === "missing").length;

  const status: EvidenceStatus = !evidenceDocuments.length && !reports.length && !scheduleNeedsEvidence.length
    ? "no_evidence"
    : ksBlockers || fieldRisks.length
      ? "blocked"
      : missingEvidenceItems
        ? "needs_capture"
        : evidenceDocuments.length || reportEvidence
          ? "ready_for_review"
          : "partial";
  const tone: EvidenceTone = status === "ready_for_review" ? "good" : status === "blocked" ? "bad" : status === "no_evidence" ? "info" : "warn";
  const headline = status === "ready_for_review" ? "Evidence готово к проверке" : status === "blocked" ? "Evidence блокирует закрытие" : status === "needs_capture" ? "Нужно добрать доказательства" : status === "partial" ? "Evidence частично собрано" : "Evidence пока не собрано";
  const nextStep = status === "blocked"
    ? "Закрыть missing фото/акты/журналы перед КС или executive package."
    : status === "no_evidence"
      ? "Загрузить фотофиксацию или исполнительный документ через существующий Documents upload."
      : "Проверить привязку evidence к графику, рапортам, КС и замечаниям.";

  const actions: EvidenceAction[] = [
    action("Загрузить evidence", "Использовать существующий Documents upload: фото, акт, журнал или схему.", missingEvidenceItems ? "high" : "medium", "Документы"),
    action("Связать фото с рапортом", "Добавить ссылку/описание фотофиксации в ежедневный рапорт площадки.", reports.length ? "medium" : "high", "Рапорты"),
    action("Проверить КС evidence", `${ksBlockers} потенциальных блокеров доказательств для КС.`, ksBlockers ? "high" : "low", "КС"),
    action("Сверить факт графика", `${scheduleNeedsEvidence.length} работ требуют доказательной проверки.`, scheduleNeedsEvidence.length ? "medium" : "low", "График")
  ];

  const copyText = [
    `Photo & evidence: ${headline}`,
    project.name ? `Проект: ${project.name}` : undefined,
    `Evidence docs: ${evidenceDocuments.length}`,
    `Photo docs: ${photoDocuments.length}`,
    `Reports with evidence mentions: ${reportEvidence}`,
    `KS blockers: ${ksBlockers}`,
    `Next: ${nextStep}`
  ].filter(Boolean).join("\n");

  return {
    summary: {
      status,
      tone,
      headline,
      nextStep,
      evidenceDocuments: evidenceDocuments.length,
      photoDocuments: photoDocuments.length,
      reportEvidence,
      linkedScheduleItems,
      ksBlockers,
      missingEvidenceItems
    },
    items,
    actions,
    handoff: {
      title: "Evidence handoff",
      copyText
    },
    limitations: [
      "v1 использует метаданные документов и текст рапортов; OCR/Computer Vision не выполняются.",
      "Онлайн smoke для этого train не загружает реальные файлы и не создает evidence-записи.",
      "Привязка evidence к работам выполняется эвристически по названиям и категориям документов."
    ]
  };
}
