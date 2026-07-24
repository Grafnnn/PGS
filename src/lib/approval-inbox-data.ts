import type { AppRole, AppUser } from "@/lib/auth/permissions";
import { resolveEffectiveProjectRole } from "@/lib/auth/project-permissions";
import {
  inboxItemKey,
  inboxStatusFor,
  projectTabHref,
  sortApprovalInbox,
  summarizeApprovalInbox,
  withInboxState,
  type ApprovalInboxItem,
  type ApprovalInboxSummary,
  type InboxItemStateValue,
  type InboxPriority
} from "@/lib/approval-inbox";
import { portfolioProjectScopeWhere } from "@/lib/portfolio-data";
import { prisma } from "@/lib/prisma";
import { canActOnWorkflowStep } from "@/lib/project-workflows";

type InboxProject = {
  id: string;
  organizationId: string;
  name: string;
  code: string | null;
  role: AppRole | null;
};

export interface ApprovalInboxScope {
  organizationId: string;
  projectId: string;
}

export interface LoadedApprovalInbox {
  items: ApprovalInboxItem[];
  summary: ApprovalInboxSummary;
  projects: Array<{ id: string; name: string; code: string | null }>;
  scopeByKey: Map<string, ApprovalInboxScope>;
}

function iso(value: Date | null | undefined) {
  return value?.toISOString() ?? null;
}

function money(value: unknown) {
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "0 ₽";
  return `${amount.toLocaleString("ru-RU", { maximumFractionDigits: 0 })} ₽`;
}

function priority(value: string | null | undefined): InboxPriority {
  if (value === "critical" || value === "high" || value === "medium" || value === "low") return value;
  if (value === "urgent") return "critical";
  return "medium";
}

function baseItem(input: {
  project: InboxProject;
  sourceType: ApprovalInboxItem["sourceType"];
  sourceId: string;
  kind: ApprovalInboxItem["kind"];
  status: ApprovalInboxItem["status"];
  priority: InboxPriority;
  title: string;
  description: string | null;
  sourceModule: string;
  sourceLabel: string;
  targetTab: string;
  dueAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
  decision: ApprovalInboxItem["decision"];
}): Omit<ApprovalInboxItem, "state" | "unread" | "snoozed" | "archived"> {
  return {
    key: inboxItemKey(input.sourceType, input.sourceId),
    projectId: input.project.id,
    projectName: input.project.name,
    projectCode: input.project.code,
    sourceType: input.sourceType,
    sourceId: input.sourceId,
    kind: input.kind,
    status: input.status,
    priority: input.priority,
    title: input.title,
    description: input.description,
    sourceModule: input.sourceModule,
    sourceLabel: input.sourceLabel,
    targetTab: input.targetTab,
    targetHref: projectTabHref(input.project.id, input.targetTab),
    dueAt: iso(input.dueAt),
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
    decision: input.decision
  };
}

