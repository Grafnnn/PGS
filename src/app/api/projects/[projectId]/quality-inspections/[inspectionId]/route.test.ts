import { beforeEach, describe, expect, it, vi } from "vitest";
import { getEffectiveProjectRole } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  claim: vi.fn(),
  updateInspection: vi.fn(),
  updateCheck: vi.fn(),
  latestIssue: vi.fn(),
  createIssue: vi.fn(),
  audit: vi.fn(async () => ({}))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "owner-1", name: "Owner", email: "owner@example.test", role: "OWNER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ getEffectiveProjectRole: vi.fn(async () => "OWNER") }));
vi.mock("@/lib/quality-management-db", () => ({ qualityInspectionInclude: {}, resolveQualityReferences: vi.fn() }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    projectQualityInspection: { findFirst: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectQualityInspection: { updateMany: mocks.claim, update: mocks.updateInspection },
      projectQualityInspectionCheck: { update: mocks.updateCheck },
      projectQualityIssue: { findFirst: mocks.latestIssue, create: mocks.createIssue },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const now = new Date("2026-07-19T10:00:00.000Z");
const check = { id: "check-1", sequence: 1, title: "Защитный слой", requirement: "40 мм", result: "pending", comment: null };
const current = {
  id: "inspection-1",
  organizationId: "org-1",
  projectId: "project-1",
  sequence: 1,
  number: "INS-001",
  type: "work",
  title: "Контроль армирования",
  location: "Секция 1",
  inspector: "Инженер качества",
  responsibleParty: "Производитель работ",
  status: "in_progress",
  scheduledAt: now,
  startedAt: now,
  completedAt: null,
  closedAt: null,
  voidedAt: null,
  decisionComment: null,
  linkedScheduleItemId: null,
  costCodeId: null,
  linkedDocumentId: null,
  linkedDocumentVersion: null,
  linkedDocumentVersionId: null,
  createdBy: "owner-1",
  createdAt: now,
  updatedAt: now,
  checks: [check],
  issues: [],
  linkedScheduleItem: null,
  costCode: null,
  linkedDocument: null
};
const failed = { ...current, status: "failed", completedAt: now, checks: [{ ...check, result: "fail", comment: "35 мм" }] };

function request(body: unknown) {
  return new Request("https://pgs.local", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("quality inspection item route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getEffectiveProjectRole).mockResolvedValue("OWNER");
    vi.mocked(prisma.projectQualityInspection.findFirst).mockResolvedValue(current as never);
    mocks.claim.mockResolvedValue({ count: 1 });
    mocks.updateCheck.mockResolvedValue({ ...check, result: "fail" });
    mocks.latestIssue.mockResolvedValue({ sequence: 2 });
    mocks.createIssue.mockResolvedValue({ id: "issue-3", number: "NCR-003" });
    mocks.updateInspection.mockResolvedValue(failed);
  });

  it("checks the project role before parsing the action", async () => {
    vi.mocked(getEffectiveProjectRole).mockResolvedValue(null);
    const { PATCH } = await import("./route");
    const response = await PATCH(new Request("https://pgs.local", { method: "PATCH", body: "not-json" }) as never, { params: { projectId: "project-1", inspectionId: "inspection-1" } });
    expect(response.status).toBe(403);
    expect(prisma.projectQualityInspection.findFirst).not.toHaveBeenCalled();
  });

  it("creates a numbered NCR for every failed inspection check", async () => {
    const { PATCH } = await import("./route");
    const response = await PATCH(request({
      action: "complete",
      checks: [{ id: "check-1", result: "fail", comment: "35 мм" }]
    }), { params: { projectId: "project-1", inspectionId: "inspection-1" } });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.createdIssues).toBe(1);
    expect(mocks.createIssue).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        number: "NCR-003",
        type: "ncr",
        inspectionId: "inspection-1",
        inspectionCheckId: "check-1",
        acceptanceBlocker: true
      })
    }));
    expect(mocks.updateInspection).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "failed" }) }));
  });

  it("does not close an inspection while linked issues are active", async () => {
    vi.mocked(prisma.projectQualityInspection.findFirst).mockResolvedValue({ ...failed, issues: [{ id: "issue-3", status: "open" }] } as never);
    const { PATCH } = await import("./route");
    const response = await PATCH(request({ action: "close", comment: "Закрыть" }), { params: { projectId: "project-1", inspectionId: "inspection-1" } });
    expect(response.status).toBe(409);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});
