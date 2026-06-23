import { z } from "zod";

export const aiInsightResponseSchema = z.object({
  title: z.string(),
  scenario: z.enum(["summary", "budget-review", "schedule-review", "procurement-review", "finance-review", "risk-review", "document-review", "daily-report-summary", "executive-report", "draft-text"]),
  overallStatus: z.enum(["on_track", "attention", "critical", "unknown"]).optional(),
  summary: z.string(),
  findings: z.array(
    z.object({
      severity: z.enum(["low", "medium", "high", "critical"]),
      title: z.string(),
      description: z.string(),
      source: z.string().optional(),
      recommendation: z.string().optional()
    })
  ),
  recommendedActions: z.array(
    z.object({
      priority: z.enum(["low", "medium", "high"]),
      title: z.string(),
      description: z.string()
    })
  ),
  draftText: z.string().optional(),
  dataUsed: z.array(z.string()),
  dataLimitations: z.array(z.string()),
  generatedAt: z.string(),
  provider: z.enum(["deterministic", "openai", "degraded"])
});
