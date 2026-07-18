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
  qualityInspectionInclude: {},
  resolveQualityReferences: mocks.references
}));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    project: { findUnique: vi.fn() },
    projectQualityInspection: { findMany: vi.fn() },
    projectQualityIssue: { findMany: vi.fn() },
    $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({
      projectQualityInspection: { findFirst: mocks.latest, create: mocks.create },
      auditLog: { create: mocks.audit }
    }))
  }
}));

const now = new Date("2026-07-19T10:00:00.000Z");
const created = {
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
  status: "planned",
  scheduledAt: null,
  decisionComment: null,
  startedAt: null,
  completedAt: null,
  closedAt: null,
  voidedAt: null,
  linkedScheduleItemId: null,
  costCodeId: null,
  linkedDocumentId: null,
  linkedDocumentVersion: null,
  linkedDocumentVersionId: null,
  createdBy: "manager-1",
  createdAt: now,
  updatedAt: now,
  checks: [{ id: "check-1", sequence: 1, title: "Шаг арматуры", requirement: "По РД", result: "pending", comment: null }],
  issues: [],
  linkedScheduleItem: null,
  costCode: null,
  linkedDocument: null
};

function request(body: unknown) {
  return new Request("https://pgs.local", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  }) as never;
}

describe("quality inspections collection route", () => {
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

  it("creates a numbered inspection with checks and audit", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      type: "work",
      title: "Контроль армирования",
      location: "Секция 1",
      inspector: "Инженер качества",
      responsibleParty: "Производитель работ",
      checks: [{ title: "Шаг арматуры", requirement: "По РД" }]
    }), { params: { projectId: "project-1" } });

    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        sequence: 1,
        number: "INS-001",
        checks: { create: [expect.objectContaining({ sequence: 1, title: "Шаг арматуры" })] }
      })
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });
});
