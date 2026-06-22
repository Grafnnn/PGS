import type { IntelligenceAction, IntelligenceCategory, IntelligenceEvidence, IntelligenceIssue, RiskLevel } from "./types";
import { riskWeight, scoreToRiskLevel } from "./risk-scoring";

export const DAY_MS = 86_400_000;
export const forecastWindows = [7, 14, 30] as const;

export function daysBetween(from: Date, to: Date) {
  return Math.ceil((to.getTime() - from.getTime()) / DAY_MS);
}

export function parseDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function dateOnly(date: Date) {
  return date.toISOString().slice(0, 10);
}

export function normalizeName(value: string) {
  return value.trim().toLowerCase().replace(/[.,;:()"']/g, " ").replace(/\s+/g, " ");
}

export function evidence(input: IntelligenceEvidence): IntelligenceEvidence {
  return {
    entityId: null,
    field: null,
    value: null,
    documentId: null,
    page: null,
    section: null,
    snippet: null,
    ...input
  };
}

export function issue(input: {
  id: string;
  category: IntelligenceCategory;
  title: string;
  reason: string;
  score: number;
  suggestedAction: string;
  evidence: IntelligenceEvidence[];
}): IntelligenceIssue {
  return {
    ...input,
    level: scoreToRiskLevel(input.score)
  };
}

export function action(input: {
  id: string;
  category: IntelligenceCategory;
  actionType: string;
  priority: RiskLevel;
  title: string;
  description: string;
  suggestedNextStep: string;
  dueDate?: string | null;
  ownerRole?: string | null;
  evidence: IntelligenceEvidence[];
  entityType?: IntelligenceEvidence["entityType"] | null;
  entityId?: string | null;
}): IntelligenceAction {
  return {
    dueDate: null,
    ownerRole: null,
    entityType: null,
    entityId: null,
    ...input
  };
}

export function sortActions(actions: IntelligenceAction[]) {
  return [...actions].sort((a, b) => riskWeight(b.priority) - riskWeight(a.priority) || (a.dueDate ?? "9999").localeCompare(b.dueDate ?? "9999"));
}

export function redactTokenLikeValue(value: unknown): unknown {
  if (typeof value === "string") {
    return value
      .replace(/sk-[A-Za-z0-9_-]+/g, "[REDACTED_OPENAI_KEY]")
      .replace(/[A-Za-z0-9_-]{24,}\.[A-Za-z0-9_-]{12,}\.[A-Za-z0-9_-]{12,}/g, "[REDACTED_TOKEN]")
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/gi, "[REDACTED_DATABASE_URL]");
  }
  if (Array.isArray(value)) return value.map(redactTokenLikeValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, nested]) => {
        if (/secret|token|password|cookie|database_url|api_key|session/i.test(key)) return [key, "[REDACTED]"];
        return [key, redactTokenLikeValue(nested)];
      })
    );
  }
  return value;
}
