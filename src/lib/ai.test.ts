import { afterEach, beforeEach, describe, expect, it, type MockInstance, vi } from "vitest";
import { askProjectAssistant } from "./ai";

vi.mock("./project-data", () => ({
  getProjectBundleFromDb: vi.fn().mockResolvedValue(null)
}));

const originalOpenAiKey = process.env.OPENAI_API_KEY;

function chatResponse(content = "Готово: риск сроков, риск материалов, риск кассового разрыва.") {
  return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
    status: 200,
    headers: { "content-type": "application/json" }
  });
}

describe("AI provider resilience", () => {
  let fetchMock: MockInstance<typeof globalThis.fetch>;
  let warnMock: MockInstance<typeof console.warn>;

  beforeEach(() => {
    fetchMock = vi.spyOn(globalThis, "fetch");
    warnMock = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    if (originalOpenAiKey) process.env.OPENAI_API_KEY = originalOpenAiKey;
    else delete process.env.OPENAI_API_KEY;
    fetchMock.mockRestore();
    warnMock.mockRestore();
  });

  it("keeps missing OpenAI key degraded behavior without calling fetch", async () => {
    delete process.env.OPENAI_API_KEY;

    const result = await askProjectAssistant("project-demo", "Что важно?");

    expect(result.status).toBe(503);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "OPENAI_API_KEY is not configured" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("retries a transient provider fetch failure once and returns success", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    fetchMock.mockRejectedValueOnce(new Error("Premature close"));
    fetchMock.mockResolvedValueOnce(chatResponse());

    const result = await askProjectAssistant("project-demo", "Назови риски.");

    expect(result.status).toBe(200);
    expect(result.ok).toBe(true);
    expect(result.response).toContain("риск сроков");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("returns a controlled provider error after one retry failure", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    fetchMock.mockRejectedValueOnce(new Error("Premature close"));
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }));

    const result = await askProjectAssistant("project-demo", "Назови риски.");

    expect(result.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "AI provider request failed" });
    expect(result.response).not.toMatch(/Error:|at\s+\S+\s+\(/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("converts OpenAI non-success responses to a safe provider error", async () => {
    process.env.OPENAI_API_KEY = "openai-token-redacted";
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            type: "server_error",
            code: "upstream_failed",
            message: "provider body with sensitive-token-should-not-leak"
          }
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      )
    );

    const result = await askProjectAssistant("project-demo", "Назови риски.");
    const serialized = JSON.stringify(result);

    expect(result.status).toBe(502);
    expect(result.ok).toBe(false);
    expect(result).toMatchObject({ error: "AI provider request failed" });
    expect(serialized).not.toContain("sensitive-token-should-not-leak");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
