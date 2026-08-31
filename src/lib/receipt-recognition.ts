import { z } from "zod";
import { expenseCategories, expensePaymentMethods } from "@/lib/project-expense-config";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_RECEIPT_MODEL = "gpt-4o-mini";

const nullableString = { anyOf: [{ type: "string" }, { type: "null" }] } as const;
const nullableNumber = { anyOf: [{ type: "number" }, { type: "null" }] } as const;

const receiptJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["merchant", "documentNumber", "expenseDate", "currency", "grossAmount", "taxAmount", "paymentMethod", "category", "items", "confidence", "warnings"],
  properties: {
    merchant: nullableString,
    documentNumber: nullableString,
    expenseDate: nullableString,
    currency: { type: "string" },
    grossAmount: nullableNumber,
    taxAmount: nullableNumber,
    paymentMethod: { type: "string", enum: expensePaymentMethods },
    category: { type: "string", enum: expenseCategories },
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name", "category", "quantity", "unit", "unitPrice", "amount", "taxAmount"],
        properties: {
          name: { type: "string" },
          category: { type: "string", enum: expenseCategories },
          quantity: { type: "number" },
          unit: { type: "string" },
          unitPrice: { type: "number" },
          amount: { type: "number" },
          taxAmount: { type: "number" }
        }
      }
    },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    warnings: { type: "array", items: { type: "string" } }
  }
} as const;

export const receiptRecognitionResultSchema = z.object({
  merchant: z.string().trim().min(1).max(300).nullable(),
  documentNumber: z.string().trim().max(120).nullable(),
  expenseDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/).default("RUB"),
  grossAmount: z.number().finite().min(0).nullable(),
  taxAmount: z.number().finite().min(0).nullable(),
  paymentMethod: z.enum(expensePaymentMethods),
  category: z.enum(expenseCategories),
  items: z.array(z.object({
    name: z.string().trim().min(1).max(300),
    category: z.enum(expenseCategories),
    quantity: z.number().finite().min(0),
    unit: z.string().trim().min(1).max(40),
    unitPrice: z.number().finite().min(0),
    amount: z.number().finite().min(0),
    taxAmount: z.number().finite().min(0)
  })).max(100),
  confidence: z.enum(["low", "medium", "high"]),
  warnings: z.array(z.string().trim().min(1).max(500)).max(20)
});

export type ReceiptRecognitionResult = z.infer<typeof receiptRecognitionResultSchema>;

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: string }> }> };
  if (typeof record.output_text === "string") return record.output_text;
  return (record.output ?? []).flatMap((item) => item.content ?? []).filter((item) => item.type === "output_text" && typeof item.text === "string").map((item) => item.text).join("\n");
}

function parseJsonText(value: string) {
  return JSON.parse(value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "")) as unknown;
}

export async function recognizeReceipt(input: { fileName: string; mimeType: "image/jpeg" | "image/png" | "image/webp" | "application/pdf"; bytes: Buffer }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new ReceiptRecognitionProviderError("Распознавание чеков не настроено", 503);
  const fileContent = input.mimeType === "application/pdf"
    ? { type: "input_file", filename: input.fileName, file_data: `data:application/pdf;base64,${input.bytes.toString("base64")}` }
    : { type: "input_image", image_url: `data:${input.mimeType};base64,${input.bytes.toString("base64")}`, detail: "high" };
  const response = await fetch(OPENAI_RESPONSES_URL, {
    method: "POST",
    headers: { authorization: `Bearer ${apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({
      model: OPENAI_RECEIPT_MODEL,
      temperature: 0.1,
      text: { format: { type: "json_schema", name: "project_expense_receipt", strict: true, schema: receiptJsonSchema } },
      input: [
        { role: "system", content: [{ type: "input_text", text: "Ты бухгалтер строительного проекта. Извлеки только явно видимые данные чека или кассового документа. Не придумывай поставщика, дату, номер, НДС, позиции или суммы. Для неизвестных значений используй null, unknown или warning. Дату верни YYYY-MM-DD, валюту ISO-кодом, категории только из заданного списка. Сумма позиции должна соответствовать данным документа, а не расчётной догадке. Ответ только на русском языке в заданной JSON-схеме." }] },
        { role: "user", content: [{ type: "input_text", text: `Распознай расходный документ ${input.fileName}. Разнеси видимые позиции постатейно.` }, fileContent] }
      ]
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new ReceiptRecognitionProviderError("Сервис распознавания чеков временно недоступен", 502);
  try {
    return receiptRecognitionResultSchema.parse(parseJsonText(responseText(payload)));
  } catch {
    throw new ReceiptRecognitionProviderError("Не удалось проверить результат распознавания чека", 502);
  }
}

export class ReceiptRecognitionProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
