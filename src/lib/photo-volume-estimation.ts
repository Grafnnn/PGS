import { z } from "zod";
import {
  runStructuredPhotoAnalysis,
  type PhotoAnalysisInput
} from "@/lib/photo-analysis-provider";

const photoVolumeJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["summary", "suggestions", "limitations"],
  properties: {
    summary: { type: "string" },
    suggestions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["scheduleItemId", "suggestedQuantity", "confidence", "basis", "needsManualMeasurement"],
        properties: {
          scheduleItemId: { type: "string" },
          suggestedQuantity: { type: ["number", "null"] },
          confidence: { type: "string", enum: ["low", "medium", "high"] },
          basis: { type: "string" },
          needsManualMeasurement: { type: "boolean" }
        }
      }
    },
    limitations: { type: "array", items: { type: "string" } }
  }
} as const;

const rawPhotoVolumeResultSchema = z.object({
  summary: z.string().trim().min(1).max(2_000),
  suggestions: z.array(z.object({
    scheduleItemId: z.string().trim().min(1).max(200),
    suggestedQuantity: z.number().positive().max(1_000_000_000).nullable(),
    confidence: z.enum(["low", "medium", "high"]),
    basis: z.string().trim().min(1).max(1_000),
    needsManualMeasurement: z.boolean()
  }).strict()).max(20),
  limitations: z.array(z.string().trim().min(1).max(500)).max(12)
}).strict();

export const photoVolumeRequestSchema = z.object({
  documentIds: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
  scheduleItemIds: z.array(z.string().trim().min(1).max(200)).min(1).max(20)
}).strict();

export type PhotoVolumeWorkContext = {
  scheduleItemId: string;
  workName: string;
  unit: string;
  plannedQuantity: number;
  completedQuantity: number;
  remainingQuantity: number;
};

export type PhotoVolumeSuggestion = {
  scheduleItemId: string;
  workName: string;
  suggestedQuantity: number | null;
  unit: string;
  confidence: "low" | "medium" | "high";
  basis: string;
  needsManualMeasurement: boolean;
};

export type PhotoVolumeResult = {
  summary: string;
  suggestions: PhotoVolumeSuggestion[];
  limitations: string[];
};

function number(value: number) {
  return value.toLocaleString("ru-RU", { maximumFractionDigits: 3 });
}

export function normalizePhotoVolumeResult(
  value: z.infer<typeof rawPhotoVolumeResultSchema>,
  works: PhotoVolumeWorkContext[]
): PhotoVolumeResult {
  const workById = new Map(works.map((work) => [work.scheduleItemId, work]));
  const rawById = new Map(value.suggestions.map((suggestion) => [suggestion.scheduleItemId, suggestion]));
  const limitations = [...value.limitations];

  const suggestions = works.map((work) => {
    const raw = rawById.get(work.scheduleItemId);
    let suggestedQuantity = raw?.suggestedQuantity ?? null;
    let needsManualMeasurement = raw?.needsManualMeasurement ?? true;
    let basis = raw?.basis ?? "На выбранных фото недостаточно данных для оценки этой работы.";
    let confidence = raw?.confidence ?? "low";

    if (suggestedQuantity !== null && suggestedQuantity > work.remainingQuantity) {
      suggestedQuantity = null;
      needsManualMeasurement = true;
      confidence = "low";
      basis = `Оценка превышает остаток ${number(work.remainingQuantity)} ${work.unit}; требуется ручная проверка.`;
      limitations.push(`Для «${work.workName}» отклонена оценка, превышающая остаток по графику.`);
    }

    if (suggestedQuantity !== null && (confidence === "low" || needsManualMeasurement)) {
      suggestedQuantity = null;
      needsManualMeasurement = true;
      confidence = "low";
      limitations.push(`Для «${work.workName}» числовая оценка не подставлена: AI указал низкую уверенность или необходимость ручного замера.`);
    }

    if (!Number.isFinite(suggestedQuantity ?? 0) || (suggestedQuantity ?? 0) <= 0) {
      suggestedQuantity = null;
      needsManualMeasurement = true;
      confidence = "low";
    } else {
      suggestedQuantity = Math.round((suggestedQuantity as number) * 1000) / 1000;
    }

    return {
      scheduleItemId: work.scheduleItemId,
      workName: work.workName,
      suggestedQuantity,
      unit: work.unit,
      confidence,
      basis,
      needsManualMeasurement
    };
  });

  return {
    summary: value.summary,
    suggestions,
    limitations: [...new Set(limitations)].slice(0, 12)
  };
}

function workPrompt(works: PhotoVolumeWorkContext[]) {
  return works.map((work) => [
    `ID: ${work.scheduleItemId}`,
    `Работа: ${work.workName}`,
    `Единица: ${work.unit}`,
    `Общий объём: ${number(work.plannedQuantity)}`,
    `Выполнено ранее: ${number(work.completedQuantity)}`,
    `Остаток: ${number(work.remainingQuantity)}`
  ].join("; ")).join("\n");
}

export async function estimatePhotoVolumes(input: { works: PhotoVolumeWorkContext[]; photos: PhotoAnalysisInput[] }) {
  const raw = await runStructuredPhotoAnalysis({
    schemaName: "daily_report_photo_volume_estimation",
    jsonSchema: photoVolumeJsonSchema,
    systemPrompt: [
      "Ты инженер ПТО, помогающий подготовить черновик фактических объёмов по фотографиям стройплощадки.",
      "Оценивай только то, что действительно видно. Не используй общий объём или остаток как основание для догадки.",
      "Числовой объём допустим только при видимом масштабе, измерительной разметке, известной геометрии всего фронта или надёжно считаемых единицах.",
      "Если масштаба, полного фронта или однозначной связи с работой нет, верни suggestedQuantity=null, confidence=low и needsManualMeasurement=true.",
      "Не суммируй один участок повторно на нескольких фотографиях. Не превышай остаток работы.",
      "Верни предложения для переданных ID и только JSON на русском языке. Это черновик, требующий подтверждения прорабом."
    ].join(" "),
    userPrompt: `Сопоставь фотографии с работами и оцени видимый объём за смену.\n\n${workPrompt(input.works)}`,
    photos: input.photos,
    parseResult: (value) => rawPhotoVolumeResultSchema.parse(value),
    timeoutMessage: "Оценка объёмов заняла слишком много времени. Выберите меньше фотографий и повторите попытку.",
    invalidResultMessage: "AI не смог подготовить проверяемую оценку объёмов. Повторите с более информативными фотографиями.",
    detail: "high"
  });
  return normalizePhotoVolumeResult(raw, input.works);
}

export function parseRawPhotoVolumeResult(value: unknown) {
  return rawPhotoVolumeResultSchema.parse(value);
}
