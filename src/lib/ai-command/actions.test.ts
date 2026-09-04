import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildAiProjectContext, runAiScenario } from "./index";

const originalOpenAiKey = process.env.OPENAI_API_KEY;
const originalDatabaseUrl = process.env.DATABASE_URL;
const originalOpenAiMode = process.env.OPENAI_CONNECTOR_MODE;

afterEach(() => {
  if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
  else delete process.env.OPENAI_API_KEY;
  if (originalDatabaseUrl) process.env.DATABASE_URL = originalDatabaseUrl;
  else delete process.env.DATABASE_URL;
  if (originalOpenAiMode) process.env.OPENAI_CONNECTOR_MODE = originalOpenAiMode;
  else delete process.env.OPENAI_CONNECTOR_MODE;
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
    "contract-review",
    "risk-review",
    "executive-report",
    "document-review",
    "daily-report-summary",
    "onboarding-review",
    "workforce-review",
    "field-review",
    "quality-review",
    "rfi-review",
    "claims-review",
    "acceptance-review",
    "closeout-review",
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
        json: async () => ({ output_text: "not-json" })
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
          output_text: JSON.stringify({
            title: "Live summary",
            overallStatus: "attention",
            summary: "Live structured output",
            findings: [{ severity: "high", title: "Live finding", description: "Provider finding", source: "budget", recommendation: "Check it" }],
            recommendedActions: [{ priority: "high", title: "Live action", description: "Do it" }],
            subject: null,
            draftText: null,
            recommendedAttachments: [],
            dataLimitations: ["Provider limitation"]
          })
        })
      }))
    );

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "summary" });

    expect(insight.provider).toBe("openai");
    expect(insight.summary).toContain("Live structured output");
    expect(insight.findings.some((item) => item.title === "Live finding")).toBe(true);
    expect(insight.dataUsed).toContain("project");
    expect(JSON.stringify(insight)).not.toContain("openai-token-redacted");
  });

  it("does not call the provider when the OpenAI connector is disabled", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    process.env.OPENAI_CONNECTOR_MODE = "disabled";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "summary" });

    expect(insight.provider).toBe("deterministic");
    expect(insight.dataLimitations.join(" ")).toContain("connector отключен");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps deterministic evidence and prevents a provider status downgrade", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    process.env.OPENAI_CONNECTOR_MODE = "read_only";
    const fetchMock = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        output_text: JSON.stringify({
          title: "Everything is fine",
          overallStatus: "on_track",
          summary: "No issues",
          findings: [],
          recommendedActions: [],
          subject: null,
          draftText: null,
          recommendedAttachments: [],
          dataLimitations: []
        })
      })
    }));
    vi.stubGlobal("fetch", fetchMock);

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "schedule-review" });

    expect(insight.provider).toBe("openai");
    expect(insight.overallStatus).not.toBe("on_track");
    expect(insight.findings.some((item) => item.source === "schedule")).toBe(true);
    const fetchCall = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const request = JSON.parse(String(fetchCall[1].body)) as {
      store: boolean;
      text: { format: { strict: boolean; type: string } };
      input: Array<{ content: Array<{ text: string }> }>;
    };
    expect(request.store).toBe(false);
    expect(request.text.format).toMatchObject({ type: "json_schema", strict: true });
    const userPayload = JSON.parse(request.input[1].content[0].text) as { context: Record<string, unknown> };
    expect(userPayload.context).toHaveProperty("schedule");
    expect(userPayload.context).not.toHaveProperty("commercial");
  });

  it("prioritizes severe deterministic findings without collapsing separate evidence", async () => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "summary" });
    const severityRank = { critical: 0, high: 1, medium: 2, low: 3 } as const;
    const ranks = insight.findings.map((item) => severityRank[item.severity]);

    expect(ranks).toEqual([...ranks].sort((left, right) => left - right));
    expect(insight.findings.filter((item) => item.title === "Дефицит материала").length).toBeGreaterThan(1);
    expect(new Set(insight.findings.map((item) => `${item.title}:${item.description}:${item.source ?? ""}`)).size).toBe(insight.findings.length);
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
