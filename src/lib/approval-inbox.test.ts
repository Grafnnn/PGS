import { describe, expect, it } from "vitest";
import {
  filterApprovalInbox,
  inboxDecisionRequest,
  inboxItemKey,
  inboxStatusFor,
  normalizeInboxState,
  parseInboxItemKey,
  projectTabHref,
  sortApprovalInbox,
  summarizeApprovalInbox,
  withInboxState,
  type ApprovalInboxItem
} from "@/lib/approval-inbox";

const now = new Date("2026-07-24T12:00:00.000Z");

function item(overrides: Partial<ApprovalInboxItem> = {}): ApprovalInboxItem {
  const base = {
    key: "workflow_step:run-1",
    projectId: "project-1",
    projectName: "Школа",
    projectCode: "PGS-01",
    sourceType: "workflow_step" as const,
    sourceId: "run-1",
    kind: "approval" as const,
    status: "pending" as const,
    priority: "high" as const,
    title: "Согласовать договор",
    description: "Финальное решение",
    sourceModule: "contract",
    sourceLabel: "Процесс согласования",
    targetTab: "Процессы",
    targetHref: "/projects/project-1?tab=%D0%9F%D1%80%D0%BE%D1%86%D0%B5%D1%81%D1%81%D1%8B",
    dueAt: "2026-07-25T12:00:00.000Z",
    createdAt: "2026-07-23T12:00:00.000Z",
    updatedAt: "2026-07-24T10:00:00.000Z",
    decision: { type: "workflow" as const, runId: "run-1", actions: ["approve", "request_revision", "reject"] as const },
    state: { readAt: null, snoozedUntil: null, archivedAt: null },
    unread: true,
    snoozed: false,
    archived: false
  };
  return { ...base, ...overrides } as ApprovalInboxItem;
}

describe("approval inbox model", () => {
  it("uses stable, validated source keys and project deep links", () => {
    expect(inboxItemKey("change_order", "co_12")).toBe("change_order:co_12");
    expect(parseInboxItemKey("change_order:co_12")).toEqual({ sourceType: "change_order", sourceId: "co_12" });
    expect(parseInboxItemKey("unknown:co_12")).toBeNull();
    expect(parseInboxItemKey("workflow_step:../../secret")).toBeNull();
    expect(projectTabHref("project 1", "Договор / Тендер")).toBe("/projects/project%201?tab=%D0%94%D0%BE%D0%B3%D0%BE%D0%B2%D0%BE%D1%80%20%2F%20%D0%A2%D0%B5%D0%BD%D0%B4%D0%B5%D1%80");
  });

  it("maps only server-advertised decisions to existing protected routes", () => {
    expect(inboxDecisionRequest(item(), "approve", "Проверено")).toEqual({
      url: "/api/projects/project-1/workflows/run-1",
      body: { action: "approve", comment: "Проверено" }
    });
    const payment = item({
      sourceType: "payment_application",
      decision: {
        type: "payment_application",
        commitmentId: "commitment-1",
        applicationId: "application-1",
        actions: ["approve", "reject"]
      }
    });
    expect(inboxDecisionRequest(payment, "reject", "Нет акта")).toEqual({
      url: "/api/projects/project-1/commitments/commitment-1/payment-applications/application-1",
      body: { action: "reject", comment: "Нет акта" }
    });
    const closeout = item({
      sourceType: "closeout_package",
      decision: {
        type: "closeout_package",
        packageId: "closeout-1",
        actions: ["approve", "request_revision", "reject"]
      }
    });
    expect(inboxDecisionRequest(closeout, "request_revision", "Добавить исполнительную схему")).toEqual({
      url: "/api/projects/project-1/closeout",
      body: {
        action: "update_package",
        id: "closeout-1",
        status: "in_progress",
        decisionComment: "Добавить исполнительную схему"
      }
    });
    const dailyReport = item({
      sourceType: "daily_report",
      decision: { type: "daily_report", reportId: "report-1", actions: ["approve"] }
    });
    expect(inboxDecisionRequest(dailyReport, "approve", "")).toEqual({
      url: "/api/daily-reports/report-1",
      body: { status: "approved" }
    });
    expect(() => inboxDecisionRequest(payment, "request_revision", "Исправить")).toThrow("Решение для этого элемента недоступно");
  });

  it("derives overdue state without hiding blocked work", () => {
    expect(inboxStatusFor(new Date("2026-07-24T11:59:59.000Z"), "pending", now)).toBe("overdue");
    expect(inboxStatusFor(null, "blocked", now)).toBe("blocked");
  });

  it("normalizes read, snooze and archive state deterministically", () => {
    expect(normalizeInboxState(null, now)).toMatchObject({ unread: true, snoozed: false, archived: false });
    expect(
      normalizeInboxState(
        { readAt: "2026-07-24T11:00:00.000Z", snoozedUntil: "2026-07-25T12:00:00.000Z", archivedAt: null },
        now
      )
    ).toMatchObject({ unread: false, snoozed: true, archived: false });
    expect(
      withInboxState(
        {
          ...item(),
          state: undefined,
          unread: undefined,
          snoozed: undefined,
          archived: undefined
        } as never,
        { archivedAt: "2026-07-24T11:00:00.000Z" },
        now
      )
    ).toMatchObject({ archived: true, unread: true });
  });

  it("summarizes only visible active work while retaining snoozed and archived totals", () => {
    const items = [
      item(),
      item({ key: "project_action:a-1", kind: "attention", status: "overdue", sourceType: "project_action" }),
      item({ key: "project_action:a-2", kind: "attention", status: "blocked", sourceType: "project_action", snoozed: true }),
      item({ key: "payment_application:p-1", archived: true, sourceType: "payment_application" })
    ];
    expect(summarizeApprovalInbox(items)).toEqual({
      active: 2,
      approvals: 1,
      overdue: 1,
      blocked: 0,
      unread: 2,
      snoozed: 1,
      archived: 1
    });
  });

  it("sorts urgent work first and filters by view, project, source and search", () => {
    const approval = item();
    const overdue = item({
      key: "project_action:a-1",
      sourceType: "project_action",
      kind: "attention",
      status: "overdue",
      priority: "critical",
      title: "Просрочить закупку"
    });
    const archived = item({ key: "commitment:c-1", sourceType: "commitment", projectId: "project-2", archived: true });

    expect(sortApprovalInbox([approval, overdue])[0].key).toBe(overdue.key);
    expect(filterApprovalInbox([approval, overdue, archived], { view: "active" })).toHaveLength(2);
    expect(filterApprovalInbox([approval, overdue, archived], { view: "archived" })).toEqual([archived]);
    expect(filterApprovalInbox([approval, overdue, archived], { view: "active", query: "закупку" })).toEqual([overdue]);
    expect(filterApprovalInbox([approval, overdue, archived], { view: "active", projectId: "project-2" })).toEqual([]);
    expect(filterApprovalInbox([approval, overdue, archived], { view: "active", sourceType: "workflow_step" })).toEqual([approval]);
  });
});
