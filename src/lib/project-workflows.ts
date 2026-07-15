import { z } from "zod";
import type { AppRole } from "@/lib/auth/permissions";

export const workflowStepTypes = ["work", "review", "approval"] as const;
export const workflowAssigneeRoles = ["MANAGER", "ADMIN", "OWNER"] as const;
export const workflowTemplateStatuses = ["active", "inactive"] as const;
export const workflowRunStatuses = ["active", "approved", "rejected", "cancelled"] as const;
export const workflowStepStatuses = ["pending", "active", "approved", "revision_required", "rejected", "cancelled"] as const;
export const workflowRunActions = ["approve", "request_revision", "reject", "cancel"] as const;

export type WorkflowStepType = (typeof workflowStepTypes)[number];
export type WorkflowAssigneeRole = (typeof workflowAssigneeRoles)[number];
export type WorkflowRunStatus = (typeof workflowRunStatuses)[number];
export type WorkflowStepStatus = (typeof workflowStepStatuses)[number];
export type WorkflowRunAction = (typeof workflowRunActions)[number];

export const workflowTemplateStepSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(1000).optional().default(""),
  stepType: z.enum(workflowStepTypes).default("review"),
  assigneeRole: z.enum(workflowAssigneeRoles).default("MANAGER"),
  dueDays: z.coerce.number().int().min(0).max(90).default(3)
});

export const workflowTemplateCreateSchema = z.object({
  name: z.string().trim().min(3).max(120),
  description: z.string().trim().max(2000).optional().default(""),
  category: z.string().trim().min(2).max(60).default("general"),
  steps: z.array(workflowTemplateStepSchema).min(1).max(10)
});

export const workflowTemplateUpdateSchema = z.object({
  status: z.enum(workflowTemplateStatuses)
});

export const workflowRunCreateSchema = z.object({
  templateId: z.string().min(1),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().max(3000).optional().default(""),
  sourceModule: z.string().trim().min(2).max(60).default("manual"),
  targetTab: z.string().trim().max(80).optional().default(""),
  referenceType: z.string().trim().max(80).optional().default(""),
  referenceId: z.string().trim().max(160).optional().default("")
});

export const workflowRunActionSchema = z.object({
  action: z.enum(workflowRunActions),
  comment: z.string().trim().max(3000).optional().default("")
});

export type WorkflowTemplateRecord = {
  id: string;
  projectId: string;
  name: string;
  description: string | null;
  category: string;
  status: string;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    sequence: number;
    name: string;
    description: string | null;
    stepType: string;
    assigneeRole: string;
    dueDays: number;
  }>;
};

export type WorkflowRunRecord = {
  id: string;
  projectId: string;
  templateId: string | null;
  title: string;
  description: string | null;
  sourceModule: string;
  targetTab: string | null;
  referenceType: string | null;
  referenceId: string | null;
  status: string;
  currentStep: number;
  startedAt: Date;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  steps: Array<{
    id: string;
    sequence: number;
    name: string;
    description: string | null;
    stepType: string;
    assigneeRole: string;
    dueDays: number;
    status: string;
    dueAt: Date | null;
    decisionComment: string | null;
    actedByName: string | null;
    actedAt: Date | null;
  }>;
};

export function dueDateFrom(now: Date, dueDays: number) {
  const dueAt = new Date(now);
  dueAt.setUTCDate(dueAt.getUTCDate() + dueDays);
  return dueAt;
}

export function canActOnWorkflowStep(role: AppRole | null, assigneeRole: string) {
  if (!role) return false;
  if (role === "OWNER" || role === "ADMIN") return true;
  return role === "MANAGER" && assigneeRole === "MANAGER";
}

export function resolveWorkflowTransition(input: {
  runStatus: string;
  currentSequence: number;
  totalSteps: number;
  action: WorkflowRunAction;
}) {
  if (input.runStatus !== "active") throw new Error("Workflow is not active");
  if (input.currentSequence < 1 || input.currentSequence > input.totalSteps) throw new Error("Workflow step is invalid");

  if (input.action === "cancel") {
    return { runStatus: "cancelled" as const, currentStep: input.currentSequence, activateStep: null, terminal: true };
  }
  if (input.action === "reject") {
    return { runStatus: "rejected" as const, currentStep: input.currentSequence, activateStep: null, terminal: true };
  }
  if (input.action === "request_revision") {
    const revisionStep = Math.max(1, input.currentSequence - 1);
    return { runStatus: "active" as const, currentStep: revisionStep, activateStep: revisionStep, terminal: false };
  }

  const nextStep = input.currentSequence + 1;
  if (nextStep > input.totalSteps) {
    return { runStatus: "approved" as const, currentStep: input.currentSequence, activateStep: null, terminal: true };
  }
  return { runStatus: "active" as const, currentStep: nextStep, activateStep: nextStep, terminal: false };
}

export function workflowSummary(runs: Array<{ status: string; steps: Array<{ status: string; dueAt: Date | null }> }>, now = new Date()) {
  return {
    total: runs.length,
    active: runs.filter((run) => run.status === "active").length,
    awaitingApproval: runs.filter((run) => run.status === "active" && run.steps.some((step) => step.status === "active" && step.dueAt && step.dueAt >= now)).length,
    overdue: runs.filter((run) => run.status === "active" && run.steps.some((step) => step.status === "active" && step.dueAt && step.dueAt < now)).length,
    approved: runs.filter((run) => run.status === "approved").length,
    rejected: runs.filter((run) => run.status === "rejected").length
  };
}

export function serializeWorkflowTemplate(template: WorkflowTemplateRecord) {
  return {
    id: template.id,
    projectId: template.projectId,
    name: template.name,
    description: template.description,
    category: template.category,
    status: template.status,
    createdAt: template.createdAt.toISOString(),
    updatedAt: template.updatedAt.toISOString(),
    steps: template.steps.map((step) => ({ ...step }))
  };
}

export function serializeWorkflowRun(run: WorkflowRunRecord) {
  return {
    id: run.id,
    projectId: run.projectId,
    templateId: run.templateId,
    title: run.title,
    description: run.description,
    sourceModule: run.sourceModule,
    targetTab: run.targetTab,
    referenceType: run.referenceType,
    referenceId: run.referenceId,
    status: run.status,
    currentStep: run.currentStep,
    startedAt: run.startedAt.toISOString(),
    completedAt: run.completedAt?.toISOString() ?? null,
    createdAt: run.createdAt.toISOString(),
    updatedAt: run.updatedAt.toISOString(),
    steps: run.steps.map((step) => ({
      ...step,
      dueAt: step.dueAt?.toISOString() ?? null,
      actedAt: step.actedAt?.toISOString() ?? null
    }))
  };
}
