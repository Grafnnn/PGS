import { z } from "zod";

export const projectActionPriorities = ["low", "medium", "high", "critical"] as const;
export const projectActionStatuses = ["open", "in_progress", "waiting_approval", "blocked", "done"] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().nullable();

export const projectActionCreateSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: optionalText(2000),
  sourceModule: z.string().trim().min(2).max(80).default("manual"),
  targetTab: optionalText(80),
  priority: z.enum(projectActionPriorities).default("medium"),
  assignee: optionalText(160),
  dueAt: z.string().datetime().optional().nullable(),
  requiresApproval: z.boolean().default(false)
});

export const projectActionUpdateSchema = projectActionCreateSchema.partial().extend({
  status: z.enum(projectActionStatuses).optional(),
  approve: z.boolean().optional()
});

type ActionRecord = {
  id: string;
  projectId: string;
  title: string;
  description: string | null;
  sourceModule: string;
  targetTab: string | null;
  priority: string;
  status: string;
  assignee: string | null;
  dueAt: Date | null;
  completedAt: Date | null;
  requiresApproval: boolean;
  approvedAt: Date | null;
  approvedBy: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export function serializeProjectAction(item: ActionRecord) {
  return {
    id: item.id,
    projectId: item.projectId,
    title: item.title,
    description: item.description,
    sourceModule: item.sourceModule,
    targetTab: item.targetTab,
    priority: item.priority,
    status: item.status,
    assignee: item.assignee,
    dueAt: item.dueAt?.toISOString() ?? null,
    completedAt: item.completedAt?.toISOString() ?? null,
    requiresApproval: item.requiresApproval,
    approvedAt: item.approvedAt?.toISOString() ?? null,
    approvedBy: item.approvedBy,
    createdAt: item.createdAt.toISOString(),
    updatedAt: item.updatedAt.toISOString()
  };
}

export function projectActionSummary(items: Array<Pick<ActionRecord, "status" | "dueAt">>, now = new Date()) {
  return {
    total: items.length,
    open: items.filter((item) => item.status !== "done").length,
    blocked: items.filter((item) => item.status === "blocked").length,
    waitingApproval: items.filter((item) => item.status === "waiting_approval").length,
    overdue: items.filter((item) => item.status !== "done" && item.dueAt && item.dueAt < now).length,
    done: items.filter((item) => item.status === "done").length
  };
}
