import { budgetTotals, financeTotals, percent } from "@/lib/calculations";
import type { ExecutiveSummary, ProjectIntelligenceContext, RiskRadarCard } from "./types";
import { dateOnly, parseDate } from "./helpers";

export function buildExecutiveSummary(context: ProjectIntelligenceContext, radar: RiskRadarCard[], missingData: string[], now = new Date()): ExecutiveSummary {
  const budget = budgetTotals(context.project.contractAmount, context.budgetItems);
  const finance = financeTotals(context.payments);
  const upcomingCriticalDates = [
    ...context.scheduleItems
      .filter((item) => {
        const startsAt = parseDate(item.startsAt);
        return Boolean(startsAt && startsAt >= now);
      })
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
      .slice(0, 3)
      .map((item) => `${item.startsAt}: ${item.name}`),
    ...context.payments
      .filter((item) => item.status !== "paid")
      .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt))
      .slice(0, 2)
      .map((item) => `${item.plannedAt}: ${item.title}`)
  ].slice(0, 5);
  const critical = radar.filter((item) => item.level === "critical" || item.level === "high");
  const conclusions = [
    critical[0] ? `${critical[0].title}: ${critical[0].shortReason}` : "Критичных отклонений по расчетной модели не выявлено.",
    `Прогнозная маржинальность: ${percent(budget.forecastMarginPercent)}.`,
    finance.financingNeed > 0 ? `Потребность в финансировании: ${finance.financingNeed}.` : "Кассовый разрыв по простой модели не выявлен."
  ];

  return {
    headline: critical.length ? `Требуется внимание: ${critical[0].title}` : "Проект в расчетной зоне контроля",
    projectName: context.project.name,
    status: context.project.status,
    budgetTotal: context.project.contractAmount,
    plannedMarginPercent: budget.plannedMarginPercent,
    forecastMarginPercent: budget.forecastMarginPercent,
    paymentFact: context.payments.filter((payment) => payment.status === "paid").reduce((sum, payment) => sum + payment.amount, 0),
    upcomingCriticalDates: upcomingCriticalDates.length ? upcomingCriticalDates : [`${dateOnly(now)}: ближайшие критичные даты не заполнены`],
    conclusions,
    missingData
  };
}
