import type { Payment } from "@/lib/types";
import type { FinanceIntelligence, IntelligenceIssue } from "./types";
import { daysBetween, evidence, forecastWindows, issue, parseDate } from "./helpers";

export function analyzeFinance(payments: Payment[], now = new Date(), openingBalance = 1_500_000): FinanceIntelligence {
  const issues: IntelligenceIssue[] = [];
  const incomingPlanned = payments.filter((item) => item.direction === "incoming").reduce((sum, item) => sum + item.amount, 0);
  const outgoingPlanned = payments.filter((item) => item.direction === "outgoing").reduce((sum, item) => sum + item.amount, 0);
  const unpaidAmount = payments.filter((item) => item.status !== "paid").reduce((sum, item) => sum + item.amount, 0);
  const overduePayments = payments.filter((item) => {
    const plannedAt = parseDate(item.plannedAt);
    return Boolean(item.status === "overdue" || (plannedAt && plannedAt < now && item.status !== "paid"));
  });
  const upcomingPayments = payments
    .filter((item) => {
      const plannedAt = parseDate(item.plannedAt);
      return Boolean(plannedAt && plannedAt >= now && daysBetween(now, plannedAt) <= 30);
    })
    .sort((a, b) => a.plannedAt.localeCompare(b.plannedAt));
  const overdueAmount = overduePayments.reduce((sum, item) => sum + item.amount, 0);
  const possibleCashGap = Math.min(openingBalance + incomingPlanned - outgoingPlanned, 0);

  for (const item of overduePayments) {
    issues.push(
      issue({
        id: `finance-overdue-${item.id}`,
        category: "finance",
        title: "Просроченный платеж",
        reason: `${item.title} на сумму ${item.amount} не закрыт в срок.`,
        score: item.direction === "incoming" ? 70 : 62,
        suggestedAction: item.direction === "incoming" ? "Проверьте дебиторскую задолженность и дату оплаты." : "Согласуйте оплату или перенос срока.",
        evidence: [
          evidence({
            entityType: "payment",
            entityId: item.id,
            label: item.title,
            field: "plannedAt/status",
            value: `${item.plannedAt}/${item.status}`,
            explanation: "Плановая дата прошла, платеж не отмечен оплаченным."
          })
        ]
      })
    );
  }

  for (const item of upcomingPayments.slice(0, 8)) {
    issues.push(
      issue({
        id: `finance-upcoming-${item.id}`,
        category: "finance",
        title: "Ближайшее платежное событие",
        reason: `${item.title}: ${item.direction === "incoming" ? "поступление" : "платеж"} ${item.amount} до ${item.plannedAt}.`,
        score: item.direction === "outgoing" ? 38 : 25,
        suggestedAction: "Проверьте готовность документов и согласований по платежу.",
        evidence: [
          evidence({
            entityType: "payment",
            entityId: item.id,
            label: item.title,
            field: "amount",
            value: item.amount,
            explanation: "Платеж попадает в ближайшие 30 дней."
          })
        ]
      })
    );
  }

  if (possibleCashGap < 0) {
    issues.push(
      issue({
        id: "finance-cash-gap",
        category: "finance",
        title: "Возможный кассовый разрыв",
        reason: `Прогнозный отрицательный баланс: ${possibleCashGap}.`,
        score: 85,
        suggestedAction: "Сверьте график поступлений и исходящих платежей, подготовьте решение по финансированию.",
        evidence: [
          evidence({
            entityType: "project",
            label: "Cashflow",
            field: "opening + incoming - outgoing",
            value: possibleCashGap,
            explanation: "Простой расчет показывает отрицательный баланс."
          })
        ]
      })
    );
  }

  if (!payments.length) {
    issues.push(
      issue({
        id: "finance-missing-plan",
        category: "finance",
        title: "Нет платежного плана",
        reason: "В проекте нет платежей для контроля cashflow.",
        score: 45,
        suggestedAction: "Добавьте план поступлений и платежей поставщикам/субподрядчикам.",
        evidence: [
          evidence({
            entityType: "project",
            label: "Платежный план",
            explanation: "Без платежей нельзя оценить кассовые разрывы."
          })
        ]
      })
    );
  }

  const forecast = forecastWindows.map((windowDays) => {
    const inWindow = payments.filter((item) => {
      const plannedAt = parseDate(item.plannedAt);
      return Boolean(plannedAt && plannedAt >= now && daysBetween(now, plannedAt) <= windowDays);
    });
    const incoming = inWindow.filter((item) => item.direction === "incoming").reduce((sum, item) => sum + item.amount, 0);
    const outgoing = inWindow.filter((item) => item.direction === "outgoing").reduce((sum, item) => sum + item.amount, 0);
    const balance = openingBalance + incoming - outgoing;
    return {
      windowDays,
      incoming,
      outgoing,
      financingNeed: balance < 0 ? Math.abs(balance) : 0
    };
  });

  return {
    incomingPlanned,
    outgoingPlanned,
    unpaidAmount,
    overdueAmount,
    possibleCashGap,
    upcomingPayments,
    overduePayments,
    forecast,
    issues
  };
}
