import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PhotoAnalysisProviderError, runStructuredPhotoAnalysis } from "./photo-analysis-provider";

const originalKey = process.env.OPENAI_API_KEY;
const originalMode = process.env.OPENAI_CONNECTOR_MODE;

describe("structured photo analysis provider", () => {
  beforeEach(() => {
    process.env.OPENAI_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.OPENAI_API_KEY = originalKey;
    if (originalMode === undefined) delete process.env.OPENAI_CONNECTOR_MODE;
    else process.env.OPENAI_CONNECTOR_MODE = originalMode;
    vi.restoreAllMocks();
  });

  it("requests a non-persistent structured result", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      output_text: JSON.stringify({ answer: "ok" })
    }), { status: 200, headers: { "content-type": "application/json" } }));

    const result = await runStructuredPhotoAnalysis({
      schemaName: "test_photo_result",
      jsonSchema: { type: "object", properties: { answer: { type: "string" } }, required: ["answer"], additionalProperties: false },
      systemPrompt: "Inspect only visible evidence.",
      userPrompt: "What is visible?",
      photos: [{ mimeType: "image/jpeg", bytes: Buffer.from("image") }],
      parseResult: (value) => value as { answer: string },
      timeoutMessage: "timeout",
      invalidResultMessage: "invalid"
    });

    expect(result).toEqual({ answer: "ok" });
    const request = JSON.parse(String(fetchMock.mock.calls[0][1]?.body)) as { store: boolean; text: { format: { name: string } } };
    expect(request.store).toBe(false);
    expect(request.text.format.name).toBe("test_photo_result");
  });

  it("returns a bounded configuration error without an API key", async () => {
    delete process.env.OPENAI_API_KEY;

    await expect(runStructuredPhotoAnalysis({
      schemaName: "test",
      jsonSchema: {},
      systemPrompt: "system",
      userPrompt: "user",
      photos: [],
      parseResult: (value) => value,
      timeoutMessage: "timeout",
      invalidResultMessage: "invalid"
    })).rejects.toEqual(expect.objectContaining<Partial<PhotoAnalysisProviderError>>({ status: 503 }));
  });

  it("does not send photos when the connector is disabled", async () => {
    process.env.OPENAI_CONNECTOR_MODE = "disabled";
    const fetchMock = vi.spyOn(globalThis, "fetch");

    await expect(runStructuredPhotoAnalysis({
      schemaName: "test",
      jsonSchema: {},
      systemPrompt: "system",
      userPrompt: "user",
      photos: [{ mimeType: "image/jpeg", bytes: Buffer.from("image") }],
      parseResult: (value) => value,
      timeoutMessage: "timeout",
      invalidResultMessage: "invalid"
    })).rejects.toEqual(expect.objectContaining<Partial<PhotoAnalysisProviderError>>({ status: 503 }));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
