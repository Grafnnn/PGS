import type { ProjectWorkbookQualityGate, ProjectWorkbookQualityIssue } from "./project-workbook-quality";

export type ProjectWorkbookResolutionStatus = "blocked" | "action_required" | "ready";
export type ProjectWorkbookResolutionStepState = "blocked" | "needs_action" | "needs_decision" | "confirmed" | "informational";
export type ProjectWorkbookQualityDecisions = Record<string, boolean>;

export interface ProjectWorkbookResolutionStep extends ProjectWorkbookQualityIssue {
  state: ProjectWorkbookResolutionStepState;
  decisionRequired: boolean;
}

export interface ProjectWorkbookResolutionPlan {
  status: ProjectWorkbookResolutionStatus;
  canCreate: boolean;
  progressPercent: number;
  steps: ProjectWorkbookResolutionStep[];
  unresolvedIssueIds: string[];
  summary: {
    blockers: number;
    correctionsRequired: number;
    decisionsRequired: number;
    decisionsConfirmed: number;
    decisionsRemaining: number;
    information: number;
  };
  message: string;
}

export function buildProjectWorkbookResolutionPlan(
  quality: ProjectWorkbookQualityGate,
  decisions: ProjectWorkbookQualityDecisions = {}
): ProjectWorkbookResolutionPlan {
  const steps = quality.issues.map((issue): ProjectWorkbookResolutionStep => {
    if (issue.severity === "blocker") return { ...issue, state: "blocked", decisionRequired: false };
    if (issue.severity === "info") return { ...issue, state: "informational", decisionRequired: false };
    if (issue.resolution === "source_change") return { ...issue, state: "needs_action", decisionRequired: false };
    return {
      ...issue,
      state: decisions[issue.id] === true ? "confirmed" : "needs_decision",
      decisionRequired: true
    };
  });
  const blockers = steps.filter((step) => step.state === "blocked").length;
  const correctionsRequired = steps.filter((step) => step.state === "needs_action").length;
  const decisionsRequired = steps.filter((step) => step.decisionRequired).length;
  const decisionsConfirmed = steps.filter((step) => step.state === "confirmed").length;
  const decisionsRemaining = decisionsRequired - decisionsConfirmed;
  const information = steps.filter((step) => step.state === "informational").length;
  const status: ProjectWorkbookResolutionStatus = blockers > 0 ? "blocked" : correctionsRequired > 0 || decisionsRemaining > 0 ? "action_required" : "ready";
  const canCreate = status === "ready";
  const requiredItems = correctionsRequired + decisionsRequired;
  const progressPercent = blockers > 0 ? 0 : requiredItems > 0 ? Math.round((decisionsConfirmed / requiredItems) * 100) : 100;
  const message = status === "blocked"
    ? `Критических проблем: ${blockers}. Исправьте Excel или карту листов и повторите анализ.`
    : status === "action_required"
      ? `Исправить в карте/файле: ${correctionsRequired}. Подтвердить решений: ${decisionsRemaining}.`
      : decisionsRequired > 0
        ? `Все обязательные решения подтверждены: ${decisionsConfirmed}.`
        : "Дополнительные решения не требуются. План импорта готов.";

  return {
    status,
    canCreate,
    progressPercent,
    steps,
    unresolvedIssueIds: steps.filter((step) => step.state === "blocked" || step.state === "needs_action" || step.state === "needs_decision").map((step) => step.id),
    summary: { blockers, correctionsRequired, decisionsRequired, decisionsConfirmed, decisionsRemaining, information },
    message
  };
}
