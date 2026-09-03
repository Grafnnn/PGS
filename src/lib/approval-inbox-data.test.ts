import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadApprovalInbox } from "@/lib/approval-inbox-data";
import { prisma } from "@/lib/prisma";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findMany: vi.fn() },
    projectWorkflowRun: { findMany: vi.fn() },
    projectActionItem: { findMany: vi.fn() },
    projectChangeOrder: { findMany: vi.fn() },
    projectCommitment: { findMany: vi.fn() },
    projectPaymentApplication: { findMany: vi.fn() },
    projectCloseoutPackage: { findMany: vi.fn() },
    projectWarrantyObligation: { findMany: vi.fn() },
    inboxItemState: { findMany: vi.fn() }
  }
}));

const now = new Date("2026-07-24T12:00:00.000Z");
const owner = { id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER" as const, authenticated: true };
const manager = { id: "manager-1", name: "Manager", email: "manager@example.test", role: "MANAGER" as const, authenticated: true };
const project = {
  id: "project-1",
  organizationId: "org-1",
  name: "Школа",
  code: "PGS-01",
  organization: { users: [{ role: "owner" }] },
  members: []
};

describe("approval inbox data loader", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(prisma.project.findMany).mockResolvedValue([project] as never);
    vi.mocked(prisma.projectWorkflowRun.findMany).mockResolvedValue([
      {
        id: "run-1",
        projectId: "project-1",
        title: "Согласовать договор",
        description: null,
        sourceModule: "contract",
        targetTab: "Договор / Тендер",
        createdAt: new Date("2026-07-23T10:00:00.000Z"),
        updatedAt: new Date("2026-07-24T10:00:00.000Z"),
        steps: [{ id: "step-1", name: "Решение", description: null, assigneeRole: "OWNER", dueAt: new Date("2026-07-23T12:00:00.000Z") }]
      }
    ] as never);
    vi.mocked(prisma.projectActionItem.findMany).mockResolvedValue([
      {
        id: "action-1",
        projectId: "project-1",
        title: "Разблокировать поставку",
        description: null,
        sourceModule: "materials",
        targetTab: "Материалы",
        priority: "critical",
        status: "blocked",
        assignee: "РП",
        dueAt: null,
        requiresApproval: false,
        createdAt: new Date("2026-07-23T10:00:00.000Z"),
        updatedAt: new Date("2026-07-24T11:00:00.000Z")
      },
      {
        id: "action-2",
        projectId: "project-1",
        title: "Согласовать решение",
        description: null,
        sourceModule: "manual",
        targetTab: "Действия",
        priority: "high",
        status: "waiting_approval",
        assignee: null,
        dueAt: null,
        requiresApproval: true,
        createdAt: new Date("2026-07-23T10:00:00.000Z"),
        updatedAt: new Date("2026-07-24T09:00:00.000Z")
      }
    ] as never);
    vi.mocked(prisma.projectChangeOrder.findMany).mockResolvedValue([
      {
        id: "co-1",
        projectId: "project-1",
        number: "ИЗМ-001",
        title: "Дополнительные работы",
        reason: "Изменение ТЗ",
        submittedAmount: 500000,
        scheduleImpactDays: 2,
        dueAt: null,
        createdAt: new Date("2026-07-22T10:00:00.000Z"),
        updatedAt: new Date("2026-07-24T08:00:00.000Z")
      }
    ] as never);
    vi.mocked(prisma.projectCommitment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectPaymentApplication.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectCloseoutPackage.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectWarrantyObligation.findMany).mockResolvedValue([]);
    vi.mocked(prisma.inboxItemState.findMany).mockResolvedValue([
      { itemKey: "project_action:action-1", readAt: now, snoozedUntil: null, archivedAt: null }
    ] as never);
  });

  it("aggregates actionable approvals and attention signals for an owner", async () => {
    const inbox = await loadApprovalInbox(owner, now);
    expect(inbox.items.map((item) => item.key)).toEqual(
      expect.arrayContaining(["workflow_step:step-1", "project_action:action-1", "project_action:action-2", "change_order:co-1"])
    );
    expect(inbox.items.find((item) => item.key === "workflow_step:step-1")).toMatchObject({
      status: "overdue",
      kind: "approval",
      decision: { type: "workflow" }
    });
    expect(inbox.items.find((item) => item.key === "project_action:action-1")).toMatchObject({
      status: "blocked",
      unread: false
    });
    expect(inbox.summary).toMatchObject({ active: 4, approvals: 3, overdue: 1, blocked: 1, unread: 3 });
    expect(inbox.scopeByKey.get("change_order:co-1")).toEqual({ organizationId: "org-1", projectId: "project-1" });
  });

  it("adds closeout approvals and expiring warranty attention without duplicating project actions", async () => {
    vi.mocked(prisma.projectCloseoutPackage.findMany).mockResolvedValue([{
      id: "closeout-1",
      projectId: "project-1",
      number: "CLS-001",
      title: "Итоговая сдача",
      scope: "Финальный комплект",
      responsibleParty: "ПТО",
      dueAt: new Date("2026-07-26T12:00:00.000Z"),
      createdAt: new Date("2026-07-23T10:00:00.000Z"),
      updatedAt: new Date("2026-07-24T11:30:00.000Z")
    }] as never);
    vi.mocked(prisma.projectWarrantyObligation.findMany).mockResolvedValue([{
      id: "warranty-1",
      projectId: "project-1",
      number: "WAR-001",
      title: "Гарантия на монтаж",
      responsibleParty: "РП",
      endsAt: new Date("2026-07-25T12:00:00.000Z"),
      noticeDays: 30,
      retentionAmount: 250000,
      retentionReleaseAt: null,
      createdAt: new Date("2026-07-23T10:00:00.000Z"),
      updatedAt: new Date("2026-07-24T11:20:00.000Z")
    }] as never);

    const inbox = await loadApprovalInbox(owner, now);
    expect(inbox.items.find((item) => item.key === "closeout_package:closeout-1")).toMatchObject({
      kind: "approval",
      targetTab: "Сдача / Гарантия",
      decision: { type: "closeout_package" }
    });
    expect(inbox.items.find((item) => item.key === "warranty_obligation:warranty-1")).toMatchObject({
      kind: "attention",
      targetTab: "Сдача / Гарантия"
    });
  });

  it("excludes owner decisions from a manager while retaining project attention work", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([{
      ...project,
      organization: { users: [{ role: "project_manager" }] },
      members: [{ role: "MANAGER" }]
    }] as never);
    const inbox = await loadApprovalInbox(manager, now);
    expect(inbox.items.map((item) => item.key)).toEqual(["project_action:action-1"]);
    expect(inbox.summary).toMatchObject({ active: 1, approvals: 0, blocked: 1 });
  });

  it("does not carry a session owner role into another organization", async () => {
    vi.mocked(prisma.project.findMany).mockResolvedValue([{
      ...project,
      organization: { users: [{ role: "project_manager" }] },
      members: [{ role: "VIEWER" }]
    }] as never);

    const inbox = await loadApprovalInbox(owner, now);

    expect(inbox.items.map((item) => item.key)).toEqual(["project_action:action-1"]);
    expect(inbox.summary).toMatchObject({ active: 1, approvals: 0, blocked: 1 });
  });
});
