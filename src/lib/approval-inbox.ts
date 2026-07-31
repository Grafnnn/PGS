import { z } from "zod";

export const inboxSourceTypes = [
  "workflow_step",
  "project_action",
  "change_order",
  "commitment",
  "payment_application",
  "closeout_package",
  "warranty_obligation",
  "daily_report"
] as const;

export type InboxSourceType = (typeof inboxSourceTypes)[number];
export type InboxItemKind = "approval" | "attention";
export type InboxItemStatus = "pending" | "overdue" | "blocked";
export type InboxPriority = "low" | "medium" | "high" | "critical";
export type InboxDecisionAction = "approve" | "request_revision" | "reject";
export type InboxStateAction = "read" | "unread" | "archive" | "restore" | "snooze" | "unsnooze";

export type InboxDecision =
  | { type: "workflow"; runId: string; actions: InboxDecisionAction[] }
  | { type: "project_action"; actionId: string; actions: ["approve"] }
  | { type: "change_order"; changeOrderId: string; actions: InboxDecisionAction[] }
  | { type: "commitment"; commitmentId: string; actions: InboxDecisionAction[] }
  | { type: "payment_application"; commitmentId: string; applicationId: string; actions: Array<"approve" | "reject"> }
  | { type: "closeout_package"; packageId: string; actions: InboxDecisionAction[] }
  | { type: "daily_report"; reportId: string; actions: ["approve"] };

export interface InboxItemStateValue {
  readAt: string | null;
  snoozedUntil: string | null;
  archivedAt: string | null;
}

export interface ApprovalInboxItem {
  key: string;
  projectId: string;
  projectName: string;
  projectCode: string | null;
  sourceType: InboxSourceType;
  sourceId: string;
  kind: InboxItemKind;
  status: InboxItemStatus;
  priority: InboxPriority;
  title: string;
  description: string | null;
  sourceModule: string;
  sourceLabel: string;
  targetTab: string;
  targetHref: string;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
  decision: InboxDecision | null;
  state: InboxItemStateValue;
  unread: boolean;
  snoozed: boolean;
  archived: boolean;
}

export interface ApprovalInboxSummary {
  active: number;
  approvals: number;
  overdue: number;
  blocked: number;
  unread: number;
  snoozed: number;
  archived: number;
}

export interface ApprovalInboxFilters {
  view?: "active" | "approvals" | "overdue" | "blocked" | "snoozed" | "archived";
  query?: string;
  projectId?: string;
  sourceType?: InboxSourceType | "all";
}

export const inboxStateMutationSchema = z
  .object({
    itemKey: z.string().trim().min(3).max(240),
    action: z.enum(["read", "unread", "archive", "restore", "snooze", "unsnooze"]),
    snoozedUntil: z.string().datetime().optional()
  })
  .superRefine((value, context) => {
    if (value.action === "snooze" && !value.snoozedUntil) {
      context.addIssue({ code: z.ZodIssueCode.custom, message: "Snooze date is required", path: ["snoozedUntil"] });
    }
  });

const priorityRank: Record<InboxPriority, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1
};

const statusRank: Record<InboxItemStatus, number> = {
  overdue: 3,
  blocked: 2,
  pending: 1
};

export function inboxItemKey(sourceType: InboxSourceType, sourceId: string) {
  return `${sourceType}:${sourceId}`;
}

export function parseInboxItemKey(value: string): { sourceType: InboxSourceType; sourceId: string } | null {
  const separator = value.indexOf(":");
  if (separator < 1) return null;
  const sourceType = value.slice(0, separator) as InboxSourceType;
  const sourceId = value.slice(separator + 1);
  if (!inboxSourceTypes.includes(sourceType) || !/^[A-Za-z0-9_-]{1,180}$/.test(sourceId)) return null;
  return { sourceType, sourceId };
}

export function projectTabHref(projectId: string, targetTab: string) {
  return `/projects/${encodeURIComponent(projectId)}?tab=${encodeURIComponent(targetTab)}`;
}

