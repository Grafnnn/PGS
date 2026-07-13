import type { DocumentChecklistItem } from "@/lib/project-pipeline";
import type { DailyReport, Project, ProjectDocument, Risk, ScheduleItem } from "@/lib/types";

export type HseTone = "good" | "warn" | "bad" | "info" | "neutral";
export type HseStatus = "no_data" | "needs_review" | "blocked" | "controlled";
export type HseTarget = "Рапорты" | "Риски" | "Документы" | "График" | "Исполнение";

export type HseSafetyPermitInput = {
  project?: Partial<Project> | null;
  scheduleItems?: ScheduleItem[] | null;
  dailyReports?: DailyReport[] | null;
  risks?: Risk[] | null;
  documents?: ProjectDocument[] | null;
  documentChecklist?: DocumentChecklistItem[] | null;
};

export type HseSafetyPermitModel = {
  summary: { status: HseStatus; tone: HseTone; headline: string; nextStep: string; totalSignals: number; criticalSignals: number; safetyDocuments: number; permitBlockers: number; reportSignals: number };
  signals: Array<{ id: string; title: string; detail: string; source: string; severity: "medium" | "high" | "critical"; tone: HseTone; targetTab: HseTarget; nextAction: string }>;
  actions: Array<{ title: string; detail: string; priority: "low" | "medium" | "high"; ownerRole: "РП" | "ИТР" | "Прораб" | "ОТиПБ"; targetTab: HseTarget }>;
  handoff: { title: string; copyText: string };
  limitations: string[];
};

const HSE_TERMS = /охран[аы]\s+труд|отиб|тб|безопасн|инструктаж|допуск|наряд|пожар|сиз|средств[ао]\s+защит|incident|травм|авар|опасн/i;
const PERMIT_TERMS = /допуск|наряд|разреш|инструктаж|пожар|безопасн|отиб|тб|сиз/i;
const CRITICAL_TERMS = /травм|авар|пожар|опасн|запрещ|приостанов|недопуск/i;

function text(value: string | null | undefined) { return (value ?? "").replace(/\s+/g, " ").trim(); }
function date(value: string) { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleDateString("ru-RU", { day: "2-digit", month: "2-digit" }); }
function tone(severity: "medium" | "high" | "critical"): HseTone { return severity === "critical" ? "bad" : severity === "high" ? "warn" : "info"; }

