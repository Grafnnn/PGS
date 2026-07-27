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
      nested: [{ token: "[REDACTED]", count: 2 }]
    });
  });

  it("redacts values based on sensitive object keys even when values are unlabeled", () => {
    const output = sanitizeAiJournalValue({
      summary: "Нужно проверить график",
      password: "hunter2",
      connection: {
        databaseUrl: "opaque-value",
        accessToken: "plain-token-value",
        tokenCount: 3
      },
      credentials: {
        login: "owner",
        value: "must-not-survive"
      }
    });

    expect(output).toEqual({
      summary: "Нужно проверить график",
      password: "[REDACTED]",
      connection: {
        databaseUrl: "[REDACTED]",
        accessToken: "[REDACTED]",
        tokenCount: 3
      },
      credentials: "[REDACTED]"
    });
    expect(JSON.stringify(output)).not.toContain("hunter2");
    expect(JSON.stringify(output)).not.toContain("opaque-value");
    expect(JSON.stringify(output)).not.toContain("plain-token-value");
    expect(JSON.stringify(output)).not.toContain("must-not-survive");
  });

  it("redacts secret-like values embedded in JSON-shaped text", () => {
    const output = sanitizeAiJournalText('{"password":"hunter2","client_secret":"opaque-value"}');

    expect(output).not.toContain("hunter2");
    expect(output).not.toContain("opaque-value");
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
