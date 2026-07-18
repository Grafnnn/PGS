import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  updateIssue: vi.fn(),
  createRun: vi.fn(),
  audit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/quality-management-db", () => ({ qualityIssueInclude: {}, resolveQualityReferences: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectQualityIssue: { findFirst: vi.fn() },
    projectWorkflowTemplate: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectQualityIssue: { updateMany: mocks.claim, update: mocks.updateIssue },
      projectWorkflowRun: { create: mocks.createRun },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const now = new Date("2026-07-19T10:00:00.000Z");
const current = {
  id: "issue-1",
  organizationId: "org-1",
  projectId: "project-1",
  inspectionId: null,
  inspectionCheckId: null,
  sequence: 1,
  number: "NCR-001",
  type: "ncr",
  title: "Отклонение защитного слоя",
  description: "Фактическая толщина не соответствует рабочей документации",
  location: "Секция 1",
  severity: "high",
  status: "in_progress",
  responsibleParty: "Производитель работ",
  dueAt: null,
  rootCause: null,
  correctiveAction: null,
  decisionComment: null,
  acceptanceBlocker: true,
  costImpact: 35000,
  scheduleImpactDays: 2,
  linkedScheduleItemId: null,
  costCodeId: null,
  sourceDailyReportId: null,
  linkedDocumentId: null,
  linkedDocumentVersion: null,
  linkedDocumentVersionId: null,
  verificationWorkflowRunId: null,
  createdBy: "owner-1",
  openedAt: now,
  startedAt: now,
  submittedAt: null,
  verifiedAt: null,
  closedAt: null,
  voidedAt: null,
  createdAt: now,
  updatedAt: now,
  inspection: null,
  inspectionCheck: null,
  linkedScheduleItem: null,
  costCode: null,
  sourceDailyReport: null,
  linkedDocument: null,
  verificationWorkflowRun: null,
  evidence: [],
  events: []
};

function request(body: unknown) {
  return new Request("https://pgs.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("quality issue item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER");
    vi.mocked(prisma.projectQualityIssue.findFirst).mockResolvedValue(current as never);
    vi.mocked(prisma.projectWorkflowTemplate.findFirst).mockResolvedValue(null);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.createRun.mockResolvedValue({ id: "run-2" });
    mocks.updateIssue.mockResolvedValue({ ...current, status: "ready_for_verification", rootCause: "Недостаточный контроль", correctiveAction: "Исправить и повторно проверить", submittedAt: now });
  });

  it("checks the project role before parsing the action", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, { params: { projectId: "project-1", issueId: "issue-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectQualityIssue.findFirst).not.toHaveBeenCalled();
  });

  it("requires root cause, corrective action and evidence before verification", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({
      action: "submit_verification",
      rootCause: "Недостаточный контроль",
      correctiveAction: "Исправить и повторно проверить"
    }), { params: { projectId: "project-1", issueId: "issue-1" } });
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("starts work without treating an unused workflow selection as an error", async () => {
    vi.mocked(prisma.projectQualityIssue.findFirst).mockResolvedValue({ ...current, status: "open" } as never);
    mocks.updateIssue.mockResolvedValue({ ...current, status: "in_progress" });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "start", workflowTemplateId: "template-1" }), { params: { projectId: "project-1", issueId: "issue-1" } });
    expect(response.status).toBe(200);
    expect(prisma.projectWorkflowTemplate.findFirst).not.toHaveBeenCalled();
  });

  it("clears the old workflow and submission state when an issue is reopened", async () => {
    vi.mocked(prisma.projectQualityIssue.findFirst).mockResolvedValue({
      ...current,
      status: "closed",
      submittedAt: now,
      verifiedAt: now,
      closedAt: now,
      verificationWorkflowRunId: "run-1",
      verificationWorkflowRun: { id: "run-1", title: "Проверка", status: "approved" }
    } as never);
    mocks.updateIssue.mockResolvedValue({ ...current, status: "in_progress" });
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "reopen", comment: "Требуется повторная проверка" }), { params: { projectId: "project-1", issueId: "issue-1" } });

    expect(response.status).toBe(200);
    expect(mocks.updateIssue).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        status: "in_progress",
        verificationWorkflowRunId: null,
        submittedAt: null,
        verifiedAt: null,
        closedAt: null
      })
    }));
  });
});
