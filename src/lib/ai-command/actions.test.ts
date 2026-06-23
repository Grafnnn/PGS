import { afterEach, describe, expect, it, vi } from "vitest";
import { buildAiProjectContext, runAiScenario } from "./index";

const originalOpenAiKey = process.env.OPENAI_API_KEY;

afterEach(() => {
  if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
  else delete process.env.OPENAI_API_KEY;
  vi.restoreAllMocks();
});

describe("AI command layer", () => {
  it("builds bounded project context with management signals", async () => {
    const context = await buildAiProjectContext("project-demo");

    expect(context.project.id).toBe("project-demo");
    expect(context.budget.sections.length).toBeGreaterThan(0);
    expect(context.schedule.delayed.length).toBeGreaterThan(0);
    expect(context.materials.deficit.length).toBeGreaterThan(0);
    expect(context.dataLimitations).toContain("Документы анализируются по метаданным: OCR/извлеченный текст пока не подключены.");
  });

  it("returns deterministic structured fallback without OPENAI_API_KEY", async () => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "budget-review" });

    expect(insight.provider).toBe("deterministic");
    expect(insight.scenario).toBe("budget-review");
    expect(insight.findings.length).toBeGreaterThan(0);
    expect(insight.dataUsed).toContain("budget");
  });

  it("builds procurement draft text from deficit materials", async () => {
    delete process.env.OPENAI_API_KEY;

    const insight = await runAiScenario({ projectId: "project-demo", scenario: "procurement-review" });

    expect(insight.draftText).toContain("Срочная заявка снабжения");
    expect(insight.draftText).toContain("AI не подтверждает рыночные цены");
  });
});
