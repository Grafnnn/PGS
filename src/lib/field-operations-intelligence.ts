import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type FieldOpsTone = "good" | "warn" | "bad" | "info" | "neutral";
export type FieldOpsStatus = "no_reports" | "needs_submission" | "blocked" | "attention" | "controlled";
export type FieldOpsPriority = "low" | "medium" | "high";

export type FieldOpsSummary = {
  status: FieldOpsStatus;
  tone: FieldOpsTone;
  headline: string;
  nextStep: string;
  reportCount: number;
  latestReportDate?: string;
  totalWorkers: number;
  totalEngineers: number;
  equipmentMentions: number;
  downtimeReports: number;
  issueReports: number;
  submittedReports: number;
  uncheckedReports: number;
  linkedScheduleItems: number;
  materialSignals: number;
};

export type FieldOpsSnapshot = {
  id: string;
  date: string;
  author: string;
  tone: FieldOpsTone;
  title: string;
  workforce: string;
  weather: string;
  equipment: string;
  completedWorks: string;
  downtime: string;
  issues: string;
  status: DailyReport["status"];
};

export type FieldOpsSignal = {
  title: string;
  detail: string;
  tone: FieldOpsTone;
  targetTab: "Рапорты" | "График" | "Материалы" | "Документы" | "КС" | "Риски" | "Исполнение";
};

export type FieldOpsAction = {
  title: string;
  detail: string;
  ownerRole: "Прораб" | "РП" | "ПТО" | "Снабжение" | "ИТР";
  priority: FieldOpsPriority;
  targetTab: FieldOpsSignal["targetTab"];
};

export type FieldOpsHandoff = {
  title: string;
  copyText: string;
};