export async function loadApprovalInbox(user: AppUser, now = new Date()): Promise<LoadedApprovalInbox> {
  const scope = portfolioProjectScopeWhere(user);
  if (!scope) return { items: [], summary: summarizeApprovalInbox([]), projects: [], scopeByKey: new Map() };

  const accessibleProjects = await prisma.project.findMany({
    where: scope,
    orderBy: { name: "asc" },
    select: {
      id: true,
      organizationId: true,
      name: true,
      code: true,
      members: {
        where: { userId: user.id },
        take: 1,
        select: { role: true }
      }
    }
  });

  const projects = accessibleProjects.map<InboxProject>((project) => ({
    id: project.id,
    organizationId: project.organizationId,
    name: project.name,
    code: project.code,
    role: resolveEffectiveProjectRole(user, project.members[0]?.role)
  }));
  const projectById = new Map(projects.map((project) => [project.id, project]));
  const projectIds = projects.map((project) => project.id);
  if (!projectIds.length) return { items: [], summary: summarizeApprovalInbox([]), projects: [], scopeByKey: new Map() };

  const [workflowRuns, actionItems, changeOrders, commitments, paymentApplications] = await Promise.all([
    prisma.projectWorkflowRun.findMany({
      where: { projectId: { in: projectIds }, status: "active", steps: { some: { status: "active" } } },
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        sourceModule: true,
        targetTab: true,
        createdAt: true,
        updatedAt: true,
        steps: {
          where: { status: "active" },
          orderBy: { sequence: "asc" },
          take: 1,
          select: { id: true, name: true, description: true, assigneeRole: true, dueAt: true }
        }
      }
    }),
    prisma.projectActionItem.findMany({
      where: {
        projectId: { in: projectIds },
        OR: [
          { status: "waiting_approval", requiresApproval: true },
          { status: "blocked" },
          { status: { in: ["open", "in_progress"] }, dueAt: { lt: now } }
        ]
      },
      orderBy: { updatedAt: "desc" },
      take: 250,
      select: {
        id: true,
        projectId: true,
        title: true,
        description: true,
        sourceModule: true,
        targetTab: true,
        priority: true,
        status: true,
        assignee: true,
        dueAt: true,
        requiresApproval: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.projectChangeOrder.findMany({
      where: { projectId: { in: projectIds }, status: "submitted", approvalWorkflowRunId: null },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        projectId: true,
        number: true,
        title: true,
        reason: true,
        submittedAmount: true,
        scheduleImpactDays: true,
        dueAt: true,
        createdAt: true,
        updatedAt: true
      }
    }),
    prisma.projectCommitment.findMany({
      where: { projectId: { in: projectIds }, status: "submitted", approvalWorkflowRunId: null },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        projectId: true,
        number: true,
        title: true,
        counterparty: true,
        createdAt: true,
        updatedAt: true,
        lines: { select: { scheduledValue: true } }
      }
    }),
    prisma.projectPaymentApplication.findMany({
      where: { projectId: { in: projectIds }, status: "submitted" },
      orderBy: { updatedAt: "desc" },
      take: 150,
      select: {
        id: true,
        projectId: true,
        commitmentId: true,
        number: true,
        netAmount: true,
        periodStart: true,
        periodEnd: true,
        createdAt: true,
        updatedAt: true,
        commitment: { select: { number: true, title: true, counterparty: true } }
      }
    })
  ]);

  const rawItems: Array<Omit<ApprovalInboxItem, "state" | "unread" | "snoozed" | "archived">> = [];

  workflowRuns.forEach((run) => {
    const project = projectById.get(run.projectId);
    const step = run.steps[0];
    if (!project?.role || !step || !canActOnWorkflowStep(project.role, step.assigneeRole)) return;
    rawItems.push(
      baseItem({
        project,
        sourceType: "workflow_step",
        sourceId: step.id,
        kind: "approval",
        status: inboxStatusFor(step.dueAt, "pending", now),
        priority: step.dueAt && step.dueAt < now ? "critical" : "high",
        title: run.title,
        description: step.description || step.name || run.description,
        sourceModule: run.sourceModule,
        sourceLabel: "Процесс согласования",
        targetTab: run.targetTab || "Процессы",
        dueAt: step.dueAt,
        createdAt: run.createdAt,
        updatedAt: run.updatedAt,
        decision: { type: "workflow", runId: run.id, actions: ["approve", "request_revision", "reject"] }
      })
    );
  });

  actionItems.forEach((action) => {
    const project = projectById.get(action.projectId);
    if (!project?.role) return;
    const isApproval = action.status === "waiting_approval" && action.requiresApproval;
    const canApprove = project.role === "OWNER" || project.role === "ADMIN";
    if (isApproval && !canApprove) return;
    const fallbackStatus = action.status === "blocked" ? "blocked" : "pending";
    rawItems.push(
      baseItem({
        project,
        sourceType: "project_action",
        sourceId: action.id,
        kind: isApproval ? "approval" : "attention",
        status: inboxStatusFor(action.dueAt, fallbackStatus, now),
        priority: action.status === "blocked" ? "critical" : priority(action.priority),
        title: action.title,
        description: action.description || (action.assignee ? `Ответственный: ${action.assignee}` : null),
        sourceModule: action.sourceModule,
        sourceLabel: isApproval ? "Действие на согласовании" : action.status === "blocked" ? "Заблокированное действие" : "Просроченное действие",
        targetTab: action.targetTab || "Действия",
        dueAt: action.dueAt,
        createdAt: action.createdAt,
        updatedAt: action.updatedAt,
        decision: isApproval ? { type: "project_action", actionId: action.id, actions: ["approve"] } : null
      })
    );
  });

  changeOrders.forEach((changeOrder) => {
    const project = projectById.get(changeOrder.projectId);
    if (!project || (project.role !== "OWNER" && project.role !== "ADMIN")) return;
    rawItems.push(
      baseItem({
        project,
        sourceType: "change_order",
        sourceId: changeOrder.id,
        kind: "approval",
        status: inboxStatusFor(changeOrder.dueAt, "pending", now),
        priority: changeOrder.dueAt && changeOrder.dueAt < now ? "critical" : "high",
        title: `${changeOrder.number}: ${changeOrder.title}`,
        description: `${money(changeOrder.submittedAmount)}${changeOrder.scheduleImpactDays ? ` · ${changeOrder.scheduleImpactDays} дн. к сроку` : ""}${changeOrder.reason ? ` · ${changeOrder.reason}` : ""}`,
        sourceModule: "change_orders",
        sourceLabel: "Изменение к договору",
        targetTab: "Договор / Тендер",
        dueAt: changeOrder.dueAt,
        createdAt: changeOrder.createdAt,
        updatedAt: changeOrder.updatedAt,
        decision: { type: "change_order", changeOrderId: changeOrder.id, actions: ["approve", "request_revision", "reject"] }
      })
    );
  });

  commitments.forEach((commitment) => {
    const project = projectById.get(commitment.projectId);
    if (!project || (project.role !== "OWNER" && project.role !== "ADMIN")) return;
    const scheduledValue = commitment.lines.reduce((sum, line) => sum + Number(line.scheduledValue), 0);
    rawItems.push(
      baseItem({
        project,
        sourceType: "commitment",
        sourceId: commitment.id,
        kind: "approval",
        status: "pending",
        priority: "high",
        title: `${commitment.number}: ${commitment.title}`,
        description: `${commitment.counterparty} · ${money(scheduledValue)}`,
        sourceModule: "commitments",
        sourceLabel: "Договорное обязательство",
        targetTab: "Договор / Тендер",
        createdAt: commitment.createdAt,
        updatedAt: commitment.updatedAt,
        decision: { type: "commitment", commitmentId: commitment.id, actions: ["approve", "request_revision", "reject"] }
      })
    );
  });

  paymentApplications.forEach((application) => {
    const project = projectById.get(application.projectId);
    if (!project || (project.role !== "OWNER" && project.role !== "ADMIN")) return;
    rawItems.push(
      baseItem({
        project,
        sourceType: "payment_application",
        sourceId: application.id,
        kind: "approval",
        status: "pending",
        priority: "high",
        title: `${application.commitment.number} / ${application.number}`,
        description: `${application.commitment.counterparty} · ${money(application.netAmount)} · ${application.periodStart.toLocaleDateString("ru-RU")}–${application.periodEnd.toLocaleDateString("ru-RU")}`,
        sourceModule: "payment_applications",
        sourceLabel: "Заявка на оплату",
        targetTab: "Договор / Тендер",
        createdAt: application.createdAt,
        updatedAt: application.updatedAt,
        decision: {
          type: "payment_application",
          commitmentId: application.commitmentId,
          applicationId: application.id,
          actions: ["approve", "reject"]
        }
      })
    );
  });

  const states = rawItems.length
    ? await prisma.inboxItemState.findMany({
        where: { userId: user.id, itemKey: { in: rawItems.map((item) => item.key) } },
        select: { itemKey: true, readAt: true, snoozedUntil: true, archivedAt: true }
      })
    : [];
  const stateByKey = new Map<string, InboxItemStateValue>(
    states.map((state) => [
      state.itemKey,
      {
        readAt: iso(state.readAt),
        snoozedUntil: iso(state.snoozedUntil),
        archivedAt: iso(state.archivedAt)
      }
    ])
  );
  const items = sortApprovalInbox(rawItems.map((item) => withInboxState(item, stateByKey.get(item.key), now)));
  const scopeByKey = new Map(
    items.map((item) => {
      const project = projectById.get(item.projectId)!;
      return [item.key, { organizationId: project.organizationId, projectId: project.id }] as const;
    })
  );

  return {
    items,
    summary: summarizeApprovalInbox(items),
    projects: projects.map(({ id, name, code }) => ({ id, name, code })),
    scopeByKey
  };
}
