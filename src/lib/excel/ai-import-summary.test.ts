import { afterEach, describe, expect, it, vi } from "vitest";
import { buildPreview } from "./import-parser";
import { buildDeterministicImportExplanation, explainImportPreview, sanitizeImportContext } from "./ai-import-summary";

function previewWithSecretLikeText() {
  return buildPreview({
    projectId: "project-demo",
    fileName: "вор.xlsx",
    sheets: ["ВОР"],
    mapping: [
      {
        sheetName: "ВОР",
        headerRow: 1,
        columns: { name: 0, qty: 1, unitPrice: 2 },
        included: true,
        detectedType: "works",
        confidence: 0.8,
        sampleRows: [
          ["Наименование", "Кол-во", "Цена"],
          ["sk-test-secret-token", "10", "100"]
        ],
        columnDetails: [
          { target: "name", sourceIndex: 0, sourceHeader: "Наименование", confidence: 0.9, samples: ["postgresql://user:pass@localhost:5432/db"] }
        ],
        rows: 2,
        parsedRows: 1,
        hiddenRows: 0,
        formulaCells: 0,
        warnings: []
      }
    ],
    sections: [],
    budgetItems: [],
    materials: [],
    scheduleItems: [],
    unknownRows: [{ sheetName: "ВОР", rowNumber: 2, reason: "Неизвестная строка", values: ["sk-test-secret-token"] }],
    previewRows: [
      {
        id: "ВОР:2",
        sheetName: "ВОР",
        sourceRowNumber: 2,
        status: "warning",
        entityType: "unknown",
        name: "sk-test-secret-token",
        normalizedJson: {},
        warnings: ["Неизвестная строка"],
        errors: [],
        suspiciousFlags: ["unknownClassification"]
      }
    ],
    warnings: ["Неизвестная строка"],
    errors: []
  });
}

describe("AI-assisted import explanation", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("builds deterministic explanation without OpenAI", async () => {
    vi.stubEnv("OPENAI_API_KEY", "");
    const fetchMock = vi.spyOn(globalThis, "fetch");
    const preview = previewWithSecretLikeText();

    const explanation = await explainImportPreview(preview);

    expect(explanation.status).toBe("deterministic");
    expect(explanation.summary).toContain("вор.xlsx");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sanitizes bounded AI context", () => {
    const contextText = JSON.stringify(sanitizeImportContext(previewWithSecretLikeText()));

    expect(contextText).not.toContain("sk-test-secret-token");
    expect(contextText).not.toContain("postgresql://user:pass");
    expect(contextText).toContain("[REDACTED]");
  });

  it("summarizes warnings and next steps deterministically", () => {
    const explanation = buildDeterministicImportExplanation(previewWithSecretLikeText());

    expect(explanation.warningsToReview).toContain("Неизвестная строка");
    expect(explanation.recommendedNextSteps.some((step) => step.includes("неизвестные строки"))).toBe(true);
  });
});
