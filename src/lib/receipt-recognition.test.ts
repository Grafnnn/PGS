import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { recognizeReceipt, ReceiptRecognitionProviderError } from "@/lib/receipt-recognition";

const previousKey = process.env.OPENAI_API_KEY;
const previousMode = process.env.OPENAI_CONNECTOR_MODE;

beforeEach(() => {
  process.env.OPENAI_CONNECTOR_MODE = "read_only";
});

afterEach(() => {
  vi.unstubAllGlobals();
  if (previousKey === undefined) delete process.env.OPENAI_API_KEY;
  else process.env.OPENAI_API_KEY = previousKey;
  if (previousMode === undefined) delete process.env.OPENAI_CONNECTOR_MODE;
  else process.env.OPENAI_CONNECTOR_MODE = previousMode;
});

describe("receipt recognition", () => {
  it("fails safely when the provider is not configured", async () => {
    delete process.env.OPENAI_API_KEY;
    await expect(recognizeReceipt({ fileName: "receipt.jpg", mimeType: "image/jpeg", bytes: Buffer.from("image") })).rejects.toMatchObject({ status: 503 });
  });

  it("sends an image only on explicit call and validates structured output", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: JSON.stringify({
      merchant: "ООО Стройснаб", documentNumber: "17", expenseDate: "2026-08-31", currency: "RUB", grossAmount: 1200,
      taxAmount: 200, paymentMethod: "card", category: "materials", confidence: "high", warnings: [],
      items: [{ name: "Крепёж", category: "materials", quantity: 2, unit: "уп", unitPrice: 600, amount: 1200, taxAmount: 200 }]
    }) }), { status: 200, headers: { "content-type": "application/json" } }));
    vi.stubGlobal("fetch", fetchMock);
    const result = await recognizeReceipt({ fileName: "receipt.jpg", mimeType: "image/jpeg", bytes: Buffer.from("image") });
    expect(result).toMatchObject({ merchant: "ООО Стройснаб", grossAmount: 1200, confidence: "high" });
    const requestBody = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { input: Array<{ content: Array<Record<string, unknown>> }> };
    expect(requestBody.input[1].content[1]).toMatchObject({ type: "input_image", detail: "high" });
    expect(JSON.stringify(requestBody)).not.toContain("test-key");
  });

  it("rejects provider output that does not match the receipt schema", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ output_text: "{}" }), { status: 200 })));
    await expect(recognizeReceipt({ fileName: "receipt.pdf", mimeType: "application/pdf", bytes: Buffer.from("pdf") })).rejects.toBeInstanceOf(ReceiptRecognitionProviderError);
  });

  it("does not send a receipt when the connector is disabled", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    process.env.OPENAI_CONNECTOR_MODE = "disabled";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await expect(recognizeReceipt({ fileName: "receipt.jpg", mimeType: "image/jpeg", bytes: Buffer.from("image") })).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
