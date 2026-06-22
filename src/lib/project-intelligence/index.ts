import { getEnvStatus } from "@/lib/env";
import type { Risk } from "@/lib/types";
import { analyzeBudget } from "./budget-analysis";
import { analyzeSchedule } from "./schedule-analysis";
import { analyzeProcurement } from "./procurement-analysis";
import { analyzeFinance } from "./finance-analysis";
import { analyzeDocuments } from "./documents-analysis";
import { buildActionPlan } from "./action-plan";
import { buildExecutiveSummary } from "./executive-summary";
import { evidence, issue } from "./helpers";
import { maxRiskLevel, riskWeight } from "./risk-scoring";
import type { IntelligenceIssue, ProjectIntelligenceContext, ProjectIntelligenceSnapshot, RiskRadarCard } from "./types";

const radarCategories = [
  { category: "budget", title: "Бюджет" },
  { category: "schedule", title: "Сроки" },
  { category: "procurement", title: "Материалы и закупки" },
  { category: "finance", title: "Финансы" },
  { category: "documents", title: "Документы" },
  { category: "risks", title: "Риски" }
] as const;

export function buildProjectIntelligence(context: ProjectIntelligenceContext, now = new Date()): ProjectIntelligenceSnapshot {
  const budget = analyzeBudget(context.budgetItems, context.project.contractAmount);
  const schedule = analyzeSchedule(context.scheduleItems, context.materials, now);
  const procurement = analyzeProcurement(context.materials, context.procurementRequests, now);
  const finance = analyzeFinance(context.payments, now);
  const documents = analyzeDocuments(context.documents, now);
  const riskIssues = analyzeRiskRegister(context.risks);
  const allIssues = [...budget.issues, ...schedule.issues, ...procurement.issues, ...finance.issues, ...documents.issues, ...riskIssues];
  const radar = buildRiskRadar(allIssues);
  const missingData = missingDataFor(context);
  const executiveSummary = buildExecutiveSummary(context, radar, missingData, now);
  const actions = buildActionPlan(allIssues, [...procurement.recommendations, ...documents.reviewRecommendations]).slice(0, 24);
  const deterministicSummary = [
    executiveSummary.headline,
    ...executiveSummary.conclusions,
    actions[0] ? `Первое действие: ${actions[0].suggestedNextStep}` : "Рекомендованных действий пока нет."
  ].join("\n");

  return {
    generatedAt: now.toISOString(),
    project: context.project,
    executiveSummary,
    radar,
    budget,
    schedule,
    procurement,
    finance,
    documents,
    actions,
    deterministicSummary,
    ai: getEnvStatus().aiConfigured
      ? { status: "available", message: "AI доступен для формирования управленческой сводки." }
      : { status: "unavailable", message: "AI недоступен, показана расчетная сводка" }
  };
}

function analyzeRiskRegister(risks: Risk[]): IntelligenceIssue[] {
  return risks
    .filter((risk) => risk.status !== "closed")
    .map((risk) =>
      issue({
        id: `risk-register-${risk.id}`,
        category: "risks",
        title: risk.title,
        reason: risk.reason,
        score: risk.priority === "critical" ? 88 : risk.priority === "high" ? 70 : risk.priority === "medium" ? 48 : 25,
        suggestedAction: `Ответственный: ${risk.owner}. Проверьте план закрытия до ${risk.dueAt}.`,
        evidence: [
          evidence({
            entityType: "risk",
            entityId: risk.id,
            label: risk.title,
            field: "priority",
            value: risk.priority,
            explanation: "Ручной риск из реестра проекта."
          })
        ]
      })
    );
}

function buildRiskRadar(issues: IntelligenceIssue[]): RiskRadarCard[] {
  return radarCategories.map(({ category, title }) => {
    const categoryIssues = issues.filter((item) => item.category === category);
    const level = maxRiskLevel(categoryIssues.map((item) => item.level));
    const score = categoryIssues.reduce((max, item) => Math.max(max, item.score), 0);
    const top = [...categoryIssues].sort((a, b) => riskWeight(b.level) - riskWeight(a.level) || b.score - a.score)[0];
    return {
      category,
      title,
      level,
      score,
      shortReason: top?.reason ?? "Критичных сигналов нет или данных недостаточно.",
      suggestedAction: top?.suggestedAction ?? "Продолжайте регулярный контроль.",
      evidence: top?.evidence ?? [
        evidence({
          entityType: "project",
          label: title,
          explanation: "Расчетный радар не нашел критичных отклонений по этой категории."
        })
      ]
    };
  });
}

function missingDataFor(context: ProjectIntelligenceContext) {
  const missing: string[] = [];
  if (!context.budgetItems.length) missing.push("Нет ВОР/бюджетных позиций.");
  if (!context.scheduleItems.length) missing.push("Нет календарного графика.");
  if (!context.materials.length) missing.push("Нет реестра материалов.");
  if (!context.payments.length) missing.push("Нет платежного плана.");
  if (!context.documents.length) missing.push("Нет документов проекта.");
  return missing;
}

export * from "./types";
export * from "./risk-scoring";
export * from "./sanitize-ai-context";
