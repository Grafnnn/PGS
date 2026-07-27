import type { AiInsightResponse } from "@/lib/ai-command/types";

export type AiDecisionJournalSmokeAssertions = {
  runCreated: boolean;
  runListed: boolean;
  feedbackRecorded: boolean;
  actionCreated: boolean;
  duplicatePrevented: boolean;
  cleanupPassed: boolean;
  roleRestored: boolean;
};

export function buildAiDecisionJournalSmokeInsight(runKey: string, generatedAt = new Date()): AiInsightResponse {
  return {
    title: `SMOKE-${runKey} AI decision journal`,
    scenario: "summary",
    overallStatus: "attention",
    summary: "Synthetic staging-only result for the AI decision journal lifecycle.",
    findings: [
      {
        severity: "medium",
        title: "Synthetic review marker",
        description: "The smoke run verifies feedback and controlled action conversion without a provider call.",
        source: "runtime-smoke"
      }
    ],
    recommendedActions: [
      {
        priority: "high",
        title: `SMOKE-${runKey} verify AI action`,
        description: "Synthetic action created only to verify the staging decision-journal lifecycle."
      }
    ],
    dataUsed: ["Synthetic staging smoke data"],
    dataLimitations: ["No live provider call was made."],
    generatedAt: generatedAt.toISOString(),
    provider: "deterministic"
  };
}

export function aiDecisionJournalSmokePassed(assertions: AiDecisionJournalSmokeAssertions) {
  return Object.values(assertions).every(Boolean);
}
