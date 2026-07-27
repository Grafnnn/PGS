import { describe, expect, it } from "vitest";
import { aiRunStatusForInsight, sanitizeAiJournalText, sanitizeAiJournalValue } from "./ai-run-journal";

describe("AI decision journal safety", () => {
  it("redacts database URLs, provider keys, bearer tokens and named secrets", () => {
    const input = "postgresql://owner:pass@db.local/pgs sk-proj-abcdefghijklmnop Bearer abc.def.ghi password=hunter2";
    const output = sanitizeAiJournalText(input);

    expect(output).not.toContain("owner:pass");
    expect(output).not.toContain("sk-proj-abcdefghijklmnop");
    expect(output).not.toContain("abc.def.ghi");
    expect(output).not.toContain("hunter2");
    expect(output.match(/\[REDACTED/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it("sanitizes nested AI output without changing scalar evidence", () => {
    const output = sanitizeAiJournalValue({
      summary: "Нужно проверить график",
      nested: [{ token: "token=very-secret-value", count: 2 }]
    });

    expect(output).toEqual({
      summary: "Нужно проверить график",
      nested: [{ token: "token=[REDACTED]", count: 2 }]
    });
  });

  it("marks provider fallback as degraded", () => {
    expect(aiRunStatusForInsight({
      title: "Fallback",
      scenario: "summary",
      summary: "Safe fallback",
      findings: [],
      recommendedActions: [],
      dataUsed: [],
      dataLimitations: [],
      generatedAt: "2026-07-27T10:00:00.000Z",
      provider: "degraded"
    })).toBe("degraded");
  });
});
