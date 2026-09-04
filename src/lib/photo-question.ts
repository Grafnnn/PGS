import { z } from "zod";
import {
  PhotoAnalysisProviderError,
  runStructuredPhotoAnalysis,
  type PhotoAnalysisInput
} from "@/lib/photo-analysis-provider";

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

export async function askPhotoQuestion(input: { question: string; photos: PhotoAnalysisInput[] }) {
  return runStructuredPhotoAnalysis({
    schemaName: "daily_report_photo_analysis",
    jsonSchema: photoQuestionJsonSchema,
    systemPrompt: "Ты помощник прораба и инженера ПТО. Анализируй только приложенные фотографии и вопрос. Не придумывай скрытые размеры, марки материалов, причины дефектов или соответствие нормам, если это нельзя надежно увидеть. Верни только JSON: answer, observations, risks, recommendedActions, confidence (low|medium|high), limitations. Ответ на русском языке.",
    userPrompt: input.question,
    photos: input.photos,
    parseResult: (value) => photoQuestionResultSchema.parse(value),
    timeoutMessage: "Анализ занял слишком много времени. Выберите меньше фотографий и повторите попытку.",
    invalidResultMessage: "AI вернул неполный результат. Повторите вопрос или выберите другие фотографии."
  });
}

export { PhotoAnalysisProviderError as PhotoQuestionProviderError };
