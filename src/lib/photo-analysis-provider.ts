const OPENAI_RESPONSES_URL = "https://api.openai.com/v1/responses";
const OPENAI_VISION_MODEL = "gpt-4o-mini";
const PHOTO_ANALYSIS_TIMEOUT_MS = 45_000;

export type PhotoAnalysisInput = {
  mimeType: "image/jpeg" | "image/png" | "image/webp";
  bytes: Buffer;
};

type StructuredPhotoAnalysisInput<T> = {
  schemaName: string;
  jsonSchema: Record<string, unknown>;
  systemPrompt: string;
  userPrompt: string;
  photos: PhotoAnalysisInput[];
  parseResult: (value: unknown) => T;
  timeoutMessage: string;
  invalidResultMessage: string;
  detail?: "low" | "high" | "auto";
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

export async function runStructuredPhotoAnalysis<T>(input: StructuredPhotoAnalysisInput<T>) {
  const apiKey = process.env.OPENAI_API_KEY?.trim();
  if (!apiKey) throw new PhotoAnalysisProviderError("AI-анализ фотографий пока не настроен.", 503);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), PHOTO_ANALYSIS_TIMEOUT_MS);
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
            name: input.schemaName,
            strict: true,
            schema: input.jsonSchema
          }
        },
        input: [
          {
            role: "system",
            content: [{ type: "input_text", text: input.systemPrompt }]
          },
          {
            role: "user",
            content: [
              { type: "input_text", text: input.userPrompt },
              ...input.photos.map((photo) => ({
                type: "input_image",
                image_url: `data:${photo.mimeType};base64,${photo.bytes.toString("base64")}`,
                detail: input.detail ?? "high"
              }))
            ]
          }
        ]
      })
    });
  } catch {
    if (controller.signal.aborted) throw new PhotoAnalysisProviderError(input.timeoutMessage, 504);
    throw new PhotoAnalysisProviderError("Сервис AI временно недоступен. Повторите попытку позже.", 502);
  } finally {
    clearTimeout(timeout);
  }

  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new PhotoAnalysisProviderError("Сервис AI временно недоступен. Повторите попытку позже.", 502);
  try {
    return input.parseResult(parseJsonText(responseText(payload)));
  } catch {
    throw new PhotoAnalysisProviderError(input.invalidResultMessage, 502);
  }
}

export class PhotoAnalysisProviderError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}
