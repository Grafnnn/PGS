import type { IntelligenceAction, IntelligenceIssue } from "./types";
import { action, sortActions } from "./helpers";

const ownerByCategory: Record<string, string> = {
  budget: "ПТО / РП",
  schedule: "РП",
  procurement: "Снабжение",
  finance: "Финансовый директор",
  documents: "ПТО",
  risks: "РП"
};

export function actionTypeForIssue(issue: IntelligenceIssue) {
  if (issue.id.includes("missing-price")) return "review_missing_price";
  if (issue.id.includes("zero-qty")) return "review_zero_quantity";
  if (issue.id.includes("amount-mismatch")) return "check_amount_mismatch";
  if (issue.id.includes("duplicate")) return "review_duplicate_item";
  if (issue.id.includes("top-concentration")) return "review_top_cost_item";
  if (issue.id.includes("overdue")) return issue.category === "finance" ? "overdue_payment" : "overdue_task";
  if (issue.id.includes("no-date")) return "missing_dates";
  if (issue.id.includes("no-owner")) return "missing_responsible";
  if (issue.id.includes("schedule-material")) return "upcoming_material_need";
  if (issue.id.includes("deficit")) return "material_deficit";
  if (issue.id.includes("supplier")) return "request_supplier_quote";
  if (issue.id.includes("overstock")) return "investigate_overstock";
  if (issue.id.includes("cash-gap")) return "possible_cash_gap";
  if (issue.id.includes("upcoming")) return "upcoming_payment";
  if (issue.id.includes("missing-contract")) return "missing_contract";
  if (issue.id.includes("missing-estimate")) return "missing_estimate";
  if (issue.id.includes("missing-design")) return "missing_design_doc";
  if (issue.id.includes("stale")) return "stale_document";
  return `${issue.category}_review_needed`;
}

export function buildActionPlan(issues: IntelligenceIssue[], extraActions: IntelligenceAction[] = []) {
  const issueActions = issues.map((item) =>
    action({
      id: `action-${item.id}`,
      category: item.category,
      actionType: actionTypeForIssue(item),
      priority: item.level,
      title: item.title,
      description: item.reason,
      suggestedNextStep: item.suggestedAction,
      ownerRole: ownerByCategory[item.category] ?? "РП",
      evidence: item.evidence,
      entityType: item.evidence[0]?.entityType ?? null,
      entityId: item.evidence[0]?.entityId ?? null
    })
  );

  const unique = new Map<string, IntelligenceAction>();
  for (const item of [...issueActions, ...extraActions]) unique.set(item.id, item);
  return sortActions(Array.from(unique.values()));
}
