import { beforeEach, describe, expect, it, vi } from "vitest";
import { canProject } from "@/lib/auth/project-permissions";
import { prisma } from "@/lib/prisma";

const mocks = vi.hoisted(() => ({ latest: vi.fn(), create: vi.fn(), audit: vi.fn(async () => ({})) }));
vi.mock("@/lib/auth/session", () => ({ getCurrentUser: vi.fn(async () => ({ id: "manager-1", name: "РП", email: "rp@example.test", role: "MANAGER", authenticated: true })) }));
vi.mock("@/lib/auth/project-permissions", () => ({ canProject: vi.fn(async () => true) }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  project: { findUnique: vi.fn() },
  procurementRequest: { findFirst: vi.fn() },
  document: { findFirst: vi.fn() },
  budgetItem: { findMany: vi.fn() },
  projectCostCode: { findMany: vi.fn() },
  procurementRequestItem: { findMany: vi.fn() },
  projectCommitment: { findMany: vi.fn() },
  $transaction: vi.fn(async (callback: (tx: unknown) => unknown) => callback({ projectCommitment: { findFirst: mocks.latest, create: mocks.create }, auditLog: { create: mocks.audit } }))
} }));

const now = new Date("2026-07-18T10:00:00Z");
const created = {
  id: "commitment-1", organizationId: "org-1", projectId: "project-1", sequence: 1, number: "COM-001", type: "subcontract",
  title: "Монолит", counterparty: "ООО Монолит", externalNumber: "SUB-17", status: "draft", currency: "RUB", retentionPercent: 5,
  paymentTerms: null, startsAt: null, endsAt: null, sourceProcurementRequestId: null, linkedDocumentId: null, linkedDocumentVersion: null,
  linkedDocumentVersionId: null, approvalWorkflowRunId: null, decisionComment: null, submittedAt: null, approvedAt: null, activatedAt: null,
  completedAt: null, terminatedAt: null, rejectedAt: null, voidedAt: null, createdAt: now, updatedAt: now,
  linkedDocument: null, sourceProcurementRequest: null, approvalWorkflowRun: null, changeOrders: [], paymentApplications: [],
  lines: [{ id: "line-1", budgetItemId: null, costCodeId: null, sourceProcurementRequestItemId: null, sequence: 1, code: null, description: "Работы", quantity: 1, unit: "компл.", unitPrice: 100, scheduledValue: 100, costCode: null }]
};

function request(body: unknown) {
  return new Request("https://pgs.local", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) as never;
}

describe("commitments collection route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(canProject).mockResolvedValue(true);
    vi.mocked(prisma.project.findUnique).mockResolvedValue({ organizationId: "org-1" } as never);
    vi.mocked(prisma.procurementRequest.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.document.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.budgetItem.findMany).mockResolvedValue([]);
    vi.mocked(prisma.projectCostCode.findMany).mockResolvedValue([]);
    vi.mocked(prisma.procurementRequestItem.findMany).mockResolvedValue([]);
    mocks.latest.mockResolvedValue(null);
    mocks.create.mockResolvedValue(created);
  });

  it("checks project edit access before parsing the request body", async () => {
    vi.mocked(canProject).mockResolvedValue(false);
    const { POST } = await import("./route");
    const response = await POST(new Request("https://pgs.local", { method: "POST", body: "not-json" }) as never, { params: { projectId: "project-1" } });
    expect(response.status).toBe(403);
    expect(prisma.project.findUnique).not.toHaveBeenCalled();
  });

  it("creates a numbered draft with a fixed SOV and audit record", async () => {
    const { POST } = await import("./route");
    const response = await POST(request({
      title: "Монолит",
      counterparty: "ООО Монолит",
      externalNumber: "SUB-17",
      retentionPercent: 5,
      lines: [{ description: "Работы", quantity: 2, unit: "компл.", unitPrice: 100 }]
    }), { params: { projectId: "project-1" } });
    expect(response.status).toBe(201);
    expect(mocks.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        number: "COM-001",
        lines: expect.objectContaining({ create: expect.arrayContaining([expect.objectContaining({ scheduledValue: 200 })]) })
      })
    }));
    expect(mocks.audit).toHaveBeenCalled();
  });
});
