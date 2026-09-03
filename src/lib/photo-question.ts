import { z } from "zod";

const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_VISION_MODEL = "gpt-4o-mini";
const PHOTO_QUESTION_TIMEOUT_MS = 45_000;

const photoQuestionJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["answer", "observations", "risks", "recommendedActions", "confidence", "limitations"],
  properties: {
    answer: { type: "string" },
    observations: { type: "array", items: { type: "string" } },
    risks: { type: "array", items: { type: "string" } },
    recommendedActions: { type: "array", items: { type: "string" } },
    confidence: { type: "string", enum: ["low", "medium", "high"] },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;

export const photoQuestionRequestSchema = z.object({
  question: z.string().trim().min(3).max(2_000),
  documentIds: z.array(z.string().min(1).max(200)).min(1).max(4)
});

export const photoQuestionResultSchema = z.object({
  answer: z.string().trim().min(1).max(4_000),
  observations: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  risks: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  recommendedActions: z.array(z.string().trim().min(1).max(500)).max(10).default([]),
  confidence: z.enum(["low", "medium", "high"]).default("low"),
  limitations: z.array(z.string().trim().min(1).max(500)).max(10).default([])
});

export type PhotoQuestionResult = z.infer<typeof photoQuestionResultSchema>;

type PhotoInput = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: string }> }>;
  };
  if (typeof record.output_text === "string") return record.output_text;
  return (record.output ?? [])
    .flatMap((item) => item.content ?? [])
    .filter((item) => item.type === "output_text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n");
}

function parseJsonText(value: string) {
  const trimmed = value.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(trimmed) as unknown;
}

export async function askPhotoQuestion(input: { question: string; photos: PhotoInput[] }) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new PhotoQuestionProviderError("AI-анализ фотографий пока не настроен.", 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_QUESTION_TIMEOUT_MS);
  let response: Response;
  try {
    response = await fetch(OPENAI_RESPONSES_URL, {
      method: "POST",
      signal: controller.signal,
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_VISION_MODEL,
        store: false,
        temperature: 0.1,
        text: {
          format: {
            type: "json_schema",
            name: "daily_report_photo_analysis",
            strict: true,
            schema: photoQuestionJsonSchema
          }
        },
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: "Ты помощник прораба и инженера ПТО. Анализируй только приложенные фотографии и вопрос. Не придумывай скрытые размеры, марки материалов, причины дефектов или соответствие нормам, если это нельзя надежно увидеть. Верни только JSON: answer, observations, risks, recommendedActions, confidence (low|medium|high), limitations. Ответ на русском языке."
            }]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: input.question },
              ...input.photos.map((photo) => ({
                type: "input_image",
                image_url: `data:${photo.mimeType};base64,${photo.bytes.toString("base64")}`,
                detail: "high"
              }))
            ]
          }
        ]
      })
    });
  } catch {
    if (controller.signal.aborted) {
      throw new PhotoQuestionProviderError("Анализ занял слишком много времени. Выберите меньше фотографий и повторите попытку.", 504);
    }
    throw new PhotoQuestionProviderError("Сервис AI временно недоступен. Повторите попытку позже.", 502);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PhotoQuestionProviderError("Сервис AI временно недоступен. Повторите попытку позже.", 502);
  try {
    return photoQuestionResultSchema.parse(parseJsonText(responseText(payload)));
  } catch {
    throw new PhotoQuestionProviderError("AI вернул неполный результат. Повторите вопрос или выберите другие фотографии.", 502);
  }
}

export class PhotoQuestionProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
