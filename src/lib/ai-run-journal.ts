import type { Prisma } from "@prisma/client";
import { z } from "zod";
import type { AppUser } from "@/lib/auth/permissions";
import type { AiInsightResponse, AiRunInput, AiScenario } from "@/lib/ai-command/types";
import { prisma } from "@/lib/prisma";

export const AI_COMMAND_PROMPT_VERSION = "ai-command-v1";

export const aiRunFeedbackSchema = z.object({
  feedback: z.enum(["helpful", "needs_review"]).nullable(),
  comment: z.string().trim().max(500).optional().nullable()
});

export const aiRunActionSchema = z.object({
  actionIndex: z.number().int().min(0).max(20)
});

export type AiRunStatus = "running" | "succeeded" | "degraded" | "failed";
export type AiRunProvider = AiInsightResponse["provider"] | "none";

type ActionLinkRecord = {
  actionIndex: number;
  actionItemId: string;
};

export type AiRunRecord = {
  id: string;
  projectId: string;
  userId: string | null;
  scenario: string;
  promptVersion: string;
  inputJson: Prisma.JsonValue | null;
  outputJson: Prisma.JsonValue | null;
  status: string;
  provider: string;
  durationMs: number | null;
  sanitizedError: string | null;
  feedback: string | null;
  feedbackComment: string | null;
  feedbackBy: string | null;
  feedbackAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  actionLinks?: ActionLinkRecord[];
};

const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/(?:postgres|postgresql):\/\/[^\s"'<>]+/gi, "[REDACTED_DATABASE_URL]"],
  [/\bsk-(?:proj-)?[A-Za-z0-9_-]{12,}\b/g, "[REDACTED_OPENAI_KEY]"],
  [/\bBearer\s+[A-Za-z0-9._~+/-]+=*\b/gi, "Bearer [REDACTED_TOKEN]"],
  [
    /\b(password|secret|token|api[_-]?key|client[_-]?secret|access[_-]?token|refresh[_-]?token|session[_-]?(?:id|token)|authorization|cookie)\b\s*["']?\s*[:=]\s*["']?[^\s,;"'}]+/gi,
    "$1=[REDACTED]"
  ]
];

export function sanitizeAiJournalText(value: string, max = 6000) {
  return SECRET_PATTERNS.reduce((text, [pattern, replacement]) => text.replace(pattern, replacement), value).slice(0, max);
}

function isSensitiveAiJournalKey(key: string) {
  const normalized = key.replace(/[^a-z0-9]/gi, "").toLowerCase();
  return (
    normalized === "authorization"
    || normalized === "cookie"
    || normalized === "credentials"
    || normalized === "databaseurl"
    || normalized === "privatekey"
    || normalized === "session"
    || normalized === "sessionid"
    || normalized.endsWith("password")
    || normalized.endsWith("secret")
    || normalized.endsWith("token")
    || normalized.endsWith("apikey")
    || normalized.endsWith("cookie")
  );
}

export function sanitizeAiJournalValue(value: unknown, depth = 0): unknown {
  if (depth > 8) return "[TRUNCATED]";
  if (typeof value === "string") return sanitizeAiJournalText(value);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeAiJournalValue(item, depth + 1));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .slice(0, 80)
        .map(([key, item]) => [
          key,
          item !== null && item !== undefined && isSensitiveAiJournalKey(key)
            ? "[REDACTED]"
            : sanitizeAiJournalValue(item, depth + 1)
        ])
    );
  }
  return value;
}

export function sanitizeAiRunError(error: unknown) {
  return sanitizeAiJournalText(error instanceof Error ? error.message : "AI scenario failed", 280);
}

export function aiRunStatusForInsight(insight: AiInsightResponse): AiRunStatus {
  return insight.provider === "degraded" ? "degraded" : "succeeded";
}

function sanitizedInput(input: AiRunInput) {
  return sanitizeAiJournalValue({
    scenario: input.scenario,
    ...(input.textType ? { textType: input.textType } : {}),
    ...(input.topic ? { topic: input.topic } : {}),
    ...(input.instructions ? { instructions: input.instructions } : {})
  }) as Prisma.InputJsonValue;
}

export async function recordAiRun(input: {
  organizationId: string;
  projectId: string;
  user: AppUser;
  runInput: AiRunInput;
  insight?: AiInsightResponse;
  status: AiRunStatus;
  provider: AiRunProvider;
  durationMs: number;
  error?: unknown;
}) {
  return prisma.aiRun.create({
    data: {
      organizationId: input.organizationId,
      projectId: input.projectId,
      userId: input.user.authenticated ? input.user.id : null,
      scenario: input.runInput.scenario,
      promptVersion: AI_COMMAND_PROMPT_VERSION,
      inputJson: sanitizedInput(input.runInput),
      ...(input.insight
        ? { outputJson: sanitizeAiJournalValue(input.insight) as Prisma.InputJsonValue }
        : {}),
      status: input.status,
      provider: input.provider,
      durationMs: Math.max(0, Math.round(input.durationMs)),
      sanitizedError: input.error ? sanitizeAiRunError(input.error) : null,
      completedAt: new Date()
    },
    include: {
      actionLinks: {
        select: { actionIndex: true, actionItemId: true }
      }
    }
  });
}

export async function recordAiRunSafely(input: Parameters<typeof recordAiRun>[0]) {
  try {
    return await recordAiRun(input);
  } catch {
    return null;
  }
}

export function serializeAiRun(run: AiRunRecord) {
  return {
    id: run.id,
    projectId: run.projectId,
    scenario: run.scenario,
    promptVersion: run.promptVersion,
    input: run.inputJson,
    output: run.outputJson,
    status: run.status,
    provider: run.provider,
    durationMs: run.durationMs,
    error: run.sanitizedError,
    feedback: run.feedback,
    feedbackComment: run.feedbackComment,
    feedbackAt: run.feedbackAt?.toISOString() ?? null,
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    actionLinks: (run.actionLinks ?? []).map((link) => ({
      actionIndex: link.actionIndex,
      actionItemId: link.actionItemId
    }))
  };
}

export function aiRunTargetTab(scenario: AiScenario) {
  const tabs: Record<AiScenario, string> = {
    summary: "Действия",
    "budget-review": "Бюджет / ВОР",
    "schedule-review": "График",
    "procurement-review": "Заявки",
    "finance-review": "Финансы",
    "contract-review": "Договор / Тендер",
    "risk-review": "Риски",
    "document-review": "Документы",
    "daily-report-summary": "Рапорты",
    "executive-report": "Рапорты",
    "draft-text": "Документы"
  };
  return tabs[scenario];
}
