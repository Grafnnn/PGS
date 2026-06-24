import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiProjectContext, runAiScenario } from "./index";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL;

afterEach(() => {
  if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
  else delete process.env.OPENAI_API_KEY;
  if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  else delete process.env.DATABASE_URL;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("AI command layer", () => {
  beforeEach(() => {
    delete process.env.DATABASE_URL;
  });

  it("builds bounded project context with management signals", async () => {
    const context = await buildAiProjectContext("project-demo");

    expect(context.project.id).toBe("project-demo");
    expect(context.budget.itemCount).toBeGreaterThan(0);
    expect(context.budget.sections.length).toBeGreaterThan(0);
    expect(context.budget.largeItems.length).toBeGreaterThan(0);
    expect(context.schedule.delayed.length).toBeGreaterThan(0);
    expect(context.materials.deficit.length).toBeGreaterThan(0);
    expect(context.procurement.materialsWithoutQuotes.length).toBeGreaterThan(0);
    expect(context.dataLimitations).toContain("Документы анализируются по метаданным: OCR/извлеченный текст пока не подключены.");
  });

  it("returns deterministic structured fallback without OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "budget-review" });

    expect(insight.provider).toBe("deterministic");
    expect(insight.scenario).toBe("budget-review");
    expect(insight.findings.length).toBeGreaterThan(0);
    expect(insight.dataUsed).toContain("budget");
    expect(insight.dataLimitations.join(" ")).toContain("AI provider key");
    expect(JSON.stringify(insight)).not.toContain("OPENAI_API_KEY");
  });

  it("builds procurement draft text from deficit materials", async () => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "procurement-review" });

    expect(insight.draftText).toContain("Срочная заявка снабжения");
    expect(insight.draftText).toContain("AI не подтверждает рыночные цены");
    expect(insight.subject).toContain("Срочная заявка снабжения");
    expect(insight.recommendedAttachments).toContain("КП/прайсы поставщиков");
  });

  it.each([
    "summary",
    "budget-review",
    "schedule-review",
    "procurement-review",
    "finance-review",
    "risk-review",
    "executive-report",
    "document-review",
    "daily-report-summary",
    "draft-text"
  ] as const)("returns a structured deterministic response for %s", async (scenario) => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario, topic: "Статус объекта", instructions: "Коротко" });

    expect(insight.scenario).toBe(scenario);
    expect(insight.title).toBeTruthy();
    expect(insight.summary).toBeTruthy();
    expect(insight.recommendedActions.length).toBeGreaterThan(0);
    expect(insight.dataUsed.length).toBeGreaterThan(0);
    expect(insight.provider).toBe("deterministic");
  });

  it("returns degraded deterministic fallback when provider JSON is invalid", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({ choices: [{ message: { content: "not-json" } }] })
      }))
    );

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "summary" });

    expect(insight.provider).toBe("degraded");
    expect(insight.dataLimitations.join(" ")).toContain("невалидный structured JSON");
    expect(JSON.stringify(insight)).not.toContain("openai-token-redacted");
  });

  it("merges a valid structured provider response without leaking request details", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: true,
        json: async () => ({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  title: "Live summary",
                  overallStatus: "attention",
                  summary: "Live structured output",
                  findings: [{ severity: "high", title: "Live finding", description: "Provider finding", source: "budget", recommendation: "Check it" }],
                  recommendedActions: [{ priority: "high", title: "Live action", description: "Do it" }],
                  dataUsed: ["project", "budget"],
                  dataLimitations: ["Provider limitation"]
                })
              }
            }
          ]
        })
      }))
    );

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "summary" });

    expect(insight.provider).toBe("openai");
    expect(insight.summary).toBe("Live structured output");
    expect(insight.findings[0]?.title).toBe("Live finding");
    expect(JSON.stringify(insight)).not.toContain("openai-token-redacted");
  });

  it("returns degraded fallback on provider failure without raw error details", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({
        ok: false,
        json: async () => ({ error: { message: "sk-leaked-secret should not leave server" } })
      }))
    );

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "finance-review" });

    expect(insight.provider).toBe("degraded");
    expect(insight.dataLimitations.join(" ")).toContain("Live AI недоступен");
    expect(JSON.stringify(insight)).not.toContain("sk-leaked-secret");
  });
});
