import { getEnvStatus } from "@/lib/env";
import { sanitizeAiContext } from "./sanitize-ai-context";
import type { AiIntelligenceSummary, ProjectIntelligenceSnapshot } from "./types";

const OPENAI_CHAT_COMPLETIONS_URL = "https://api.openai.com/v1/chat/completions";
const OPENAI_MODEL = "gpt-4o-mini";

export async function generateAiIntelligenceSummary(snapshot: ProjectIntelligenceSnapshot): Promise<AiIntelligenceSummary> {
  if (!getEnvStatus().aiConfigured || !process.env.OPENAI_API_KEY) {
    return deterministicAiSummary(snapshot, "unavailable");
  }

  try {
    const response = await fetch(OPENAI_CHAT_COMPLETIONS_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
        "content-type": "application/json"
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.2,
        messages: [
          {
            role: "system",
            content:
              "Ты - помощник руководителя строительного проекта. Верни только JSON: executiveSummary, keyRisks, recommendedActions, managementNote, assumptions, missingData. Не выдумывай факты, используй только provided context."
          },
          {
            role: "user",
            content: JSON.stringify({ context: sanitizeAiContext(snapshot) })
          }
        ]
      })
    });

    if (!response.ok) return deterministicAiSummary(snapshot, "degraded");
    const payload = (await response.json().catch(() => null)) as { choices?: Array<{ message?: { content?: string } }> } | null;
    const content = payload?.choices?.[0]?.message?.content;
    if (!content) return deterministicAiSummary(snapshot, "degraded");
    return normalizeAiSummary(JSON.parse(content));
  } catch {
    return deterministicAiSummary(snapshot, "degraded");
  }
}

export function deterministicAiSummary(snapshot: ProjectIntelligenceSnapshot, status: "unavailable" | "degraded" = "unavailable"): AiIntelligenceSummary {
  return {
    status,
    executiveSummary: snapshot.deterministicSummary,
    keyRisks: snapshot.radar.filter((item) => item.level === "critical" || item.level === "high").map((item) => `${item.title}: ${item.shortReason}`).slice(0, 5),
    recommendedActions: snapshot.actions.slice(0, 6).map((item) => item.suggestedNextStep),
    managementNote: status === "unavailable" ? "AI недоступен, показана расчетная сводка" : "AI-сводка недоступна, показан расчетный fallback.",
    assumptions: ["Расчет основан на текущих данных проекта без внешних источников."],
    missingData: snapshot.executiveSummary.missingData,
    source: "deterministic"
  };
}

function normalizeAiSummary(value: unknown): AiIntelligenceSummary {
  const record = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
  return {
    status: "success",
    executiveSummary: stringValue(record.executiveSummary),
    keyRisks: stringArray(record.keyRisks),
    recommendedActions: stringArray(record.recommendedActions),
    managementNote: stringValue(record.managementNote),
    assumptions: stringArray(record.assumptions),
    missingData: stringArray(record.missingData),
    source: "openai"
  };
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : "";
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}