export function inboxDecisionRequest(item: ApprovalInboxItem, action: InboxDecisionAction, comment: string) {
  if (!item.decision || !(item.decision.actions as readonly InboxDecisionAction[]).includes(action)) {
    throw new Error("Решение для этого элемента недоступно");
  }
  const projectId = encodeURIComponent(item.projectId);
  if (item.decision.type === "workflow") {
    return {
      url: `/api/projects/${projectId}/workflows/${encodeURIComponent(item.decision.runId)}`,
      body: { action, comment: comment || undefined }
    };
  }
  if (item.decision.type === "project_action") {
    return {
      url: `/api/projects/${projectId}/actions/${encodeURIComponent(item.decision.actionId)}`,
      body: { approve: true }
    };
  }
  if (item.decision.type === "change_order") {
    return {
      url: `/api/projects/${projectId}/change-orders/${encodeURIComponent(item.decision.changeOrderId)}`,
      body: { action, comment: comment || undefined }
    };
  }
  if (item.decision.type === "commitment") {
    return {
      url: `/api/projects/${projectId}/commitments/${encodeURIComponent(item.decision.commitmentId)}`,
      body: { action, comment: comment || undefined }
    };
  }
  if (item.decision.type === "closeout_package") {
    const status = action === "approve" ? "accepted" : action === "reject" ? "rejected" : "in_progress";
    return {
      url: `/api/projects/${projectId}/closeout`,
      body: {
        action: "update_package",
        id: item.decision.packageId,
        status,
        decisionComment: comment || (action === "approve" ? "Пакет принят через Approval Inbox." : "Пакет возвращён через Approval Inbox.")
      }
    };
  }
  if (item.decision.type === "daily_report") {
    return {
      url: `/api/daily-reports/${encodeURIComponent(item.decision.reportId)}`,
      body: { status: "approved" }
    };
  }
  return {
    url: `/api/projects/${projectId}/commitments/${encodeURIComponent(item.decision.commitmentId)}/payment-applications/${encodeURIComponent(item.decision.applicationId)}`,
    body: { action, comment: comment || undefined }
  };
}

export function normalizeInboxState(
  state: Partial<InboxItemStateValue> | null | undefined,
  now = new Date()
): Pick<ApprovalInboxItem, "state" | "unread" | "snoozed" | "archived"> {
  const normalized: InboxItemStateValue = {
    readAt: state?.readAt ?? null,
    snoozedUntil: state?.snoozedUntil ?? null,
    archivedAt: state?.archivedAt ?? null
  };
  const snoozedAt = normalized.snoozedUntil ? new Date(normalized.snoozedUntil) : null;
  return {
    state: normalized,
    unread: !normalized.readAt,
    snoozed: Boolean(snoozedAt && Number.isFinite(snoozedAt.getTime()) && snoozedAt > now),
    archived: Boolean(normalized.archivedAt)
  };
}

export function withInboxState<T extends Omit<ApprovalInboxItem, "state" | "unread" | "snoozed" | "archived">>(
  item: T,
  state: Partial<InboxItemStateValue> | null | undefined,
  now = new Date()
): ApprovalInboxItem {
  return { ...item, ...normalizeInboxState(state, now) };
}

export function summarizeApprovalInbox(items: ApprovalInboxItem[]): ApprovalInboxSummary {
  const activeItems = items.filter((item) => !item.archived && !item.snoozed);
  return {
    active: activeItems.length,
    approvals: activeItems.filter((item) => item.kind === "approval").length,
    overdue: activeItems.filter((item) => item.status === "overdue").length,
    blocked: activeItems.filter((item) => item.status === "blocked").length,
    unread: activeItems.filter((item) => item.unread).length,
    snoozed: items.filter((item) => !item.archived && item.snoozed).length,
    archived: items.filter((item) => item.archived).length
  };
}

export function sortApprovalInbox(items: ApprovalInboxItem[]) {
  return [...items].sort((left, right) => {
    const status = statusRank[right.status] - statusRank[left.status];
    if (status) return status;
    const priority = priorityRank[right.priority] - priorityRank[left.priority];
    if (priority) return priority;
    if (left.dueAt && right.dueAt) {
      const due = new Date(left.dueAt).getTime() - new Date(right.dueAt).getTime();
      if (due) return due;
    } else if (left.dueAt) return -1;
    else if (right.dueAt) return 1;
    const updated = new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
    return updated || left.key.localeCompare(right.key);
  });
}

export function filterApprovalInbox(items: ApprovalInboxItem[], filters: ApprovalInboxFilters) {
  const query = filters.query?.trim().toLocaleLowerCase("ru-RU") ?? "";
  return sortApprovalInbox(
    items.filter((item) => {
      const view = filters.view ?? "active";
      if (view === "active" && (item.archived || item.snoozed)) return false;
      if (view === "approvals" && (item.archived || item.snoozed || item.kind !== "approval")) return false;
      if (view === "overdue" && (item.archived || item.snoozed || item.status !== "overdue")) return false;
      if (view === "blocked" && (item.archived || item.snoozed || item.status !== "blocked")) return false;
      if (view === "snoozed" && (item.archived || !item.snoozed)) return false;
      if (view === "archived" && !item.archived) return false;
      if (filters.projectId && filters.projectId !== "all" && item.projectId !== filters.projectId) return false;
      if (filters.sourceType && filters.sourceType !== "all" && item.sourceType !== filters.sourceType) return false;
      if (!query) return true;
      return [item.title, item.description, item.projectName, item.projectCode, item.sourceLabel, item.sourceModule]
        .filter(Boolean)
        .some((value) => String(value).toLocaleLowerCase("ru-RU").includes(query));
    })
  );
}

export function inboxStatusFor(dueAt: Date | null | undefined, fallback: "pending" | "blocked", now = new Date()): InboxItemStatus {
  if (fallback === "blocked") return "blocked";
  if (dueAt && dueAt < now) return "overdue";
  return fallback;
}
