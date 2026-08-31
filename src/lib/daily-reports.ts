import type { AppRole } from "@/lib/auth/permissions";
import {
  dailyReportWorkOutputTotals,
  dailyReportWorkOutputsComplete,
  parseDailyReportWorkOutputs
} from "@/lib/daily-report-work-outputs";
import { parseDailyReportWorkScopes } from "@/lib/daily-report-work-scopes";
import { parseDailyReportCrewMembers } from "@/lib/daily-report-crew";
import type { DailyReport } from "@/lib/types";

export const dailyReportStatuses = ["draft", "submitted", "checked", "approved"] as const;

const transitions: Record<DailyReport["status"], DailyReport["status"][]> = {
  draft: ["submitted"],
  submitted: ["draft", "checked"],
  checked: ["submitted", "approved"],
  approved: []
};

export function canTransitionDailyReport(from: string, to: string, role: AppRole | null) {
  if (!dailyReportStatuses.includes(from as DailyReport["status"]) || !dailyReportStatuses.includes(to as DailyReport["status"])) return false;
  const current = from as DailyReport["status"];
  const next = to as DailyReport["status"];
  if (from === to) return true;
  if (!role || !transitions[current].includes(next)) return false;
  if (next === "approved") return role === "OWNER" || role === "ADMIN";
  if (next === "checked") return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
  return role === "OWNER" || role === "ADMIN" || role === "MANAGER";
}

export function dailyReportStatusLabel(status: DailyReport["status"]) {
  const labels: Record<DailyReport["status"], string> = {
    draft: "Черновик",
    submitted: "Отправлен",
    checked: "Проверен",
    approved: "Утвержден"
  };
  return labels[status];
}

type DailyReportValidationInput = {
  date: Date | string;
  author: string;
  weather?: string;
  workers: number;
  engineers: number;
  equipment?: string;
  completedWorks: string;
  materialsReceived?: string;
  materialsConsumed?: string;
  downtime?: string;
  issues?: string;
  workOutputs?: unknown;
  phase?: "open" | "closed";
  workCategory?: string;
  workScopes?: unknown;
  plannedWorks?: string;
  crewMembers?: unknown;
};

export type DailyReportValidationIssue = {
  field: string;
  message: string;
};

const reportTextLimits: Array<[keyof DailyReportValidationInput, number, string]> = [
  ["author", 160, "Автор"],
  ["weather", 500, "Погода"],
  ["equipment", 4_000, "Техника"],
  ["workCategory", 240, "Вид работ"],
  ["plannedWorks", 8_000, "План смены"],
  ["completedWorks", 8_000, "Выполненные работы"],
  ["materialsReceived", 8_000, "Полученные материалы"],
  ["materialsConsumed", 8_000, "Израсходованные материалы"],
  ["downtime", 8_000, "Простои"],
  ["issues", 8_000, "Замечания"]
];

const singleLineFields = new Set(["author", "weather"]);

function normalizeReportText(value: string, singleLine: boolean) {
  const normalized = value.trim().replace(/[ \t]+/g, " ");
  return singleLine
    ? normalized.replace(/\s*\n\s*/g, " ")
    : normalized.replace(/[ \t]+\n/g, "\n").replace(/\n{3,}/g, "\n\n");
}

export function normalizeDailyReportFields<T extends object>(input: T): T {
  const normalized = { ...input } as Record<string, unknown>;
  for (const [field] of reportTextLimits) {
    const value = normalized[field];
    if (typeof value === "string") normalized[field] = normalizeReportText(value, singleLineFields.has(field));
  }
  if (typeof normalized.weather === "string" && !normalized.weather) normalized.weather = "Не указано";
  return normalized as T;
}

export function dailyReportDraftIssues(report: DailyReportValidationInput): DailyReportValidationIssue[] {
  const issues: DailyReportValidationIssue[] = [];
  const date = report.date instanceof Date ? report.date : new Date(report.date);
  if (Number.isNaN(date.getTime())) issues.push({ field: "date", message: "Укажите корректную дату рапорта." });
  if (report.author.trim().length < 2) issues.push({ field: "author", message: "Укажите автора рапорта." });
  const phase = report.phase ?? "closed";
  const crew = parseDailyReportCrewMembers(report.crewMembers);
  const workScopes = parseDailyReportWorkScopes(report.workScopes, report.workCategory);
  if (report.workScopes !== undefined && report.workScopes !== null) {
    if (!Array.isArray(report.workScopes) || workScopes.length !== report.workScopes.length) {
      issues.push({ field: "workScopes", message: "Проверьте список видов работ: позиции должны быть заполнены и не дублироваться." });
    }
  }
  if (phase === "open") {
    if (!workScopes.length) issues.push({ field: "workScopes", message: "Выберите хотя бы один укрупнённый вид работ на смену." });
    if ((report.plannedWorks ?? "").trim().length < 3) issues.push({ field: "plannedWorks", message: "Опишите план работ на смену." });
    if (!crew.length && report.workers + report.engineers === 0) issues.push({ field: "crewMembers", message: "Выберите состав смены или укажите численность вручную." });
  } else if (report.completedWorks.trim().length < 3) {
    issues.push({ field: "completedWorks", message: "Опишите выполненные работы или явно укажите, что работы не выполнялись." });
  }
  if (!Number.isInteger(report.workers) || report.workers < 0) issues.push({ field: "workers", message: "Количество рабочих должно быть целым неотрицательным числом." });
  if (!Number.isInteger(report.engineers) || report.engineers < 0) issues.push({ field: "engineers", message: "Количество ИТР должно быть целым неотрицательным числом." });

  for (const [field, limit, label] of reportTextLimits) {
    const value = report[field];
    if (typeof value === "string" && value.length > limit) issues.push({ field, message: `${label}: максимум ${limit.toLocaleString("ru-RU")} символов.` });
  }

  if (report.workOutputs !== undefined && report.workOutputs !== null) {
    if (!Array.isArray(report.workOutputs)) {
      issues.push({ field: "workOutputs", message: "Фактическая выработка должна быть списком строк." });
    } else {
      const outputs = parseDailyReportWorkOutputs(report.workOutputs);
      if (outputs.length !== report.workOutputs.length || !dailyReportWorkOutputsComplete(outputs)) {
        issues.push({ field: "workOutputs", message: "Заполните или удалите незавершённые строки фактической выработки." });
      }
    }
  }
  return issues;
}

export function dailyReportSubmissionIssues(report: DailyReportValidationInput): DailyReportValidationIssue[] {
  const issues = dailyReportDraftIssues(report);
  if ((report.phase ?? "closed") !== "closed") {
    issues.push({ field: "phase", message: "Сначала внесите фактические результаты и закройте смену." });
  }
  const personnel = Math.max(0, report.workers) + Math.max(0, report.engineers);
  const outputs = parseDailyReportWorkOutputs(report.workOutputs);
  const totals = dailyReportWorkOutputTotals(outputs);

  if (personnel === 0 && !report.downtime?.trim() && !report.issues?.trim()) {
    issues.push({ field: "workers", message: "Укажите людей на смене либо зафиксируйте причину отсутствия работ в простоях/замечаниях." });
  }
  if (outputs.length && personnel === 0) {
    issues.push({ field: "workOutputs", message: "Нельзя отправить выработку без указанного персонала смены." });
  } else if (outputs.length && totals.laborHours > personnel * 24) {
    issues.push({
      field: "workOutputs",
      message: `Трудозатраты ${totals.laborHours.toLocaleString("ru-RU")} ч превышают физический максимум для ${personnel} чел. за сутки.`
    });
  }
  return issues;
}