export function buildHseSafetyPermitIntelligence(input: HseSafetyPermitInput): HseSafetyPermitModel {
  const project = input.project ?? {};
  const reports = [...(input.dailyReports ?? [])].sort((a, b) => b.date.localeCompare(a.date));
  const risks = input.risks ?? [];
  const schedule = input.scheduleItems ?? [];
  const documents = input.documents ?? [];
  const checklist = input.documentChecklist ?? [];
  const reportSignals = reports.filter((item) => HSE_TERMS.test(`${item.issues} ${item.downtime} ${item.equipment}`));
  const hseRisks = risks.filter((item) => item.status !== "closed" && HSE_TERMS.test(`${item.title} ${item.reason}`));
  const safetyDocuments = documents.filter((item) => PERMIT_TERMS.test(`${item.category} ${item.title} ${item.fileName ?? ""}`));
  const permitBlockers = checklist.filter((item) => item.status !== "present" && PERMIT_TERMS.test(`${item.title} ${item.suggestedNextStep ?? ""}`));
  const stoppedWorks = schedule.filter((item) => item.status === "stopped");
  const signals = [
    ...reportSignals.map((item) => {
      const detail = text(item.issues || item.downtime || item.equipment) || "Рапорт требует проверки условий безопасного выполнения работ.";
      const severity = CRITICAL_TERMS.test(detail) ? "critical" as const : "high" as const;
      return { id: `report:${item.id}`, title: `HSE-сигнал площадки · ${date(item.date)}`, detail, source: "Ежедневный рапорт", severity, tone: tone(severity), targetTab: "Рапорты" as const, nextAction: "Проверить условия, назначить ответственного и зафиксировать устранение в рапорте." };
    }),
    ...hseRisks.map((item) => {
      const severity = item.priority === "critical" ? "critical" as const : item.priority === "high" ? "high" as const : "medium" as const;
      return { id: `risk:${item.id}`, title: item.title, detail: item.reason || "Открытый HSE-риск требует решения.", source: `Риск · ${item.owner || "владелец не назначен"}`, severity, tone: tone(severity), targetTab: "Риски" as const, nextAction: "Проверить меру контроля, владельца и срок выполнения." };
    }),
    ...permitBlockers.map((item) => ({ id: `permit:${item.key}`, title: `Блокер допуска: ${item.title}`, detail: item.suggestedNextStep || "Подтверждающий документ отсутствует.", source: "Document checklist", severity: "high" as const, tone: "warn" as const, targetTab: "Документы" as const, nextAction: "Подтвердить документ/допуск перед продолжением работ." })),
    ...stoppedWorks.map((item) => ({ id: `schedule:${item.id}`, title: `Приостановленная работа: ${item.name}`, detail: `${item.actualQty}/${item.plannedQty} · владелец ${item.owner || "не назначен"}`, source: "График", severity: "critical" as const, tone: "bad" as const, targetTab: "График" as const, nextAction: "Подтвердить безопасный план возобновления и связи с разрешениями." }))
  ].slice(0, 24);
  const criticalSignals = signals.filter((item) => item.severity === "critical").length;
  const status: HseStatus = !reports.length && !risks.length && !documents.length && !checklist.length && !schedule.length ? "no_data" : criticalSignals || permitBlockers.length ? "blocked" : signals.length ? "needs_review" : "controlled";
  const toneValue: HseTone = status === "controlled" ? "good" : status === "blocked" ? "bad" : status === "needs_review" ? "warn" : "info";
  const headline = status === "controlled" ? "Критичных HSE-сигналов в текущем срезе не найдено" : status === "blocked" ? "Допуски или HSE-сигналы блокируют безопасное продолжение работ" : status === "needs_review" ? "Условия безопасности требуют проверки и назначения мер" : "Нет данных для HSE-контроля";
  const nextStep = status === "no_data" ? "Добавьте рапорт, риск, документ или чеклист: v1 соберет HSE-сигналы из существующих данных." : status === "blocked" ? "Снять блокеры допусков, зафиксировать меры и подтвердить безопасное возобновление работ." : status === "needs_review" ? "Провести HSE-review: проверить рапорты, документы, владельцев и сроки." : "Поддерживать актуальность инструктажей, допусков и ежедневных рапортов.";
  const actions = [
    { title: "Провести HSE-review", detail: `${signals.length} сигналов в текущем срезе.`, priority: signals.length ? "high" as const : "low" as const, ownerRole: "ОТиПБ" as const, targetTab: "Риски" as const },
    { title: "Проверить допуски и наряды", detail: `${permitBlockers.length} документальных блокеров.`, priority: permitBlockers.length ? "high" as const : "medium" as const, ownerRole: "ИТР" as const, targetTab: "Документы" as const },
    { title: "Сверить рапорты площадки", detail: `${reportSignals.length} рапортов с HSE-сигналами.`, priority: reportSignals.length ? "high" as const : "low" as const, ownerRole: "Прораб" as const, targetTab: "Рапорты" as const },
    { title: "Подтвердить безопасный фронт", detail: `${stoppedWorks.length} приостановленных работ.`, priority: stoppedWorks.length ? "high" as const : "medium" as const, ownerRole: "РП" as const, targetTab: "Исполнение" as const }
  ];
  return { summary: { status, tone: toneValue, headline, nextStep, totalSignals: signals.length, criticalSignals, safetyDocuments: safetyDocuments.length, permitBlockers: permitBlockers.length, reportSignals: reportSignals.length }, signals, actions, handoff: { title: "HSE handoff", copyText: [`HSE / Safety & permits: ${headline}`, project.name ? `Проект: ${project.name}` : "", `Сигналы: ${signals.length}`, `Критичные: ${criticalSignals}`, `Документы HSE: ${safetyDocuments.length}`, `Блокеры допусков: ${permitBlockers.length}`, `Следующий шаг: ${nextStep}`].filter(Boolean).join("\n") }, limitations: ["v1 использует существующие рапорты, риски, график, документы и checklist; отдельные журналы инструктажа не создаются.", "Статусы допусков и фактическое выполнение мер должны подтверждаться ответственными пользователями.", "OCR, распознавание фото и автоматическая квалификация инцидентов не выполняются."] };
}
