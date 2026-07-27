import { describe, expect, it } from "vitest";
import { aiInsightResponseSchema } from "@/lib/ai-command/schemas";
import { aiDecisionJournalSmokePassed, buildAiDecisionJournalSmokeInsight } from "./ai-decision-journal";

describe("AI decision journal staging smoke helpers", () => {
  it("builds a deterministic actionable result accepted by the production schema", () => {
    const result = buildAiDecisionJournalSmokeInsight("run-123", new Date("2026-07-27T12:00:00.000Z"));

    expect(aiInsightResponseSchema.parse(result)).toEqual(result);
    expect(result.provider).toBe("deterministic");
    expect(result.recommendedActions).toHaveLength(1);
    expect(JSON.stringify(result)).not.toMatch(/password|database_url|access_token|cookie/i);
  });

  it("passes only when the complete lifecycle and cleanup are verified", () => {
    const complete = {
      runCreated: true,
      runListed: true,
      feedbackRecorded: true,
      actionCreated: true,
      duplicatePrevented: true,
      cleanupPassed: true,
      roleRestored: true
    };

    expect(aiDecisionJournalSmokePassed(complete)).toBe(true);
    for (const key of Object.keys(complete) as Array<keyof typeof complete>) {
      expect(aiDecisionJournalSmokePassed({ ...complete, [key]: false })).toBe(false);
    }
  });
});
