import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({
  latest: vi.fn(),
  create: vi.fn(),
  audit: vi.fn(async () => ({})),
  references: vi.fn(async () => ({ error: "", scheduleItem: null, costCode: null, dailyReport: null, document: null }))
}));

vi.mock("@/lib/auth/session", () => ({
  getCurrentUser: vi.fn(async () => ({ id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true }))
}));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/quality-management-db", () => ({
  qualityIssueInclude: {},
  resolveQualityReferences: mocks.references
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectQualityIssue: { findMany: vi.fn() },
    projectQualityInspection: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectQualityIssue: { findFirst: mocks.latest, create: mocks.create },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const now = new Date("2026-07-19T10:00:00.000Z");
const created = {
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
  status: "open",
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
  createdBy: "manager-1",
  openedAt: now,
  startedAt: null,
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
  events: [{ id: "event-1", eventType: "create", statusBefore: null, statusAfter: "open", comment: null, createdByName: "РП", createdAt: now }]
};

function request(body: unknown) {
  return new Request("https://pgs.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("quality issues collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    mocks.latest.mockResolvedValue(null);
    mocks.create.mockResolvedValue(created);
    mocks.references.mockResolvedValue({ error: "", scheduleItem: null, costCode: null, dailyReport: null, document: null });
  });

  it("checks edit access before parsing the request body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates a numbered NCR with history and audit", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      type: "ncr",
      title: "Отклонение защитного слоя",
      description: "Фактическая толщина не соответствует рабочей документации",
      location: "Секция 1",
      severity: "high",
      responsibleParty: "Производитель работ",
      acceptanceBlocker: true,
      costImpact: 35000,
      scheduleImpactDays: 2
    }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sequence: 1,
        number: "NCR-001",
        events: { create: expect.objectContaining({ eventType: "create", statusAfter: "open" }) }
      })
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });
});
