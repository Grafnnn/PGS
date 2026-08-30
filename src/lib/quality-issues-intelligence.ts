import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { BudgetItem, DailyReport, Material, Payment, ProcurementRequest, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type QualityTone = "good" | "warn" | "bad" | "info" | "neutral";
export type QualityStatus = "no_data" | "needs_triage" | "blocked" | "controlled";
export type QualityTarget = "Рапорты" | "Риски" | "Документы" | "График" | "КС" | "Исполнение";

export type QualityIssue = {
  id: string;
  title: string;
  detail: string;
  source: string;
  severity: "medium" | "high" | "critical";
  tone: QualityTone;
  targetTab: QualityTarget;
  nextAction: string;
};

export type QualityAction = {
  title: string;
  detail: string;
  priority: "low" | "medium" | "high";
  ownerRole: "РП" | "ПТО" | "ИТР" | "Прораб";
  targetTab: QualityTarget;
};

export type QualityIssuesInput = {
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

export type QualityIssuesModel = {
  summary: {
    status: QualityStatus;
    tone: QualityTone;
    headline: string;
    nextStep: string;
    totalIssues: number;
    criticalIssues: number;
    reportIssues: number;
    evidenceDocuments: number;
    acceptanceBlockers: number;
    delayedWorkItems: number;
  };
  issues: QualityIssue[];
  actions: QualityAction[];
  handoff: { title: string; copyText: string };
  limitations: string[];
};

const ISSUE_TERMS = /замечан|дефект|брак|несоответств|передел|ncr|punch|устран|нарушен|претенз|качест|не принят/i;
const EVIDENCE_TERMS = /фото|photo|акт|журнал|исполн|схем|сертифик|паспорт|evidence/i;
const ACCEPTANCE_TERMS = /кс|приемк|закрыт|скрыт|акт|исполн|evidence/i;

function normalize(value: string | null | undefined) {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

function readableDate(value: string | undefined) {
  if (!value) return "без даты";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function issue(title: string, detail: string, source: string, severity: QualityIssue["severity"], targetTab: QualityTarget, nextAction: string): QualityIssue {
  return {
    id: `${source}:${title}`,
    title,
    detail,
    source,
    severity,
    tone: severity === "critical" ? "bad" : severity === "high" ? "warn" : "info",
    targetTab,
    nextAction
  };
}

function action(title: string, detail: string, priority: QualityAction["priority"], ownerRole: QualityAction["ownerRole"], targetTab: QualityTarget): QualityAction {
  return { title, detail, priority, ownerRole, targetTab };
}

export function buildQualityIssuesIntelligence(input: QualityIssuesInput): QualityIssuesModel {
  const project = input.project ?? {};
  const reports = [...(input.dailyReports ?? [])].sort((left, right) => right.date.localeCompare(left.date));
  const risks = input.risks ?? [];
  const scheduleItems = input.scheduleItems ?? [];
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];

  const reportIssues = reports.filter((report) => ISSUE_TERMS.test(`${report.issues} ${report.downtime}`));
  const qualityRisks = risks.filter((risk) => risk.status !== "closed" && ISSUE_TERMS.test(`${risk.title} ${risk.reason}`));
  const delayedWorks = scheduleItems.filter((item) => item.status === "delayed" || item.status === "stopped");
  const evidenceDocuments = documents.filter((document) => EVIDENCE_TERMS.test(`${document.category} ${document.title} ${document.fileName ?? ""}`));
  const acceptanceBlockers = checklist.filter((item) => item.status !== "present" && ACCEPTANCE_TERMS.test(`${item.title} ${item.suggestedNextStep ?? ""}`));

  const issues: QualityIssue[] = [
    ...reportIssues.map((report) => issue(
      `Замечание площадки · ${readableDate(report.date)}`,
      normalize(report.issues || report.downtime) || "Рапорт требует разбора замечаний.",
      "Ежедневный рапорт",
      report.downtime ? "critical" : "high",
      "Рапорты",
      "Назначить владельца, срок устранения и привязать фото/акт подтверждения."
    )),
    ...qualityRisks.map((risk) => issue(
      risk.title,
      risk.reason || "Открытый риск качества требует решения.",
      `Риск · ${risk.owner || "владелец не назначен"}`,
      risk.priority === "critical" ? "critical" : risk.priority === "high" ? "high" : "medium",
      "Риски",
      "Проверить статус риска и зафиксировать меру устранения."
    )),
    ...delayedWorks.map((item) => issue(
      `Контроль качества по работе: ${item.name}`,
      `${item.actualQty}/${item.plannedQty} · ${item.status} · владелец ${item.owner || "не назначен"}`,
      "График",
      item.status === "stopped" ? "critical" : "high",
      "График",
      "Сверить отставание с замечаниями, evidence и восстановительным планом."
    )),
    ...acceptanceBlockers.map((item) => issue(
      `Блокер закрытия: ${item.title}`,
      item.suggestedNextStep || "Документ или подтверждение отсутствует.",
      "Document checklist / КС",
      item.status === "missing" ? "high" : "medium",
      "КС",
      "Закрыть документальный блокер до предъявления объема."
    ))
  ].slice(0, 24);

  const criticalIssues = issues.filter((item) => item.severity === "critical").length;
  const status: QualityStatus = !reports.length && !risks.length && !scheduleItems.length && !checklist.length && !documents.length
    ? "no_data"
    : criticalIssues || acceptanceBlockers.length
      ? "blocked"
      : issues.length
        ? "needs_triage"
        : "controlled";
  const tone: QualityTone = status === "controlled" ? "good" : status === "blocked" ? "bad" : status === "no_data" ? "info" : "warn";
  const headline = status === "controlled"
    ? "Критичных замечаний в текущем срезе не найдено"
    : status === "blocked"
      ? "Замечания блокируют закрытие или требуют немедленного решения"
      : status === "needs_triage"
        ? "Замечания требуют распределения и контроля устранения"
        : "Нет данных для реестра качества";
  const nextStep = status === "no_data"
    ? "Добавьте рапорт, риск, график или документ: v1 соберет реестр замечаний из уже доступных данных."
    : status === "blocked"
      ? "Собрать evidence, назначить владельцев и снять блокеры до КС или следующей планерки."
      : status === "needs_triage"
        ? "Провести triage: подтвердить замечания, сроки, владельцев и связь с evidence."
        : "Поддерживать ежедневные рапорты и документальные подтверждения для контроля качества.";

  const actions: QualityAction[] = [
    action("Провести triage замечаний", `${issues.length} сигналов качества в текущем срезе.`, issues.length ? "high" : "low", "РП", "Риски"),
    action("Назначить устранение на площадке", `${reportIssues.length} рапорт(ов) содержат замечания или простои.`, reportIssues.length ? "high" : "medium", "Прораб", "Рапорты"),
    action("Проверить evidence", `${evidenceDocuments.length} документов могут подтверждать устранение.`, evidenceDocuments.length ? "medium" : "high", "ИТР", "Документы"),
    action("Снять блокеры КС", `${acceptanceBlockers.length} документальных блокеров для предъявления объемов.`, acceptanceBlockers.length ? "high" : "low", "ПТО", "КС"),
    action("Сверить график и качество", `${delayedWorks.length} работ с отклонением графика.`, delayedWorks.length ? "medium" : "low", "РП", "График")
  ];

  const copyText = [
    `Quality / Issues: ${headline}`,
    project.name ? `Проект: ${project.name}` : undefined,
    `Открытые сигналы: ${issues.length}`,
    `Критичные: ${criticalIssues}`,
    `Рапорты с замечаниями: ${reportIssues.length}`,
    `Evidence docs: ${evidenceDocuments.length}`,
    `Блокеры КС: ${acceptanceBlockers.length}`,
    `Следующий шаг: ${nextStep}`
  ].filter(Boolean).join("\n");

  return {
    summary: {
      status,
      tone,
      headline,
      nextStep,
      totalIssues: issues.length,
      criticalIssues,
      reportIssues: reportIssues.length,
      evidenceDocuments: evidenceDocuments.length,
      acceptanceBlockers: acceptanceBlockers.length,
      delayedWorkItems: delayedWorks.length
    },
    issues,
    actions,
    handoff: { title: "Передача данных по качеству", copyText },
    limitations: [
      "Этот intelligence-срез объединяет рапорты, риски, график и документы; управляемые NCR/Punch записи ведутся в разделе «Исполнение».",
      "Фото и документы учитываются по категории и метаданным; OCR и Computer Vision не выполняются.",
      "Статусы, исполнители и сроки устранения требуют подтверждения пользователем в рабочих разделах."
    ]
  };
}