export type FieldOperationsInput = {
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

export type FieldOperationsModel = {
  summary: FieldOpsSummary;
  snapshots: FieldOpsSnapshot[];
  signals: FieldOpsSignal[];
  actions: FieldOpsAction[];
  handoff: FieldOpsHandoff;
  limitations: string[];
};

function hasText(value: string | undefined | null) {
  return Boolean(value?.trim());
}

function readableDate(value: string | undefined) {
  if (!value) return "нет даты";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function splitMentions(value: string | undefined | null) {
  return (value ?? "")
    .split(/[,;.\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function reportTone(report: DailyReport): FieldOpsTone {
  if (hasText(report.downtime) || hasText(report.issues)) return "bad";
  if (report.status === "draft" || report.status === "submitted") return "warn";
  if (report.status === "approved" || report.status === "checked") return "good";
  return "info";
}

function scheduleLinksFromReports(reports: DailyReport[], scheduleItems: ScheduleItem[]) {
  return scheduleItems.filter((item) => {
    const name = item.name.toLowerCase();
    return reports.some((report) => report.completedWorks.toLowerCase().includes(name) || report.issues.toLowerCase().includes(name));
  });
}

function materialSignalsFromReports(reports: DailyReport[], materials: Material[]) {
  const source = reports.map((report) => `${report.materialsReceived} ${report.materialsConsumed} ${report.issues}`).join(" ").toLowerCase();
  return materials.filter((material) => {
    const name = material.name.toLowerCase();
    return source.includes(name) || (material.requiredQty > material.deliveredQty && source.includes("материал"));
  });
}

function makeAction(title: string, detail: string, ownerRole: FieldOpsAction["ownerRole"], priority: FieldOpsPriority, targetTab: FieldOpsAction["targetTab"]): FieldOpsAction {
  return { title, detail, ownerRole, priority, targetTab };
}

export function buildFieldOperationsIntelligence(input: FieldOperationsInput): FieldOperationsModel {
  const project = input.project ?? {};
  const reports = [...(input.dailyReports ?? [])].sort((left, right) => right.date.localeCompare(left.date));
  const scheduleItems = input.scheduleItems ?? [];
  const materials = input.materials ?? [];
  const risks = input.risks ?? [];
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];

  const latest = reports[0];
  const downtimeReports = reports.filter((report) => hasText(report.downtime)).length;
  const issueReports = reports.filter((report) => hasText(report.issues)).length;
  const submittedReports = reports.filter((report) => report.status === "submitted" || report.status === "checked" || report.status === "approved").length;
  const uncheckedReports = reports.filter((report) => report.status === "draft" || report.status === "submitted").length;
  const totalWorkers = reports.reduce((sum, report) => sum + Math.max(0, report.workers), 0);
  const totalEngineers = reports.reduce((sum, report) => sum + Math.max(0, report.engineers), 0);
  const equipmentMentions = reports.reduce((sum, report) => sum + splitMentions(report.equipment).length, 0);
  const linkedScheduleItems = scheduleLinksFromReports(reports, scheduleItems);
  const materialSignals = materialSignalsFromReports(reports, materials);
  const openFieldRisks = risks.filter((risk) => risk.status !== "closed" && /площад|рапорт|простой|техника|бригада|замечан|факт|погода|исполн/i.test(`${risk.title} ${risk.reason}`));
  const fieldDocuments = documents.filter((document) => /журнал|рапорт|фото|исполн|акт|кс/i.test(`${document.category} ${document.title} ${document.fileName ?? ""}`));
  const missingFieldDocuments = checklist.filter((item) => item.status !== "present" && /журнал|фото|исполн|акт|кс|рапорт/i.test(`${item.title} ${item.suggestedNextStep ?? ""}`));

  const status: FieldOpsStatus = !reports.length
    ? "no_reports"
    : downtimeReports || issueReports || openFieldRisks.length
        ? "blocked"
        : uncheckedReports === reports.length
          ? "needs_submission"
          : materialSignals.length || missingFieldDocuments.length
            ? "attention"
            : "controlled";
  const tone: FieldOpsTone = status === "controlled" ? "good" : status === "blocked" ? "bad" : status === "no_reports" ? "info" : "warn";
  const headline =
    status === "controlled"
      ? "Площадка под контролем"
      : status === "blocked"
        ? "Есть блокеры площадки"
        : status === "needs_submission"
          ? "Рапорты требуют проверки"
          : status === "attention"
            ? "Есть сигналы к сверке"
            : "Нет рапортов площадки";
  const nextStep =
    status === "no_reports"
      ? "Создать первый ежедневный рапорт и зафиксировать людей, технику, выполненные объемы и замечания."
      : downtimeReports
        ? "Разобрать простои и связать их с графиком, рисками и ответственными."
        : issueReports
          ? "Проверить замечания площадки и назначить действия РП/ПТО."
          : uncheckedReports
            ? "Проверить черновики/поданные рапорты и подтвердить факт."
            : "Сверить факт площадки с графиком, КС и снабжением.";

  const snapshots = reports.slice(0, 5).map<FieldOpsSnapshot>((report) => ({
    id: report.id,
    date: report.date,
    author: report.author,
    tone: reportTone(report),
    title: `${readableDate(report.date)} · ${report.author}`,
    workforce: `${report.workers} рабочих / ${report.engineers} ИТР`,
    weather: report.weather || "Погода не указана",
    equipment: report.equipment || "Техника не указана",
    completedWorks: report.completedWorks || "Выполненные объемы не заполнены",
    downtime: report.downtime || "Простоев не указано",
    issues: report.issues || "Замечаний не указано",
    status: report.status
  }));

  const signals: FieldOpsSignal[] = [
    ...reports
      .filter((report) => hasText(report.downtime))
      .slice(0, 3)
      .map((report) => ({
        title: `Простой: ${readableDate(report.date)}`,
        detail: report.downtime,
        tone: "bad" as const,
        targetTab: "График" as const
      })),
    ...reports
      .filter((report) => hasText(report.issues))
      .slice(0, 3)
      .map((report) => ({
        title: `Замечание: ${readableDate(report.date)}`,
        detail: report.issues,
        tone: "warn" as const,
        targetTab: "Риски" as const
      })),
    ...linkedScheduleItems.slice(0, 3).map((item) => ({
      title: `Факт связан с графиком: ${item.name}`,
      detail: `${item.actualQty}/${item.plannedQty} · ${item.status}`,
      tone: item.status === "delayed" || item.status === "stopped" ? "bad" as const : "info" as const,
      targetTab: "График" as const
    })),
    ...materialSignals.slice(0, 3).map((item) => ({
      title: `Материальный сигнал: ${item.name}`,
      detail: `Потребность ${item.requiredQty} ${item.unit}, доставлено ${item.deliveredQty} ${item.unit}.`,
      tone: item.requiredQty > item.deliveredQty ? "warn" as const : "info" as const,
      targetTab: "Материалы" as const
    })),
    ...missingFieldDocuments.slice(0, 3).map((item) => ({
      title: `Документ площадки: ${item.title}`,
      detail: item.suggestedNextStep,
      tone: item.status === "missing" ? "warn" as const : "info" as const,
      targetTab: "Документы" as const
    }))
  ];

  const actions: FieldOpsAction[] = [
    !reports.length
      ? makeAction("Создать ежедневный рапорт", "Зафиксировать факт смены: люди, техника, объемы, материалы, простои и замечания.", "Прораб", "high", "Рапорты")
      : makeAction("Проверить последний рапорт", latest ? `${readableDate(latest.date)} · ${latest.author}` : "Рапорт не найден.", "РП", uncheckedReports ? "high" : "medium", "Рапорты"),
    downtimeReports
      ? makeAction("Разобрать простои", `${downtimeReports} рапорт(ов) с простоями нужно связать с графиком и восстановительным планом.`, "РП", "high", "График")
      : makeAction("Сверить факт с графиком", `${linkedScheduleItems.length} работ имеют текстовую связь с рапортами.`, "ПТО", "medium", "График"),
    issueReports
      ? makeAction("Назначить владельцев замечаний", `${issueReports} рапорт(ов) содержат замечания площадки.`, "ИТР", "high", "Риски")
      : makeAction("Проверить замечания площадки", "Замечания не указаны; подтвердите это на планерке.", "ИТР", "low", "Рапорты"),
    materialSignals.length
      ? makeAction("Передать потребность снабжению", `${materialSignals.length} материалов всплыли в рапортах или дефиците.`, "Снабжение", "medium", "Материалы")
      : makeAction("Сверить материалы смены", "Проверить поступление и списание материалов за смену.", "Снабжение", "low", "Материалы"),
    makeAction("Подготовить факт к КС", "Использовать подтвержденный факт площадки как источник готовности к закрытию объемов.", "ПТО", "medium", "КС")
  ];

  const copyLines = [
    `Field operations: ${headline}`,
    project.name ? `Проект: ${project.name}` : undefined,
    `Рапорты: ${reports.length}`,
    latest ? `Последний рапорт: ${readableDate(latest.date)} · ${latest.author}` : "Последний рапорт: нет",
    `Люди в рапортах: ${totalWorkers} рабочих / ${totalEngineers} ИТР`,
    `Простои/замечания: ${downtimeReports}/${issueReports}`,
    signals[0] ? `Главный сигнал: ${signals[0].title} — ${signals[0].detail}` : undefined,
    `Следующее действие: ${nextStep}`
  ].filter(Boolean);

  const limitations = [
    "Модель использует текст ежедневных рапортов и не выполняет OCR/анализ фотографий.",
    "Связка рапортов с графиком и материалами выполняется эвристически по тексту и названиям.",
    "Факт площадки не записывается автоматически в график, КС или риски без явного действия пользователя."
  ];
  if (!fieldDocuments.length) limitations.push("Документы/фото площадки не найдены в текущем срезе документов.");

  return {
    summary: {
      status,
      tone,
      headline,
      nextStep,
      reportCount: reports.length,
      latestReportDate: latest?.date,
      totalWorkers,
      totalEngineers,
      equipmentMentions,
      downtimeReports,
      issueReports,
      submittedReports,
      uncheckedReports,
      linkedScheduleItems: linkedScheduleItems.length,
      materialSignals: materialSignals.length
    },
    snapshots,
    signals: signals.slice(0, 12),
    actions,
    handoff: {
      title: "Weekly field handoff",
      copyText: copyLines.join("\n")
    },
    limitations
  };
}
